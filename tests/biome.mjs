// Биомы: смена по чекпоинту, надпись и запись в «Инфо», модификаторы,
// круг заново с прибавкой к уровню, закрепление биома при отступлении.
//   node tests/biome.mjs
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

// Доводит игру до спавна следующей стаи с заданным чекпоинтом.
const toPack = (page, progress) => page.evaluate(p => {
  S.progress = p; S.pack = []; S.phase = 'walk'; S.phaseUntil = 0; S.deathStreak = 0;
}, progress).then(() => run(page, 30, { bot: { skill: 1 } }));
const state = page => page.evaluate(() => ({
  progress: S.progress, biome: BIOME.pack, name: curBiome().name, banner: BIOME.banner && BIOME.banner.name,
  info: S.info[0] && S.info[0].kind === 'biome' ? S.info[0].biome : null,
  leaderRage: (S.pack.filter(m => m.leader)[0] || {}).rage,
  healer: biomeHealerRate(), lead: biomeLead(), bonus: packLevelBonus(),
  icon: document.getElementById('cp-biome').title
}));

{
  const g = await openGame(browser, file, { seed: 5 });
  await run(g.page, 300, { bot: { skill: 1 } });
  let s = await state(g.page);
  await g.page.screenshot({ path: path.join(OUT, 'biome-0.png') });
  check('начало — Русло реки, без модификаторов', s.biome === 0 && s.name === 'Русло реки' && s.healer === 0.2 && s.lead === 500, s);

  await toPack(g.page, 10);
  s = await state(g.page);
  check('чекпоинт 10 — Пещера: надпись, «Инфо», замах крита короче на 10%', s.biome === 1 && s.banner === 'Пещера' && s.info === 1 && s.lead === 450 && s.icon === 'Пещера', s);
  await g.page.screenshot({ path: path.join(OUT, 'biome-1.png') });

  await toPack(g.page, 20);
  s = await state(g.page);
  check('Пустынный город — хилеров +10%', s.biome === 2 && Math.abs(s.healer - 0.3) < 1e-9 && s.lead === 500, s);
  await run(g.page, 200, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'biome-2.png') });

  await toPack(g.page, 30);
  s = await state(g.page);
  check('Метеорит — вожак сразу со стаком злости', s.biome === 3 && (s.leaderRage === undefined || s.leaderRage >= 1), s);
  await run(g.page, 200, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'biome-3.png') });

  await toPack(g.page, 40);
  s = await state(g.page);
  check('после 4-го биома — круг 2 и +2 к уровню стаи', s.biome === 4 && s.name === 'Русло реки' && s.banner === 'Русло реки · круг 2' && s.bonus === 10 + 2, s);

  // Отступление не уводит в прошлый биом (по умолчанию), а с выключенным закреплением — уводит.
  const retreat = (p, pin) => g.page.evaluate(([p, pin]) => { TUNE.biomePin = pin; S.progress = p; resolvePrompt('retreat'); var r = S.progress; TUNE.biomePin = true; return r; }, [p, pin]);
  const r1 = await retreat(21, true), r2 = await retreat(21, false), r3 = await retreat(25, true), r4 = await retreat(1, true);
  check('отступление: 21→20 (биом закреплён), без закрепления 21→18, 25→22, в первом биоме 1→-2', r1 === 20 && r2 === 18 && r3 === 22 && r4 === -2, [r1, r2, r3, r4]);

  const saved = await g.page.evaluate(() => { var v = parseSave(JSON.parse(JSON.stringify(buildSave()))); return v.info.filter(e => e.kind === 'biome').map(e => e.biome); });
  check('записи о биомах переживают сохранение', saved.length >= 4, saved);
  check('нет ошибок в консоли', g.errors.length === 0, g.errors);
  await g.close();
}

// Главарь: последняя стая биома, три фазы, двойной удар, гарантированная редкая вещь.
{
  const g = await openGame(browser, file, { seed: 7 });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 9);
  const pk = await g.page.evaluate(() => S.pack.map(m => ({ type: m.type, chief: !!m.chief, leader: m.leader })));
  check('стая главаря: двое свиты и главарь последним', pk.length === 3 && pk[2].chief && !pk[0].chief && !pk[1].chief && pk[0].type === 'normal', pk);
  await g.page.screenshot({ path: path.join(OUT, 'chief-1.png') });
  const ph = await g.page.evaluate(() => {
    var c = chiefMob(); S.pack = [c]; S.telegraph = null; var now = performance.now(), r = {};
    c.hp = c.maxHp * 0.6; chiefTick(c, now); r.p2 = c.chiefPhase; r.shield = c.shield;
    breakShield(c, now); r.first = !!(S.telegraph && S.telegraph.first);
    S.guardUntil = S.telegraph.hitAt + 1; resolveCrit(S.telegraph.hitAt);
    r.noCounter = S.counterUntil < now; r.second = !!(S.telegraph && !S.telegraph.first);
    S.guardUntil = S.telegraph.hitAt + 1; resolveCrit(S.telegraph.hitAt);
    r.counter = S.counterUntil > now;
    c.hp = c.maxHp * 0.2; chiefTick(c, performance.now()); r.p3 = c.chiefPhase; r.atk = chiefAtkMult(c);
    return r;
  });
  check('фазы: 2-я со щитом, раскол → двойной удар, контра только после второго блока, 3-я злее', ph.p2 === 2 && ph.shield && ph.first && ph.noCounter && ph.second && ph.counter && ph.p3 === 3 && ph.atk === 1.25, ph);
  await run(g.page, 30, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'chief-3.png') });
  const end = await g.page.evaluate(() => { var c = chiefMob(); S.telegraph = null; killMob(c);
    var it = S.log[0] && S.log[0].item; return { info: S.info.slice(0, 3).map(e => e.kind), rarity: it && RARITY.indexOf(it.rarity), progress: S.progress }; });
  check('главарь повержен: запись в «Инфо», вещь «Редкий» или выше, биом пройден', end.info.includes('chief') && end.rarity >= 2 && end.progress === 10, end);
  check('нет ошибок в консоли (главарь)', g.errors.length === 0, g.errors);
  await g.close();
}

// Летучая мышь: только с Пещеры, двойной укус, контра после второго блока.
{
  const g = await openGame(browser, file, { seed: 9, tune: { biomeMobRate: 1 } });
  await run(g.page, 200, { bot: { skill: 1 } });
  const none = await g.page.evaluate(() => S.pack.every(m => m.type !== 'bat'));
  check('в Русле реки летучих мышей нет', none);
  let pk = [];
  for (let i = 0; i < 10 && !pk.includes('bat'); i++) { await toPack(g.page, 10); pk = await g.page.evaluate(() => S.pack.map(m => m.leader ? 'leader' : m.type)); }
  const roll = await g.page.evaluate(() => biomeMobType('normal') + ',' + biomeMobType('yellow'));
  check('в Пещере обычных заменяют летучие мыши', pk.includes('bat') && !pk.includes('normal') && roll === 'bat,yellow', [pk, roll]);
  await g.page.evaluate(() => { var b = S.pack.filter(m => m.type === 'bat')[0]; S.pack.splice(S.pack.indexOf(b), 1); S.pack.unshift(b); b.vx = null; S.telegraph = null; });
  const bite = await g.page.evaluate(() => {
    var b = front(); if (!b || b.type !== 'bat') return { skip: true };
    var now = performance.now(), r = {};
    S.telegraph = { start: now, hitAt: now + 10, mob: b, first: true };
    S.guardUntil = now + 20; resolveCrit(now + 10);
    r.noCounter = S.counterUntil < now; r.second = !!(S.telegraph && !S.telegraph.first && S.telegraph.mob === b);
    S.guardUntil = S.telegraph.hitAt + 1; resolveCrit(S.telegraph.hitAt);
    r.counter = S.counterUntil > now; return r;
  });
  check('двойной укус: контра только после второго блока', bite.noCounter && bite.second && bite.counter, bite);
  await g.page.evaluate(() => { var b = front(); S.telegraph = { start: performance.now(), hitAt: performance.now() + 1e5, mob: b, first: true }; });
  await run(g.page, 20, {});
  await g.page.screenshot({ path: path.join(OUT, 'bat.png') });
  await g.page.evaluate(() => { S.telegraph = null; });
  await run(g.page, 1200, { bot: { skill: 0.7 } });
  check('нет ошибок в консоли (летучая мышь)', g.errors.length === 0, g.errors);
  await g.close();
}

// Выключенные биомы — всё как раньше.
{
  const g = await openGame(browser, file, { seed: 5, tune: { biomes: false } });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 19);
  const noChief = await g.page.evaluate(() => !chiefMob());
  await toPack(g.page, 20);
  const s = await state(g.page);
  check('биомы выключены: главаря нет', noChief);
  check('биомы выключены: модификаторов и надписи нет, иконка скрыта', s.healer === 0.2 && s.lead === 500 && !s.banner && s.bonus === 5 &&
    await g.page.evaluate(() => document.getElementById('cp-biome').hidden), s);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
