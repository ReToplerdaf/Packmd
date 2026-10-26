// Стартовая заставка и музыка: бой ждёт «Старта», звук и музыка включаются
// отдельно (и попадают в «Настройку»), сброс прогресса — только после
// подтверждения, пока заставка на экране, сохранение не затирается.
//   node tests/splash.mjs [--shot файл.png]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, ROOT } from './lib/harness.mjs';

const args = process.argv.slice(2);
const shotI = args.indexOf('--shot');
const shot = shotI >= 0 ? args[shotI + 1] : null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('arena.tutorial.done', '1'); } catch (e) {} });

let fails = 0;
const check = (name, ok) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name); if (!ok) fails++; };
const st = () => page.evaluate(() => ({ phase: S.phase, started: !!S.tm.started, splash: !$('splash').hidden, kills: S.kills, level: S.level,
  sound: TUNE.sound, music: TUNE.music, cs: $('c-sound').checked, cm: $('c-music').checked, playing: !$('music').paused,
  save: localStorage.getItem(SAVE_KEY), reset: !$('splash-reset').hidden, ask: !$('splash-confirm').hidden }));

await page.goto(url);
await page.waitForTimeout(1500);
let s = await st();
check('заставка на экране, бой не начат', s.splash && !s.started);
check('без сохранения сброса нет', !s.reset);
if (shot) await page.screenshot({ path: shot });

await page.click('#splash-music');
s = await st();
check('музыка выключается отдельно от звука', !s.music && s.sound && !s.cm && s.cs);
await page.click('#splash-sound');
s = await st();
check('звук выключается, музыка остаётся выключенной', !s.sound && !s.music && !s.cs);
await page.click('#splash-sound'); await page.click('#splash-music');
await page.click('#splash-start');
await page.waitForTimeout(2500);
s = await st();
check('«Старт» начинает бой', !s.splash && s.started);
check('музыка играет', s.playing);
await page.click('#btn-bag'); await page.click('#tab-tune');
await page.click('label:has(#c-music)');
s = await st();
check('тумблер «Музыка» в Настройке глушит музыку', !s.music && !s.playing);
await page.click('label:has(#c-music)');
await page.dispatchEvent('#backpack-close', 'pointerdown');

// сохранение есть → после перезагрузки снова заставка, она не затирает сохранение
await page.evaluate(() => { saveGame(); const d = JSON.parse(localStorage.getItem(SAVE_KEY)); d.hero.level = 7; SAVE.off = true; localStorage.setItem(SAVE_KEY, JSON.stringify(d)); });
await page.reload(); await page.waitForTimeout(1000);
const saved = (await st()).save;
await page.reload(); await page.waitForTimeout(1000);
s = await st();
check('заставка не затирает сохранение', s.splash && s.save === saved && JSON.parse(saved).hero.level === 7);
check('музыку браузер не включает без касания', !s.playing);
check('есть «Сбросить прогресс», он внизу', s.reset && await page.evaluate(() => $('splash-reset').getBoundingClientRect().bottom > innerHeight - 80));
await page.click('#splash-reset');
s = await st();
check('сброс спрашивает подтверждение', s.ask && !!s.save);
await page.click('#splash-no');
s = await st();
check('«Отмена» ничего не удаляет', !s.ask && !!s.save);
await page.click('#splash-reset'); await page.click('#splash-yes');
s = await st();
check('«Да» удаляет прогресс', !s.save && !s.reset);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
s = await st();
check('Enter — «Старт», игра с начала', !s.splash && s.started && s.level === 1);

await browser.close();
server.close();
check('нет ошибок в консоли', !errors.length);
if (errors.length) console.log(errors.join('\n'));
console.log(fails ? `\n${fails} проверок не прошли` : '\nвсё прошло');
process.exit(fails ? 1 : 0);
