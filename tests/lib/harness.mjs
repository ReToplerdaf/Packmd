// Общий запуск игры в headless Chromium с виртуальными часами и ботом.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', '/opt/node-tools/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('Не найден playwright: npm i -D playwright (или глобально)');
}
export const { chromium } = loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const OUT = path.join(ROOT, 'tests/out');
const DRIVER = fs.readFileSync(path.join(here, 'driver.js'), 'utf8');

// Доступ теста к состоянию игры. В модульной версии всё лежит в глобальной
// области, в старой однофайловой — внутри замыкания, туда вставляем тот же текст.
const HOOK = `window.__pack = { get S() { return S; }, get TUNE() { return TUNE; },
  front: function () { return front(); }, activeHealer: function () { return activeHealer(); },
  guardWindow: function () { return guardWindow(); }, dur: function (x) { return dur(x); },
  pulseGoodMs: function () { return pulseGoodMs(); }, pulseLateMs: function () { return pulseLateMs(); } };`;

// Достаёт версию игры из git (тег/коммит) во временную папку и возвращает путь к index.html.
export function checkoutRef(ref) {
  const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', ref]).toString().trim();
  const dir = path.join(OUT, 'ref-' + sha);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['-C', ROOT, 'archive', sha]);
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    const f = path.join(dir, 'index.html');
    let html = fs.readFileSync(f, 'utf8');
    const anchor = '\n  resize();\n  if (window.claude';
    if (html.includes('(function () {\n  "use strict";') && html.includes(anchor)) {
      html = html.replace(anchor, '\n  ' + HOOK + anchor);
      fs.writeFileSync(f, html);
    }
  }
  return path.join(dir, 'index.html');
}

export async function launch() {
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
}

// Открывает игру. cfg: { seed, tutorial, tune, ui }. Возвращает { page, errors }.
export async function openGame(browser, htmlPath, cfg = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(`window.__DRV_CFG = ${JSON.stringify(cfg)};\n${DRIVER}`);
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(HOOK_IF_MISSING);
  return { page, errors, close: () => ctx.close() };
}
const HOOK_IF_MISSING = `if (!window.__pack) { ${HOOK} }`;

export async function run(page, frames, opt) {
  // большими кусками, чтобы не упираться в таймаут одного evaluate
  const out = [];
  const chunk = 3600;
  for (let done = 0; done < frames; done += chunk) {
    const n = Math.min(chunk, frames - done);
    out.push(...await page.evaluate(([n, opt]) => window.__drv.run(n, opt), [n, opt]));
  }
  return out;
}
