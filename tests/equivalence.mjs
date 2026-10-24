// Проверка «поведение один в один»: одни и те же сценарии (seed, бот,
// действия в интерфейсе) прогоняются на эталонной версии из git и на
// текущих файлах, затем сравниваются хэши состояния боя, текста интерфейса
// и картинки canvas по кадрам.
//
//   node tests/equivalence.mjs                 # эталон — тег v0-single-file
//   node tests/equivalence.mjs --ref <коммит>  # другой эталон
//   node tests/equivalence.mjs --target dist/pack.html   # проверить сборку в один файл
//   node tests/equivalence.mjs --ref <коммит> --tune '{"combo":false}' --no-ui
//       # новая механика выключена: бой и картинка должны совпасть с версией
//       # до неё; текст интерфейса (новые пункты «Настройки») не сравнивается
import path from 'node:path';
import { launch, openGame, run, checkoutRef, ROOT } from './lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ref = opt('--ref', 'v0-single-file');
const target = path.resolve(ROOT, opt('--target', 'index.html'));
const quick = args.includes('--quick');
const extraTune = opt('--tune', null) ? JSON.parse(opt('--tune')) : null;
const noUi = args.includes('--no-ui');
const ignoreState = opt('--ignore-state', null) ? opt('--ignore-state').split(',') : null;

const ui = {
  3000: 'open', 3010: 'tab:tab-loot', 3020: 'select', 3030: 'equip', 3040: 'tab:tab-gear',
  3050: 'tab:tab-tune', 3060: 'slider:s-speed:1.5', 3070: 'toggle:c-debug', 3080: 'click:tune-export',
  3090: 'tab:tab-stats', 3100: 'close',
  3105: 'guard', 3110: 'guard', 3115: 'guard', 3120: 'strike', 3125: 'strike',  // спам кнопок вне окон
  6000: 'open', 6010: 'tab:tab-loot', 6020: 'delete', 6030: 'equip', 6040: 'select', 6050: 'select',
  6060: 'tab:tab-tune', 6070: 'toggle:c-debug', 6080: 'toggle:c-fatigue', 6090: 'slider:s-crit:60', 6100: 'close',
  9000: 'open', 9010: 'tab:tab-tune', 9020: 'toggle:c-adapt', 9030: 'slider:s-packmax:7', 9040: 'close',
  12000: 'open', 12010: 'tab:tab-tune', 12020: 'click:tut-start', 12030: 'close',
};

const F = quick ? 0.25 : 1;
const scenarios = [
  { name: 'активный бот', cfg: { seed: 1 }, frames: 20000 * F, bot: { skill: 1 } },
  { name: 'пассивный (смерти, отступление)', cfg: { seed: 2 }, frames: 24000 * F, bot: { skill: 0, prompt: 'retreat' } },
  { name: 'обучение', cfg: { seed: 3, tutorial: true }, frames: 15000 * F, bot: { skill: 0.8 } },
  { name: 'рюкзак, вкладки, ползунки', cfg: { seed: 4, ui }, frames: 18000 * F, bot: { skill: 0.6, prompt: 'ack' } },
  { name: 'скорость ×3 (как в ревью)', cfg: { seed: 5, tune: { speed: 1.5 } }, frames: 20000 * F, bot: { skill: 0.9 } },
];

if (extraTune) for (const sc of scenarios) sc.cfg.tune = Object.assign({}, sc.cfg.tune, extraTune);
if (ignoreState) for (const sc of scenarios) sc.cfg.ignoreState = ignoreState;

const browser = await launch();
const refPath = checkoutRef(ref);
let failed = 0;
console.log(`эталон: ${ref}  →  проверяем: ${path.relative(ROOT, target)}`);
for (const sc of scenarios) {
  const runOne = async (file) => {
    const g = await openGame(browser, file, sc.cfg);
    const trace = await run(g.page, sc.frames, { every: 30, canvasEvery: 300, bot: sc.bot });
    const sum = await g.page.evaluate(() => { const S = __pack.S; return { level: S.level, kills: S.kills, deaths: S.tm.deaths, flees: S.tm.flees, progress: S.progress }; });
    await g.close();
    return { trace, sum, errors: g.errors };
  };
  const a = await runOne(refPath), b = await runOne(target);
  let diff = null;
  for (let i = 0; i < Math.max(a.trace.length, b.trace.length); i++) {
    const x = a.trace[i] || {}, y = b.trace[i] || {};
    for (const k of noUi ? ['s', 'cv'] : ['s', 'ui', 'cv']) if (x[k] !== y[k]) { diff = { frame: x.f ?? y.f, what: k }; break; }
    if (diff) break;
  }
  const ok = !diff && !b.errors.length && JSON.stringify(a.sum) === JSON.stringify(b.sum);
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${sc.name}: ${a.trace.length} снимков, итог ${JSON.stringify(b.sum)}`);
  if (diff) console.log(`     первое расхождение: кадр ${diff.frame}, ${{ s: 'состояние боя', ui: 'текст интерфейса', cv: 'картинка' }[diff.what]}`);
  if (a.errors.length) console.log('     ошибки эталона:', a.errors.slice(0, 5));
  if (b.errors.length) console.log('     ошибки:', b.errors.slice(0, 5));
}
await browser.close();
console.log(failed ? `\nРасхождений: ${failed}` : '\nВсе сценарии совпали один в один.');
process.exit(failed ? 1 : 0);
