/**
 * Headless bot playtest: `npm run playtest [runsPerDay]`.
 * Prints clear-rate and score per weekday so the difficulty curve can be tuned with data.
 */
import { botRun } from '../src/game/bot';
import { THEMES, tierOf } from '../src/game/config';

function main(): void {
  const runs = Number(process.argv[2] ?? 20);
  const days = [1, 2, 3, 4, 5, 6, 0];
  console.log(`Bot playtest, ${runs} runs per weekday\n`);
  console.log('day        tier  B-clear  L-clear  D-clear  full-run  avg-score  avg-time(s)  avg-lives-lost');
  for (const wd of days) {
    const cleared = [0, 0, 0];
    const reached = [0, 0, 0];
    let full = 0;
    let score = 0;
    let time = 0;
    let lives = 0;
    for (let i = 0; i < runs; i++) {
      const run = botRun({ mode: 'practice', seed: 1000 + i * 7919 + wd, weekday: wd, dateKey: 'test', adaptive: 1 });
      run.outcomes.forEach((o, c) => {
        reached[c]!++;
        if (o.cleared) cleared[c]!++;
      });
      if (run.phase === 'complete') full++;
      score += run.totalScore;
      time += run.totals.time;
      lives += run.totals.lives;
    }
    const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-').padStart(7);
    console.log(
      `${THEMES[wd]!.name.padEnd(10)} ${String(tierOf(wd)).padStart(4)} ${pct(cleared[0]!, reached[0]!)}  ${pct(cleared[1]!, reached[1]!)}  ${pct(cleared[2]!, reached[2]!)}  ${pct(full, runs)}  ${String(Math.round(score / runs)).padStart(9)}  ${(time / runs).toFixed(0).padStart(11)}  ${(lives / runs).toFixed(1).padStart(14)}`,
    );
  }
}

if (process.argv[1]?.endsWith('playtest.ts')) main();
