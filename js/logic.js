// Pure game logic: no DOM, no network. Shared by every view and unit-tested with Node.

export const TOKENS_PER_ROUND = 2;
export const CLOSEST_BONUS = 3;
export const LOWER_KEY = 'lower';

const SUFFIXES = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mil: 1e6, mill: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, bil: 1e9, billion: 1e9,
  t: 1e12, trillion: 1e12,
};

// "1,200" -> 1200, "1.2m" -> 1200000, "45k" -> 45000, "-80" -> -80. Returns NaN if unreadable.
export function parseGuess(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().toLowerCase()
    .replace(/[−–—]/g, '-') // unicode minus / dashes
    .replace(/[,\s_$]/g, '');
  const m = s.match(/^(-?)(\d*\.?\d+)([a-z]*)$/);
  if (!m) return NaN;
  const mult = m[3] ? SUFFIXES[m[3]] : 1;
  if (!mult) return NaN;
  const n = parseFloat(m[2]) * mult * (m[1] ? -1 : 1);
  if (!isFinite(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}

export function formatNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  // Year-like numbers (1000–2100) read better without a comma: 1937, not 1,937.
  if (Number.isInteger(n) && n >= 1000 && n <= 2100) return String(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

// Unique guesses sorted low -> high, plus the "lower than all" slot at 6:1.
// Middle slot(s) pay 2:1, then 3:1, 4:1, 5:1 moving outward (capped at 5:1).
export function buildBoard(guessValues) {
  const vals = [...new Set((guessValues || []).filter((v) => typeof v === 'number' && isFinite(v)))]
    .sort((a, b) => a - b);
  const n = vals.length;
  const mids = n === 0 ? [] : n % 2 === 1 ? [(n - 1) / 2] : [n / 2 - 1, n / 2];
  const board = [{ key: LOWER_KEY, value: null, odds: 6 }];
  vals.forEach((v, i) => {
    const d = Math.min(...mids.map((m) => Math.abs(i - m)));
    board.push({ key: 'g' + i, value: v, odds: Math.min(5, 2 + d) });
  });
  return board;
}

export function slotLabel(slot) {
  if (!slot) return '?';
  return slot.value === null || slot.value === undefined ? 'Lower than all' : formatNum(slot.value);
}

// The winning slot is the highest guess that does not go over the answer.
// If every guess is too high, "Lower than all" wins.
export function winningSlot(board, answer) {
  let win = null;
  for (const s of board) {
    if (s.value === null || s.value === undefined) continue;
    if (s.value <= answer && (!win || s.value > win.value)) win = s;
  }
  return win || board.find((s) => s.key === LOWER_KEY);
}

// players: {pid: {chips}}, guesses: {pid: number}, bets: {pid: {tokens: {key: n}, chips: {key: n}}}
export function computeResults({ board, guesses = {}, bets = {}, players = {}, answer, multiplier = 1 }) {
  const win = winningSlot(board, answer);
  const payouts = {};
  const closest = [];
  for (const pid of Object.keys(players)) {
    const p = { delta: 0, lines: [] };
    const b = bets[pid] || {};
    const tokens = b.tokens || {};
    const stakes = b.chips || {};
    const tokenCount = Object.values(tokens).reduce((a, c) => a + (c || 0), 0);
    // Tokens: free, at most TOKENS_PER_ROUND count. A winning token pays its odds.
    let tokensLeft = TOKENS_PER_ROUND;
    for (const s of board) {
      const c = Math.min(tokens[s.key] || 0, tokensLeft);
      tokensLeft -= c;
      if (c > 0 && s.key === win.key) {
        const g = c * s.odds * multiplier;
        p.delta += g;
        p.lines.push({ kind: 'token', text: `${c} token${c > 1 ? 's' : ''} on ${slotLabel(s)} @ ${s.odds}:1`, amt: g });
      }
    }
    // Staked chips: win stake x odds on the winning slot, otherwise lost. Never more than you have.
    let avail = Math.max(0, players[pid].chips || 0);
    for (const s of board) {
      let n = Math.floor(stakes[s.key] || 0);
      n = Math.max(0, Math.min(n, avail));
      if (!n) continue;
      avail -= n;
      if (s.key === win.key) {
        const g = n * s.odds * multiplier;
        p.delta += g;
        p.lines.push({ kind: 'stake', text: `${n} chip${n > 1 ? 's' : ''} staked on ${slotLabel(s)} @ ${s.odds}:1`, amt: g });
      } else {
        p.delta -= n;
        p.lines.push({ kind: 'lost', text: `${n} chip${n > 1 ? 's' : ''} lost on ${slotLabel(s)}`, amt: -n });
      }
    }
    if (win.value !== null && win.value !== undefined && guesses[pid] === win.value) {
      const g = CLOSEST_BONUS * multiplier;
      p.delta += g;
      p.lines.push({ kind: 'bonus', text: `Closest guess (${slotLabel(win)})`, amt: g });
      closest.push(pid);
    }
    p.betPlaced = tokenCount > 0;
    payouts[pid] = p;
  }
  return { winKey: win.key, payouts, closest };
}

export function rankPlayers(players = {}) {
  return Object.entries(players)
    .map(([pid, p]) => ({ pid, ...p, chips: p.chips || 0 }))
    .sort((a, b) => b.chips - a.chips || String(a.name).localeCompare(String(b.name)));
}

export function teamTotals(players = {}) {
  const t = { 1: 0, 2: 0 };
  for (const p of Object.values(players)) t[p.team] = (t[p.team] || 0) + (p.chips || 0);
  return t;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return s.toUpperCase();
}

// ── Record book ───────────────────────────────────────────────────────────────
// Summarize a finished game into a compact record that is saved to history.
export function gameRecord(G, { setId, setName, finishedAt }) {
  const ps = G.players || {};
  const results = G.results || {};
  const guesses = G.guesses || {};
  const rounds = Object.keys(results);
  const ranked = rankPlayers(ps);
  const tt = teamTotals(ps);
  const players = ranked.map((p, i) => {
    let closest = 0, winningBets = 0, bestRound = 0, roundsPlayed = 0;
    for (const r of rounds) {
      const res = results[r] || {};
      const pay = (res.payouts || {})[p.pid];
      if ((res.closest || []).includes(p.pid)) closest++;
      if (pay && (pay.lines || []).some((l) => (l.kind === 'token' || l.kind === 'stake') && l.amt > 0)) winningBets++;
      if (pay && pay.delta > bestRound) bestRound = pay.delta;
      if ((guesses[r] || {})[p.pid] !== undefined) roundsPlayed++;
    }
    return { name: String(p.name || '?'), team: p.team || 0, chips: p.chips || 0, rank: i + 1, closest, winningBets, bestRound, roundsPlayed };
  });
  const winner = (tt[1] || 0) === (tt[2] || 0) ? 0 : (tt[1] || 0) > (tt[2] || 0) ? 1 : 2;
  return { finishedAt, setId: setId || '', setName: setName || '', rounds: rounds.length, teamTotals: { t1: tt[1] || 0, t2: tt[2] || 0 }, winner, players };
}

// Combine every saved game into all-time stats per player (matched by name, case-insensitive).
export function allTimeStats(history = {}) {
  const by = {};
  for (const rec of Object.values(history)) {
    for (const p of rec.players || []) {
      const k = String(p.name).trim().toLowerCase();
      const s = by[k] = by[k] || { name: p.name, games: 0, teamWins: 0, mvps: 0, totalChips: 0, closest: 0, winningBets: 0, bestRound: 0 };
      s.name = p.name;
      s.games++;
      if (rec.winner && rec.winner === p.team) s.teamWins++;
      if (p.rank === 1) s.mvps++;
      s.totalChips += p.chips || 0;
      s.closest += p.closest || 0;
      s.winningBets += p.winningBets || 0;
      s.bestRound = Math.max(s.bestRound, p.bestRound || 0);
    }
  }
  return Object.values(by)
    .map((s) => ({ ...s, avgChips: s.games ? Math.round(s.totalChips / s.games) : 0 }))
    .sort((a, b) => b.totalChips - a.totalChips || b.teamWins - a.teamWins);
}

export function historyCsv(history = {}) {
  const rows = [['date', 'theme', 'result', 'team 1 total', 'team 2 total', 'player', 'team', 'final chips', 'rank', 'closest guesses', 'rounds with a winning bet', 'best round']];
  const recs = Object.values(history).sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  for (const r of recs) {
    const d = new Date(r.finishedAt || 0).toISOString().slice(0, 16).replace('T', ' ');
    for (const p of r.players || []) {
      rows.push([d, r.setName, r.solo ? 'Solo game' : r.winner ? 'Team ' + r.winner : 'Tie', r.teamTotals?.t1 ?? '', r.teamTotals?.t2 ?? '', p.name, p.team, p.chips, p.rank, p.closest, p.winningBets, p.bestRound]);
    }
  }
  return rows.map((r) => r.map((c) => /[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(',')).join('\n');
}
