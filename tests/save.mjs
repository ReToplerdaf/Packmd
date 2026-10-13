// Проверка сохранения: прогресс переживает перезагрузку, битое сохранение
// не роняет игру, строка экспорта читается обратно, «Начать заново» стирает.
// Игра открывается в реальном времени, без driver.js — он чистит
// localStorage при каждой загрузке. Страница отдаётся через маленький
// локальный сервер: headless Chromium в тестовом контексте иногда теряет
// localStorage страниц file:// при перезагрузке (около 15% прогонов).
//   node tests/save.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, ROOT } from './lib/harness.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('arena.tutorial.done', '1'); } catch (e) {} });

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
}

// Сводка того, что должно сохраниться.
const sum = () => page.evaluate(() => ({
  level: S.level, xp: S.xp, hp: S.hp, kills: S.kills,
  progress: S.progress, resist: S.resist, memLeft: S.memLeft, bossFled: S.bossFled, deathStreak: S.deathStreak,
  bag: S.log.map(e => e.item.name + '|' + e.item.rarity.id + '|' + e.item.ilvl + '|' + !!e.seen + '|' + e.item.score.toFixed(3)),
  gear: Object.keys(S.gear).sort().map(k => k + ':' + S.gear[k].name + '|' + (S.log.findIndex(e => e.item === S.gear[k]))),
  info: S.info.map(e => e.kind),
  maxHp: S.stats.maxHp
}));

await page.goto(url);
await page.waitForTimeout(1500);
check('новая игра без сохранения', await page.evaluate(() => S.level === 1 && S.log.length === 0 && !localStorage.getItem('arena.save.broken')));

// 1. Прогресс переживает перезагрузку.
await page.evaluate(() => {
  for (var i = 0; i < 4; i++) grantXp(xpToNext(S.level));
  for (var j = 0; j < 6; j++) pushLog({ kind: 'item', item: rollItem(S.level) });
  equipItem(S.log[2].item); equipItem(S.log[4].item);
  S.log[0].seen = true;
  S.progress = 7; S.resist = 2; S.memLeft = 1; S.bossFled = true; S.deathStreak = 1; S.kills = 42;
  S.hp = Math.round(S.stats.maxHp * 0.6);
  SAVE.packStart = null;       // как будто между стаями
  saveGame();
});
const before = await sum();
await page.reload();
await page.waitForTimeout(800);
const after = await sum();
check('перезагрузка: всё на месте', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before) === JSON.stringify(after) ? null : { before, after });
check('здоровье как было, не полное', after.hp < after.maxHp && after.hp === before.hp);

// 2. Сохранение при закрытии вкладки (pagehide), без явного saveGame.
await page.evaluate(() => { S.kills = 777; });
await page.reload();
await page.waitForTimeout(500);
check('pagehide сохраняет', await page.evaluate(() => S.kills) === 777);

// 3. Посреди боя: память — как перед стаей, если никто не сбежал.
await page.waitForFunction(() => S.phase === 'fight', null, { timeout: 15000 });
const mid = await page.evaluate(() => {
  var ps = SAVE.packStart;
  var d = buildSave();
  return { ok: !!ps && d.pack.resist === ps.resist && d.pack.memLeft === ps.memLeft && d.pack.bossFled === (S.bossFled || ps.bossFled) };
});
check('посреди боя память откатывается к началу стаи', mid.ok);

// 4. Строка экспорта читается обратно один в один.
const rt = await page.evaluate(() => {
  var s = exportSave();
  var a = JSON.parse(decodeURIComponent(escape(atob(s.slice(6)))));
  var b = JSON.parse(importSave(s));
  delete a.savedAt; delete b.savedAt;
  var bad = [];
  ['', 'abc', 'PACK1:@@@', 'PACK1:' + btoa('{"v":99}'), 'PACK1:' + btoa('[1]')].forEach(function (x) {
    try { importSave(x); bad.push(x); } catch (e) {}
  });
  return { same: JSON.stringify(a) === JSON.stringify(b), prefix: s.indexOf('PACK1:') === 0, bad: bad };
});
check('экспорт → импорт', rt.same && rt.prefix && !rt.bad.length, rt);

// 5. Чужие и кривые вещи отбрасываются, а не роняют загрузку.
// SAVE.off — чтобы pagehide при перезагрузке не записал поверх.
await page.evaluate(() => {
  SAVE.off = true;
  var d = JSON.parse(localStorage.getItem('arena.save'));
  d.bag.push({ item: { slot: 'tail', rarity: 'rare', stats: {}, rolls: [] } });
  d.bag.push({ item: { slot: 'ring', rarity: 'rare', ilvl: 3, name: '<img src=x onerror=alert(1)>', stats: { atk: 'много' }, rolls: [] } });
  d.hero.hp = -5; d.hero.level = 1e9; d.pack.resist = 99;
  localStorage.setItem('arena.save', JSON.stringify(d));
});
await page.reload();
await page.waitForTimeout(500);
const odd = await page.evaluate(() => ({
  level: S.level, hp: S.hp, max: S.stats.maxHp, resist: S.resist,
  names: S.log.map(e => e.item.name), atk: S.log[S.log.length - 1].item.stats.atk
}));
check('кривые данные приводятся в порядок', odd.level === 999 && odd.hp === odd.max && odd.resist === 3 &&
  !odd.names.some(n => /[<>]/.test(n)) && odd.atk === 0, odd);

// 6. Битое сохранение: новая игра, копия отложена, запись в «Инфо».
await page.evaluate(() => { SAVE.off = true; localStorage.setItem('arena.save', '{битое'); });
await page.reload();
await page.waitForTimeout(500);
const broken = await page.evaluate(() => ({
  level: S.level, kept: localStorage.getItem('arena.save.broken'), info: S.info.map(e => e.kind)
}));
check('битое сохранение', broken.level === 1 && broken.kept === '{битое' && broken.info.includes('broken'), broken);

// 7. «Начать заново» через интерфейс, с подтверждением.
await page.evaluate(() => { S.kills = 5; S.progress = 3; saveGame(); });
await page.click('#btn-bag');
await page.click('#tab-tune');
await page.click('#save-reset');
check('подтверждение показано', await page.isVisible('#save-confirm'));
await page.click('#save-no');
check('«Отмена» ничего не стирает', await page.evaluate(() => !!localStorage.getItem('arena.save')));
await page.click('#save-reset');
await Promise.all([page.waitForEvent('load'), page.click('#save-yes')]);
await page.waitForTimeout(500);
const fresh = await page.evaluate(() => ({ kills: S.kills, progress: S.progress, tut: !!S.tut }));
check('«Начать заново» стирает прогресс, обучение не повторяется', fresh.kills === 0 && fresh.progress === 0 && !fresh.tut, fresh);

// 8. Импорт через интерфейс.
const str = await page.evaluate(() => { S.kills = 0; return 'PACK1:' + btoa(unescape(encodeURIComponent(JSON.stringify(Object.assign(buildSave(), { hero: { level: 9, xp: 0, hp: 50, kills: 9 } }))))); });
await page.click('#btn-bag');
await page.click('#tab-tune');
await page.click('#save-import');
await page.fill('#save-out', 'мусор');
await page.click('#save-import');
check('неверная строка — сообщение', /не подходит/.test(await page.textContent('#save-msg')));
await page.fill('#save-out', str);
await page.click('#save-import');
await Promise.all([page.waitForEvent('load'), page.click('#save-yes')]);
await page.waitForTimeout(500);
check('импорт через интерфейс', await page.evaluate(() => S.level === 9 && S.kills === 9 && S.hp === 50));

// 9. Бой идёт после загрузки.
await page.waitForTimeout(4000);
check('после загрузки бой идёт', await page.evaluate(() => S.phase === 'fight' && S.pack.length > 0));

await browser.close();
server.close();
check('нет ошибок в консоли', !errors.length, errors);
console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
