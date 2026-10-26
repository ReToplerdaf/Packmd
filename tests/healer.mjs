// Ярость хилера: непрерванный каст, который можно было прервать, на один раз
// вдвое сокращает промежуток до следующего каста, глаза горят зелёным;
// яростный каст (прерван или нет) снимает ярость; прерванный каст, каст за
// щитом переднего и выключенный тумблер ярость не дают; «Атака» не вовремя — даёт.
//   node tests/healer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, run, ROOT, OUT } from './lib/harness.mjs';

const file = path.resolve(ROOT, 'index.html');
const browser = await launch();
let failed = 0;
function check(name, ok, info) {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`);
}
fs.mkdirSync(OUT, { recursive: true });

const st = page => page.evaluate(() => {
  var h = S.pack.find(m => m.type === 'healer');
  return { phase: S.phase, now: performance.now(), rage: h ? (h.healRage || 0) : -1,
    cast: !!(h && h.healPulse), start: h && h.healPulse ? h.healPulse.start : 0,
    hitAt: h && h.healPulse ? h.healPulse.hitAt : 0, swing: h ? h.healSwingAt : 0 };
});
async function until(page, fn, max = 4000) {
  for (let i = 0; i < max; i++) { const s = await st(page); if (fn(s)) return s; await run(page, 1, {}); }
  return st(page);
}
// Стая: передний (неубиваемый, ранен) и хилер; больше никто не действует.
async function setup(tune) {
  const g = await openGame(browser, file, { seed: 7, tune: Object.assign({ mobRate: 1e8, rangedInterval: 1e8, autoAfter: 0, bats: false }, tune) });
  await until(g.page, s => s.phase === 'fight');
  await g.page.evaluate(() => {
    var f = S.pack[0], h = S.pack[1];
    f.type = 'normal'; f.shield = false; f.pulse = null; f.maxHp = 1e9; f.hp = 3e8;
    h.type = 'healer'; h.maxHp = h.hp = 1; h.healPulse = null; h.healSwingAt = performance.now(); h.dormant = false;
    S.pack.length = 2;
    S.hp = S.stats.maxHp = 1e6; S.mobSwingAt = Infinity; S.telegraph = null;
  });
  return g;
}
// Ждём начала каста и его конца без нажатий; возвращаем старт.
async function castThrough(page) {
  const a = await until(page, s => s.cast);
  await until(page, s => !s.cast);
  return a;
}
// Ждём каст и жмём «Атаку» ровно в момент лечения (щелчок).
async function castInterrupt(page) {
  const a = await until(page, s => s.cast);
  await until(page, s => s.now >= a.hitAt);
  await page.evaluate(() => { S.lastStrike = -1e9; pressStrike(); });
  return a;
}

{
  const g = await setup({});
  const c1 = await castThrough(g.page);
  let s = await st(g.page);
  check('пропущенный каст — ярость', s.rage === 1, s);
  const shot = path.join(OUT, 'healer-rage.png');
  await g.page.evaluate(() => { var h = S.pack[1]; S.pack.splice(1, 1); S.pack.unshift(h); });
  await run(g.page, 2, {});
  await g.page.screenshot({ path: shot });
  await g.page.evaluate(() => { var h = S.pack[0]; S.pack.splice(0, 1); S.pack.push(h); S.pack[0].hp = 3e8; });
  const c2 = await castThrough(g.page);
  const gap1 = c2.start - c1.start;
  s = await st(g.page);
  check('яростный каст сделан — ярость прошла', s.rage === 0, s);
  const c3 = await until(g.page, s => s.cast);
  const gap2 = c3.start - c2.start;
  // ход дальше без ярости: обычный промежуток (±15%) — минимум 0.85 / 0.5 speed
  check('промежуток после промаха вдвое короче, потом обычный', gap1 < gap2 * 0.7 && gap2 > 5000 * 0.85 / 0.5 - 50, { gap1, gap2 });
  check('без ошибок в консоли', !g.errors.length, g.errors);
  await g.close();
}
{
  const g = await setup({});
  await castInterrupt(g.page);
  let s = await st(g.page);
  check('прерванный каст — ярости нет', s.rage === 0 && !s.cast, s);
  await g.close();
}
{
  const g = await setup({});
  await castThrough(g.page);
  await castInterrupt(g.page);
  const s = await st(g.page);
  check('яростный каст прерван — ярость прошла', s.rage === 0, s);
  await g.close();
}
{
  const g = await setup({});
  const a = await until(g.page, s => s.cast);
  await g.page.evaluate(() => { S.lastStrike = -1e9; pressStrike(); });   // рано, до окна
  const s = await st(g.page);
  check('«Атака» не вовремя — лечение сразу и ярость', s.rage === 1 && !s.cast, s);
  await g.close();
}
{
  const g = await setup({});
  await g.page.evaluate(() => { S.pack[0].shield = true; });
  await castThrough(g.page);
  const s = await st(g.page);
  check('каст за щитом переднего (прервать нельзя) — ярости нет', s.rage === 0, s);
  await g.close();
}
{
  const g = await setup({ healRage: false });
  await castThrough(g.page);
  const s = await st(g.page);
  check('тумблер выключен — ярости нет', s.rage === 0, s);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
