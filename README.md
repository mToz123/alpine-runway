# alpine-runway

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/mToz123/alpine-runway/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/mToz123/alpine-runway/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Alpine Runway — an original chase-view flight game: fly a mountain valley at sunset, thread 10 glowing rings, then set the plane down on the runway. Keyboard and mouse controls, a real flight model (stall, crash, landing), and a full HUD with altitude, speed and heading.

## Run it

```sh
cd game && python3 -m http.server 8000
```

Then open http://localhost:8000 — or open `game/index.html` straight from disk, which works because the game uses classic scripts and no modules.

## How to play

- **Arrows / WASD** — pitch and bank
- **Mouse** — steer by position (move off-centre to bank and pitch)
- **Shift / Ctrl** (or `+` / `-`, or the mouse wheel) — throttle up / down
- **R** — restart, **P** — pause, **M** — sound on/off
- **Enter / Space / click** — start flying

Fly through every ring for 100 points each (a close pass is 25), then land
on the runway: slow, level and aligned, for 500 points. Touch the terrain
anywhere else and the flight is over. Watch the stall warning — below
75 knots the wing stops flying and the nose drops.

## What is in this repo

- `main.ts` — the hand-in program (Node 22, standard library only): copies
  `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `game/` — the game itself: `index.html` plus classic scripts under `src/`
  (`config.js` tuning, `world.js` flight model and course, `render.js`
  the canvas renderer and HUD, `audio.js` synthesized sound, `input.js`
  keyboard and mouse, `main.js` the loop and screenshot scenes).
- `screenshots/` — four renders of the real game, staged deterministically:
  the title screen, mid-flight toward a ring, a close ring pass, and the
  final approach to the runway.
- `vendor/makefun-game.ts` — the kit's dossier library, copied unchanged.

## Screenshots

The game stages its own screenshot scenes: open it with
`?shot=title|cover|ring|approach&seed=N`. Each scene runs the real rules
forward with the autopilot from a fixed seed and paints one frame, so the
same seed always gives the same frame.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
