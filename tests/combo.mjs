// Серия (комбо): растёт за точные нажатия, «идеально» даёт +2, ступени дают
// бонус к опыту, промах сбрасывает, в авто серии нет, рекорд сохраняется.
//   node tests/combo.mjs
import path from 'node:path';
import { launch, openGame, run, ROOT } from './lib/harness.mjs';

const file = path.resolve(ROOT, 'index.html');
const browser = await launch();
let failed = 0;
function check(name, ok, info) {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`);
}
const combo = page => page.evaluate(() => ({
  n: COMBO.n, tier: COMBO.tier, lost: COMBO.lost, best: COMBO.sess.best, bestEver: COMBO.bestEver,
  threats: COMBO.sess.threats, blocked: COMBO.sess.blocked, perfect: COMBO.sess.perfect,
  auto: AUTO.on, shown: !document.getElementById('combo').hidden, label: document.getElementById('combo').innerText.replace(/\s+/g, ' ').trim(),
  taken: __pack.S.tm.taken
}));

// 1. Бот жмёт ровно на щелчок: всё «идеально», серия доходит до ×1.5.
{
  const g = await openGame(browser, file, { seed: 11 });
  await run(g.page, 9000, { bot: { skill: 1 } });
  const c = await combo(g.page);
  check('ровно на щелчок — почти всё идеально', c.blocked > 5 && c.perfect >= c.blocked * 0.9, c);
  check('серия дошла до ступени ×1.5', c.best >= 30, c);
  const hudLabel = await g.page.evaluate(() => { var k = [COMBO.n, COMBO.tier]; COMBO.n = 31; COMBO.tier = 3; comboHud(performance.now());
    var r = { shown: !el.combo.hidden, text: el.combo.innerText.replace(/\s+/g, ' ').trim(), cls: el.combo.className }; COMBO.n = k[0]; COMBO.tier = k[1]; return r; });
  check('счётчик на экране: «×1.5 31», золотая ступень', hudLabel.shown && hudLabel.text === '×1.5 31' && /\bt3\b/.test(hudLabel.cls), hudLabel);
  const xp = await g.page.evaluate(() => { var keep = COMBO.tier; COMBO.tier = 3; var a = comboXp(10); COMBO.tier = 0; var b = comboXp(10); COMBO.tier = 1; var d = comboXp(10); COMBO.tier = keep; return [a, b, d]; });
  check('опыт за убийство: ×1.5 / ×1 / ×1.1', xp[0] === 15 && xp[1] === 10 && xp[2] === 11, xp);
  const save = await g.page.evaluate(() => buildSave().combo);
  check('лучшая серия попадает в сохранение', save && save.best === c.bestEver && c.bestEver >= c.best, save);

  // 2. Перестали жать: первый же пропущенный крит или выстрел сбрасывает серию.
  const before = c.taken;
  let after = c;
  for (let i = 0; i < 40 && after.taken === before; i++) { await run(g.page, 60, { bot: { skill: 0 } }); after = await combo(g.page); }
  check('пропущенный удар сбрасывает серию', after.taken > before && after.n === 0 && after.tier === 0 && after.lost > 0, after);

  // 3. Без нажатий включается авто — серии нет, счётчик скрыт.
  await run(g.page, 1200, { bot: { skill: 0 } });
  const a = await combo(g.page);
  check('в авто серия не растёт и не видна', a.auto && a.n === 0 && !a.shown, a);
  await g.close();
  check('нет ошибок в консоли', !g.errors.length, g.errors.slice(0, 3));
}

// 4. Нажатия вразброс по окну: часть идеально, часть просто хорошо.
{
  const g = await openGame(browser, file, { seed: 12 });
  await run(g.page, 9000, { bot: { skill: 1, jitter: 1 } });
  const c = await combo(g.page);
  check('вразброс — идеально только часть блоков', c.blocked > 5 && c.perfect > 0 && c.perfect < c.blocked, c);
  await g.close();
  check('нет ошибок в консоли (вразброс)', !g.errors.length, g.errors.slice(0, 3));
}

// 5. Тумблер выключен — серии нет совсем.
{
  const g = await openGame(browser, file, { seed: 11, tune: { combo: false } });
  await run(g.page, 6000, { bot: { skill: 1 } });
  const c = await combo(g.page);
  check('тумблер выкл — серии нет', c.n === 0 && c.best === 0 && !c.shown, c);
  await g.close();
}

await browser.close();
console.log(failed ? `\nНе прошло: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
