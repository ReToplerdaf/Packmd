// Быстрая проверка «игра открывается и бой идёт» в реальном времени, как у
// игрока: index.html открывается через file:// (двойной клик), без подмены часов.
//   node tests/smoke.mjs [путь к html] [--shot файл.png]
import path from 'node:path';
import { launch, ROOT } from './lib/harness.mjs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const shotI = args.indexOf('--shot');
const shot = shotI >= 0 ? args.splice(shotI, 2)[1] : null;
const file = path.resolve(ROOT, args[0] || 'index.html');

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('arena.tutorial.done', '1'); } catch (e) {} window.PACK_NOSPLASH = true; });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(6000);
const st = await page.evaluate(() => { const S = window.__pack ? __pack.S : window.S; return { phase: S.phase, packLen: S.pack.length, hp: S.hp, heroSwingAt: S.heroSwingAt > 0, kills: S.kills }; });
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400); }
await page.click('#btn-bag'); await page.waitForTimeout(200);
const bagOpen = await page.evaluate(() => !document.getElementById('backpack-overlay').hidden && (window.__pack ? __pack.S : window.S).paused);
await page.dispatchEvent('#backpack-close', 'pointerdown');
if (shot) await page.screenshot({ path: shot });
await browser.close();

const ok = !errors.length && st.phase === 'fight' && st.packLen > 0 && bagOpen;
console.log(ok ? 'OK' : 'FAIL', JSON.stringify({ ...st, bagOpen }), errors.length ? errors : '');
process.exit(ok ? 0 : 1);
