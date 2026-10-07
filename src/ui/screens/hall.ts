import { addDays } from '../../core/clock';
import { sfx } from '../../audio/sfx';
import { ACHIEVEMENTS } from '../../game/content';
import type { BoardKind } from '../../services/leaderboard';
import type { App, Screen } from '../app';
import { button, clear, fmt, h } from '../dom';
import { paneSet } from '../widgets';

const TABS: Array<{ kind: BoardKind; label: string }> = [
  { kind: 'daily', label: 'TODAY' },
  { kind: 'alltime', label: 'ALL-TIME' },
  { kind: 'streak', label: 'STREAKS' },
];

export function hallScreen(app: App): Screen {
  const profile = app.profile.get();
  const date = app.today();
  let tab: BoardKind = 'daily';
  let alive = true;

  const list = h('div', { class: 'board' });
  const source = h('div', { class: 'source' });
  const tabBar = h('div', { class: 'tabs' });

  const render = async () => {
    clear(list);
    list.append(h('p', { class: 'hint' }, 'LOADING...'));
    const rows = await app.board.top(tab, date, 10);
    if (!alive) return;
    clear(list);
    source.textContent = app.board.source === 'online' ? 'ONLINE - whole community' : 'THIS DEVICE ONLY - community board not connected';
    source.className = `source ${app.board.source}`;
    if (!rows.length) list.append(h('p', { class: 'hint' }, 'Nobody here yet. Be the first!'));
    rows.forEach((r, i) => {
      const value = tab === 'streak' ? `${r.streak} d` : fmt(r.score);
      list.append(h('div', { class: `row ${r.name === profile.nickname ? 'me' : ''}` },
        h('span', { class: 'rank' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'who' }, r.name),
        h('span', { class: 'val' }, value),
      ));
    });
  };

  const drawTabs = () => {
    clear(tabBar);
    for (const t of TABS) {
      tabBar.append(h('button', {
        class: `tab ${t.kind === tab ? 'on' : ''}`,
        type: 'button',
        onclick: () => { sfx.click(); tab = t.kind; drawTabs(); void render(); },
      }, t.label));
    }
  };
  drawTabs();
  void render();

  // streak calendar: last 14 days
  const days = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13));
  const calendar = h('div', { class: 'cal' }, ...days.map((d) => {
    const rec = profile.daily[d];
    return h('div', { class: `cell ${rec ? 'on' : ''} ${d === date ? 'today' : ''}`, title: rec ? `${d}: ${rec.score}` : d }, d.slice(8));
  }));

  const unlocked = new Set(profile.achievements);
  const badges = h('div', { class: 'badges' }, ...ACHIEVEMENTS.map((a) =>
    h('div', { class: `badge ${unlocked.has(a.id) ? 'on' : ''}` }, h('b', {}, unlocked.has(a.id) ? a.name : '???'), h('span', {}, a.desc)),
  ));

  const el = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'HALL OF FAME'), button('BACK', () => { sfx.click(); app.goTitle(); }, 'ghost small')),
    paneSet([
      { label: 'BOARD', nodes: [h('div', { class: 'card' }, tabBar, source, list)] },
      {
        label: 'STATS',
        nodes: [
          h('div', { class: 'card' },
            h('div', { class: 'card-title' }, 'YOUR STATS'),
            h('div', { class: 'stats' },
              h('div', {}, h('b', {}, fmt(profile.bestScore)), h('span', {}, 'BEST DAILY')),
              h('div', {}, h('b', {}, String(profile.streak.best)), h('span', {}, 'BEST STREAK')),
              h('div', {}, h('b', {}, String(profile.runs)), h('span', {}, 'RUNS')),
              h('div', {}, h('b', {}, fmt(profile.totalFood)), h('span', {}, 'DISHES EATEN')),
            ),
          ),
          h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'LAST 14 DAYS'), calendar),
        ],
      },
      { label: 'BADGES', nodes: [h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'ACHIEVEMENTS'), badges)] },
    ]),
  );
  return { el, fit: true, dispose: () => void (alive = false) };
}
