// Версия «кружок» (index.html?circle): все мобы — кружок; он бегает по двум дугам у кнопок и перепрыгивает между ними,
// краснеет; касание по красному убивает моба, не успел — урон герою; тычок
// мимо или по зелёному — откат; удержание на кружке двигает область.
// Касания — настоящими событиями pointer по канвасу.
//   node tests/circle.mjs
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
  var q = circleUV(circleArc(CIRCLE.ai), CIRCLE.u, CIRCLE.v);
  return { mode: CIRCLE_MODE, phase: S.phase, types: S.pack.map(m => m.type), kills: S.kills, hp: S.hp, max: S.stats.maxHp,
    x: CIRCLE.x, y: CIRCLE.y, red: !!CIRCLE.red, cool: performance.now() < CIRCLE.coolUntil, has: !!CIRCLE.mob,
    inArea: !!CIRCLE.hop || Math.hypot(CIRCLE.x - q.x, CIRCLE.y - q.y) < 1, ai: CIRCLE.ai, hop: !!CIRCLE.hop,
    area: CIRCLE.area, combo: COMBO.n, tut: !!S.tut, biomes: TUNE.biomes, saveKey: SAVE_KEY };
});
const tap = (page, dx, dy, up = true) => page.evaluate(([dx, dy, up]) => {
  var cv = document.getElementById('arena'), r = cv.getBoundingClientRect();
  var o = { bubbles: true, pointerId: 1, isPrimary: true, clientX: r.left + CIRCLE.x + dx, clientY: r.top + CIRCLE.y + dy };
  cv.dispatchEvent(new PointerEvent('pointerdown', o));
  if (up) cv.dispatchEvent(new PointerEvent('pointerup', o));
  return true;
}, [dx, dy, up]);
async function until(page, fn, max = 2000) {
  for (let i = 0; i < max; i++) { const s = await st(page); if (fn(s)) return s; await run(page, 1, {}); }
  return st(page);
}

{
  const g = await openGame(browser, file, { seed: 5, query: '?circle' });
  let s = await until(g.page, s => s.phase === 'fight' && s.has);
  check('режим «кружок»: все мобы — кружок, без обучения и биомов, своё сохранение',
    s.mode && s.types.length > 0 && s.types.every(t => t === 'circle') && !s.tut && !s.biomes && s.saveKey === 'arena.circle.save', s);

  // кружок бегает по области и не выходит за неё
  const pts = [];
  for (let i = 0; i < 40; i++) { await run(g.page, 6, {}); pts.push(await st(g.page)); }
  const moved = new Set(pts.map(p => Math.round(p.x) + ',' + Math.round(p.y))).size;
  check('кружок бегает по дуге и не выходит за неё', moved > 10 && pts.every(p => p.inArea || p.red), { moved, out: pts.filter(p => !p.inArea).length });
  // перепрыгивает из левой дуги в правую и обратно
  const sides = new Set(), hops = [];
  for (let i = 0; i < 300; i++) { await run(g.page, 4, {}); const p = await st(g.page); sides.add(p.ai); if (p.hop) hops.push(p.y); }
  check('перепрыгивает между дугами', sides.size === 2 && hops.length > 0, { sides: [...sides], hops: hops.length });
  await g.page.screenshot({ path: path.join(OUT, 'circle-green.png') });

  // тычок по зелёному — откат; во время отката красный не пробить
  s = await until(g.page, s => !s.red && s.has);
  await tap(g.page, 0, 0);
  s = await st(g.page);
  check('тычок по зелёному — откат (циферблат)', s.cool, s);
  await run(g.page, 4, {});
  await g.page.screenshot({ path: path.join(OUT, 'circle-cool.png') });

  // краснеет только на остановке и, пока красный, стоит на месте
  {
    const r0 = await until(g.page, s => s.red);
    const moving = await g.page.evaluate(() => !!CIRCLE.hop || performance.now() >= CIRCLE.stopUntil);
    await run(g.page, 8, {});
    const r1 = await st(g.page);
    check('красный — только на остановке и не двигается', !moving && r1.red && r1.x === r0.x && r1.y === r0.y, { moving, a: [r0.x, r0.y], b: [r1.x, r1.y] });
  }
  // не успели по красному — урон герою, моб жив
  let before = await until(g.page, s => s.red && !s.cool);
  const k0 = before.kills;
  await g.page.screenshot({ path: path.join(OUT, 'circle-red.png') });
  s = await until(g.page, s => !s.red);
  check('не успел по красному — урон герою, моб жив', s.hp < before.hp && s.kills === k0, [before.hp, s.hp]);

  // попал по красному — моб умирает
  await g.page.evaluate(() => { S.hp = S.stats.maxHp; });
  before = await until(g.page, s => s.red && !s.cool);
  await tap(g.page, 5, -5);
  s = await st(g.page);
  check('попал по красному — моб умер, серия выросла', s.kills === before.kills + 1 && s.hp >= before.hp && s.combo > 0, [before.kills, s.kills, s.combo]);

  // удержание на кружке двигает область и запоминает её
  s = await until(g.page, s => s.has && !s.cool && !s.red);
  const a0 = s.area;
  await tap(g.page, 0, 0, false);
  await run(g.page, 40, {});                       // держим дольше порога
  await g.page.evaluate(() => {
    var cv = document.getElementById('arena'), r = cv.getBoundingClientRect(), h = CIRCLE.hold;
    var o = { bubbles: true, pointerId: 1, isPrimary: true, clientX: r.left + h.x0 - 60, clientY: r.top + h.y0 - 80 };
    cv.dispatchEvent(new PointerEvent('pointermove', o));
    cv.dispatchEvent(new PointerEvent('pointerup', o));
  });
  s = await st(g.page);
  const stored = await g.page.evaluate(() => (JSON.parse(localStorage.getItem('arena.circle.arcs')) || [])[CIRCLE.ai]);
  check('удержание на кружке двигает область и она запоминается', s.area.x < a0.x && s.area.y < a0.y && stored && stored.y === s.area.y && !s.cool, [a0, s.area]);
  await g.page.screenshot({ path: path.join(OUT, 'circle-moved.png') });
  check('нет ошибок в консоли', g.errors.length === 0, g.errors);
  await g.close();
}

// бот (как в симуляции) бьёт по красному настоящими касаниями — проходит стаи без урона
{
  const g = await openGame(browser, file, { seed: 6, query: '?circle' });
  await run(g.page, 6000, { bot: { skill: 1 } });
  const s = await st(g.page);
  const prog = await g.page.evaluate(() => S.progress);
  check('бот с точным касанием проходит стаи', prog >= 3 && s.kills >= 8, { prog, kills: s.kills, hp: s.hp });
  check('нет ошибок в консоли (бот)', g.errors.length === 0, g.errors);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
