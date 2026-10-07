# MESSED UP

**Survive the week. Skip the sambar.**

A retro pixel-art maze game about a hungry hostel student. Eat the day's mess menu, dodge the dishes that chase you, escape through the exit, and come back tomorrow for the Daily Run. It runs in any modern browser, on phones, tablets and desktops, with no install and no login.

**Play it:** https://messed-up-game.vercel.app

![Title screen](docs/screens/title.png)

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [How to play](#how-to-play)
- [Game AI](#game-ai)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deployment and CI/CD](#deployment-and-cicd)
- [Leaderboard](#leaderboard)
- [Known limitations](#known-limitations)
- [Credits](#credits)

## Features

- **Daily Run**: one ranked attempt per day (IST), the same mazes for everyone, with a streak system and Streak Freezes.
- **Practice mode**: any weekday, random maze, unlimited tries, adaptive difficulty.
- **Seven days, seven themes**: each weekday has its own menu, enemy line-up, difficulty and dining-hall look, from gentle Monday to brutal Sunday.
- **Easy / Normal / Hard**: scale enemy speed, number of dishes, lives and score multiplier. Scores are normalised so Daily ranks stay comparable.
- **Procedurally generated dining hall**: furniture-based layouts that are always connected and free of dead-end traps.
- **Game AI**: A* chasers, an ambusher, a wanderer, a finite-state-machine boss, adaptive difficulty and a bot playtester. See [Game AI](#game-ai).
- **Responsive, no-scroll UI**: every menu page is laid out in columns and scaled to fit the screen, so nothing scrolls. In-game, the maze and HUD rearrange for portrait and landscape.
- **Touch, keyboard and swipe controls**, with a large on-screen d-pad whose position can be switched for one-handed play.
- **First-run guided tour** in the game screen that points out the player, enemies, dishes, exit and HUD. It can be skipped, and replayed from the `?` button.
- **Accessibility and comfort options**: high contrast, clear font, three text sizes, reduced motion, CRT effect toggle, vibration toggle, adjustable volume.
- **Community leaderboard** (optional) backed by Upstash Redis, with an automatic per-device fallback.
- **Tiny footprint**: no image or audio files. Art is defined as text and drawn to canvas, sound is synthesised with WebAudio. The production JavaScript bundle is about 100 kB (37 kB gzipped).

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript (strict) |
| Rendering | HTML5 Canvas 2D, pre-rendered sprites and an offscreen static layer |
| Build / dev server | Vite |
| Tests | Vitest |
| Audio | WebAudio synthesiser |
| Backend (optional) | One Vercel Function plus Upstash Redis (REST) |
| Hosting | Vercel |
| CI/CD | GitHub Actions |

## Getting started

Requires **Node.js 22** (the version CI uses) or newer.

```bash
git clone https://github.com/Divyan-H/messed-up-game.git
cd messed-up-game
npm ci
npm run dev        # http://localhost:5173
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting |
| `npm test` | Run the unit tests |
| `npm run playtest [n]` | Headless bot plays `n` runs per weekday and prints clear rates |
| `npm run snapshot` | Render PNG frames with the real renderer into `./snapshots` |
| `npm run foodsheet` | Render a labelled contact sheet of every dish sprite |

### URL flags

| Flag | Effect |
|---|---|
| `/?autopilot` | The bot plays the game (good for demos) |
| `/?autopilot&sim=4` | Same, with the simulation running 4x faster |

## How to play

**Goal:** eat every dish to open the exit, then reach it. A day has three courses: Breakfast, Lunch and Dinner.

**Controls:** arrow keys or WASD, swipe on the maze, or the on-screen pad. `P` or `Esc` pauses. You keep moving in your chosen direction until you turn.

| Thing | Rule |
|---|---|
| Lives | Start with 3 stomachs (Easy: 4). Touching a chaser costs one. |
| Hunger | A hunger bar drains over time and refills when you eat. At zero you lose a stomach. |
| Points | Dish +10 (combo up to x5), bonus snack +100, clear bonus for time and remaining stomachs. |
| Outside Maggi | A power-up that scares every chaser. Eat them for 200, 400, 800 and 1600. |
| Warden | Stop eating for too long and the Warden appears and hunts you. |
| Perks | After each course, choose 1 of 3 (speed, extra stomach, longer Maggi, longer combo, see enemy paths). |
| Daily Run | One ranked attempt per IST day. The attempt is only consumed when you press START. |
| Streaks | +1 per day played. Every 7th day earns a Streak Freeze (max 2) that forgives one missed day. |
| Practice | Unlimited, any weekday, random maze, adaptive difficulty, no streak or ranking. |

### Difficulty

Each weekday gets harder (more and faster enemies, quicker releases). On top of that you can choose a level in **Settings** or on the menu card:

| Level | Effect | Score |
|---|---|---|
| Easy | Slower enemies, fewer dishes, 4 stomachs, longer Maggi, no boss | x0.75 |
| Normal | The intended experience | x1 |
| Hard | Faster enemies, more dishes, quicker releases, shorter Maggi, hungrier player | x1.5 |

The maze is the same for everyone at every level, and the level is part of the run configuration, so replays stay deterministic.

![Menu card](docs/screens/menu-card.png)
![Gameplay](docs/screens/gameplay.png)

## Game AI

The game is built around classic game-AI techniques.

| Module | Technique | Code |
|---|---|---|
| Chaser (Sambar Blob) | **A\*** with a Manhattan heuristic on a binary min-heap | `src/game/pathfinding.ts`, `src/game/enemies.ts` |
| Ambusher (Mystery Curry) | Target prediction: aims several tiles ahead of the player's heading | `src/game/enemies.ts` |
| Wanderer (Chapati Ghost) | Stochastic movement from a seeded RNG | `src/game/enemies.ts` |
| Boss (Wednesday Special) | **Finite state machine**, PATROL and CHASE with hysteresis. All enemies share DEN, ACTIVE, SCARED and EATEN modes | `src/game/enemies.ts` |
| Level generation | **Procedural content generation**: furniture sets placed by constrained rejection sampling, a flood-fill connectivity check, and dead-end and trap-pocket removal using **Tarjan's articulation points** | `src/game/furniture.ts`, `src/game/maze.ts` |
| Adaptive difficulty | **Dynamic difficulty adjustment**: an exponential moving average of player performance scales enemy speed in Practice (Daily stays fixed so rankings are fair) | `src/game/difficulty.ts` |
| Bot playtester | Danger-weighted **Dijkstra** agent used to measure balance without human testers | `src/game/bot.ts`, `scripts/playtest.ts` |
| Determinism | Fixed 60 Hz simulation and a seeded RNG: the same inputs always produce the same run, and `replayRun` verifies it | `src/game/run.ts` |

The in-game **AI Lab** screen exposes these live: a pathfinding benchmark (A\* vs Dijkstra vs BFS), a bot playtest, a record-and-replay determinism check and the adaptive-difficulty state. A "Show enemy paths" setting draws every enemy's planned A\* route over the maze.

To get current balance numbers after any tuning change, run:

```bash
npm run playtest 20
```

![Enemy paths](docs/screens/ai-paths-overlay.png)

## Architecture

```
src/
  core/      Pure utilities: seeded RNG, IST clock, min-heap, safe storage
  game/      The simulation. No DOM, no Math.random, no wall-clock time
             config, menu, maze (PCG), pathfinding, mover, enemies (AI),
             stage, run, perks, difficulty, bot
  render/    Canvas renderer, text-defined pixel art, hall painter, particles
  audio/     WebAudio synthesiser (no audio files)
  services/  Streak rules, profile (localStorage), leaderboard providers
  ui/        App shell, screens, game view, input, layout and fit engine, tour
api/         leaderboard.ts: Vercel Function (Redis sorted sets)
tests/       Unit tests
scripts/     Headless playtest and PNG snapshot tools
```

Key design decisions:

- **Simulation is separate from presentation.** `src/game` runs headless, which is what makes bot playtesting, unit tests and replays possible. The UI only reads state and consumes an event queue.
- **Fixed timestep (60 Hz) with a free-running renderer.** Behaviour is identical on 60, 120 and 144 Hz screens and on slow phones.
- **Cheap rendering.** The dining hall is drawn once to an offscreen canvas, sprites are pre-rendered, particles are pooled and the HUD only touches the DOM when a value changes.
- **Fit-to-screen menu pages.** `src/ui/layout.ts` lays each menu page out at several candidate widths, picks the one that scales up best for the viewport, and applies a uniform scale. Wide screens show every card at once; portrait phones get tabs. In-game overlays shrink instead of scrolling.
- **Patterns used.** Strategy (enemy behaviours, leaderboard providers), state machines (enemy modes, run phases), adapter and fallback (remote board to local board), an event queue between simulation and UI.

## Testing

```bash
npm test
```

The suite covers the seeded RNG and heap, pathfinding optimality and equivalence, maze and furniture guarantees (connectivity, no dead-end traps, clear aisles), enemy behaviour, run determinism and replay, streak rules, the difficulty model, profile sanitisation, layout and fit calculations, and sprite and menu coverage. The same suite runs in CI on every push and pull request.

## Deployment and CI/CD

The site is deployed on Vercel. A GitHub Actions workflow (`.github/workflows/deploy.yml`) handles both checks and deployment:

| Event | What runs |
|---|---|
| Pull request to `main` | Typecheck, tests, production build |
| Push to `main` | The same checks, then a production deploy to Vercel |

So merging or pushing to `main` updates the live site automatically.

### Setup for your own fork

1. Create a Vercel project for the repository and link it locally with `npx vercel link`. The IDs are then in `.vercel/project.json`.
2. Create a token at https://vercel.com/account/tokens.
3. Add these repository secrets (Settings, Secrets and variables, Actions):

   | Secret | Value |
   |---|---|
   | `VERCEL_TOKEN` | The token from step 2 |
   | `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
   | `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

4. Push to `main`.

Security headers and long-lived asset caching are configured in `vercel.json`.

## Leaderboard

The community leaderboard is optional. Without it, the game works fully and uses a per-device board.

1. In your Vercel project, add the **Upstash Redis** integration from the Marketplace.
2. It injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (`KV_REST_API_URL` and `KV_REST_API_TOKEN` are also accepted).
3. Redeploy.

The API (`api/leaderboard.ts`) validates score range, nickname format and dates before writing. Until the variables are set it answers `503` and the client falls back to the local board automatically.

## Known limitations

- **No accounts.** Nicknames are self-chosen. The daily-attempt lock and streak live in the browser's `localStorage`, so clearing storage allows another attempt, and the shared board trusts submitted scores within the API's validation limits.
- **Anti-cheat is not built yet.** Runs are deterministic, so a future version can upload the input log and re-simulate it on the server with `replayRun`. The simulation is ready for this; the upload and verification are not.
- **Leaderboard storage has not been load-tested** against a live Redis instance.
- Audio is synthesised and has not been covered by automated checks.

## Credits

Mess menu data adapted from the SRM IST hostel mess menu (w.e.f. 23.03.2026). All art is original pixel art generated from text in `src/render/art.ts` and related files. The pixel font is [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) via Fontsource.
