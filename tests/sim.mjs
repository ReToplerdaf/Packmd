// Headless-симуляция баланса: N прогонов на профиль игрока, вывод — рост
// уровня, смерти и зачищенные стаи в час, доля сбежавших мобов.
// Время — игровое при текущих настройках (TUNE_DEFAULTS, speed 0.5), то есть
// «час» здесь — час у игрока перед экраном.
//
//   node tests/sim.mjs                         # 4 прогона × 30 мин на профиль
//   node tests/sim.mjs --runs 8 --minutes 60
//   node tests/sim.mjs --profiles "активный:1,средний:0.7,пассивный:0"
//   node tests/sim.mjs --tune '{"critRate":0.7}'   # проверить другие числа
//   node tests/sim.mjs --no-equip              # не надевать лут
//   node tests/sim.mjs --profiles "точный:1:0.3,неровный:0.9:0.9"   # третье число — разброс нажатия (jitter)
//
// Бот: с вероятностью skill реагирует на каждую угрозу (блок крита и
// выстрела, контра, раскол щита, прерывание хилера) в середине окна.
// skill 0 — игрок не жмёт ничего. После 2 смертей подряд выбирает
// «отступить». Лут надевается, если подсказка игры (item.score) лучше.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, run, ROOT, OUT } from './lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const runs = +opt('--runs', 4);
const minutes = +opt('--minutes', 30);
const tune = opt('--tune', null) ? JSON.parse(opt('--tune')) : undefined;
const equip = !args.includes('--no-equip');
const target = path.resolve(ROOT, opt('--target', 'index.html'));
const profiles = opt('--profiles', 'активный:1,средний:0.7,пассивный:0').split(',').map(s => {
  const [name, skill, jitter] = s.split(':'); return { name, skill: +skill, jitter: +(jitter || 0) };
});
const parallel = +opt('--parallel', 4);
const frames = Math.round(minutes * 60 * 60);

const browser = await launch();
const jobs = [];
for (const p of profiles) for (let r = 0; r < runs; r++) jobs.push({ p, seed: 1000 + r });

async function one(job) {
  const g = await openGame(browser, target, { seed: job.seed, tune });
  const samples = await run(g.page, frames, { sample: 600, bot: { skill: job.p.skill, jitter: job.p.jitter, prompt: 'retreat', equip } });
  await g.close();
  if (g.errors.length) throw new Error('ошибки в игре: ' + g.errors.slice(0, 3).join('; '));
  return { profile: job.p.name, skill: job.p.skill, seed: job.seed, samples };
}

const results = [];
const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    results.push(await one(job));
    process.stderr.write(`  ${results.length}/${jobs.length}\r`);
  }
}));
await browser.close();

// ── сводка ──
const hours = minutes / 60;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
const rows = profiles.map(p => {
  const rs = results.filter(r => r.profile === p.name).map(r => r.samples[r.samples.length - 1]);
  const flee = rs.map(s => s.flees / Math.max(1, s.kills + s.flees));
  const block = rs.map(s => s.crits ? s.blocked / s.crits : 0);
  return {
    profile: p.name, skill: p.skill, runs: rs.length,
    level: mean(rs.map(s => s.level + s.xp / (60 * Math.pow(s.level, 1.5)))),
    levelsPerHour: mean(rs.map(s => (s.level - 1 + s.xp / (60 * Math.pow(s.level, 1.5))) / hours)),
    deathsPerHour: mean(rs.map(s => s.deaths / hours)),
    packsPerHour: mean(rs.map(s => s.cleared / hours)),
    retreatsPerHour: mean(rs.map(s => s.retreats / hours)),
    fleeShare: mean(flee), blockShare: mean(block),
    killsPerHour: mean(rs.map(s => s.kills / hours)),
    comboBest: mean(rs.map(s => s.combo ? s.combo.best : 0)),
    perfectShare: mean(rs.map(s => s.combo && s.combo.blocked ? s.combo.perfect / s.combo.blocked : 0)),
    bonusShare: mean(rs.map(s => { const t = s.combo && s.combo.tierMs; const all = t ? t.reduce((a, b) => a + b, 0) : 0; return all ? (all - t[0]) / all : 0; })),
  };
});

console.log(`\nСимуляция: ${runs} прогона × ${minutes} мин игрового времени на профиль` +
  (tune ? `, настройки ${JSON.stringify(tune)}` : ', настройки по умолчанию') + (equip ? '' : ', без лута') +
  ` (${((Date.now() - t0) / 1000).toFixed(0)} с)\n`);
console.log('профиль      skill  уровень  ур/час  стай/час  убийств/час  смертей/час  отступл/час  сбежало  блок крита  серия  идеально  с бонусом');
for (const r of rows) {
  console.log(`${r.profile.padEnd(12)} ${fmt(r.skill, 2).padStart(5)}  ${fmt(r.level).padStart(7)}  ${fmt(r.levelsPerHour).padStart(6)}  ${fmt(r.packsPerHour).padStart(8)}  ${fmt(r.killsPerHour, 0).padStart(11)}  ${fmt(r.deathsPerHour).padStart(11)}  ${fmt(r.retreatsPerHour).padStart(11)}  ${(fmt(r.fleeShare * 100, 0) + '%').padStart(7)}  ${(fmt(r.blockShare * 100, 0) + '%').padStart(10)}  ${fmt(r.comboBest, 0).padStart(5)}  ${(fmt(r.perfectShare * 100, 0) + '%').padStart(8)}  ${(fmt(r.bonusShare * 100, 0) + '%').padStart(9)}`);
}
const base = rows.find(r => r.skill === 0);
if (base) for (const r of rows) if (r !== base && base.levelsPerHour > 0) console.log(`  ${r.profile} растёт в ${fmt(r.levelsPerHour / base.levelsPerHour, 2)} раза быстрее пассивного`);

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `sim-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ runs, minutes, tune, equip, rows, results }, null, 1));
console.log('\nподробно (уровень по времени для каждого прогона):', path.relative(ROOT, file));
