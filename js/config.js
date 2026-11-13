// ── Your settings ─────────────────────────────────────────────────────────────
// 1. Paste the config object from Firebase (Project settings → Your apps → Web app).
//    Leave the PASTE values in place to run in local demo mode (one computer, browser tabs).
export const firebaseConfig = {
  apiKey: 'AIzaSyC0E4pQn1ou9-gdgryDkAGKMCJPR0qP_0Q',
  authDomain: 'cabin-games-15f31.firebaseapp.com',
  databaseURL: 'https://cabin-games-15f31-default-rtdb.firebaseio.com',
  projectId: 'cabin-games-15f31',
  storageBucket: 'cabin-games-15f31.firebasestorage.app',
  messagingSenderId: '91817361835',
  appId: '1:91817361835:web:a1d00eed35598b9cf152ee',
};

// 2. Game settings
export const GAME_ID = 'cabin';                // change to start a completely separate game
export const TEAM_NAMES = { 1: 'Team 1', 2: 'Team 2' };
export const TEAM_SIZE = 5;                     // a team shows as "full" at this many players
export const CLOCK_SECONDS = 60;                // display-only countdown; the host closes each phase
