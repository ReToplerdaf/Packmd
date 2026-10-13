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
  check('начало — Пустошь, без модификаторов', s.biome === 0 && s.name === 'Пустошь' && s.healer === 0.2 && s.lead === 500, s);

  await toPack(g.page, 10);
  s = await state(g.page);
  check('чекпоинт 10 — Чаща: надпись, «Инфо», хилеров +10%', s.biome === 1 && s.banner === 'Чаща' && s.info === 1 && Math.abs(s.healer - 0.3) < 1e-9 && s.icon === 'Чаща', s);
  await g.page.screenshot({ path: path.join(OUT, 'biome-1.png') });

  await toPack(g.page, 20);
  s = await state(g.page);
  check('Пещеры — замах крита короче на 10%', s.biome === 2 && s.lead === 450 && s.healer === 0.2, s);
  await run(g.page, 200, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'biome-2.png') });

  await toPack(g.page, 30);
  s = await state(g.page);
  check('Пепелище — вожак сразу со стаком злости', s.biome === 3 && (s.leaderRage === undefined || s.leaderRage >= 1), s);
  await run(g.page, 200, { bot: { skill: 1 } });
  await g.page.screenshot({ path: path.join(OUT, 'biome-3.png') });

  await toPack(g.page, 40);
  s = await state(g.page);
  check('после 4-го биома — круг 2 и +2 к уровню стаи', s.biome === 4 && s.name === 'Пустошь' && s.banner === 'Пустошь · круг 2' && s.bonus === 10 + 2, s);

  // Отступление не уводит в прошлый биом (по умолчанию), а с выключенным закреплением — уводит.
  const retreat = (p, pin) => g.page.evaluate(([p, pin]) => { TUNE.biomePin = pin; S.progress = p; resolvePrompt('retreat'); var r = S.progress; TUNE.biomePin = true; return r; }, [p, pin]);
  const r1 = await retreat(21, true), r2 = await retreat(21, false), r3 = await retreat(25, true), r4 = await retreat(1, true);
  check('отступление: 21→20 (биом закреплён), без закрепления 21→18, 25→22, в первом биоме 1→-2', r1 === 20 && r2 === 18 && r3 === 22 && r4 === -2, [r1, r2, r3, r4]);

  const saved = await g.page.evaluate(() => { var v = parseSave(JSON.parse(JSON.stringify(buildSave()))); return v.info.filter(e => e.kind === 'biome').map(e => e.biome); });
  check('записи о биомах переживают сохранение', saved.length >= 4, saved);
  check('нет ошибок в консоли', g.errors.length === 0, g.errors);
  await g.close();
}

// Выключенные биомы — всё как раньше.
{
  const g = await openGame(browser, file, { seed: 5, tune: { biomes: false } });
  await run(g.page, 200, { bot: { skill: 1 } });
  await toPack(g.page, 20);
  const s = await state(g.page);
  check('биомы выключены: модификаторов и надписи нет, иконка скрыта', s.healer === 0.2 && s.lead === 500 && !s.banner && s.bonus === 5 &&
    await g.page.evaluate(() => document.getElementById('cp-biome').hidden), s);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
