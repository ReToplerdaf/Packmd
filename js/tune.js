// Настройки боя (ползунки TUNE), константы механик, хранение настроек в localStorage.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   НАСТРОЙКИ БОЯ — то, что крутится ползунками
   ════════════════════════════════════════════════════════════════════ */

// Отдельная версия игры «кружок» (index.html?circle, circle.html): все мобы —
// кружок, свои настройки и сохранение, без биомов и обучения (см. circle.js).
var CIRCLE_MODE = window.PACK_CIRCLE === true || /[?&]circle\b/.test(location.search);

// Умолчания = настройки, выставленные для теста (присланы из игры 09.10).
var TUNE_DEFAULTS = { lead: 500, guard: 150, cool: 900, critRate: 0.85, shieldRate: 0.55, mobRate: 3600, speed: 0.5, retreatWindow: 8000, rageStep: 0.5, pulseWindow: 300, sound: true, debug: false, adapt: true,
  healerRate: 0.2, yellowRate: 0.4, rangedRate: 0.32, rangedInterval: 2000, healInterval: 5000, rangedLead: 1050, yellowCounter: 300, fatigue: true, fatigueWindow: 900, packMin: 3, packMax: 5,
  autoAfter: 15000, autoBlock: 0.35,
  combo: true, perfect: 0.4,
  pace: true, pacePacks: 8, paceStep: 0.04,
  biomes: true, bossEvery: 10, biomePin: true, chief: true,
  circleRed: 700, circleCool: 900, circleSpeed: 440, circleGreen: 3000,
  bats: true, batEvery: 15000, healRage: true, biomeBg: false, biomeMods: false };
var TUNE = JSON.parse(JSON.stringify(TUNE_DEFAULTS));

var CRIT_MULT = 2.5;        // во сколько раз крит моба больнее обычного удара
var STAGGER_MS = 1200;      // сколько моб оглушён после удачного блока
var COUNTER_MS = 1200;      // окно контратаки, открывающееся блоком
var COUNTER_MULT = 3.0;     // множитель урона контратаки
var HEAL_FRAC = 0.15;       // сколько макс. HP лечит добивание контратакой
var HERO_SWING = 900;       // базовый интервал авто-атаки, мс
var VULN_STEP = 0.25;       // насколько растёт урон по недобитому мобу за каждый несорванный стан
var VULN_CAP = 2.0;         // потолок множителя уязвимости
var RETREAT_FRAC = 0.28;    // ниже какой доли HP моб прячется за следующего в очереди
// Время до побега раненого моба крутится ползунком — TUNE.retreatWindow.
var HEAL_RAGE_GAP = 0.5;    // ярость хилера: во сколько раз короче промежуток до следующего каста
var PULSE_LEAD = 900;        // сколько идёт пульс щита/лечения от старта до момента срабатывания
// Ширина окна удара по щиту (и окна прерывания лечения) крутится ползунком —
// TUNE.pulseWindow (мс, целиком), делится 65/35 на «чуть раньше» и «чуть позже».
function pulseGoodMs() { return pace(TUNE.pulseWindow) * 0.65; }
function pulseLateMs() { return pace(TUNE.pulseWindow) * 0.35; }
// Сила усиления моба за промах по щиту крутится ползунком — TUNE.rageStep.
var RAGE_CAP = 3;            // потолок стаков злости
var BOSS_FLEE_RAGE = 2;      // вожак сбегает, когда у него 3 короны (1 + 2 стака злости)
var MEM_PACKS = 3;           // сколько стай подряд держится верхний стак памяти, прежде чем снимется
var MEM_CAP = 3;             // память не больше 3
var MEM_STEP = 0.15;         // каждая единица памяти режет урон героя по стае на 15%
// Темп стаи: каждые TUNE.pacePacks чекпоинтов — ступень, на каждой тайминги
// мобов короче на TUNE.paceStep (окно блока и откат героя не трогаются).
var PACE_CAP = 10;           // потолок ступеней темпа

var STRIKE_DEBOUNCE_MS = 200; // минимальный интервал между засчитанными нажатиями «Удар» — гасит дребезг тача
// Ярость дальнобойщика — одна ступень: пропущенный ОБЫЧНЫЙ выстрел злит его,
// следующий выстрел — яростный (урон ×RANGED_RAGE_MULT), после него ярость
// сразу проходит, и даже пропущенный яростный выстрел её не продлевает.
var RANGED_RAGE_MULT = 2.35;
var RANGED_RAGE_LOOK = 3;    // графически ярость выглядит как «3-я ступень»
var RANGED_FRAC = 0.55;      // дальнобойщик всегда бьёт слабее ближнего боя
var FATIGUE_DECAY = 2500;    // сколько держится усталость блока без нового спама
// Сколько лечит хилер: чем меньше здоровья у моба впереди, тем больше.
// 10% HP и ниже → +50% макс. HP; 70% HP и выше → +10%; между — линейно.
function healFracFor(hpFrac) {
  var k = (hpFrac - 0.10) / (0.70 - 0.10);
  k = Math.max(0, Math.min(1, k));
  return 0.50 + (0.10 - 0.50) * k;
}
// Как часто хилер начинает канал — ползунок «Частота каста хила» (TUNE.healInterval, мс).

// Новый ключ хранилища: старые сохранённые ползунки (до новых умолчаний)
// больше не подхватываются — везде стартуем с TUNE_DEFAULTS.
var TUNE_KEY = CIRCLE_MODE ? 'arena.circle.tune' : 'arena.tune.v2';
try {
  var saved = JSON.parse(localStorage.getItem(TUNE_KEY) || 'null');
  if (saved) for (var kk in saved) if (kk in TUNE) TUNE[kk] = saved[kk];
  // разовая миграция: красный больше не тратит ходы на блок, крит подняли до 85%
  if (saved && !saved.critMig && TUNE.critRate <= 0.7) TUNE.critRate = 0.85;
  TUNE.critMig = 1;
  // разовая миграция: «кружок» стал вдвое быстрее
  if (CIRCLE_MODE) { if (saved && !saved.circleMig && TUNE.circleSpeed === 220) TUNE.circleSpeed = 440; TUNE.circleMig = 1; }
} catch (e) { /* приватное окно — просто идём с умолчаниями */ }

if (CIRCLE_MODE) TUNE.biomes = false;   // в «кружке» — только эта механика

function saveTune() {
  try { localStorage.setItem(TUNE_KEY, JSON.stringify(TUNE)); } catch (e) {}
}

// Экспорт текущих настроек — чтобы зашить их в версию как умолчания.
(function () {
  var btn = document.getElementById('tune-export');
  var out = document.getElementById('tune-export-out');
  if (!btn || !out) return;
  btn.addEventListener('click', function () {
    var txt = JSON.stringify(TUNE);
    out.value = txt; out.hidden = false;
    out.focus(); out.select();
    var done = function () { btn.textContent = 'Скопировано — вставь в чат'; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { btn.textContent = 'Скопируй текст ниже вручную'; });
      } else if (document.execCommand && document.execCommand('copy')) { done(); }
      else btn.textContent = 'Скопируй текст ниже вручную';
    } catch (e) { btn.textContent = 'Скопируй текст ниже вручную'; }
  });
})();

// Все запланированные тайминги идут через это: масштабирует длительность
// событий под текущую скорость боя, не трогая абсолютные часы.
function dur(ms) { return ms / (TUNE.speed || 1); }
