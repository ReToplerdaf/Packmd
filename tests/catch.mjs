// Механика «поймай»: мобы биомов (рыба, летучая мышь, змея, голем) показывают
// цель на экране; касание по ней в окне бьёт моба, промах — урон герою.
// Касания идут настоящими событиями pointerdown по канвасу.
//   node tests/catch.mjs
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

// Ставит впереди моба нужного вида (в бою, чекпоинт его биома) и начинает его ход.
const setup = (page, type, progress) => page.evaluate(([type, progress]) => {
  S.progress = progress; S.pack = []; S.phase = 'walk'; S.phaseUntil = 0;
  return true;
}, [type, progress]).then(() => run(page, 10, {})).then(() => page.evaluate(type => {
  var ms = mobStats(S.packLevel, false), st = BIOME_MOB_STATS[type];
  var m = { maxHp: Math.round(ms.maxHp * st.hp) * 5, hp: Math.round(ms.maxHp * st.hp) * 5, atk: ms.atk, xp: ms.xp, leader: false, staggerUntil: 0, hurt: 0,
    wob: 1, size: 1, shield: false, pulse: null, rage: 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
    type: type, healPulse: null, rangedTelegraph: null, rangedSwingAt: 0 };
  S.pack = [m]; S.telegraph = null; CATCH.ev = null; S.hp = S.stats.maxHp;
  S.heroSwingAt = performance.now() + 1e9;              // авто-атака не мешает считать урон
  S.mobSwingAt = performance.now();
  return true;
}, type));
const state = page => page.evaluate(() => {
  var ev = CATCH.ev, m = S.pack[0];
  return { ev: ev ? { kind: ev.kind, open: performance.now() >= ev.openAt, n: ev.targets.length, left: ev.targets.filter(t => !t.hit).length } : null,
    mobHp: m ? m.hp : null, heroHp: S.hp, max: S.stats.maxHp, combo: COMBO.n };
});
// Ждёт открытия цели и жмёт по каждой не сбитой цели в её точке (или мимо).
async function tapTargets(page, miss) {
  for (let i = 0; i < 200; i++) { const s = await state(page); if (s.ev && s.ev.open) break; await run(page, 1, {}); }
  return page.evaluate(miss => {
    var cv = document.getElementById('arena'), r = cv.getBoundingClientRect();
    CATCH.ev.targets.forEach(function (t) {
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + t.x + (miss ? 200 : 0), clientY: r.top + t.y + (miss ? 200 : 0) }));
    });
    return true;
  }, miss);
}

const kinds = [['fish', 0], ['bat', 10], ['snake', 20], ['golem', 30]];
for (const [type, progress] of kinds) {
  const g = await openGame(browser, file, { seed: 3 });
  await run(g.page, 120, {});
  await setup(g.page, type, progress);
  await run(g.page, 2, {});
  let s = await state(g.page);
  check(`${type}: ход моба — цель «поймай» вместо крита`, s.ev && s.ev.kind === type && !g.page.isClosed() && s.ev.n === (type === 'golem' ? 3 : 1), s);
  const before = s;
  await run(g.page, 20, {});
  await g.page.screenshot({ path: path.join(OUT, `catch-${type}-lead.png`) });
  await tapTargets(g.page, false);
  await g.page.screenshot({ path: path.join(OUT, `catch-${type}-hit.png`) });
  s = await state(g.page);
  check(`${type}: попал — моб получил урон, герой цел, серия выросла`, !s.ev && s.mobHp < before.mobHp && s.heroHp === before.heroHp && s.combo > 0, s);

  // промах: касание мимо, окно закрылось — урон герою, серия сброшена
  await g.page.evaluate(() => { S.mobSwingAt = performance.now(); });
  await run(g.page, 2, {});
  const b2 = await state(g.page);
  await tapTargets(g.page, true);
  for (let i = 0; i < 200; i++) { const x = await state(g.page); if (!x.ev) break; await run(g.page, 1, {}); }
  s = await state(g.page);
  check(`${type}: промах — урон герою, моб цел, серия сброшена`, b2.ev && s.heroHp < b2.heroHp && s.mobHp === b2.mobHp && s.combo === 0, [b2, s]);
  check(`${type}: нет ошибок в консоли`, g.errors.length === 0, g.errors);
  await g.close();
}

// Бот (как в симуляции) жмёт по целям настоящими касаниями; в авто цели гасятся сами.
{
  const g = await openGame(browser, file, { seed: 4, tune: { biomeMobRate: 1 } });
  await run(g.page, 60, {});
  await setup(g.page, 'bat', 10);
  await run(g.page, 200, { bot: { skill: 1 } });
  const s = await state(g.page);
  check('бот попадает по летучей мыши', s.heroHp === s.max && s.mobHp < 1e9, s);
  await g.page.evaluate(() => { AUTO.lastInput = -1e9; TUNE.autoBlock = 1; S.mobSwingAt = performance.now() + 50; });
  await run(g.page, 200, {});
  const a = await state(g.page);
  check('авто с шансом блока гасит цель без урона', a.heroHp === a.max, a);
  check('нет ошибок в консоли (бот, авто)', g.errors.length === 0, g.errors);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
