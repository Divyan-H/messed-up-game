/**
 * "AI Lab": the part of the game you present in a viva. It exposes the algorithms with live numbers:
 * pathfinding benchmark, bot playtest, determinism check and the adaptive-difficulty state.
 */
import { weekdayOf } from '../../core/clock';
import { hashString, mulberry32 } from '../../core/rng';
import { sfx } from '../../audio/sfx';
import { botRun } from '../../game/bot';
import { THEMES, WEEKDAY_NAMES } from '../../game/config';
import { ENEMY_INFO } from '../../game/content';
import { buildLayout } from '../../game/maze';
import { MENUS } from '../../game/menu';
import { benchmarkAlgorithms } from '../../game/pathfinding';
import { replayRun, type RunConfig } from '../../game/run';
import type { App, Screen } from '../app';
import { button, clear, fmt, h } from '../dom';

const ALGO_LABEL = { astar: 'A* (Manhattan)', dijkstra: 'Dijkstra', bfs: 'BFS' } as const;
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export function aiLabScreen(app: App): Screen {
  const profile = app.profile.get();
  const skill = app.skillModel();
  let alive = true;

  const benchOut = h('div', { class: 'lab-out' }, 'Press RUN to compare the algorithms on today\'s maze.');
  const runBench = () => {
    sfx.click();
    const date = app.today();
    const layout = buildLayout(hashString(`${hashString(`messedup-${date}`)}|layout|0`), {
      foodCount: 28, items: MENUS[weekdayOf(date)]!.breakfast, maggiCount: 2,
    });
    const rows = benchmarkAlgorithms(layout.grid, layout.floor, 400, mulberry32(7));
    clear(benchOut);
    benchOut.append(h('table', { class: 'tbl' },
      h('tr', {}, h('th', {}, 'ALGORITHM'), h('th', {}, 'NODES'), h('th', {}, 'US/SEARCH'), h('th', {}, 'PATH')),
      ...rows.map((r) => h('tr', {}, h('td', {}, ALGO_LABEL[r.algo]), h('td', {}, r.avgExpanded.toFixed(0)), h('td', {}, r.avgMicros.toFixed(1)), h('td', {}, r.avgPathLen.toFixed(1)))),
    ), h('p', { class: 'hint' }, '400 random start/goal pairs. A* expands the fewest nodes because its heuristic points at the goal; all three return equally short paths.'));
  };

  const botOut = h('div', { class: 'lab-out' }, 'Lets the bot play full runs on a weekday and reports clear rate.');
  const daySel = h('select', { class: 'sel' }, ...[1, 2, 3, 4, 5, 6, 0].map((d) => h('option', { value: String(d) }, WEEKDAY_NAMES[d]!)));
  const runBot = async (btn: HTMLButtonElement) => {
    sfx.click();
    btn.disabled = true;
    const wd = Number(daySel.value);
    const total = 8;
    let full = 0;
    let score = 0;
    const stageClear = [0, 0, 0];
    const stageSeen = [0, 0, 0];
    for (let i = 0; i < total && alive; i++) {
      botOut.textContent = `Simulating run ${i + 1}/${total}...`;
      await nextFrame();
      const run = botRun({ mode: 'practice', seed: 500 + i * 131, weekday: wd, dateKey: 'lab', adaptive: 1 });
      run.outcomes.forEach((o, c) => { stageSeen[c]!++; if (o.cleared) stageClear[c]!++; });
      if (run.phase === 'complete') full++;
      score += run.totalScore;
    }
    if (!alive) return;
    clear(botOut);
    botOut.append(h('table', { class: 'tbl' },
      h('tr', {}, h('th', {}, WEEKDAY_NAMES[wd]!.toUpperCase()), h('th', {}, 'RESULT')),
      h('tr', {}, h('td', {}, 'Full runs cleared'), h('td', {}, `${full}/${total}`)),
      h('tr', {}, h('td', {}, 'Average score'), h('td', {}, fmt(Math.round(score / total)))),
      ...['Breakfast', 'Lunch', 'Dinner'].map((n, c) => h('tr', {}, h('td', {}, `${n} cleared`), h('td', {}, stageSeen[c] ? `${stageClear[c]}/${stageSeen[c]}` : '-'))),
    ), h('p', { class: 'hint' }, 'A simple Dijkstra bot (danger-weighted). Humans plan ahead and use Maggi better, so treat this as a floor.'));
    btn.disabled = false;
  };

  const replayOut = h('div', { class: 'lab-out' }, 'Records a bot run, then replays only its inputs and compares the result.');
  const runReplay = () => {
    sfx.click();
    const cfg: RunConfig = { mode: 'daily', seed: hashString(`messedup-${app.today()}`), weekday: weekdayOf(app.today()), dateKey: app.today(), adaptive: 1 };
    const original = botRun(cfg);
    const copy = replayRun(cfg, original.log);
    const ok = original.totalScore === copy.totalScore && original.tickCount === copy.tickCount;
    replayOut.textContent = `Original: ${fmt(original.totalScore)} pts in ${original.tickCount} ticks. Replay: ${fmt(copy.totalScore)} pts in ${copy.tickCount} ticks. ${ok ? 'MATCH - the simulation is deterministic.' : 'MISMATCH!'}`;
  };

  const toggle = (label: string, key: 'showPaths' | 'reducedMotion') => {
    const b = h('button', { class: 'btn small', type: 'button' }, '');
    const paint = () => void (b.textContent = `${label}: ${app.profile.get().settings[key] ? 'ON' : 'OFF'}`);
    b.onclick = () => { sfx.click(); app.toggleSetting(key); paint(); };
    paint();
    return b;
  };

  const runBtn = button('RUN BOT PLAYTEST', () => void runBot(runBtn as HTMLButtonElement), 'small');

  const el = h('div', { class: 'page scroll' },
    h('h2', { class: 'page-title' }, 'AI LAB'),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'ENEMY BRAINS'),
      h('pre', { class: 'diagram' }, 'every enemy:  DEN > ACTIVE <> SCARED > EATEN > DEN\nWednesday Special while ACTIVE:\n  PATROL <> CHASE  (range 7, gives up at 10)'),
      ...(['blob', 'curry', 'chapati', 'special'] as const).map((k) => h('p', { class: 'hint' }, h('b', {}, `${ENEMY_INFO[k].name}: `), ENEMY_INFO[k].blurb)),
      toggle('SHOW ENEMY PATHS IN GAME', 'showPaths'),
    ),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, '1. PATHFINDING BENCHMARK'), button('RUN', runBench, 'small'), benchOut),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, '2. BOT PLAYTESTER'), daySel, runBtn, botOut),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, '3. DETERMINISM CHECK'), button('RECORD + REPLAY', runReplay, 'small'), replayOut),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '4. ADAPTIVE DIFFICULTY'),
      h('p', { class: 'hint' }, `Skill estimate ${profile.skill.toFixed(2)} (${skill.label()}). Enemy speed multiplier x${skill.multiplier().toFixed(2)} in Practice. Daily Runs stay fixed so the ranking is fair.`),
    ),
    h('p', { class: 'hint' }, `Today: ${THEMES[weekdayOf(app.today())]!.name}.`),
    button('BACK', () => { sfx.click(); app.goTitle(); }),
  );
  return { el, dispose: () => void (alive = false) };
}
