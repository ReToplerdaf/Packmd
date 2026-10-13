// Авто-режим (герой сам блокирует часть критов и выстрелов, пока игрок не
// жмёт кнопки) и оффлайн-прогресс (опыт и лут за время отсутствия).
"use strict";

// Служебное состояние держим вне S, как и SAVE: S сравнивается тестом equivalence.
var AUTO = {
  on: false,          // сейчас пассив: герой играет сам
  lastInput: 0,       // когда игрок последний раз жал «Защиту»/«Атаку» или открывал рюкзак
  deathAt: 0,         // кадр смерти в авто закроется сам в это время
  blocks: 0,          // сколько критов и выстрелов герой заблокировал сам (для «Замеров»)
  ms: 0,              // сколько времени шёл авто-режим (для «Замеров»)
  hiddenAt: 0,        // когда вкладку свернули (Date.now)
  ownPause: false     // бой поставлен на паузу экраном «Пока вас не было»
};

var AUTO_DEATH_MS = 3000;        // через сколько кадр смерти в авто продолжится сам
var OFFLINE_MIN_MS = 2 * 60000;  // меньше 2 минут отсутствия — ничего не начисляем
var OFFLINE_KEEP = 6;            // сколько лучших вещей с оффлайна кладём в рюкзак
// Пассивный темп из симуляции (tests/sim.mjs, профиль «авто», умолчания TUNE,
// 4 прогона × 60 мин, 13.10): 311 убийств в час, ~17 уровней за первый час.
// Пересчитать после изменений баланса.
var OFFLINE_KILLS_PER_HOUR = 310;

// Игрок что-то нажал — авто выключается, отсчёт до него идёт заново.
function autoTouch() {
  AUTO.lastInput = performance.now();
  if (AUTO.on) { AUTO.on = false; AUTO.deathAt = 0; updateDeathNext(); }
}

// Каждый кадр из main: включить авто после TUNE.autoAfter мс без нажатий.
function autoTick(now, dt) {
  var want = TUNE.autoAfter > 0 && !S.tut && now - AUTO.lastInput >= TUNE.autoAfter;
  if (want !== AUTO.on) {
    AUTO.on = want;
    if (want && S.phase === 'dead' && !el.deathOverlay.hidden) AUTO.deathAt = now + AUTO_DEATH_MS;
  }
  if (AUTO.on && !S.paused) AUTO.ms += dt;
  if (el.autoTag) el.autoTag.hidden = !AUTO.on;
  // Кадр смерти в авто: обратный отсчёт на «Дальше», затем продолжаем сами.
  if (AUTO.on && AUTO.deathAt) {
    if (now >= AUTO.deathAt) { AUTO.deathAt = 0; closeDeath(); }
    updateDeathNext(now);
  }
}

// Решает, поймал ли герой этот удар сам. Только в авто, бросок один на удар.
function autoBlocks() {
  if (!AUTO.on || rnd() >= TUNE.autoBlock) return false;
  AUTO.blocks++;
  return true;
}

function updateDeathNext(now) {
  var b = el.deathNext;
  if (!b) return;
  b.textContent = AUTO.deathAt && now ? 'Дальше · ' + Math.max(1, Math.ceil((AUTO.deathAt - now) / 1000)) : 'Дальше';
}

/* ── Оффлайн-прогресс ────────────────────────────────────────────── */

// Начисляет опыт и лут за ms отсутствия по пассивному темпу. Чекпоинт,
// память, HP не меняются, смертей нет. Возвращает сводку для экрана.
function grantOffline(ms) {
  var capMs = TUNE.offlineCapH * 3600000;
  var used = Math.min(ms, capMs);
  var kills = Math.floor(used / 3600000 * OFFLINE_KILLS_PER_HOUR * TUNE.offlineEff);
  var res = { ms: ms, used: used, capped: ms > capMs, kills: 0, packs: 0, xp: 0, levelFrom: S.level, kept: [], lost: 0 };
  if (kills <= 0) return res;
  var drops = [];
  var packMin = Math.max(2, TUNE.packMin || 2), packMax = Math.max(packMin, TUNE.packMax || 4);
  var progBonus = TUNE.adapt ? Math.floor(S.progress / 4) : 0;
  while (res.kills < kills) {
    var n = ri(packMin, packMax);
    var lvl = Math.max(1, Math.min(S.level + 6, S.level + ri(-1, 1) + progBonus));
    res.packs++;
    for (var i = 0; i < n && res.kills < kills; i++) {
      var leader = n >= 3 && i === n - 1;
      var xp = mobStats(lvl, leader).xp;
      res.xp += xp;
      res.kills++;
      grantXp(xp);
      if (leader || rnd() <= 0.34) drops.push(rollItem(lvl));
    }
  }
  drops.sort(function (a, b) { return b.score - a.score; });
  res.kept = drops.slice(0, OFFLINE_KEEP);
  res.lost = drops.length - res.kept.length;
  for (var k = res.kept.length - 1; k >= 0; k--) pushLog({ kind: 'item', item: res.kept[k] });
  S.kills += res.kills;
  S.tm.drops += drops.length;
  pushInfo({ kind: 'offline', ms: res.used, kills: res.kills, xp: res.xp });
  updateBagBadge();
  markSave();
  return res;
}

function fmtDuration(ms) {
  var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  m -= h * 60;
  return (h ? h + ' ч ' : '') + m + ' мин';
}

function showOffline(r) {
  var lines = [];
  lines.push('Вас не было ' + fmtDuration(r.ms) + (r.capped ? ' (засчитано ' + fmtDuration(r.used) + ', это предел)' : '') + '.');
  lines.push('Герой зачистил ' + r.packs + ' ' + plural(r.packs, 'стаю', 'стаи', 'стай') + ' и получил ' + r.xp + ' опыта' +
             (S.level > r.levelFrom ? ', уровень ' + r.levelFrom + ' → ' + S.level : '') + '.');
  if (r.kept.length) {
    lines.push('В рюкзаке ' + r.kept.length + ' ' + plural(r.kept.length, 'новая вещь', 'новые вещи', 'новых вещей') +
               (r.lost ? ', ещё ' + r.lost + ' ' + plural(r.lost, 'вещь рассыпалась', 'вещи рассыпались', 'вещей рассыпались') : '') + '.');
  }
  el.offlineText.innerHTML = lines.map(function (l) { return '<span>' + l + '</span>'; }).join('<br>');
  if (!S.paused) { S.paused = true; S.pauseStart = performance.now(); AUTO.ownPause = true; }
  el.offlineOverlay.hidden = false;
}

function closeOffline() {
  if (el.offlineOverlay.hidden) return;
  el.offlineOverlay.hidden = true;
  if (AUTO.ownPause) {
    AUTO.ownPause = false;
    shiftTimers(performance.now() - S.pauseStart);
    S.paused = false;
  }
  autoTouch();
}

// Вызывается из start() с временем последнего сохранения и при возврате на вкладку.
function offlineSince(at) {
  if (!at || S.tut) return;
  var gap = Date.now() - at;
  if (!(gap >= OFFLINE_MIN_MS)) return;      // часы перевели назад, или слишком мало
  showOffline(grantOffline(gap));
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) { AUTO.hiddenAt = Date.now(); return; }
  if (!AUTO.hiddenAt) return;
  var gap = Date.now() - AUTO.hiddenAt;
  AUTO.hiddenAt = 0;
  // Пока вкладка была свёрнута, бой не шёл, а часы шли: сдвигаем таймеры
  // боя, как после рюкзака, иначе все пропущенные удары придут разом.
  if (gap >= OFFLINE_MIN_MS && !S.paused) shiftTimers(gap);
  offlineSince(Date.now() - gap);
});
