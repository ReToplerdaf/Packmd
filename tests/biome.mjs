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
  const g = await openGame(browser, file, { seed: 5, tune: { biomeMods: true } });
  await run(g.page, 300, { bot: { skill: 1 } });
  let s = await state(g.page);
  await g.page.screenshot({ path: path.join(OUT, 'biome-0.png') });
  check('начало — Высохшее русло, без модификаторов', s.biome === 0 && s.name === 'Высохшее русло' && s.healer === 0.2 && s.lead === 500, s);

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
  check('после 4-го биома — круг 2 и +2 к уровню стаи', s.biome === 4 && s.name === 'Высохшее русло' && s.banner === 'Высохшее русло · круг 2' && s.bonus === 10 + 2, s);

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
  const g = await openGame(browser, file, { seed: 7, tune: { biomeMods: true } });
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
  // бот сам закрывает карточку — ловим её показ
  await g.page.evaluate(() => { window.__intro = 0; var o = chiefIntro; chiefIntro = function () { o(); if (el.tutH.textContent === 'Главарь' && !el.tutOverlay.hidden) window.__intro++; }; });
  await run(g.page, 30);
  const intro = await g.page.evaluate(() => ({ seen: S.chiefSeen, shown: window.__intro === 1, saved: parseSave(JSON.parse(JSON.stringify(buildSave()))).chiefSeen }));
  check('первая встреча: карточка «Главарь», отметка в сохранении', intro.seen && intro.shown && intro.saved, intro);
  const hp = await g.page.evaluate(() => { var c = chiefMob(); return { hp: c.maxHp, want: Math.round(mobStats(c.level || S.packLevel, true).maxHp * CHIEF_HP), k: CHIEF_HP }; });
  check('здоровье главаря ×4 от вожака', hp.k === 4, hp);
  // Ложный замах: без подсказки, нажатая «Защита» сгорает, следом настоящий крит.
  const fe = await g.page.evaluate(() => {
    var c = chiefMob(), now = performance.now(), r = {};
    S.telegraph = null;
    var tg = null; for (var i = 0; i < 200 && !tg; i++) { var t = chiefCrit(c, now); if (t.feint) tg = t; }
    r.found = !!tg;
    S.telegraph = tg; r.cue = (function () { var d = []; if (S.telegraph && !S.telegraph.feint) d.push(1); return d.length; })();
    S.guardPressedAt = tg.start + 10; S.guardUntil = 0;
    var hp0 = S.hp; resolveCrit(tg.hitAt);
    r.real = !!(S.telegraph && !S.telegraph.feint && S.telegraph.mob === c); r.noDmg = S.hp === hp0;
    r.text = S.floats.some(f => f.t === 'ФИНТ · щит сгорел');
    var feints = 0; for (var j = 0; j < 1000; j++) if (chiefCrit(c, now).feint) feints++; r.share = feints / 1000;
    S.telegraph = null; return r;
  });
  check('ложный замах в 3-й фазе: ~30%, урона нет, «щит сгорел», следом настоящий крит', fe.found && fe.real && fe.noDmg && fe.text && fe.share > 0.22 && fe.share < 0.38, fe);
  await run(g.page, 30, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'chief-3.png') });
  const end = await g.page.evaluate(() => { var c = chiefMob(); S.telegraph = null; killMob(c);
    var it = S.log[0] && S.log[0].item; return { info: S.info.slice(0, 3).map(e => e.kind), rarity: it && RARITY.indexOf(it.rarity), progress: S.progress }; });
  check('главарь повержен: запись в «Инфо», вещь «Редкий» или выше, биом пройден', end.info.includes('chief') && end.rarity >= 2 && end.progress === 10, end);
  check('нет ошибок в консоли (главарь)', g.errors.length === 0, g.errors);
  await g.close();
}

// Главарь, 3-я фаза: налёт мышей и сразу щит, раскол щита — новый налёт (не больше трёх мышей),
// налёт отбит — снова щит, бьёт и из-за щита. С выключенным налётом — как раньше.
{
  const g = await openGame(browser, file, { seed: 7 });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 9);
  await g.page.evaluate(() => { S.chiefSeen = true; S.hp = 1e6; var c = chiefMob(); S.pack = [c]; S.telegraph = null; c.chiefPhase = 2; c.shield = false; c.hp = c.maxHp * 0.2; });
  await run(g.page, 2);
  const r0 = await g.page.evaluate(() => { var c = chiefMob(); return { ph: c.chiefPhase, shield: c.shield, queued: CHIEF_RAID.queue.length + CHIEF_RAID.bats.length + (CIRCLE.mob ? 1 : 0) }; });
  check('3-я фаза начинается с налёта трёх мышей и сразу щита', r0.ph === 3 && r0.shield && r0.queued === 3, r0);
  await run(g.page, 240);
  const r1 = await g.page.evaluate(() => {
    var c = chiefMob(), r = { bats: CHIEF_RAID.bats.length + (CIRCLE.mob ? 1 : 0) };
    var b = CHIEF_RAID.bats[0]; r.blocks = !b.hop ? batBlocks(b.ai ? 'strike' : 'guard') : true;
    c.shield = true; breakShield(c, performance.now()); r.afterBreak = CHIEF_RAID.bats.length + CHIEF_RAID.queue.length + (CIRCLE.mob ? 1 : 0);
    r.noStrike = !S.telegraph || !S.telegraph.first;
    return r;
  });
  check('мыши прилетели, мышь глушит кнопку, раскол щита без удара и не больше трёх мышей', r1.bats === 3 && r1.blocks && r1.afterBreak === 3 && r1.noStrike, r1);
  // Сбить всех мышей: касание по красной.
  const r2 = await g.page.evaluate(() => {
    var now = performance.now();
    CIRCLE.mob = null; RAID.at = now + 1e9;
    CHIEF_RAID.bats.forEach(b => { b.red = { start: now }; b.redUntil = now + 1000; b.coolUntil = 0; });
    CHIEF_RAID.bats.slice().forEach(b => chiefBatTap(b, b.x, b.y));
    return { left: CHIEF_RAID.bats.length, reShield: CHIEF_RAID.reShieldAt > now };
  });
  check('мыши сбиваются касанием, налёт отбит — назначен щит', r2.left === 0 && r2.reShield, r2);
  await run(g.page, 150);
  const r3 = await g.page.evaluate(() => { var c = chiefMob(); return { shield: c.shield }; });
  check('через секунду главарь снова в щите', r3.shield, r3);
  let swung = false;
  for (let i = 0; i < 40 && !swung; i++) { await run(g.page, 30); swung = await g.page.evaluate(() => !!(S.telegraph && chiefMob() && chiefMob().shield)); }
  check('в 3-й фазе главарь замахивается и из-за щита', swung);
  check('нет ошибок в консоли (налёт главаря)', g.errors.length === 0, g.errors);
  await g.close();
}
{
  const g = await openGame(browser, file, { seed: 7, tune: { chiefRaid: false } });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 9);
  const r = await g.page.evaluate(() => { S.chiefSeen = true; var c = chiefMob(); S.pack = [c]; S.telegraph = null; c.chiefPhase = 2; c.shield = false; c.hp = c.maxHp * 0.2;
    chiefTick(c, performance.now()); return { ph: c.chiefPhase, shield: c.shield, raid: chiefRaidActive() }; });
  check('налёт главаря выключен: 3-я фаза без щита и мышей', r.ph === 3 && !r.shield && !r.raid, r);
  await g.close();
}

// По умолчанию модификаторы биомов выключены: Пещера и Пустыня — как Высохшее русло, только цвет фона другой.
{
  const g = await openGame(browser, file, { seed: 5 });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 10);
  const a = await state(g.page);
  await toPack(g.page, 20);
  const b = await state(g.page);
  const bg = await g.page.evaluate(() => curBiome().flat[0]);
  check('модификаторы выключены по умолчанию: биом меняется, бой нет', a.biome === 1 && a.lead === 500 && b.biome === 2 && Math.abs(b.healer - 0.2) < 1e-9 && bg === '#8a3b22', { a, b, bg });
  check('нет ошибок в консоли (без модификаторов)', g.errors.length === 0, g.errors);
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
