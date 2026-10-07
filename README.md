# MESSED UP - survive the week, skip the sambar

A retro pixel-art maze game about a hungry hostel student, built as a coursework project on **AI in games**.
Eat the mess menu, dodge the dishes that chase you, escape through the exit, and come back tomorrow for the Daily Run.

* Pure static front-end (TypeScript + Canvas, ~36 KB gzipped plus a 12 KB font, no image or audio files), so **free Vercel hosting just works**.
* Optional community leaderboard through one Vercel Function + free Upstash Redis.
* No login (dropped on purpose): a nickname, a per-device streak and an optional shared board.

![title](docs/screens/title.png)

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 43 unit tests
npm run build        # typecheck + production build into dist/
npm run playtest 20  # headless bot plays 20 runs per weekday and prints clear rates
npm run snapshot     # renders PNG frames with the real renderer (output in ./snapshots)
npm run foodsheet    # labelled contact sheet of every dish sprite (docs/screens/food-sheet.png)
```

Handy URL flags: `/?autopilot` lets the bot play (great for demos), `/?autopilot&sim=4` runs it 4x faster.

## Deploy to Vercel (free)

1. Push this folder to a GitHub repo.
2. vercel.com -> Add New Project -> import the repo. Vercel detects **Vite** automatically (build `npm run build`, output `dist`). Click Deploy.
3. *Optional, for a community leaderboard:* in the project, Storage -> add the **Upstash Redis** integration from the Marketplace. It injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; redeploy. Without it the game still works and silently uses the per-device board.

## The look: a furnished mess dining hall, not a maze

There is no corridor maze. The hall is *furnished*: separate sets of tables and chairs in different sizes (two-tops, pairs, family and long tables, big tables with six chairs, a round table ringed by stools), booths pushed against the side walls, buffet counters, planters, crates and rice sacks, with aisles of floor between them. What you bump into is the footprint of that furniture. Tables are gingham-clothed or bare wood with place settings, chairs face their table, the top wall is a serving counter, the outer walls are wooden wainscot with brass lamps, and the floor is vertical boards with a red rug under the kitchen where the dishes spawn. A back wall has wallpaper, windows, a menu board and glass cabinets. Each weekday re-dresses the hall (floor stain, tablecloth colour, wallpaper). Dishes are served on plates, characters cast soft shadows, and warm lamp light plus a vignette is baked into the static layer, so the whole scene costs one `drawImage` per frame.

Code: `src/game/furniture.ts` (layout generator), `src/render/hall.ts` (scene painter, floor, furniture, lighting), `src/render/decorArt.ts` (props), `THEMES` in `src/game/config.ts`. Gameplay only ever sees the wall mask, so pathfinding, enemy AI, replays and the leaderboard work unchanged. A test checks that furniture stays clearly lighter than the floor on every day.

![hall](docs/screens/hall-monday.png)

## Screens, settings and responsive layouts

| Screen | What it does |
|---|---|
| **Menu card** | Shown before every run: the day's dishes as pixel icons (tap one for a joke), bonus snack, Maggi, the enemies to avoid, and a quick Easy / Normal / Hard picker. The daily attempt is only used up when you press START. |
| **Settings** | Difficulty, adaptive AI, enemy-path overlay, hint ticker, menu card on/off; CRT scanlines, high contrast, pixel or clear font, text size S/M/L, maze scaling (auto / fill / crisp), particles (full / low / off), reduce motion, FPS counter; on-screen pad (auto / on / off) and its position (left / mid / right), vibration; sound and volume. Everything saves on the device and applies instantly. |
| **Pause** | Quick toggles for sound, scanlines and enemy paths. |

**Difficulty levels** (set in Settings or on the menu card): Easy gives 4 stomachs, slower dishes, a longer Maggi and no boss, with score x0.75. Hard gives faster dishes, quicker releases, a shorter Maggi and an extra enemy, with score x1.5. The final score is multiplied, so Daily ranks stay comparable, and the maze is the same for everyone at every level. Level is part of the run config, so replays stay deterministic.

**Responsive layout** (`src/ui/layout.ts`, pure and tested): a UI scale (1 on phones up to 1.7 on large monitors, times the text-size setting) drives all text and window sizes. Portrait screens stack HUD, maze and pad; landscape screens (phones on their side, laptops, desktops) put the maze on the left and the HUD, hints and pad in a side column. Checked in a headless browser at 360x640, 390x844, 844x390, 820x1180, 1366x768 and 1920x1080 with no horizontal overflow.

![menu card](docs/screens/menu-card.png)
![settings](docs/screens/settings.png)
![desktop](docs/screens/gameplay.png)

## How the game works

| Thing | Rule |
|---|---|
| Goal | Eat every dish to open the exit, then reach it. 3 courses per day: Breakfast, Lunch, Dinner. |
| Lives | 3 stomachs. Touching an enemy costs one. A hunger bar drains and refills when you eat; at zero you lose a stomach. |
| Points | Dish +10 (combo up to x5), bonus snack +100, Maggi power-up lets you eat enemies for 200/400/800/1600, clear bonus for time and stomachs. |
| Warden | Stop eating for 13 s and he appears and hunts you. |
| Perks | After each course pick 1 of 3 (speed, extra stomach, longer Maggi, longer combo, see enemy paths). |
| Daily Run | One ranked attempt per IST day, same mazes for everyone, resets at midnight IST. Streak +1 per day played. |
| Streak Freeze | Every 7th streak day earns one (max 2); it forgives exactly one missed day. |
| Practice | Unlimited, any weekday, random maze, adaptive difficulty, no streak or ranking. |
| Difficulty | Monday (easiest) to Sunday (hardest): more enemies, faster enemies, quicker releases. Menu and level names come from the real SRM mess menu. You can also pick Easy / Normal / Hard (see above). |
| Food art | Every dish on the trimmed SRM menu has its own 12x12 pixel sprite (`src/render/foodArt.ts`), drawn as text with shading. |

## AI in games: what to present

| Module | Technique | Where in code |
|---|---|---|
| Chasing enemy (Sambar Blob) | **A\*** with Manhattan heuristic on a binary min-heap | `src/game/pathfinding.ts`, `enemies.ts` |
| Ambusher (Mystery Curry) | Target prediction: aims 4 tiles ahead of the player's heading | `enemies.ts` (`ambush`) |
| Wanderer (Chapati Ghost) | Stochastic movement (seeded RNG) | `enemies.ts` (`wander`) |
| Moody boss (Wednesday Special) | **Finite state machine**: PATROL <-> CHASE with hysteresis; all enemies share DEN/ACTIVE/SCARED/EATEN modes | `enemies.ts` (`moody`) |
| Level generation | **Procedural content generation** by constraint-based placement: furniture sets are dropped on the floor by rejection sampling (must fit, stay clear of the kitchen/start/corners, keep an aisle unless flush to a wall, never split the floor, checked by flood fill). Dead ends are plugged with clutter, and trap pockets are found with **Tarjan's articulation-point algorithm** and plugged or re-rolled. Then exit/Maggi/food placement. Every hall is verified connected | `src/game/furniture.ts`, `src/game/maze.ts` |
| Adaptive difficulty | **Dynamic difficulty adjustment**: exponential moving average of player performance scales enemy speed (Practice only, so Daily stays fair) | `src/game/difficulty.ts` |
| Bot playtester | Danger-weighted **Dijkstra** agent with momentum and target hysteresis; measures balance without human testers | `src/game/bot.ts`, `scripts/playtest.ts` |
| Determinism / anti-cheat basis | Fixed 60 Hz simulation + seeded RNG: the same inputs always give the same run; `replayRun` proves it | `src/game/run.ts`, test "run determinism" |

The in-game **AI LAB** screen runs these live: pathfinding benchmark, bot playtest, record-and-replay determinism check, and shows the adaptive-difficulty state. A "Show enemy paths" toggle draws every enemy's planned A\* route over the maze.

### Measured results (copy these into your report, then re-run for your own numbers)

Pathfinding on today's maze (AI Lab, 400 random start/goal pairs): A\* expanded about 42 nodes per search against about 104 for Dijkstra and BFS, with identical path lengths (all are optimal on a uniform grid).

Bot playtest (`npm run playtest 24`, 24 full runs per weekday). The bot is a simple floor, humans do better, but the curve shows the intended ramp:

| Day | Breakfast cleared | Lunch cleared | Dinner cleared | Full run cleared |
|---|---|---|---|---|
| Monday | 88% | 76% | 75% | 50% |
| Tuesday | 83% | 55% | 45% | 21% |
| Wednesday | 46% | 73% | 50% | 17% |
| Thursday | 71% | 41% | 14% | 4% |
| Friday | 54% | 54% | 29% | 8% |
| Saturday | 46% | 36% | 25% | 4% |
| Sunday | 38% | 22% | 0% | 0% |

Difficulty levels (bot, 20 full runs per cell, seeds 900+; Wednesday normal vs hard is within sampling noise at this sample size):

| Day | Easy full-run | Normal full-run | Hard full-run | Avg courses cleared (easy / normal / hard) |
|---|---|---|---|---|
| Monday | 95% | 70% | 10% | 2.95 / 2.40 / 1.10 |
| Wednesday | 55% | 10% | 5% | 2.25 / 0.90 / 0.65 |
| Sunday | 55% | 5% | 0% | 2.25 / 0.50 / 0.25 |

Suggested experiments with real players from your college: adaptive on vs off (survival rate and retries), time per course by weekday, and which enemy causes the most deaths.

![AI paths](docs/screens/ai-paths-overlay.png)

## Architecture and design principles

```
src/
  core/      pure utilities: seeded RNG, IST clock, min-heap, safe storage
  game/      the simulation. NO DOM, NO Math.random, NO wall-clock time
             config, menu, maze (PCG), pathfinding, mover, enemies (AI), stage, run, perks, difficulty, bot
  render/    canvas renderer, pixel art defined as text, particles/popups
  audio/     WebAudio synth (no audio files)
  services/  streak rules, profile (localStorage), leaderboard (strategy + fallback)
  ui/        DOM screens, game view, input
api/         leaderboard.ts - Vercel Function (Redis sorted sets)
tests/       43 unit tests
scripts/     headless playtest + PNG snapshot renderer
```

* **Separation of simulation and presentation.** `src/game` runs headless, which is what makes bot playtesting, unit tests, replay and server-side verification possible. The UI only reads state and consumes an event queue.
* **Fixed timestep (60 Hz) with a free-running renderer.** Same behaviour on 60/120/144 Hz screens and on slow phones.
* **Performance.** Maze drawn once to an offscreen canvas; sprites pre-rendered; pooled particles; typed arrays; A\* allocates nothing per search and only runs when an enemy reaches a tile centre with a real choice. HUD touches the DOM only when a value changes.
* **Patterns used.** Strategy (enemy behaviours, leaderboard providers), State machine (enemy modes, run phases), Adapter/Fallback (remote -> local board), Observer-style event queue, Factory seam for canvas (renderer also runs under node).
* **Pure, tested rules.** Streak logic, difficulty model, maze guarantees, pathfinding optimality and determinism each have tests.

## Honest limitations

* **No accounts.** Names are self-chosen; the daily-attempt lock and streak live in the browser's localStorage, so a determined player can clear storage and replay, and the community board trusts submitted scores (the API validates ranges, names and dates, nothing more).
* **Anti-cheat roadmap.** Because runs are deterministic, the client could upload its input log (`run.log`) and the server could re-simulate with `replayRun` and reject mismatches. The simulation is ready for that; the upload and server verification are not built.
* The Vercel API route and Upstash storage are written to Upstash's REST API but were **not exercised against a live Redis** here. Deploy and test it once with a real score before relying on it. The in-browser fallback is tested.
* Audio is synthesized and was not listened to in an automated check.

## Report outline (suggested)

1. Introduction and motivation (community game, retention loop). 2. Survey of game AI (pathfinding, FSMs, PCG, DDA). 3. System design (layers above, free-tier deployment). 4. Each AI module with complexity: A\* O(E log V) per search, DFS maze O(V), BFS validation O(V), DDA O(1) update. 5. Experiments (tables above, plus your player data). 6. Limitations and future work (replay verification, learned enemy policies, accounts). 7. Conclusion.

Mess menu data adapted from the SRM IST hostel mess menu (w.e.f. 23.03.2026). All art is original pixel art generated from text in `src/render/art.ts`.
