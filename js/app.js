import { firebaseConfig, GAME_ID, TEAM_NAMES, TEAM_SIZE, CLOCK_SECONDS } from './config.js';
import {
  parseGuess, formatNum, buildBoard, computeResults, slotLabel, rankPlayers, teamTotals, initials,
  TOKENS_PER_ROUND, LOWER_KEY, CLOSEST_BONUS, gameRecord, allTimeStats, historyCsv,
} from './logic.js';
import { QUESTION_SETS, toLines, fromLines } from './questions.js';
import { createBackend } from './backend.js';

// ── Setup ────────────────────────────────────────────────────────────────────
const ROUTE = (location.hash.replace('#', '') || 'play').toLowerCase();
const app = document.getElementById('app');
document.body.classList.add('view-' + ROUTE);
const backend = await createBackend(firebaseConfig, GAME_ID);
const LOCAL = backend.mode === 'local';
let G = { phase: 'lobby', round: 0 };
let lastHtml = '';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rk = () => 'r' + (G.round || 0);
const players = () => G.players || {};
const playerCount = () => Object.keys(players()).length;
const curGuesses = () => (G.guesses || {})[rk()] || {};
const curBoard = () => { const b = (G.board || {})[rk()]; return Array.isArray(b) ? b : b ? Object.values(b) : []; };
const curBets = () => (G.bets || {})[rk()] || {};
const curResults = () => (G.results || {})[rk()] || null;
const isFinal = () => (G.totalRounds || 0) > 0 && G.round === G.totalRounds - 1;
const teamName = (t) => TEAM_NAMES[t] || 'Team ' + t;
const unitSuffix = (u) => (u ? ' ' + esc(u) : '');
const roundLabel = () => `Round ${(G.round || 0) + 1} of ${G.totalRounds || '?'}${isFinal() ? ' · Final round · 2× payouts' : ''}`;
const joinUrl = () => location.origin + location.pathname + (LOCAL ? '?local' : '');

let HISTORY = {};
backend.history.on((h) => { HISTORY = h || {}; render(); });

backend.onGame((g) => {
  G = Object.assign({ phase: 'lobby', round: 0 }, g || {});
  render();
});

// Keep text inputs (name, question editor) intact across re-renders.
function apply(html) {
  if (html === lastHtml) return false;
  const active = document.activeElement;
  const saved = {};
  app.querySelectorAll('input[id], textarea[id]').forEach((el) => { saved[el.id] = el.value; });
  const focusId = active && active.id;
  const sel = focusId && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  app.innerHTML = html;
  lastHtml = html;
  for (const [id, v] of Object.entries(saved)) { const el = document.getElementById(id); if (el && el.dataset.keep !== 'no') el.value = v; }
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } }
  return true;
}

function render() {
  let html = '';
  if (ROUTE === 'tv') html = renderTV();
  else if (ROUTE === 'host') html = renderHost();
  else html = renderPlayer();
  const banner = LOCAL ? `<div class="demo-banner">Local demo mode — open more tabs of this page to play. Add your Firebase config to play on phones.</div>` : '';
  if (apply(banner + html)) afterRender();
  tick();
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset, el);
});

// ── Clock (display only) ────────────────────────────────────────────────────
function remainingMs() {
  const c = G.clock;
  if (!c) return null;
  if (c.pausedLeft != null) return c.pausedLeft;
  return c.endsAt - backend.now();
}
function clockText(ms) {
  if (ms == null) return '';
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const buzzed = new Set();
function tick() {
  const ms = remainingMs();
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const up = ms != null && ms <= 0;
    el.textContent = up ? "TIME'S UP" : clockText(ms);
    el.classList.toggle('timesup', up);
    el.classList.toggle('paused', !!(G.clock && G.clock.pausedLeft != null));
  });
  if (ROUTE === 'tv' && ms != null && ms <= 0 && (G.phase === 'guessing' || G.phase === 'betting')) {
    const k = G.phase + rk();
    if (!buzzed.has(k)) { buzzed.add(k); sound.buzzer(); }
  }
}
setInterval(tick, 250);
const freshClock = () => ({ endsAt: backend.now() + CLOCK_SECONDS * 1000, pausedLeft: null });

// ── Sound (TV only, after a click unlocks audio) ─────────────────────────────
const sound = (() => {
  let ctx = null;
  const tone = (freq, start, dur, type = 'sine', vol = 0.25) => {
    if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
  };
  return {
    unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch { /* no audio */ } },
    get on() { return !!ctx; },
    ding() { tone(880, 0, 0.5); tone(1320, 0.12, 0.7); },
    buzzer() { tone(110, 0, 0.7, 'sawtooth', 0.18); tone(116, 0, 0.7, 'square', 0.08); },
    pop() { tone(660, 0, 0.12, 'triangle', 0.15); },
  };
})();

// ── Shared bits ─────────────────────────────────────────────────────────────
const teamChip = (t, extra = '') => `<span class="team-chip team-${t} ${extra}">${esc(teamName(t))}</span>`;
const oddsTxt = (o) => `${o}:1`;

function betsBySlot() {
  const by = {};
  for (const [pid, b] of Object.entries(curBets())) {
    const p = players()[pid];
    if (!p) continue;
    for (const [key, n] of Object.entries(b.tokens || {})) {
      by[key] = by[key] || { tokens: [], chips: 0 };
      for (let i = 0; i < n; i++) by[key].tokens.push({ i: initials(p.name), team: p.team });
    }
    for (const [key, n] of Object.entries(b.chips || {})) {
      by[key] = by[key] || { tokens: [], chips: 0 };
      by[key].chips += n || 0;
    }
  }
  return by;
}

// ══════════════════════════════════════════════════════════════════════════════
// TV BOARD
// ══════════════════════════════════════════════════════════════════════════════
let tvStarted = false;
let revealAnimated = null;

function renderTV() {
  if (!tvStarted) {
    return `<div class="tv"><button class="tv-start" data-act="tvStart">
      <span class="tv-start-title">Wits &amp; Wagers</span>
      <span>Click to start the TV board (turns on sound and full screen)</span></button></div>`;
  }
  if (G.showRecord) return `<div class="tv">${tvRecord()}</div>`;
  const body = { lobby: tvLobby, themes: tvThemes, guessing: tvGuessing, betting: tvBetting, reveal: tvReveal, scores: tvScores, over: tvOver }[G.phase] || tvLobby;
  return `<div class="tv">${body()}</div>`;
}

function tvLobby() {
  const ps = players();
  const teams = [1, 2].map((t) => {
    const list = Object.values(ps).filter((p) => p.team === t).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    const slots = list.map((p) => `<div class="lobby-player">${esc(p.name)}</div>`);
    for (let i = list.length; i < TEAM_SIZE; i++) slots.push(`<div class="lobby-player open">Open spot</div>`);
    return `<div class="card lobby-team"><div class="row-between">${teamChip(t, 'lg')}<span class="muted">${list.length} / ${TEAM_SIZE}</span></div>${slots.join('')}</div>`;
  }).join('');
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(joinUrl())}`;
  return `
    <div class="tv-head">
      <div><div class="eyebrow">Cabin Game Show Night</div><div class="tv-title">Wits &amp; Wagers</div></div>
      <div class="muted big">${playerCount()} player${playerCount() === 1 ? '' : 's'} joined</div>
    </div>
    <div class="tv-lobby">
      <div class="card qr-card">
        <img class="qr" src="${qr}" alt="QR code to join the game">
        <div class="qr-label">Scan to join</div>
        <div class="muted center small">${esc(joinUrl().replace(/^https?:\/\//, ''))}</div>
      </div>
      <div class="lobby-teams">${teams}</div>
    </div>
    <div class="muted center big">${G.setName ? `Tonight’s theme: <b class="dark">${esc(G.setName)}</b> · ` : ''}Waiting for the host to start the game…</div>`;
}

function tvGuessing() {
  const g = curGuesses();
  const tiles = rankPlayersByTeam().map((p) => {
    const done = g[p.pid] !== undefined;
    return `<div class="status-tile ${done ? 'done team-' + p.team : 'waiting'}"><div class="st-name">${esc(p.name)}</div><div class="st-status">${done ? '✓ locked in' : 'thinking…'}</div></div>`;
  }).join('');
  const n = Object.keys(g).filter((pid) => players()[pid]).length;
  return `
    <div class="tv-head"><div class="muted big strong">${roundLabel()}</div><div class="clock-wrap"><span class="muted">Clock</span><span class="clock" data-clock></span></div></div>
    <div class="card question-card">
      <div class="question">${esc(G.question?.text)}</div>
      <div class="muted big">Enter your guess on your phone · guesses stay anonymous</div>
    </div>
    <div class="status-wrap"><div class="strong big">Guesses in: ${n} / ${playerCount()}</div><div class="status-grid">${tiles}</div></div>`;
}

function rankPlayersByTeam() {
  return Object.entries(players()).map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => a.team - b.team || (a.joinedAt || 0) - (b.joinedAt || 0));
}

function tvSlots(mode) {
  const board = curBoard();
  const by = betsBySlot();
  const res = curResults();
  return `<div class="slots" style="grid-template-columns: repeat(${board.length}, minmax(0, 1fr))">` + board.map((s) => {
    const b = by[s.key] || { tokens: [], chips: 0 };
    const win = res && res.winKey === s.key;
    const cls = mode === 'reveal' ? (win ? 'slot win' : 'slot dim') : 'slot';
    const mid = s.odds === 2 ? 'mid' : '';
    return `<div class="${cls}" data-slot="${s.key}">
      <div class="odds ${mid}">${oddsTxt(s.odds)}</div>
      <div class="slot-value ${s.key === LOWER_KEY ? 'lower' : ''}">${esc(slotLabel(s))}</div>
      <div class="slot-bets">
        <div class="tiny-label">${win && mode === 'reveal' ? 'WINNER' : 'Bets'}</div>
        <div class="bet-dots">${b.tokens.map((t) => `<span class="bet-dot team-${t.team}">${esc(t.i)}</span>`).join('')}</div>
        <div class="muted small">${b.chips ? '+' + b.chips + ' chip' + (b.chips > 1 ? 's' : '') : ''}</div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function tvBetting() {
  const locked = Object.entries(curBets()).filter(([pid, b]) => b.locked && players()[pid]).length;
  return `
    <div class="tv-head">
      <div><div class="muted big strong">${roundLabel()} · Place your bets</div><div class="question small-q">${esc(G.question?.text)}</div></div>
      <div class="untimed">No clock — lock in on your phone</div>
    </div>
    ${tvSlots('bet')}
    <div class="row-between muted"><div>Anonymous guesses, sorted low → high. Duplicates share a slot. Middle slots pay least.</div><div class="strong dark">Bets locked: ${locked} / ${playerCount()}</div></div>`;
}

function tvReveal() {
  const res = curResults();
  if (!res) return tvBetting();
  const ps = players();
  const entries = Object.entries(res.payouts || {}).filter(([pid]) => ps[pid]);
  const winners = entries.filter(([, p]) => p.delta > 0).sort((a, b) => b[1].delta - a[1].delta).slice(0, 7);
  const losers = entries.filter(([, p]) => p.delta < 0).sort((a, b) => a[1].delta - b[1].delta).slice(0, 5);
  const closest = (res.closest || []).filter((pid) => ps[pid]).map((pid) => esc(ps[pid].name));
  const row = ([pid, p], cls) => `<div class="pay-row"><div><b>${esc(ps[pid].name)}</b> <span class="muted small">${esc((p.lines || []).filter((l) => (cls === 'neg') === (l.amt < 0)).map((l) => l.text).join(' · '))}</span></div><div class="${cls}">${p.delta > 0 ? '+' : '−'}${Math.abs(p.delta)}</div></div>`;
  return `
    <div class="card answer-card">
      <div><div class="muted big strong">${roundLabel()} · The answer is…</div><div class="muted">${esc(G.question?.text)}</div></div>
      <div class="answer" id="answer" data-final="${res.answer}">${formatNum(res.answer)}${unitSuffix(res.unit)}</div>
    </div>
    ${tvSlots('reveal')}
    <div class="pay-grid">
      <div class="card pay-card"><div class="tiny-label">Payouts${res.multiplier > 1 ? ' · doubled' : ''}</div>
        ${winners.length ? winners.map((w) => row(w, 'pos')).join('') : '<div class="muted">Nobody bet on the winning guess!</div>'}</div>
      <div class="card pay-card"><div class="tiny-label">Closest guess &amp; losses</div>
        <div class="pay-row"><div><b>${closest.length ? closest.join(', ') : 'Nobody'}</b> <span class="muted small">closest without going over</span></div><div class="pos">${closest.length ? '+' + CLOSEST_BONUS * (res.multiplier || 1) + ' each' : ''}</div></div>
        ${losers.map((l) => row(l, 'neg')).join('')}
      </div>
    </div>`;
}

function tvScores() {
  const ranked = rankPlayers(players());
  const tt = teamTotals(players());
  const max = Math.max(1, ...ranked.map((p) => p.chips));
  const rounds = Array.from({ length: G.totalRounds || 0 }, (_, i) => `<span class="pip ${i <= G.round ? 'done' : ''}"></span>`).join('');
  const rows = ranked.map((p, i) => `
    <div class="score-row">
      <div class="rank">${i + 1}</div><div class="sname">${esc(p.name)}</div>
      <div class="bar-track"><div class="bar team-${p.team}" style="width:${Math.round((p.chips / max) * 100)}%"></div></div>
      <div class="schips">${p.chips}</div>
      <div class="sdelta ${p.lastDelta > 0 ? 'pos' : p.lastDelta < 0 ? 'neg' : 'muted'}">${p.lastDelta > 0 ? '+' + p.lastDelta : p.lastDelta < 0 ? '−' + Math.abs(p.lastDelta) : '0'}</div>
    </div>`).join('');
  return `
    <div class="tv-head"><div class="tv-title md">${G.phase === 'over' ? 'Final standings' : `Standings after Round ${(G.round || 0) + 1}`}</div><div class="pips">${rounds}</div></div>
    <div class="team-totals">
      <div class="team-total team-1"><span>${esc(teamName(1))}</span><b>${tt[1] || 0}</b></div>
      <div class="team-total team-2"><span>${esc(teamName(2))}</span><b>${tt[2] || 0}</b></div>
    </div>
    <div class="card score-card">${rows || '<div class="muted">No players yet</div>'}</div>`;
}

function tvThemes() {
  const themes = Array.isArray(G.themes) ? G.themes : Object.values(G.themes || {});
  const cards = themes.map((t) => `
    <div class="theme-card ${G.setId === t.id ? 'selected' : ''}">
      ${G.setId === t.id ? '<div class="theme-tag">Tonight’s pick</div>' : ''}
      <div class="theme-name">${esc(t.name)}</div>
      <div class="muted">${esc(t.desc)}</div>
      <div class="grow"></div>
      <div class="row-between small"><span class="muted">${t.count} questions</span>${t.played ? `<span class="played">Played ${esc(new Date(t.played).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : '<span class="fresh">New</span>'}</div>
    </div>`).join('');
  return `
    <div class="tv-head"><div><div class="eyebrow">Wits &amp; Wagers</div><div class="tv-title md">${G.setId ? 'Tonight’s theme' : 'Pick tonight’s theme'}</div></div>
      <div class="muted big">${playerCount()} players ready</div></div>
    <div class="theme-grid">${cards}</div>
    <div class="muted center big">Last question of every theme pays double</div>`;
}

function tvRecord() {
  const stats = allTimeStats(HISTORY);
  const recs = Object.values(HISTORY).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 6);
  const rows = stats.slice(0, 12).map((p, i) => `<tr><td class="muted">${i + 1}</td><td class="strong">${esc(p.name)}</td><td>${p.games}</td><td>${p.teamWins}</td><td>${p.mvps}</td><td class="strong">${p.totalChips}</td><td>${p.avgChips}</td><td>${p.closest}</td><td>${p.bestRound ? '+' + p.bestRound : '—'}</td></tr>`).join('');
  const games = recs.map((r) => {
    const mvp = (r.players || []).find((p) => p.rank === 1);
    return `<div class="rec-game"><div class="small muted">${esc(new Date(r.finishedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(r.setName || '')}${r.endedEarly ? ` (${r.rounds} of ${r.totalRounds} rounds)` : ''}</div>
      <div class="strong">${r.winner ? esc(teamName(r.winner)) + ' won' : 'Tie'} ${r.teamTotals?.t1 ?? 0}–${r.teamTotals?.t2 ?? 0}</div>
      ${mvp ? `<div class="small">MVP: ${esc(mvp.name)} (${mvp.chips})</div>` : ''}</div>`;
  }).join('');
  return `
    <div class="tv-head"><div><div class="eyebrow">All-time</div><div class="tv-title md">The Record Book</div></div><div class="muted big">${Object.keys(HISTORY).length} games played</div></div>
    <div class="record-grid">
      <div class="card record-card">${stats.length ? `<table class="record-table"><thead><tr><th></th><th>Player</th><th>Games</th><th>Team wins</th><th>MVPs</th><th>Total chips</th><th>Avg</th><th>Closest</th><th>Best round</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="muted big">No finished games yet.</div>'}</div>
      <div class="card record-card"><div class="tiny-label">Recent games</div>${games || '<div class="muted">—</div>'}</div>
    </div>`;
}

function tvOver() {
  const tt = teamTotals(players());
  const winner = (tt[1] || 0) === (tt[2] || 0) ? null : (tt[1] || 0) > (tt[2] || 0) ? 1 : 2;
  const top = rankPlayers(players())[0];
  return `
    <div class="over-banner ${winner ? 'team-' + winner : ''}">
      <div class="eyebrow">Game over</div>
      <div class="over-title">${winner ? esc(teamName(winner)) + ' wins!' : 'It’s a tie!'}</div>
      <div class="big">${tt[1] || 0} – ${tt[2] || 0}${top ? ` · Top player: ${esc(top.name)} (${top.chips})` : ''}${G.setName ? ' · ' + esc(G.setName) : ''}</div>
      <div class="small">${G.endedEarly != null ? `Ended early after ${G.endedEarly} of ${G.totalRounds} rounds · ` : ''}Saved to the record book</div>
    </div>
    ${tvScores().replace(/<div class="tv-head">[\s\S]*?<\/div><\/div>/, '')}`;
}

function afterRender() {
  if (ROUTE === 'tv' && G.phase === 'reveal' && curResults() && revealAnimated !== rk() + ':' + G.results[rk()].winKey) {
    revealAnimated = rk() + ':' + G.results[rk()].winKey;
    animateReveal();
  }
}

function animateReveal() {
  const el = document.getElementById('answer');
  if (!el) return;
  const res = curResults();
  const final = res.answer;
  const unit = res.unit ? ' ' + res.unit : '';
  const slots = document.querySelector('.slots');
  const pays = document.querySelector('.pay-grid');
  slots && slots.classList.add('pre-reveal');
  pays && pays.classList.add('hidden-pay');
  const start = performance.now();
  const dur = 1800;
  const from = final > 0 && Number.isInteger(final) && final > 2000 && final < 2100 ? 1900 : 0; // years count from 1900
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = from + (final - from) * e;
    el.textContent = formatNum(k < 1 ? Math.round(v) : final) + unit;
    if (k < 1) requestAnimationFrame(step);
    else {
      sound.ding();
      slots && slots.classList.remove('pre-reveal');
      setTimeout(() => pays && pays.classList.remove('hidden-pay'), 700);
    }
  };
  requestAnimationFrame(step);
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAYER PHONE
// ══════════════════════════════════════════════════════════════════════════════
const store = LOCAL ? sessionStorage : localStorage;
const PID_KEY = 'ww-pid-' + GAME_ID;
let PID = store.getItem(PID_KEY);
if (!PID) { PID = Math.random().toString(36).slice(2, 10); store.setItem(PID_KEY, PID); }
const me = () => players()[PID];
let joinTeam = null;
let joinError = '';
const draft = { round: null, guess: '', editingGuess: false, guessError: '', tokens: {}, chips: {}, locked: false };

function syncDraft() {
  const sig = JSON.stringify(curBoard().map((s) => [s.key, s.value]));
  const newRound = draft.round !== rk();
  if (newRound) Object.assign(draft, { round: rk(), guess: '', editingGuess: false, guessError: '' });
  if (newRound || draft.boardSig !== sig) {
    // New round, or the host rebuilt the board / undid a step: reload my bets from the server.
    const b = curBets()[PID] || {};
    Object.assign(draft, { boardSig: sig, tokens: { ...(b.tokens || {}) }, chips: { ...(b.chips || {}) }, locked: !!b.locked });
  }
}

function renderPlayer() {
  if (!me()) return phoneJoin();
  syncDraft();
  const p = me();
  const head = `<div class="phone-head"><span>${esc(p.name)} · ${teamChip(p.team, 'sm')}</span><span class="strong">${p.chips || 0} chips</span></div>`;
  const body = { lobby: phoneLobby, themes: phoneLobby, guessing: phoneGuess, betting: phoneBet, reveal: phoneResult, scores: phoneResult, over: phoneOver }[G.phase] || phoneLobby;
  return `<div class="phone">${head}${body()}</div>`;
}

function phoneJoin() {
  const counts = { 1: 0, 2: 0 };
  Object.values(players()).forEach((p) => { counts[p.team] = (counts[p.team] || 0) + 1; });
  const btn = (t) => {
    const full = counts[t] >= TEAM_SIZE;
    return `<button class="team-pick team-${t} ${joinTeam === t ? 'selected' : ''}" data-act="pickTeam" data-team="${t}" ${full && joinTeam !== t ? 'disabled' : ''}>
      <span class="strong">${esc(teamName(t))}</span><span class="small">${counts[t] || 0} / ${TEAM_SIZE}${full ? ' · full' : ''}${joinTeam === t ? ' · selected' : ''}</span></button>`;
  };
  return `<div class="phone">
    <div><div class="eyebrow">Cabin Game Show Night</div><div class="phone-title">Wits &amp; Wagers</div></div>
    <label class="field-label" for="name">Your name</label>
    <input id="name" class="text-input" maxlength="16" autocomplete="off" placeholder="First name">
    <div class="field-label">Pick your team</div>
    <div class="two-col">${btn(1)}${btn(2)}</div>
    ${joinError ? `<div class="error">${esc(joinError)}</div>` : ''}
    <div class="grow"></div>
    <button class="primary" data-act="join">Join game</button>
    <div class="muted small center">If your phone locks, reopening this page puts you back in.</div>
  </div>`;
}

function phoneLobby() {
  return `<div class="phone-center">
    <div class="phone-title">You’re in!</div>
    <div class="muted center">Watch the TV. The game starts when the host is ready.</div>
    ${G.setName ? `<div class="stat wide center"><div class="muted small">Tonight’s theme</div><div class="stat-val">${esc(G.setName)}</div></div>` : ''}
    <div class="muted center small">${playerCount()} players joined</div>
  </div>`;
}

function guessPreview() {
  const v = parseGuess(draft.guess);
  if (!draft.guess) return '&nbsp;';
  return Number.isNaN(v) ? 'Not a number yet' : '= ' + formatNum(v) + unitSuffix(G.question?.unit);
}

function phoneGuess() {
  const mine = curGuesses()[PID];
  const q = `<div class="phone-q-meta"><span class="muted strong small">${roundLabel()}</span><span class="clock sm" data-clock></span></div><div class="phone-q">${esc(G.question?.text)}</div>`;
  if (mine !== undefined && !draft.editingGuess) {
    return `${q}<div class="locked-box"><div class="muted small">Your guess is locked in</div><div class="locked-val">${formatNum(mine)}${unitSuffix(G.question?.unit)}</div></div>
      <button class="secondary" data-act="editGuess">Change my guess</button>
      <div class="grow"></div><div class="muted small center">You can change it until the host closes guessing.</div>`;
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  return `${q}
    <div class="guess-display"><span class="guess-text">${esc(draft.guess) || '<span class="muted">0</span>'}</span><span class="muted">${esc(G.question?.unit || '')}</span></div>
    <div class="muted small">${guessPreview()}</div>
    ${draft.guessError ? `<div class="error">${esc(draft.guessError)}</div>` : ''}
    <div class="keypad">${keys.map((k) => `<button class="key" data-act="key" data-k="${k}" ${k === '⌫' ? 'aria-label="Delete"' : ''}>${k}</button>`).join('')}</div>
    <div class="keypad four">
      <button class="key sm" data-act="key" data-k="neg" aria-label="Make negative">+/−</button>
      <button class="key sm" data-act="key" data-k="k">thousand</button>
      <button class="key sm" data-act="key" data-k="m">million</button>
      <button class="key sm" data-act="key" data-k="b">billion</button>
    </div>
    <button class="primary" data-act="lockGuess">Lock in guess</button>`;
}

function tokensUsed() { return Object.values(draft.tokens).reduce((a, n) => a + (n || 0), 0); }
function chipsStaked() { return Object.values(draft.chips).reduce((a, n) => a + (n || 0), 0); }

function phoneBet() {
  const board = curBoard();
  const mine = curGuesses()[PID];
  const myChips = me().chips || 0;
  const left = TOKENS_PER_ROUND - tokensUsed();
  const rows = board.map((s) => {
    const n = draft.tokens[s.key] || 0;
    const yours = mine !== undefined && s.value === mine;
    return `<div class="bet-row ${n ? 'chosen' : ''}">
      <div class="bet-odds">${oddsTxt(s.odds)}</div>
      <div class="bet-val">${esc(slotLabel(s))}${yours ? ' <span class="muted small">(yours)</span>' : ''}</div>
      <div class="bet-tokens">${'●'.repeat(n)}</div>
      <button class="step" data-act="tok" data-key="${s.key}" data-d="-1" aria-label="Remove token" ${n ? '' : 'disabled'}>−</button>
      <button class="step" data-act="tok" data-key="${s.key}" data-d="1" aria-label="Add token" ${left > 0 ? '' : 'disabled'}>+</button>
    </div>`;
  }).join('');
  const stakeRows = board.filter((s) => draft.tokens[s.key]).map((s) => {
    const n = draft.chips[s.key] || 0;
    return `<div class="stake-row"><div class="small strong">Stake chips on ${esc(slotLabel(s))}</div>
      <div class="stepper"><button class="step" data-act="chip" data-key="${s.key}" data-d="-1" aria-label="Fewer chips" ${n ? '' : 'disabled'}>−</button>
      <span class="strong">${n}</span>
      <button class="step" data-act="chip" data-key="${s.key}" data-d="1" aria-label="More chips" ${chipsStaked() < myChips ? '' : 'disabled'}>+</button></div></div>`;
  }).join('');
  return `
    <div class="phone-q-meta"><span class="muted strong small">${roundLabel()} · Bets</span><span class="muted small">no time limit</span></div>
    <div class="two-col">
      <div class="stat"><div class="muted small">Tokens left</div><div class="stat-val">${left} of ${TOKENS_PER_ROUND}</div></div>
      <div class="stat"><div class="muted small">Chips · staked</div><div class="stat-val">${myChips} · ${chipsStaked()}</div></div>
    </div>
    <div class="muted small">Tap + to put a free token on a guess. Then you can stake chips you’ve won on those guesses (lost if wrong).</div>
    <div class="bet-list">${rows}</div>
    ${stakeRows}
    <button class="primary ${draft.locked ? 'done' : ''}" data-act="lockBets" ${tokensUsed() ? '' : 'disabled'}>${draft.locked ? '✓ Bets locked in' : 'Lock in bets'}</button>
    ${draft.locked ? '<div class="muted small center">You can still change bets until the host closes betting.</div>' : ''}`;
}

function myRank() {
  const r = rankPlayers(players());
  return r.findIndex((p) => p.pid === PID) + 1;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function phoneResult() {
  const res = curResults();
  const tt = teamTotals(players());
  const pay = res && res.payouts ? res.payouts[PID] : null;
  const d = pay ? pay.delta : 0;
  const lines = pay && pay.lines ? pay.lines : [];
  return `
    <div class="answer-box"><div class="muted small">The answer</div><div class="answer-sm">${res ? formatNum(res.answer) + unitSuffix(res.unit) : '…'}</div></div>
    <div class="delta-box ${d > 0 ? 'pos-bg' : d < 0 ? 'neg-bg' : ''}"><span>${d > 0 ? 'You won' : d < 0 ? 'You lost' : 'No change this round'}</span><b>${d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'}</b></div>
    ${lines.length ? `<div class="lines">${lines.map((l) => `<div class="line"><span>${esc(l.text)}</span><b>${l.amt > 0 ? '+' : '−'}${Math.abs(l.amt)}</b></div>`).join('')}</div>` : ''}
    <div class="two-col">
      <div class="stat"><div class="muted small">Your chips</div><div class="stat-val">${me().chips || 0} · ${ordinal(myRank())}</div></div>
      <div class="stat"><div class="muted small">${esc(teamName(1))} vs ${esc(teamName(2))}</div><div class="stat-val">${tt[1] || 0} – ${tt[2] || 0}</div></div>
    </div>
    <div class="grow"></div>
    <div class="muted center">Look up at the TV · next round starts when the host is ready</div>`;
}

function myGameStats() {
  const rec = G.gameKey && HISTORY[G.gameKey];
  const p = rec && (rec.players || []).find((x) => x.name === me().name);
  if (!p) return '';
  return `<div class="two-col wide-grid">
    <div class="stat"><div class="muted small">Closest guesses</div><div class="stat-val">${p.closest}</div></div>
    <div class="stat"><div class="muted small">Rounds with a winning bet</div><div class="stat-val">${p.winningBets}</div></div>
    <div class="stat"><div class="muted small">Best round</div><div class="stat-val">${p.bestRound ? '+' + p.bestRound : '—'}</div></div>
    <div class="stat"><div class="muted small">Rounds played</div><div class="stat-val">${p.roundsPlayed}</div></div>
  </div><div class="muted small">Saved to the record book</div>`;
}

function phoneOver() {
  const tt = teamTotals(players());
  const winner = (tt[1] || 0) === (tt[2] || 0) ? null : (tt[1] || 0) > (tt[2] || 0) ? 1 : 2;
  return `<div class="phone-center">
    <div class="eyebrow">Game over</div>
    <div class="phone-title">${winner ? esc(teamName(winner)) + ' wins!' : 'It’s a tie!'}</div>
    <div class="big strong">${tt[1] || 0} – ${tt[2] || 0}</div>
    <div class="stat wide"><div class="muted small">You finished</div><div class="stat-val">${ordinal(myRank())} · ${me().chips || 0} chips</div></div>
    ${myGameStats()}
  </div>`;
}

function saveBets() {
  const tokens = {}; const chips = {};
  for (const [k, n] of Object.entries(draft.tokens)) if (n > 0) tokens[k] = n;
  for (const [k, n] of Object.entries(draft.chips)) if (n > 0 && tokens[k]) chips[k] = n;
  draft.chips = chips;
  backend.update({ [`bets/${rk()}/${PID}`]: Object.keys(tokens).length ? { tokens, chips, locked: draft.locked } : null });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST
// ══════════════════════════════════════════════════════════════════════════════
const SETS_KEY = 'ww-sets-' + GAME_ID; // old per-laptop storage; now only a backup / one-time import
const clone = (x) => JSON.parse(JSON.stringify(x));
const normSets = (list) => (Array.isArray(list) ? list : Object.values(list || {}))
  .filter(Boolean)
  .map((s) => ({ id: s.id, name: s.name || 'Untitled', desc: s.desc || '', questions: (Array.isArray(s.questions) ? s.questions : Object.values(s.questions || {})).filter(Boolean) }));
function localSets() {
  try { const s = JSON.parse(localStorage.getItem(SETS_KEY)); if (Array.isArray(s) && s.length) return s; } catch { /* none */ }
  return null;
}
// Question sets live in the database (sets/<GAME_ID>) so they survive browser cleanup and work from any device.
let SETS = ROUTE === 'host' ? clone(QUESTION_SETS) : [];
let setsStatus = 'loading'; // 'loading' | 'ok' | 'offline'
function saveSets() {
  try { localStorage.setItem(SETS_KEY, JSON.stringify(SETS)); } catch { /* backup only */ }
  if (setsStatus === 'ok') {
    backend.sets.set({ list: SETS, updatedAt: backend.now() }).catch((e) => { console.error(e); setsStatus = 'offline'; render(); });
  }
}
if (ROUTE === 'host') {
  backend.sets.on((v) => {
    const list = v && v.list ? normSets(v.list) : [];
    if (list.length) {
      SETS = list;
      setsStatus = 'ok';
    } else if (setsStatus === 'loading') {
      // First run: seed the database from any sets saved on this laptop, else the starter sets.
      setsStatus = 'ok';
      SETS = normSets(localSets() || clone(QUESTION_SETS));
      saveSets();
    }
    lastHtml = '';
    render();
  }, (err) => {
    console.error('Could not load question sets from the database', err);
    setsStatus = 'offline';
    SETS = normSets(localSets() || clone(QUESTION_SETS));
    lastHtml = '';
    render();
  });
}
const setById = (id) => SETS.find((s) => s.id === id);
const activeSet = () => setById(G.setId) || null;
const qs = () => (activeSet() || { questions: [] }).questions;
const host = { editing: false, editId: null, editErrors: [], undo: [] };

function lastPlayed(setId) {
  const ts = Object.values(HISTORY).filter((r) => r.setId === setId).map((r) => r.finishedAt || 0);
  return ts.length ? Math.max(...ts) : 0;
}
const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
function themeList() {
  return SETS.map((s) => ({ id: s.id, name: s.name, desc: s.desc || '', count: s.questions.length, played: lastPlayed(s.id) }));
}

function snapshot() {
  host.undo.push(clone(G));
  if (host.undo.length > 30) host.undo.shift();
}

function primaryAction() {
  const last = G.round >= (G.totalRounds || qs().length) - 1;
  const set = activeSet();
  switch (G.phase) {
    case 'lobby': return { label: 'Show theme picker on TV', act: 'showThemes', ok: true };
    case 'themes': return set
      ? { label: `Start Round 1 · ${set.name}`, act: 'startGame', ok: playerCount() > 0 && set.questions.length > 0, why: playerCount() ? '' : 'Waiting for players to join.' }
      : { label: 'Pick a theme below first', act: 'startGame', ok: false, why: 'Click a theme to select it — the TV highlights it.' };
    case 'guessing': return { label: 'Close guessing → Show betting board', act: 'closeGuessing', ok: true };
    case 'betting': return { label: 'Close betting → Reveal answer', act: 'reveal', ok: true };
    case 'reveal': return { label: 'Show leaderboard', act: 'showScores', ok: true };
    case 'scores': return last ? { label: 'Finish game → Final results', act: 'finish', ok: true } : { label: `Start Round ${G.round + 2}`, act: 'nextRound', ok: true };
    case 'over': return { label: 'Play again (same players, chips reset)', act: 'playAgain', ok: true };
    default: return { label: 'Start', act: 'showThemes', ok: true };
  }
}

function hostSetPicker() {
  return `<div class="card">
    <div class="tiny-label">Choose tonight’s theme ${G.phase === 'themes' ? '· showing on TV' : ''}</div>
    <div class="set-grid">${SETS.map((s) => {
      const lp = lastPlayed(s.id);
      return `<button class="set-btn ${G.setId === s.id ? 'selected' : ''}" data-act="pickSet" data-id="${esc(s.id)}">
        <span class="strong">${esc(s.name)}</span>
        <span class="small muted">${s.questions.length} questions${lp ? ' · played ' + shortDate(lp) : ''}</span></button>`;
    }).join('')}</div>
  </div>`;
}

function hostRecordCard() {
  const recs = Object.entries(HISTORY).sort((a, b) => (b[1].finishedAt || 0) - (a[1].finishedAt || 0));
  const list = recs.map(([k, r]) => {
    const mvp = (r.players || []).find((p) => p.rank === 1);
    return `<div class="hist-row"><div><b>${esc(shortDate(r.finishedAt))}</b> · ${esc(r.setName || 'Custom')}${r.endedEarly ? ` <span class="muted small">(${r.rounds} of ${r.totalRounds} rounds)</span>` : ''}<div class="small muted">${r.winner ? esc(teamName(r.winner)) + ' won' : 'Tie'} ${r.teamTotals?.t1 ?? 0}–${r.teamTotals?.t2 ?? 0}${mvp ? ' · MVP ' + esc(mvp.name) + ' (' + mvp.chips + ')' : ''}</div></div>
      <button class="mini" data-act="deleteRecord" data-key="${esc(k)}" title="Delete this game from the record book">✕</button></div>`;
  }).join('');
  return `<div class="card">
    <div class="row-between"><div class="tiny-label">Record book · ${recs.length} game${recs.length === 1 ? '' : 's'} saved</div>
      <div class="row-gap"><button class="secondary" data-act="toggleRecord">${G.showRecord ? 'Hide record book on TV' : 'Show record book on TV'}</button>
      <button class="secondary" data-act="downloadCsv" ${recs.length ? '' : 'disabled'}>Download CSV</button></div></div>
    ${list || '<div class="muted small">Finished games are saved here automatically.</div>'}
  </div>`;
}

function renderHost() {
  const set = activeSet();
  const inGame = !['lobby', 'themes'].includes(G.phase);
  const rounds = set ? set.questions.map((q, i) => {
    const st = !inGame ? 'next' : i < G.round || (i === G.round && G.phase === 'over') ? 'done' : i === G.round ? 'cur' : 'next';
    return `<div class="round-item ${st}"><div class="tiny-label">Round ${i + 1}${i === set.questions.length - 1 ? ' · Final · 2×' : ''}${st === 'cur' ? ' · now' : st === 'done' ? ' · done' : ''}</div><div class="small strong">${esc(q.q)}</div></div>`;
  }).join('') : '<div class="muted small">Pick a theme to see its questions.</div>';
  const q = inGame ? qs()[G.round] : null;
  const phases = ['guessing', 'betting', 'reveal', 'scores'];
  const pidx = phases.indexOf(G.phase);
  const phaseBar = ['Guessing', 'Betting', 'Reveal', 'Leaderboard'].map((n, i) => `<div class="phase ${i < pidx || G.phase === 'over' ? 'done' : i === pidx ? 'now' : ''}">${n}</div>`).join('');
  const pa = primaryAction();
  const clockCtl = G.phase === 'guessing' ? `
      <button class="secondary" data-act="pauseClock"><span class="clock sm inline" data-clock></span> · ${G.clock && G.clock.pausedLeft != null ? 'Resume clock' : 'Pause clock'}</button>
      <button class="secondary" data-act="addTime">+15 seconds</button>` : '';
  const g = curGuesses(); const b = curBets(); const board = curBoard();
  const label = (key) => slotLabel(board.find((s) => s.key === key));
  const prow = rankPlayersByTeam().map((p) => {
    const bet = b[p.pid];
    const betTxt = bet ? Object.entries(bet.tokens || {}).map(([k, n]) => `${n}× ${label(k)}${bet.chips && bet.chips[k] ? ` +${bet.chips[k]}c` : ''}`).join(', ') + (bet.locked ? ' ✓' : '') : (G.phase === 'betting' ? '<span class="warn">waiting…</span>' : '—');
    const guessTxt = g[p.pid] !== undefined ? formatNum(g[p.pid]) : (G.phase === 'guessing' ? '<span class="warn">waiting…</span>' : '—');
    return `<div class="prow">
      <div class="pname"><span class="dot team-${p.team}"></span>${esc(p.name)}</div>
      <div>${guessTxt}</div><div class="small">${betTxt}</div><div class="right strong">${p.chips || 0}</div>
      <div class="pactions">
        <button class="mini" data-act="moveTeam" data-pid="${p.pid}" title="Move to other team">⇄</button>
        <button class="mini" data-act="editPlayerGuess" data-pid="${p.pid}" title="Edit guess">✎</button>
        <button class="mini" data-act="removePlayer" data-pid="${p.pid}" title="Remove player">✕</button>
      </div></div>`;
  }).join('');

  const es = host.editing ? setById(host.editId) || SETS[0] : null;
  const editor = es ? `
    <div class="modal-back"><div class="modal">
      <div class="row-between"><div class="strong big">Question sets</div><button class="secondary" data-act="closeEditor">Close</button></div>
      <div class="set-tabs">${SETS.map((s) => `<button class="set-tab ${s.id === es.id ? 'selected' : ''}" data-act="editSet" data-id="${esc(s.id)}">${esc(s.name)} <span class="muted small">${s.questions.length}</span></button>`).join('')}
        <button class="set-tab add" data-act="newSet">+ New set</button></div>
      <div class="two-col">
        <div><label class="field-label" for="setname-${esc(es.id)}">Theme name (shown on TV)</label><input class="text-input sm" id="setname-${esc(es.id)}" value="${esc(es.name)}" maxlength="30"></div>
        <div><label class="field-label" for="setdesc-${esc(es.id)}">Short description</label><input class="text-input sm" id="setdesc-${esc(es.id)}" value="${esc(es.desc || '')}" maxlength="60"></div>
      </div>
      <div class="muted small">One question per line: <b>question | answer | unit | source</b>. The last line is the final round (2×). Answers can be negative or shorthand like 1.2m.</div>
      <textarea id="qtext-${esc(es.id)}" spellcheck="false">${esc(toLines(es.questions))}</textarea>
      ${host.editErrors.map((e) => `<div class="error">${esc(e)}</div>`).join('')}
      <div class="row-between">
        <div class="row-gap"><button class="secondary" data-act="deleteSet" data-id="${esc(es.id)}" ${SETS.length > 1 ? '' : 'disabled'}>Delete this set</button>
        <button class="secondary" data-act="resetSets">Restore starter sets</button></div>
        <button class="primary auto" data-act="saveSet" data-id="${esc(es.id)}">Save “${esc(es.name)}”</button>
      </div>
    </div></div>` : '';

  const qCard = inGame ? `<div class="card">
          <div class="tiny-label">${G.phase === 'over' ? 'Game over' : roundLabel()} · ${esc(set ? set.name : '')}</div>
          <div class="host-q">${q ? esc(q.q) : 'No question'}</div>
          ${q ? `<div class="answer-strip"><b>Answer (only you see this)</b><span class="answer-val">${formatNum(q.answer)}${unitSuffix(q.unit)}</span><span class="small">${esc(q.source || '')}</span></div>` : ''}
        </div>` : hostSetPicker();

  return `<div class="host">
    <div class="row-between">
      <div class="host-title">Host · Wits &amp; Wagers <span class="muted small">game “${esc(GAME_ID)}”</span>
        ${setsStatus === 'offline' && !LOCAL ? '<div class="error">Question sets couldn’t be saved to the database — edits are only kept on this laptop. Check that the Firebase rules include “sets” (see README).</div>' : ''}
        ${setsStatus === 'loading' && !LOCAL ? '<div class="muted small">Loading question sets…</div>' : ''}</div>
      <div class="row-gap">
        <button class="secondary" data-act="openTV">Open TV board</button>
        <button class="secondary" data-act="openEditor">Edit question sets</button>
        <button class="secondary" data-act="newGame">New game…</button>
        <span class="pill ok">${playerCount()} players</span>
      </div>
    </div>
    <div class="host-grid">
      <div class="card host-col"><div class="tiny-label">${set ? esc(set.name) + ' · ' + set.questions.length + ' rounds' : 'Rounds'}</div>${rounds}</div>
      <div class="host-main">
        ${qCard}
        <div class="card">
          <div class="tiny-label">Phase</div>
          <div class="phases">${phaseBar}</div>
          <button class="primary huge" data-act="${pa.act}" ${pa.ok ? '' : 'disabled'}>${esc(pa.label)}</button>
          <div class="muted small">${pa.ok ? 'Space bar also does this.' : esc(pa.why || '')}</div>
          <div class="row-gap wrap">
            ${clockCtl}
            <button class="secondary" data-act="undo" ${host.undo.length ? '' : 'disabled'}>Undo last step</button>
            ${inGame && G.phase !== 'over' ? '<button class="secondary danger" data-act="endEarly">End game now</button>' : ''}
          </div>
        </div>
        ${hostRecordCard()}
      </div>
      <div class="card host-col wide">
        <div class="tiny-label">Players</div>
        <div class="prow head"><div>Name</div><div>Guess</div><div>Bets</div><div class="right">Chips</div><div></div></div>
        ${prow || '<div class="muted small">Nobody has joined yet. Players join at:<br><b>' + esc(joinUrl()) + '</b></div>'}
      </div>
    </div>
    ${editor}
  </div>`;
}

document.addEventListener('keydown', (e) => {
  if (ROUTE !== 'host' || e.code !== 'Space' || host.editing) return;
  if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
  e.preventDefault();
  const pa = primaryAction();
  if (pa.ok) ACTIONS[pa.act]();
});

function startRound(i) {
  const list = qs();
  const q = list[i];
  if (!q) return;
  snapshot();
  const paths = {
    phase: 'guessing', round: i, totalRounds: list.length, showRecord: null,
    question: { text: q.q, unit: q.unit || '' },
    clock: freshClock(),
  };
  if (i === 0) {
    // Fresh game: clear anything left over from earlier games.
    Object.assign(paths, { guesses: null, bets: null, board: null, results: null, gameKey: 'g' + backend.now() });
    for (const pid of Object.keys(players())) { paths[`players/${pid}/chips`] = 0; paths[`players/${pid}/lastDelta`] = null; }
  } else {
    for (const p of ['guesses', 'bets', 'board', 'results']) paths[`${p}/r${i}`] = null;
    for (const pid of Object.keys(players())) paths[`players/${pid}/lastDelta`] = null;
  }
  backend.update(paths);
}

function downloadText(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const HOST_ACTIONS = {
  openTV() { window.open(location.pathname + location.search + '#tv', 'wwtv'); },
  openEditor() { host.editing = true; host.editId = (activeSet() || SETS[0]).id; host.editErrors = []; render(); },
  closeEditor() { host.editing = false; render(); },
  editSet(d) { host.editId = d.id; host.editErrors = []; render(); },
  newSet() {
    const id = 'set' + Date.now().toString(36);
    SETS.push({ id, name: 'New theme', desc: '', questions: [] });
    saveSets(); host.editId = id; host.editErrors = []; render();
  },
  deleteSet(d) {
    const s = setById(d.id); if (!s || SETS.length < 2) return;
    if (G.setId === s.id && !['lobby', 'themes', 'over'].includes(G.phase)) { alert('That set is being played right now.'); return; }
    if (!confirm(`Delete the question set “${s.name}”?`)) return;
    SETS = SETS.filter((x) => x.id !== s.id); saveSets();
    host.editId = SETS[0].id;
    if (G.setId === s.id) backend.update({ setId: null, setName: null });
    if (G.phase === 'themes') backend.update({ themes: themeList() });
    render();
  },
  resetSets() {
    if (!confirm('Replace all question sets with the starter sets? Your edits will be lost.')) return;
    SETS = clone(QUESTION_SETS); saveSets(); host.editId = SETS[0].id; host.editErrors = []; app.innerHTML = '';
    if (G.phase === 'themes') backend.update({ themes: themeList() });
    lastHtml = ''; render();
  },
  saveSet(d) {
    const s = setById(d.id); if (!s) return;
    const name = document.getElementById('setname-' + s.id).value.trim();
    const desc = document.getElementById('setdesc-' + s.id).value.trim();
    const { list, errors } = fromLines(document.getElementById('qtext-' + s.id).value, parseGuess);
    if (!name) errors.push('Give the theme a name.');
    if (!list.length) errors.push('Add at least one question.');
    const playing = G.setId === s.id && !['lobby', 'themes', 'over'].includes(G.phase);
    if (playing && list.length <= G.round) errors.push(`This set is being played (round ${G.round + 1}), so it needs at least ${G.round + 1} questions.`);
    host.editErrors = errors;
    if (!errors.length) {
      Object.assign(s, { name, desc, questions: list });
      saveSets();
      const paths = {};
      if (G.setId === s.id) { paths.setName = name; if (playing) paths.totalRounds = list.length; }
      if (G.phase === 'themes') paths.themes = themeList();
      if (Object.keys(paths).length) backend.update(paths);
    }
    lastHtml = ''; render();
  },
  showThemes() { snapshot(); backend.update({ phase: 'themes', themes: themeList(), showRecord: null }); },
  pickSet(d) {
    const s = setById(d.id); if (!s) return;
    const paths = { setId: s.id, setName: s.name, themes: themeList() };
    if (G.phase === 'lobby') paths.phase = 'themes';
    backend.update(paths);
  },
  startGame() { if (activeSet()) startRound(0); },
  nextRound() { startRound(G.round + 1); },
  closeGuessing() {
    snapshot();
    const vals = Object.entries(curGuesses()).filter(([pid]) => players()[pid]).map(([, v]) => v);
    backend.update({ phase: 'betting', [`board/${rk()}`]: buildBoard(vals), clock: null }); // betting is untimed
  },
  reveal() {
    const q = qs()[G.round];
    if (!q) return;
    snapshot();
    const mult = isFinal() ? 2 : 1;
    const res = computeResults({ board: curBoard(), guesses: curGuesses(), bets: curBets(), players: players(), answer: q.answer, multiplier: mult });
    const paths = {
      phase: 'reveal', clock: null,
      [`results/${rk()}`]: { answer: q.answer, unit: q.unit || '', winKey: res.winKey, multiplier: mult, payouts: res.payouts, closest: res.closest },
    };
    for (const [pid, p] of Object.entries(res.payouts)) {
      paths[`players/${pid}/chips`] = Math.max(0, (players()[pid].chips || 0) + p.delta);
      paths[`players/${pid}/lastDelta`] = p.delta;
    }
    backend.update(paths);
  },
  showScores() { snapshot(); backend.update({ phase: 'scores' }); },
  finish(early) {
    early = early === true;
    snapshot();
    const key = G.gameKey || 'g' + backend.now();
    const set = activeSet();
    const rec = gameRecord(G, { setId: G.setId, setName: set ? set.name : G.setName, finishedAt: backend.now() });
    rec.totalRounds = G.totalRounds || rec.rounds;
    if (early) rec.endedEarly = true;
    backend.history.update({ [key]: rec });
    backend.update({ phase: 'over', gameKey: key, clock: null, endedEarly: early ? rec.rounds : null });
  },
  endEarly() {
    const done = Object.keys(G.results || {}).length;
    const mid = G.phase === 'guessing' || G.phase === 'betting';
    const msg = `End the game now?\n\n${done} of ${G.totalRounds} rounds completed${mid ? ' (the round in progress won’t count)' : ''}. Final standings go on the TV and the game is saved to the record book.`;
    if (!confirm(msg)) return;
    HOST_ACTIONS.finish(true);
  },
  playAgain() {
    snapshot();
    const ps = {};
    for (const [pid, p] of Object.entries(players())) ps[pid] = { name: p.name, team: p.team, chips: 0, joinedAt: p.joinedAt || 0 };
    backend.setRoot({ phase: 'lobby', round: 0, players: ps });
  },
  newGame() {
    const keep = confirm('Start a new game?\n\nOK = keep the players who joined, reset chips to 0, pick a new theme.\nCancel = do nothing.\n\n(Finished games stay in the record book.)');
    if (keep) HOST_ACTIONS.playAgain();
  },
  undo() {
    const prev = host.undo.pop();
    if (!prev) return;
    if (G.phase === 'over' && prev.phase !== 'over' && G.gameKey) backend.history.update({ [G.gameKey]: null }); // un-finish removes the saved record
    backend.setRoot(prev);
    render();
  },
  pauseClock() {
    const c = G.clock; if (!c) return;
    if (c.pausedLeft != null) backend.update({ clock: { endsAt: backend.now() + c.pausedLeft, pausedLeft: null } });
    else backend.update({ clock: { endsAt: c.endsAt, pausedLeft: Math.max(0, c.endsAt - backend.now()) } });
  },
  addTime() {
    const c = G.clock; if (!c) return;
    if (c.pausedLeft != null) backend.update({ 'clock/pausedLeft': c.pausedLeft + 15000 });
    else backend.update({ 'clock/endsAt': Math.max(c.endsAt, backend.now()) + 15000 });
  },
  toggleRecord() { backend.update({ showRecord: G.showRecord ? null : true }); },
  deleteRecord(d) {
    const r = HISTORY[d.key]; if (!r) return;
    if (!confirm(`Delete the ${shortDate(r.finishedAt)} game (${r.setName}) from the record book?`)) return;
    backend.history.update({ [d.key]: null });
  },
  downloadCsv() { downloadText(`wits-wagers-record-book.csv`, historyCsv(HISTORY), 'text/csv'); },
  moveTeam(d) { const p = players()[d.pid]; if (p) backend.update({ [`players/${d.pid}/team`]: p.team === 1 ? 2 : 1 }); },
  editPlayerGuess(d) {
    const p = players()[d.pid]; if (!p) return;
    if (G.phase !== 'guessing' && G.phase !== 'betting') { alert('Guesses can only be edited during guessing or betting.'); return; }
    const cur = curGuesses()[d.pid];
    const raw = prompt(`New guess for ${p.name}:`, cur !== undefined ? String(cur) : '');
    if (raw === null) return;
    const v = parseGuess(raw);
    if (Number.isNaN(v)) { alert('That is not a number.'); return; }
    const paths = { [`guesses/${rk()}/${d.pid}`]: v };
    if (G.phase === 'betting') {
      if (!confirm('Changing a guess during betting rebuilds the board and clears everyone’s bets. Continue?')) return;
      snapshot();
      const g = { ...curGuesses(), [d.pid]: v };
      paths[`board/${rk()}`] = buildBoard(Object.entries(g).filter(([pid]) => players()[pid]).map(([, x]) => x));
      paths[`bets/${rk()}`] = null; // board changed, so slots changed
    }
    backend.update(paths);
  },
  removePlayer(d) {
    const p = players()[d.pid]; if (!p) return;
    if (!confirm(`Remove ${p.name} from the game?`)) return;
    snapshot();
    backend.update({ [`players/${d.pid}`]: null, [`guesses/${rk()}/${d.pid}`]: null, [`bets/${rk()}/${d.pid}`]: null });
  },
};

// ── Actions ────────────────────────────────────────────────────────────────
const ACTIONS = {
  // TV
  tvStart() {
    tvStarted = true;
    sound.unlock();
    try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch { /* optional */ }
    render();
  },
  // Player
  pickTeam(d) { joinTeam = Number(d.team); joinError = ''; render(); },
  join() {
    const name = (document.getElementById('name')?.value || '').trim();
    if (!name) { joinError = 'Type your name first.'; return render(); }
    if (!joinTeam) { joinError = 'Pick a team.'; return render(); }
    const taken = Object.entries(players()).some(([pid, p]) => pid !== PID && String(p.name || '').toLowerCase() === name.toLowerCase());
    if (taken) { joinError = 'Someone already has that name — add an initial.'; return render(); }
    joinError = '';
    backend.update({ [`players/${PID}`]: { name, team: joinTeam, chips: 0, joinedAt: backend.now() } });
  },
  key(d) {
    const k = d.k;
    let s = draft.guess;
    const m = s.match(/^(-?)([\d.]*)([kmb]?)$/) || ['', '', '', ''];
    let [, sign, num, suf] = m;
    if (k === '⌫') { if (suf) suf = ''; else if (num) num = num.slice(0, -1); else sign = ''; }
    else if (k === 'neg') sign = sign ? '' : '-';
    else if (k === 'k' || k === 'm' || k === 'b') suf = suf === k ? '' : k;
    else if (k === '.') { if (!num.includes('.')) num = (num || '0') + '.'; }
    else if (num.replace('.', '').length < 15) num = num === '0' ? k : num + k;
    draft.guess = sign + num + suf;
    draft.guessError = '';
    render();
  },
  lockGuess() {
    const v = parseGuess(draft.guess);
    if (Number.isNaN(v)) { draft.guessError = 'Enter a number first.'; return render(); }
    draft.editingGuess = false;
    backend.update({ [`guesses/${rk()}/${PID}`]: v });
  },
  editGuess() {
    const mine = curGuesses()[PID];
    draft.editingGuess = true;
    draft.guess = mine !== undefined ? String(mine) : '';
    render();
  },
  tok(d) {
    const n = (draft.tokens[d.key] || 0) + Number(d.d);
    if (n < 0 || (Number(d.d) > 0 && tokensUsed() >= TOKENS_PER_ROUND)) return;
    draft.tokens[d.key] = n;
    if (!n) delete draft.chips[d.key];
    draft.locked = false;
    saveBets(); render();
  },
  chip(d) {
    const n = (draft.chips[d.key] || 0) + Number(d.d);
    if (n < 0 || (Number(d.d) > 0 && chipsStaked() >= (me().chips || 0))) return;
    draft.chips[d.key] = n;
    draft.locked = false;
    saveBets(); render();
  },
  lockBets() { draft.locked = true; saveBets(); render(); },

  ...HOST_ACTIONS,
};

render();
