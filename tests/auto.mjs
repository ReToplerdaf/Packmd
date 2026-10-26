// Проверка авто-режима и оффлайн-прогресса.
//   node tests/auto.mjs
// Часть 1 — виртуальные часы и пассивный бот: авто включается через 15 с без
// нажатий, герой сам блокирует, смерть не забирает рюкзак, кадр смерти и
// вопрос после 2 смертей проходят сами, нажатие выключает авто.
// Часть 2 — реальное время через локальный сервер (как tests/save.mjs):
// сохранение «из прошлого» даёт экран «Пока вас не было».
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, openGame, run, ROOT } from './lib/harness.mjs';

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
}

const browser = await launch();

/* ── 1. Авто-режим ─────────────────────────────────────────────── */
{
  const g = await openGame(browser, path.join(ROOT, 'index.html'), { seed: 7 });
  const st = () => g.page.evaluate(() => ({ on: AUTO.on, blocks: AUTO.blocks, deaths: S.tm.deaths, retreats: S.tm.retreats,
    bag: S.log.length, lost: S.info.filter(e => e.kind === 'lost').length, autoRetreat: S.info.filter(e => e.kind === 'retreat' && e.auto).length,
    prompt: !document.getElementById('prompt-overlay').hidden, tag: !document.getElementById('auto-tag').hidden }));
  await run(g.page, 60 * 10, { bot: { skill: 0 } });
  check('через 10 с без нажатий авто ещё нет', !(await st()).on);
  await run(g.page, 60 * 6, { bot: { skill: 0 } });
  let s = await st();
  check('через 16 с авто включён и виден на экране', s.on && s.tag, s);
  // Положим вещей в рюкзак: в авто смерть не должна их забрать.
  await g.page.evaluate(() => { for (var i = 0; i < 5; i++) pushLog({ kind: 'item', item: rollItem(S.level) }); });
  // Бот не трогает кадр смерти и вопрос: без ответа игрока бой не должен встать.
  for (let i = 0; i < 40 && !s.autoRetreat; i++) { await run(g.page, 3600, { bot: { skill: 0, noDeathTap: true } }); s = await st(); }
  check('герой сам блокирует часть критов', s.blocks > 0, s);
  check('в авто были смерти (для проверки ниже)', s.deaths >= 2, s);
  check('смерть в авто не забирает рюкзак', s.lost === 0 && s.bag >= 5, s);
  check('после 2 смертей подряд отступает сам, вопрос не висит', s.autoRetreat >= 1 && !s.prompt, s);
  await g.page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  await run(g.page, 2, { bot: { skill: 0 } });
  s = await st();
  check('нажатие «Защиты» выключает авто', !s.on && !s.tag, s);
  check('нет ошибок в консоли (авто)', !g.errors.length, g.errors.slice(0, 3));
  await g.close();
}

/* ── 2. Оффлайн ────────────────────────────────────────────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('arena.tutorial.done', '1'); } catch (e) {} window.PACK_NOSPLASH = true; });
  await page.goto(url);
  await page.waitForTimeout(800);

  // Сохранение, записанное hoursAgo часов назад.
  const setSave = hoursAgo => page.evaluate(h => {
    S.progress = 5; S.resist = 1; S.memLeft = 2;
    var d = buildSave();
    d.savedAt = Date.now() - h * 3600000;
    SAVE.off = true;
    localStorage.setItem('arena.save', JSON.stringify(d));
  }, hoursAgo);
  const view = () => page.evaluate(() => ({ open: !document.getElementById('offline-overlay').hidden, paused: S.paused,
    level: S.level, kills: S.kills, bag: S.log.length, progress: S.progress, resist: S.resist,
    text: document.getElementById('offline-text').textContent, info: S.info.filter(e => e.kind === 'offline').length }));

  await setSave(3);
  await page.reload(); await page.waitForTimeout(800);
  let v = await view();
  check('3 часа отсутствия: экран «Пока вас не было», бой на паузе', v.open && v.paused, v);
  check('начислены опыт и убийства, лут не больше 6 вещей', v.level > 1 && v.kills > 0 && v.bag > 0 && v.bag <= 6 && v.info === 1, v);
  check('чекпоинт и память не изменились', v.progress === 5 && v.resist === 1, v);
  check('в тексте 3 часа, без предела', /3 ч/.test(v.text) && !/предел/.test(v.text), v.text);
  await page.dispatchEvent('#offline-ok', 'pointerdown');
  await page.waitForTimeout(1500);
  v = await view();
  check('«Забрать» закрывает экран, бой идёт', !v.open && !v.paused && await page.evaluate(() => S.phase === 'fight' || S.phase === 'walk'), v);

  await setSave(30);
  await page.reload(); await page.waitForTimeout(800);
  v = await view();
  check('30 часов: засчитано 8 часов', v.open && /засчитано 8 ч/.test(v.text), v.text);

  await setSave(1 / 120);        // 30 секунд
  await page.reload(); await page.waitForTimeout(800);
  v = await view();
  check('меньше 2 минут — ничего не показываем', !v.open, v);

  await setSave(-5);             // часы перевели: сохранение «из будущего»
  await page.reload(); await page.waitForTimeout(800);
  v = await view();
  check('сохранение из будущего — без оффлайна', !v.open, v);

  check('нет ошибок в консоли (оффлайн)', !errors.length, errors.slice(0, 3));
  await ctx.close();
}
server.close();
await browser.close();
console.log(failed ? `\nНе прошло: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
