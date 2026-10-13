// Ядро: случайные числа, кривые прогрессии, генератор предметов, формула урона. Без DOM и canvas.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   ЯДРО — переносится в C# один в один. Ничего из этого не знает ни про
   DOM, ни про canvas: чистая арифметика, кривые и генератор предметов.
   ════════════════════════════════════════════════════════════════════ */

var rnd = Math.random;
function rr(a, b) { return a + rnd() * (b - a); }
function ri(a, b) { return Math.floor(rr(a, b + 1)); }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

function weighted(list) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].w;
  var roll = rnd() * total;
  for (i = 0; i < list.length; i++) { roll -= list[i].w; if (roll <= 0) return list[i]; }
  return list[list.length - 1];
}

/* ── Кривые прогрессии ───────────────────────────────────────────── */

function xpToNext(level) { return Math.floor(60 * Math.pow(level, 1.5)); }

function baseStats(level) {
  var k = level - 1;
  return {
    maxHp: 100 + 22 * k,
    atk: 10 + 3 * k,
    def: 2 + k,
    critChance: 0.05,
    critDmg: 0.60,
    atkSpeed: 0,
    guardBonus: 0,
    blockReward: 0
  };
}

function mobStats(level, leader) {
  var k = level - 1, m = leader ? 2.1 : 1;
  return {
    maxHp: Math.round((42 + 15 * k) * m),
    atk: Math.round((6 + 2.3 * k) * (leader ? 1.35 : 1)),
    xp: Math.round((13 + 5.5 * k) * (leader ? 2.2 : 1))
  };
}

/* ── Предметы ────────────────────────────────────────────────────── */

var SLOTS = [
  { id: 'weapon', name: 'Оружие',   bases: ['Клинок', 'Топор', 'Молот', 'Копьё', 'Секира'], stat: 'atk',        lo: 3,    hi: 6,    per: 0.9 },
  { id: 'helm',   name: 'Шлем',     bases: ['Шлем', 'Капюшон', 'Венец'],                     stat: 'def',        lo: 1,    hi: 3,    per: 0.4 },
  { id: 'armor',  name: 'Броня',    bases: ['Кираса', 'Куртка', 'Панцирь'],                  stat: 'maxHp',      lo: 12,   hi: 22,   per: 3.2 },
  { id: 'gloves', name: 'Перчатки', bases: ['Перчатки', 'Наручи', 'Рукавицы'],               stat: 'atk',        lo: 1,    hi: 3,    per: 0.45 },
  { id: 'boots',  name: 'Сапоги',   bases: ['Сапоги', 'Поножи', 'Ботфорты'],                 stat: 'def',        lo: 1,    hi: 2,    per: 0.35 },
  { id: 'ring',   name: 'Кольцо',   bases: ['Кольцо', 'Перстень'],                           stat: 'critChance', lo: 0.01, hi: 0.03, per: 0 },
  { id: 'amulet', name: 'Амулет',   bases: ['Амулет', 'Талисман', 'Оберег'],                 stat: 'maxHp',      lo: 9,    hi: 16,   per: 2.4 }
];

var RARITY = [
  { id: 'common',    name: 'Обычный',     w: 50, affixes: 0, css: 'var(--r-common)' },
  { id: 'uncommon',  name: 'Необычный',   w: 28, affixes: 1, css: 'var(--r-uncommon)' },
  { id: 'rare',      name: 'Редкий',      w: 15, affixes: 2, css: 'var(--r-rare)' },
  { id: 'epic',      name: 'Эпический',   w: 6,  affixes: 3, css: 'var(--r-epic)' },
  { id: 'legendary', name: 'Легендарный', w: 1,  affixes: 4, css: 'var(--r-legendary)' }
];

// kind: flat — плоское число, pct — проценты, ms — миллисекунды.
// per — прирост границ за уровень предмета.
var AFFIXES = [
  { id: 'atk',         label: 'Атака',           lo: 2,  hi: 6,  per: 0.55, kind: 'flat' },
  { id: 'maxHp',       label: 'Здоровье',        lo: 8,  hi: 25, per: 2.4,  kind: 'flat' },
  { id: 'def',         label: 'Защита',          lo: 1,  hi: 4,  per: 0.35, kind: 'flat' },
  { id: 'critChance',  label: 'Шанс крита',      lo: 1,  hi: 4,  per: 0,    kind: 'pct' },
  { id: 'critDmg',     label: 'Урон крита',      lo: 5,  hi: 20, per: 0,    kind: 'pct' },
  { id: 'atkSpeed',    label: 'Скорость атаки',  lo: 2,  hi: 8,  per: 0,    kind: 'pct' },
  { id: 'blockReward', label: 'Награда за блок', lo: 10, hi: 40, per: 0,    kind: 'pct' },
  { id: 'guardBonus',  label: 'Окно блока',      lo: 15, hi: 60, per: 0,    kind: 'ms', signature: true }
];

var PREFIX = ['Ржавый', 'Крепкий', 'Закалённый', 'Гранёный', 'Рунный', 'Древний', 'Пламенный', 'Ледяной', 'Штормовой', 'Кованый'];
var SUFFIX = ['Стража', 'Зари', 'Пепла', 'Бури', 'Разлома', 'Вершин', 'Гончей', 'Скалы', 'Затмения'];

function affixRange(af, ilvl) {
  return { lo: af.lo + af.per * (ilvl - 1), hi: af.hi + af.per * (ilvl - 1) };
}

function rollAffixValue(af, ilvl) {
  var r = affixRange(af, ilvl);
  if (af.kind === 'flat') return Math.max(1, Math.round(rr(r.lo, r.hi)));
  if (af.kind === 'ms')   return Math.round(rr(r.lo, r.hi) / 5) * 5;
  return Math.round(rr(r.lo, r.hi));            // pct — целые проценты
}

function rollItem(ilvl) {
  var slot = pick(SLOTS);
  var rar = weighted(RARITY);
  var base = pick(slot.bases);

  var stats = { atk: 0, maxHp: 0, def: 0, critChance: 0, critDmg: 0, atkSpeed: 0, guardBonus: 0, blockReward: 0 };
  var rolls = [];

  // Базовая характеристика слота.
  var blo = slot.lo + slot.per * (ilvl - 1), bhi = slot.hi + slot.per * (ilvl - 1);
  var bval = slot.stat === 'critChance' ? rr(blo, bhi) : Math.max(1, Math.round(rr(blo, bhi)));
  stats[slot.stat] += bval;
  rolls.push({
    id: slot.stat,
    label: slot.stat === 'critChance' ? 'Шанс крита' : (slot.stat === 'atk' ? 'Атака' : (slot.stat === 'def' ? 'Защита' : 'Здоровье')),
    kind: slot.stat === 'critChance' ? 'pctf' : 'flat',
    value: bval, lo: blo, hi: bhi, base: true
  });

  // Аффиксы: без повторов, количество задаёт редкость.
  var pool = AFFIXES.slice();
  for (var i = 0; i < rar.affixes && pool.length; i++) {
    var idx = Math.floor(rnd() * pool.length);
    var af = pool.splice(idx, 1)[0];
    var v = rollAffixValue(af, ilvl);
    var rg = affixRange(af, ilvl);

    if (af.kind === 'pct') stats[af.id] += v / 100;
    else stats[af.id] += v;

    rolls.push({ id: af.id, label: af.label, kind: af.kind, value: v, lo: rg.lo, hi: rg.hi, signature: !!af.signature });
  }

  var name = base;
  if (rar.affixes >= 1) name = pick(PREFIX) + ' ' + name.toLowerCase();
  if (rar.affixes >= 2) name = name + ' ' + pick(SUFFIX);

  return { slot: slot, rarity: rar, ilvl: ilvl, name: name, stats: stats, rolls: rolls, score: scoreStats(stats) };
}

// Во что авто-экипировка превращает предмет, сравнивая его с надетым.
function scoreStats(s) {
  return s.atk * 2.4
    + s.maxHp * 0.12
    + s.def * 1.6
    + s.critChance * 100 * 0.9
    + s.critDmg * 100 * 0.22
    + s.atkSpeed * 100 * 0.7
    + s.guardBonus * 0.07
    + s.blockReward * 0.12;
}

/* ── Урон ────────────────────────────────────────────────────────── */

function damage(atk, def, mult) {
  var raw = atk * (mult || 1) - def * 0.5;
  return Math.max(1, Math.round(raw * rr(0.88, 1.12)));
}
