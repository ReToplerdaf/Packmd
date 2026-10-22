// Десктоп и клавиатура: определение десктопа (мышь без сенсора, ?desktop /
// ?mobile, первая игровая клавиша на сенсорном), колонка телефона, клавиши:
// рюкзак и вкладки, звук, касание мыши пробелом, карточки по Enter / 1 / 2.
//   node tests/desktop.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, OUT } from './lib/harness.mjs';

const url = pathToFileURL(path.resolve(ROOT, 'index.html')).href;
const browser = await launch();
let failed = 0;
function check(name, ok, info) {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`);
}
fs.mkdirSync(OUT, { recursive: true });

async function open(ctxOpt, query = '') {
  const ctx = await browser.newContext(ctxOpt);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('arena.tutorial.done', '1'); } catch (e) {} });
  await page.goto(url + query);
  await page.waitForFunction(() => S.phase === 'fight');
  return { page, errors, close: () => ctx.close() };
}
const desk = p => p.evaluate(() => document.documentElement.classList.contains('desktop'));
const DESK = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

{
  const g = await open(DESK);
  const p = g.page;
  check('мышь без сенсора — десктоп', await desk(p));
  const w = await p.evaluate(() => document.querySelector('.app').getBoundingClientRect().width);
  check('колонка с пропорциями телефона', Math.abs(w - 800 * 390 / 844) < 2, { w });
  const hint = await p.evaluate(() => getComputedStyle(document.getElementById('btn-guard'), '::before').content);
  check('подпись клавиши на «Защите»', hint === '"A"', { hint });
  await p.screenshot({ path: path.join(OUT, 'desktop-1.png') });

  await p.keyboard.press('b');
  check('B открывает рюкзак', await p.evaluate(() => !el.backpackOverlay.hidden && S.paused));
  await p.keyboard.press('4');
  check('4 — вкладка «Настройка», блок «Клавиши» виден',
    await p.evaluate(() => !$('pane-tune').hidden && !$('keys-help').hidden));
  await p.screenshot({ path: path.join(OUT, 'desktop-2.png') });
  await p.keyboard.press('3');
  check('3 — вкладка «Инфо»', await p.evaluate(() => !$('pane-info').hidden && $('pane-tune').hidden));
  const snd = await p.evaluate(() => TUNE.sound);
  await p.keyboard.press('m');
  check('M переключает звук', await p.evaluate(s => TUNE.sound === !s && $('c-sound').checked === !s, snd));
  await p.keyboard.press('m');
  await p.keyboard.press('Escape');
  check('Esc закрывает рюкзак', await p.evaluate(() => el.backpackOverlay.hidden && !S.paused));

  // поле ввода: клавиши игры не перехватываются
  await p.keyboard.press('b');
  await p.keyboard.press('4');
  await p.evaluate(() => { $('save-import').click(); });
  const typed = await p.evaluate(() => !$('save-out').hidden);
  if (typed) {
    await p.focus('#save-out');
    await p.keyboard.type('bm1');
    check('в поле ввода B, M, 1 — просто буквы', await p.evaluate(() => !el.backpackOverlay.hidden && $('save-out').value.endsWith('bm1')));
    await p.evaluate(() => document.activeElement.blur());
  }
  await p.keyboard.press('Escape');

  // летучая мышь: пробел по красной — убита
  await p.evaluate(() => { RAID.at = performance.now(); S.hp = S.stats.maxHp = 1e6; S.mobSwingAt = Infinity; });
  await p.waitForFunction(() => CIRCLE.mob && CIRCLE.red, null, { timeout: 30000 });
  await p.keyboard.press('Space');
  check('пробел по красной мыши — мышь убита', await p.evaluate(() => !CIRCLE.mob));

  // карточка смерти — Enter
  await p.evaluate(() => { S.hp = S.stats.maxHp = 100; S.hp = 0; heroDies(performance.now()); });
  await p.waitForFunction(() => !$('death-overlay').hidden);
  await p.keyboard.press('Enter');
  check('Enter закрывает «Герой пал»', await p.evaluate(() => $('death-overlay').hidden));

  // вопрос после двух смертей — 2
  await p.evaluate(() => showPrompt());
  await p.keyboard.press('2');
  check('2 на вопросе — «Сменю снаряжение»', await p.evaluate(() => $('prompt-overlay').hidden && S.phase === 'walk'));
  check('нет ошибок в консоли (десктоп)', !g.errors.length, g.errors);
  await g.close();
}

{
  const g = await open(PHONE);
  check('телефон — не десктоп, подписей нет', !(await desk(g.page)) &&
    await g.page.evaluate(() => getComputedStyle(document.getElementById('btn-guard'), '::before').content === 'none'));
  await g.page.keyboard.press('ArrowLeft');
  check('игровая клавиша на сенсорном включает десктоп', await desk(g.page));
  await g.close();
}
{
  const g = await open(PHONE, '?desktop');
  check('?desktop на телефоне — десктоп', await desk(g.page));
  await g.close();
}
{
  const g = await open(DESK, '?mobile');
  check('?mobile на десктопе — телефон', !(await desk(g.page)));
  await g.page.keyboard.press('ArrowLeft');
  check('?mobile — клавиша не включает десктоп', !(await desk(g.page)));
  check('нет ошибок в консоли (?mobile)', !g.errors.length, g.errors);
  await g.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли.');
process.exit(failed ? 1 : 0);
