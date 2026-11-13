# Wits & Wagers — Cabin Edition

A live party game for one host, a TV, and up to ~10 players on their phones.
Everyone guesses a number, the guesses go up on the TV as a betting board, and players bet on whose guess is closest without going over.

- **TV board:** `https://<you>.github.io/<repo>/#tv`
- **Host controls (your laptop):** `https://<you>.github.io/<repo>/#host`
- **Players:** `https://<you>.github.io/<repo>/` (the QR code on the TV goes here)

---

## Try it right now (no setup)

With the Firebase settings left blank, the game runs in **local demo mode**: everything syncs between tabs in one browser.

1. In this folder, run `python3 -m http.server 8000`
2. Open `http://localhost:8000/#host`, `http://localhost:8000/#tv`, and a few tabs of `http://localhost:8000/` (each player tab is a different player).

(It has to be served by a web server like this. Double-clicking `index.html` won't work.)

---

## Setup for real phones (about 30 minutes, once)

### 1. Create the Firebase database (free)
1. Go to <https://console.firebase.google.com> → **Add project**. Name it anything (e.g. `cabin-games`). You can turn Google Analytics off.
2. In the left menu: **Build → Realtime Database → Create database**. Pick the US location, then **Start in locked mode**.
3. Open the **Rules** tab, replace everything with the contents of `database.rules.json` from this folder, and click **Publish**. (These rules cover both the live game and the record book.)
4. Click the gear icon → **Project settings** → under *Your apps* click the **`</>`** (Web) icon. Register an app (no hosting needed).
5. Firebase shows a `firebaseConfig = { ... }` block. Copy the values into `js/config.js`.
   - Make sure `databaseURL` is filled in. It looks like `https://cabin-games-default-rtdb.firebaseio.com`. If it's missing from the snippet, copy it from the top of the Realtime Database page.

> The rules let anyone with the link read and write the game, which is fine for a weekend with friends. You can delete the Firebase project afterwards.

### 2. Put it on GitHub Pages
1. Create a new **public** repo on GitHub (e.g. `cabin-games`).
2. Upload everything in this folder: **Add file → Upload files**, drag the contents in, then commit.
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)` → **Save**.
4. After a minute your site is live at `https://<your-username>.github.io/cabin-games/`.

### 3. Test before the trip
Open `#host` on your laptop and `#tv` in a second window, then join from your phone and a friend's. Play one round.
To clear the test game, click **New game…** on the host screen.

---

## On game night
1. Plug your laptop into the TV. Open the **TV board** (`#tv`) in a full-screen window and click once to start (this turns on sound).
2. Open the **host screen** (`#host`) on your laptop screen, or on a second device.
3. Everyone scans the QR code on the TV, types their name, and picks a team.
4. Click **Show theme picker on TV**, then click a theme on the host screen. The TV highlights tonight's pick, and themes already played show the date.
5. Run each round from the big button on the host screen (or press the **space bar**):
   **Start round → Close guessing → Reveal answer → Show leaderboard → Next round**
6. Guessing has a 60-second clock that's just for pressure. When it hits 0:00 it flashes TIME'S UP, but nothing closes until you click. **Betting has no clock.**
7. After the last round, **Finish game** saves the game to the **record book**. Click **Play again** to pick another theme with the same players.

**Host tools:** pause the clock or add 15 seconds, **Undo last step** (e.g. if you revealed too early), move a player to the other team (⇄), fix someone's guess (✎), remove a player (✕).

If a phone locks or someone closes the tab, they reopen the link and they're back in the game.

---

## Rules (as built)
- Everyone starts with **0 chips**. Team score = the total chips of its players.
- **Guess:** everyone enters a number on their phone. Guesses are anonymous on the TV.
- **Board:** guesses are sorted low → high and duplicates are combined. Middle guesses pay **2:1**, then 3:1, 4:1, and 5:1 going outward. An extra **"Lower than all"** slot pays **6:1**.
- **Bet:** each round you get **2 free betting tokens** to place on any guess, including your own. A winning token pays its odds in chips.
- **Stake chips:** on any guess you put a token on, you can also bet chips you've already won. You win stake × odds if it's right and lose the stake if it's wrong.
- **Winning guess:** the closest guess **without going over**. If every guess is too high, "Lower than all" wins.
- **Closest guess bonus:** whoever made the winning guess gets +3.
- **Final round:** the last question pays **double**: token payouts, chip winnings and the bonus. Losses aren't doubled.

## Question sets (themes)
Five starter themes with 10 questions each: **Snowed In**, **Bar & Kitchen**, **Road Trip USA**, **Lab Coats & Rockets**, and **Game Day**.

The host screen → **Edit question sets** lets you rename themes, add new ones, or delete them. Each set has one question per line:

```
How many feet tall is Mount Everest? | 29032 | ft | 2020 survey
```

- The **last line is the final round** (2× payouts).
- Answers can be negative and use shorthand: `1.2m`, `45k`.
- Edits are saved **on the host laptop only**, so your real questions don't have to go in the public repo. If you want them in the repo instead, edit `js/questions.js` (but anyone with the link could read them there).
- **Restore starter sets** in the editor brings back the originals.

## Record book (stats across nights)
Every finished game is saved automatically, in the Firebase database or in the browser in demo mode. The record book stays when you start new games and on later nights.
- **Show record book on TV** displays all-time standings: games played, team wins, MVPs (top player in a game), total and average chips, closest guesses, and best single round. It also lists recent games.
- Players are matched across games **by name**, so ask everyone to use the same name each night.
- On the host screen you can delete a game from the record book (✕, e.g. a test game) or **Download CSV** for a spreadsheet.
- **Undo** right after finishing a game also removes it from the record book.

## Settings
In `js/config.js`: team names, team size, clock length, and `GAME_ID`. Changing `GAME_ID` starts a completely separate game, for example a test game vs. the real one.

## Troubleshooting
- **Banner says "Local demo mode" on the real site** → `js/config.js` still has `PASTE` values, or the Firebase script couldn't load (check the internet connection).
- **Phones don't update** → check the database **Rules** were published, and that `databaseURL` is right.
- **Cabin internet** → every phone needs a connection. Cell data works fine, since each update is tiny.
