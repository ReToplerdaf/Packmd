// Мобы по главам: в Высохшем русле только красные (и налёт), щитовики — с Пещеры,
// дальники — с Пустынного города, хилеры — с Метеорита, со второго круга всё.
// Карточка «Новый враг» при первой встрече, короткое обучение, сохранение, тумблер.
//   node tests/unlock.mjs
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

// Типы мобов в 60 стаях на заданном чекпоинте (без стаи главаря).
const typesAt = (page, progress) => page.evaluate(p => {
  var seen = {}, keep = S.progress;
  for (var i = 0; i < 60; i++) {
    S.progress = p; spawnPack(performance.now());
    S.pack.forEach(function (m) { if (!m.leader) seen[m.type] = (seen[m.type] || 0) + 1; });
  }
  S.progress = keep; S.pack = []; S.phase = 'walk'; S.phaseUntil = 0;
  return seen;
}, progress);
// Бот сам закрывает карточки, поэтому показы записываем на лету.
const RECORD = () => {
  window.__cards = [];
  var mi = mobIntro, ts = tutShow;
  mobIntro = function (t) { mi(t); __cards.push({ type: t, step: el.tutStep.textContent, h: el.tutH.textContent, text: el.tutText.textContent, paused: S.paused && !el.tutOverlay.hidden }); };
  tutShow = function (k) { var was = S.tut && S.tut.shown[k]; ts(k); if (!was) __cards.push({ type: k, step: el.tutStep.textContent, h: el.tutH.textContent, text: el.tutText.textContent, paused: S.paused }); };
};
const card = page => page.evaluate(() => { var c = __cards.shift(); return c ? Object.assign({ shown: true }, c) : { shown: false }; });
async function untilCard(page, max = 4000, opt = { bot: { skill: 1 } }) {
  for (let i = 0; i < max; i += 20) { const c = await card(page); if (c.shown) return c; await run(page, 20, opt); }
  return card(page);
}
// Стая из заданных мобов на чекпоинте p (впереди — первый).
const forcePack = (page, p, types) => page.evaluate(([p, types]) => {
  S.progress = p; S.pack = []; S.phase = 'walk'; S.phaseUntil = 0; S.deathStreak = 0;
  var orig = rollMobType, i = 0;
  rollMobType = function () { return types[i++ % types.length]; };
  TUNE.packMin = TUNE.packMax = types.length;
  spawnPack(performance.now());
  rollMobType = orig; TUNE.packMin = 3; TUNE.packMax = 5;
  S.phase = 'fight';
}, [p, types]);

{
  const g = await openGame(browser, file, { seed: 5, tune: { autoAfter: 0 } });
  await run(g.page, 60, {});
  await g.page.evaluate(RECORD);
  const t0 = await typesAt(g.page, 3), t1 = await typesAt(g.page, 13), t2 = await typesAt(g.page, 23), t3 = await typesAt(g.page, 33), t4 = await typesAt(g.page, 43);
  check('Высохшее русло — только красные', Object.keys(t0).join() === 'normal', t0);
  check('Пещера — появляются щитовики, дальников и хилеров нет', t1.yellow > 0 && !t1.ranged && !t1.healer, t1);
  check('Пустынный город — появляются дальники, хилеров нет', t2.yellow > 0 && t2.ranged > 0 && !t2.healer, t2);
  check('Метеорит — появляются хилеры', t3.yellow > 0 && t3.ranged > 0 && t3.healer > 0, t3);
  check('второй круг — открыто всё', t4.yellow > 0 && t4.ranged > 0 && t4.healer > 0, t4);

  // надпись о новом биоме называет новых врагов
  await g.page.evaluate(() => { S.progress = 9; spawnPack(performance.now()); S.progress = 10; S.pack = []; S.phase = 'walk'; S.phaseUntil = 0; });
  await run(g.page, 30, { bot: { skill: 1 } });
  const banner = await g.page.evaluate(() => BIOME.banner && BIOME.banner.note);
  check('надпись Пещеры: «появляются щитовики»', banner === 'появляются щитовики', banner);

  // карточка щитовика — когда он впервые вышел вперёд
  await g.page.evaluate(() => { tutClose(); UNLOCK.seen = {}; __cards = []; });
  await forcePack(g.page, 12, ['yellow', 'normal', 'normal']);
  let c = await untilCard(g.page);
  check('щитовик впереди — карточка «Новый враг», бой на паузе', c.shown && c.step === 'НОВЫЙ ВРАГ' && c.h === 'Жёлтый моб со щитом' && c.paused, c);
  await g.page.evaluate(() => tutClose());
  await forcePack(g.page, 12, ['yellow', 'normal', 'normal']);
  c = await untilCard(g.page, 400);
  check('второй раз карточки нет', !c.shown, c);

  // дальник — при первом выстреле, хилер — при первом касте
  await forcePack(g.page, 22, ['normal', 'ranged', 'normal']);
  c = await untilCard(g.page);
  check('дальник — карточка при первом выстреле', c.shown && c.h === 'Дальник', c);
  await g.page.evaluate(() => tutClose());
  await forcePack(g.page, 32, ['normal', 'healer', 'normal']);
  c = await untilCard(g.page, 8000);
  check('хилер — карточка при первом касте', c.shown && c.h === 'Хилер', c);
  await g.page.evaluate(() => tutClose());

  // сохранение: увиденные карточки пишутся, старое сохранение — всё уже видели
  const sv = await g.page.evaluate(() => {
    var d = buildSave(), old = JSON.parse(JSON.stringify(d)); delete old.pack.mobSeen;
    return { now: d.pack.mobSeen.sort().join(), old: parseSave(old).mobSeen.sort().join(), bad: parseSave(Object.assign(d, { pack: Object.assign(d.pack, { mobSeen: ['zzz', 'healer'] }) })).mobSeen.join() };
  });
  check('сохранение помнит карточки; старое сохранение — всё видели; мусор отбрасывается',
    sv.now === 'healer,ranged,yellow' && sv.old === 'healer,ranged,yellow' && sv.bad === 'healer', sv);

  // в авто карточка ждёт ручной игры
  await g.page.evaluate(() => { UNLOCK.seen = {}; TUNE.autoAfter = 1; AUTO.lastInput = -1e9; });
  await run(g.page, 5, {});
  await forcePack(g.page, 12, ['yellow', 'normal', 'normal']);
  c = await untilCard(g.page, 300, {});   // без бота: нажатие выключило бы авто
  check('в авто карточки нет', !c.shown, c);
  check('авто включилось', await g.page.evaluate(() => AUTO.on));
  await g.page.evaluate(() => { TUNE.autoAfter = 0; });
  check('ошибок в консоли нет', g.errors.length === 0, g.errors);
  await g.close();
}

{
  // тумблер выключен — все типы с первой стаи
  const g = await openGame(browser, file, { seed: 5, tune: { unlock: false, autoAfter: 0 } });
  await run(g.page, 60, {});
  const t0 = await typesAt(g.page, 3);
  check('тумблер выключен — в русле все типы', t0.yellow > 0 && t0.ranged > 0 && t0.healer > 0, t0);
  await g.close();
}

// Обучение: короткое — обычный, налёт, вожак; полное (тумблер выключен) — все.
for (const unlock of [true, false]) {
  const g = await openGame(browser, file, { seed: 3, tutorial: true, tune: { unlock } });
  await g.page.evaluate(RECORD);
  await run(g.page, 120, {});
  const pack = await g.page.evaluate(() => S.pack.map(m => (m.leader ? 'L:' : '') + m.type));
  const seenKeys = [];
  for (let i = 0; i < 400; i++) {
    const c = await card(g.page);
    if (c.shown) {
      seenKeys.push(c.h);
      if (c.h === 'Обучение пройдено') {
        if (unlock) check('короткое обучение: в конце — про мобов по главам', /по главам/.test(c.text), c.text);
        break;
      }
      continue;
    }
    await run(g.page, 30, { bot: { skill: 1 } });
  }
  const seen = await g.page.evaluate(() => Object.keys(UNLOCK.seen).sort().join());
  if (unlock) {
    check('короткое обучение: только красные и вожак', pack.every(t => /normal$/.test(t)) && pack.length === 4, pack);
    check('короткое обучение: карточки — обычный, налёт, вожак', seenKeys.join('|') === 'Обычный моб|Налёт|Вожак|Обучение пройдено', seenKeys);
    check('новых врагов после короткого обучения ещё не видели', seen === '', seen);
  } else {
    check('полное обучение: все виды мобов', pack.some(t => t === 'yellow') && pack.some(t => t === 'ranged') && pack.some(t => t === 'healer'), pack);
    check('после полного обучения карточки новых врагов уже не нужны', seen === 'healer,ranged,yellow', { seen, seenKeys });
  }
  check('обучение: ошибок нет', g.errors.length === 0, g.errors);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
