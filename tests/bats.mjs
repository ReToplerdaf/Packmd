// Налёт летучих мышей в основной игре: мышь прилетает посреди боя, бегает по
// дугам у кнопок и глушит кнопку, у которой сидит; урона не наносит; касание
// по красной убивает её и освобождает кнопку; авто ловит сам; тумблер выключает.
//   node tests/bats.mjs
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

const st = page => page.evaluate(() => ({
  bat: !!CIRCLE.mob, hop: !!CIRCLE.hop, ai: CIRCLE.ai, red: !!CIRCLE.red, x: CIRCLE.x, y: CIRCLE.y,
  phase: S.phase, hp: S.hp, combo: COMBO.n,
  gBlocked: batBlocks('guard'), sBlocked: batBlocks('strike'),
  gClass: document.getElementById('btn-guard').classList.contains('bat-blocked'),
  sClass: document.getElementById('btn-strike').classList.contains('bat-blocked')
}));
async function until(page, fn, max = 3000) {
  for (let i = 0; i < max; i++) { const s = await st(page); if (fn(s)) return s; await run(page, 1, {}); }
  return st(page);
}
const tapBat = (page, dx = 0, dy = 0) => page.evaluate(([dx, dy]) => {
  var cv = document.getElementById('arena'), r = cv.getBoundingClientRect();
  var o = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: r.left + CIRCLE.x + dx, clientY: r.top + CIRCLE.y + dy };
  var t = document.elementFromPoint(o.clientX, o.clientY) || cv;
  t.dispatchEvent(new PointerEvent('pointerdown', o));
  t.dispatchEvent(new PointerEvent('pointerup', o));
}, [dx, dy]);

{
  // мобы не бьют: проверяем только мышь
  const g = await openGame(browser, file, { seed: 5, tune: { mobRate: 1e8, rangedInterval: 1e8 } });
  let s = await until(g.page, s => s.phase === 'fight');
  await g.page.evaluate(() => { RAID.at = performance.now(); S.hp = S.stats.maxHp = 1e6; });
  s = await until(g.page, s => s.bat && !s.hop);
  check('мышь прилетела и села в дугу у кнопки', s.bat && !s.hop, s);
  check('кнопка у мыши заглушена (и серая), другая работает',
    (s.ai === 0 ? s.gBlocked && s.gClass && !s.sBlocked : s.sBlocked && s.sClass && !s.gBlocked), s);
  await g.page.screenshot({ path: path.join(OUT, 'bats-1.png') });

  // нажатие заглушенной «Защиты» не открывает окно блока
  s = await until(g.page, s => s.gBlocked && !s.red, 4000);
  const guardOpened = await g.page.evaluate(() => { var before = S.guardUntil; pressGuard(); return S.guardUntil !== before; });
  check('заглушенная «Защита» не блокирует', s.gBlocked && !guardOpened, { blocked: s.gBlocked, guardOpened });

  // пропущенная красная — урона нет, мышь остаётся
  s = await until(g.page, s => s.red);
  const hp0 = await g.page.evaluate(() => { S.mobSwingAt = Infinity; S.telegraph = null; S.pack.forEach(m => { m.rangedTelegraph = null; m.rangedSwingAt = Infinity; }); return S.hp; });
  s = await until(g.page, s => !s.red);
  check('не успел по красной — урона нет, мышь на месте', s.bat && s.hp === hp0, { hp0, hp: s.hp, bat: s.bat });

  // касание по красной — мышь убита, кнопки свободны
  s = await until(g.page, s => s.red && !s.hop);
  await tapBat(g.page, 4, -4);
  s = await st(g.page);
  check('касание по красной — мышь убита, кнопки свободны, серия', !s.bat && !s.gBlocked && !s.sBlocked && s.combo > 0, s);
  check('нет ошибок в консоли', g.errors.length === 0, g.errors);
  await g.close();
}

// бот проходит бой с налётами, мыши ловятся
{
  const g = await openGame(browser, file, { seed: 6, tune: { batEvery: 5000 } });
  await run(g.page, 8000, { bot: { skill: 1 } });
  const r = await g.page.evaluate(() => ({ progress: S.progress, kills: S.kills, combo: COMBO.sess.blocked }));
  check('бот с налётами проходит стаи', r.progress >= 3, r);
  check('нет ошибок в консоли (бот)', g.errors.length === 0, g.errors);
  await g.close();
}

// тумблер выключает налёт
{
  const g = await openGame(browser, file, { seed: 5, tune: { bats: false, batEvery: 5000 } });
  await run(g.page, 3000, { bot: { skill: 1 } });
  const s = await st(g.page);
  check('налёт выключен — мышей нет', !s.bat, s);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
