// Realtime sync. Two interchangeable backends with the same interface.
// Each has two stores:
//   game    -> the live game         (Firebase path games/<GAME_ID>)
//   history -> finished-game records (Firebase path history/<GAME_ID>), kept across games and nights
//   sets    -> the host's question sets (Firebase path sets/<GAME_ID>)
// A store has: on(cb), update(paths), set(obj). update() takes {'a/b/c': value}; null deletes.
// For convenience the game store is also exposed as onGame / update / setRoot.

const FIREBASE_VERSION = '10.12.2';

function isConfigured(cfg) {
  return cfg && cfg.apiKey && !String(cfg.apiKey).startsWith('PASTE') && cfg.databaseURL && !String(cfg.databaseURL).startsWith('PASTE');
}

function wrap(b) {
  return Object.assign(b, {
    onGame: (cb) => b.game.on(cb),
    update: (paths) => b.game.update(paths),
    setRoot: (obj) => b.game.set(obj),
  });
}

export async function createBackend(firebaseConfig, gameId) {
  const forceLocal = new URLSearchParams(location.search).has('local');
  if (!forceLocal && isConfigured(firebaseConfig)) {
    try {
      return wrap(await firebaseBackend(firebaseConfig, gameId));
    } catch (e) {
      console.error('Firebase failed to load, falling back to local demo mode', e);
    }
  }
  return wrap(localBackend(gameId));
}

async function firebaseBackend(cfg, gameId) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const { getDatabase, ref, onValue, update, set } = await import(`${base}/firebase-database.js`);
  const app = initializeApp(cfg);
  const db = getDatabase(app);
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const store = (path) => {
    const r = ref(db, path);
    return {
      on(cb, onErr) { onValue(r, (s) => cb(s.val() || {}), onErr); },
      update(paths) { return update(r, paths); },
      set(obj) { return set(r, obj); },
    };
  };
  return {
    mode: 'firebase',
    game: store(`games/${gameId}`),
    history: store(`history/${gameId}`),
    sets: store(`sets/${gameId}`),
    now() { return Date.now() + offset; },
  };
}

function localBackend(gameId) {
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('ww-local-' + gameId) : null;
  const all = [];

  function setPath(obj, path, val) {
    const parts = path.split('/').filter(Boolean);
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) {
        if (val === null) return;
        o[parts[i]] = {};
      }
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) delete o[last];
    else o[last] = JSON.parse(JSON.stringify(val));
  }

  const store = (key) => {
    const listeners = [];
    const read = () => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
    const emit = () => { const g = read(); listeners.forEach((cb) => cb(g)); };
    const write = (obj) => {
      localStorage.setItem(key, JSON.stringify(obj));
      if (channel) channel.postMessage(key);
      setTimeout(emit, 0);
    };
    const s = {
      key, emit,
      on(cb) { listeners.push(cb); setTimeout(() => cb(read()), 0); },
      update(paths) { const g = read(); for (const [p, v] of Object.entries(paths)) setPath(g, p, v); write(g); return Promise.resolve(); },
      set(obj) { write(obj || {}); return Promise.resolve(); },
    };
    all.push(s);
    return s;
  };

  const game = store('ww-local-' + gameId);
  const history = store('ww-history-' + gameId);
  const sets = store('ww-setsdb-' + gameId);
  const emitKey = (k) => all.forEach((s) => { if (s.key === k) s.emit(); });
  if (channel) channel.onmessage = (e) => emitKey(e.data);
  window.addEventListener('storage', (e) => emitKey(e.key));

  return { mode: 'local', game, history, sets, now() { return Date.now(); } };
}
