// Сохранение прогресса в localStorage: герой, снаряжение, рюкзак, память
// стаи, чекпоинт. Текущая стая не сохраняется — после загрузки она
// начинается заново. Плюс кнопки «Скопировать / Вставить сохранение» и
// «Начать заново» во вкладке «Настройка».
"use strict";

var SAVE_KEY = 'arena.save';
var SAVE_BROKEN_KEY = 'arena.save.broken';
var SAVE_VERSION = 1;
var SAVE_PREFIX = 'PACK1:';

// Служебное состояние сохранения держим вне S: S целиком сравнивается
// тестом equivalence, а это не часть боя.
var SAVE = {
  dirty: false,       // что-то поменялось — запишем в конце кадра
  off: false,         // перед перезагрузкой: больше ничего не писать
  packStart: null     // память стаи на момент начала текущей стаи
};

// Миграции: MIGRATIONS[v] переводит сохранение версии v в версию v + 1.
var MIGRATIONS = {};

function markSave() { SAVE.dirty = true; }

// Перед началом обычной стаи запоминаем память и вожака — если вкладку
// закроют посреди боя, стая начнётся заново с теми же значениями, а не
// потратит «порцию» памяти или вернувшегося вожака второй раз.
function savePackStart() {
  SAVE.packStart = { resist: S.resist, memLeft: S.memLeft, bossFled: S.bossFled, flees: S.tm.flees };
}

/* ── Запись ──────────────────────────────────────────────────────── */

function itemOut(it) {
  return { slot: it.slot.id, rarity: it.rarity.id, ilvl: it.ilvl, name: it.name, stats: it.stats, rolls: it.rolls };
}

function buildSave() {
  var bag = [], idx = new Map();
  for (var i = 0; i < S.log.length; i++) {
    var e = S.log[i];
    if (!e.item) continue;
    idx.set(e.item, bag.length);
    bag.push({ item: itemOut(e.item), seen: !!e.seen });
  }
  var gear = {};
  for (var sid in S.gear) {
    var g = S.gear[sid];
    gear[sid] = idx.has(g) ? idx.get(g) : itemOut(g);
  }
  var info = [];
  for (var j = 0; j < S.info.length; j++) {
    var n = S.info[j], o = {};
    for (var k in n) o[k] = k === 'item' ? itemOut(n[k]) : n[k];
    info.push(o);
  }

  var resist = S.resist, memLeft = S.memLeft, bossFled = S.bossFled;
  var ps = SAVE.packStart;
  if (S.phase === 'fight' && ps) {
    // Стая начнётся заново: память — как перед ней, если за бой никто не сбежал.
    if (S.tm.flees === ps.flees) { resist = ps.resist; memLeft = ps.memLeft; }
    bossFled = bossFled || ps.bossFled;
  }
  var dead = S.phase === 'dead' || S.phase === 'prompt';

  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    hero: { level: S.level, xp: S.xp, hp: dead ? S.stats.maxHp : S.hp, kills: S.kills },
    gear: gear,
    bag: bag,
    pack: { progress: S.progress, resist: resist, memLeft: memLeft, bossFled: bossFled, deathStreak: S.deathStreak },
    info: info
  };
}

function saveGame() {
  // В обучении не сохраняем (стая особая, смерти нет); отметка «есть что
  // сохранить» доживёт до его конца.
  if (SAVE.off || S.tut) return;
  SAVE.dirty = false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(buildSave())); } catch (e) {}
}

/* ── Проверка и разбор ───────────────────────────────────────────── */

function num(v, lo, hi, def) {
  return typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}
function int(v, lo, hi, def) { return Math.round(num(v, lo, hi, def)); }
function txt(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, '').slice(0, 80); }
function findId(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

var STAT_KEYS = ['atk', 'maxHp', 'def', 'critChance', 'critDmg', 'atkSpeed', 'guardBonus', 'blockReward'];
var ROLL_KINDS = { flat: 1, pct: 1, pctf: 1, ms: 1 };

// Вещь из сохранения → настоящая вещь игры. Непонятная — null.
function itemIn(o) {
  if (!o || typeof o !== 'object') return null;
  var slot = findId(SLOTS, o.slot), rar = findId(RARITY, o.rarity);
  if (!slot || !rar || !o.stats || !Array.isArray(o.rolls)) return null;
  var stats = {};
  for (var i = 0; i < STAT_KEYS.length; i++) stats[STAT_KEYS[i]] = num(o.stats[STAT_KEYS[i]], -1e6, 1e6, 0);
  var rolls = [];
  for (var j = 0; j < o.rolls.length && j < 8; j++) {
    var r = o.rolls[j];
    if (!r || !ROLL_KINDS[r.kind]) return null;
    var out = { id: txt(r.id), label: txt(r.label), kind: r.kind, value: num(r.value, -1e6, 1e6, 0),
                lo: num(r.lo, -1e6, 1e6, 0), hi: num(r.hi, -1e6, 1e6, 0) };
    if (r.base) out.base = true;
    if (r.signature) out.signature = true;
    rolls.push(out);
  }
  return { slot: slot, rarity: rar, ilvl: int(o.ilvl, 1, 1e6, 1), name: txt(o.name) || slot.name,
           stats: stats, rolls: rolls, score: scoreStats(stats) };
}

var INFO_KINDS = { level: 1, flee: 1, retreat: 1, ack: 1, lost: 1, full: 1, broken: 1 };

// Разбирает сохранение (уже распарсенный JSON) в готовые для S значения.
// Бросает ошибку, если сохранение не подходит целиком.
function parseSave(d) {
  if (!d || typeof d !== 'object' || typeof d.v !== 'number') throw new Error('не сохранение');
  if (d.v > SAVE_VERSION) throw new Error('сохранение из более новой версии игры');
  while (d.v < SAVE_VERSION) {
    if (!MIGRATIONS[d.v]) throw new Error('нет миграции с версии ' + d.v);
    d = MIGRATIONS[d.v](d);
  }
  var h = d.hero || {}, p = d.pack || {};
  var level = int(h.level, 1, 999, 1);

  var log = [], items = [];
  var bag = Array.isArray(d.bag) ? d.bag : [];
  for (var i = 0; i < bag.length; i++) {
    var it = bag[i] && itemIn(bag[i].item);
    items.push(it);                      // индекс сохраняем и для выброшенных — на него ссылается gear
    if (it) log.push({ kind: 'item', item: it, seen: !!bag[i].seen });
  }
  var gear = {};
  if (d.gear && typeof d.gear === 'object') {
    for (var s = 0; s < SLOTS.length; s++) {
      var g = d.gear[SLOTS[s].id];
      var gi = typeof g === 'number' ? items[g] : itemIn(g);
      if (gi && gi.slot.id === SLOTS[s].id) gear[gi.slot.id] = gi;
    }
  }
  // Лишнее сверх вместимости рюкзака отбрасываем с конца (самое старое).
  var unequipped = 0;
  log = log.filter(function (e) {
    if (gear[e.item.slot.id] === e.item) return true;
    return ++unequipped <= BAG_CAP;
  });

  var info = [];
  var src = Array.isArray(d.info) ? d.info : [];
  for (var k = 0; k < src.length && info.length < INFO_CAP; k++) {
    var n = src[k];
    if (!n || !INFO_KINDS[n.kind]) continue;
    var e = { kind: n.kind };
    if (n.kind === 'level') e.level = int(n.level, 1, 999, 1);
    if (n.kind === 'flee') e.resist = int(n.resist, 0, MEM_CAP, 0);
    if (n.kind === 'retreat') e.progress = int(n.progress, -1e6, 1e6, 0);
    if (n.kind === 'lost') e.count = int(n.count, 0, 1e6, 0);
    if (n.kind === 'full') { e.item = itemIn(n.item); if (!e.item) continue; }
    info.push(e);
  }

  var resist = int(p.resist, 0, MEM_CAP, 0);
  return {
    level: level,
    xp: num(h.xp, 0, xpToNext(level) - 1, 0),
    hp: num(h.hp, 0, 1e9, 0),
    kills: int(h.kills, 0, 1e9, 0),
    gear: gear, log: log, info: info,
    progress: int(p.progress, -4, 1e6, 0),
    resist: resist,
    memLeft: resist ? int(p.memLeft, 0, MEM_PACKS, 0) : 0,
    bossFled: !!p.bossFled,
    deathStreak: int(p.deathStreak, 0, 1000, 0)
  };
}

function applySave(v) {
  S.level = v.level; S.xp = v.xp; S.kills = v.kills;
  S.gear = v.gear; S.log = v.log; S.info = v.info;
  S.progress = v.progress; S.resist = v.resist; S.memLeft = v.memLeft;
  S.bossFled = v.bossFled; S.deathStreak = v.deathStreak;
  recalc();
  S.hp = v.hp >= 1 ? Math.min(v.hp, S.stats.maxHp) : S.stats.maxHp;
  dirty.loot = true; dirty.gear = true; dirty.info = true;
}

// Вызывается из start(). true — прогресс восстановлен.
function loadGame() {
  var raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  if (!raw) return false;
  try {
    applySave(parseSave(JSON.parse(raw)));
    return true;
  } catch (err) {
    // Битое сохранение не затираем молча: откладываем копию и начинаем заново.
    try { localStorage.setItem(SAVE_BROKEN_KEY, raw); localStorage.removeItem(SAVE_KEY); } catch (e) {}
    pushInfo({ kind: 'broken' });
    return false;
  }
}

/* ── Строка для переноса ─────────────────────────────────────────── */

function exportSave() {
  var json = JSON.stringify(buildSave());
  return SAVE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

// Строка → готовое к записи сохранение (JSON-текст). Ошибка — исключение.
function importSave(str) {
  str = String(str || '').replace(/\s+/g, '');
  if (str.indexOf(SAVE_PREFIX) !== 0) throw new Error('строка должна начинаться с ' + SAVE_PREFIX);
  var json = decodeURIComponent(escape(atob(str.slice(SAVE_PREFIX.length))));
  parseSave(JSON.parse(json));          // проверка целиком, до записи
  return json;
}

function reloadWith(fn) {
  SAVE.off = true;                      // pagehide при перезагрузке не должен записать старое
  try { fn(); } catch (e) {}
  location.reload();
}

/* ── Когда сохраняем ─────────────────────────────────────────────── */

document.addEventListener('visibilitychange', function () { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', saveGame);

/* ── Кнопки во вкладке «Настройка» ───────────────────────────────── */

(function () {
  var out = $('save-out'), msg = $('save-msg');
  var exp = $('save-export'), imp = $('save-import'), reset = $('save-reset');
  var ask = $('save-confirm'), askText = $('save-confirm-text'), yes = $('save-yes'), no = $('save-no');
  if (!out) return;
  var pending = null;

  function say(t) { msg.textContent = t; msg.hidden = !t; }
  function confirmThen(text, fn) {
    pending = fn;
    askText.textContent = text;
    ask.hidden = false;
  }
  no.addEventListener('click', function () { pending = null; ask.hidden = true; });
  yes.addEventListener('click', function () { var fn = pending; pending = null; ask.hidden = true; if (fn) fn(); });

  exp.addEventListener('click', function () {
    if (S.tut) { say('Сохранение появится после обучения.'); return; }
    var s = exportSave();
    out.value = s; out.hidden = false; out.readOnly = true;
    out.focus(); out.select();
    var done = function () { say('Скопировано. Вставьте эту строку на другом устройстве.'); };
    var manual = function () { say('Скопируйте строку выше вручную.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, manual);
      else if (document.execCommand && document.execCommand('copy')) done();
      else manual();
    } catch (e) { manual(); }
  });

  imp.addEventListener('click', function () {
    if (out.hidden || out.readOnly) {
      out.value = ''; out.hidden = false; out.readOnly = false; out.focus();
      say('Вставьте строку сохранения и нажмите кнопку ещё раз.');
      return;
    }
    var json;
    try { json = importSave(out.value); }
    catch (e) { say('Строка не подходит: ' + e.message + '.'); return; }
    confirmThen('Заменить текущий прогресс сохранением из строки?', function () {
      reloadWith(function () { localStorage.setItem(SAVE_KEY, json); });
    });
  });

  reset.addEventListener('click', function () {
    confirmThen('Герой, снаряжение и рюкзак будут удалены. Начать заново?', function () {
      reloadWith(function () { localStorage.removeItem(SAVE_KEY); });
    });
  });
})();
