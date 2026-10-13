// Опыт, уровни, дроп, надевание, прятки и побег раненых, журнал.
"use strict";

/* ── Лут и уровни ────────────────────────────────────────────────── */

function grantXp(amount) {
  S.xp += amount;
  var leveled = false;
  while (S.xp >= xpToNext(S.level)) {
    S.xp -= xpToNext(S.level);
    S.level++;
    leveled = true;
  }
  if (leveled) {
    var before = S.stats.maxHp;
    recalc();
    S.hp += (S.stats.maxHp - before);         // уровень лечит на прирост
    S.flash = 1; S.flashColor = '#c9954a';
    sfx('level');
    pushLog({ kind: 'level', level: S.level });
    markSave();
  }
}

function dropFrom(mob) {
  var chance = mob.leader ? 1 : 0.34;   // вожак и главарь — всегда
  if (rnd() > chance) return;

  var item = rollItem(S.packLevel, mob.chief ? CHIEF_MIN_RARITY : 0);
  S.tm.drops++;

  // Экипировка теперь ручная: предмет ложится в журнал, игрок сам решает,
  // надевать ли его — весовая функция (item.score) только подсказывает.
  sfx('loot', item.rarity.id);
  pushLog({ kind: 'item', item: item });
  markSave();
}

// Вызывается только нажатием кнопки «надеть» в журнале лута.
function equipItem(item) {
  if (!item || S.gear[item.slot.id] === item) return;
  S.gear[item.slot.id] = item;
  S.tm.equips++;
  recalc();
  dirty.loot = true; dirty.gear = true;
  markSave();
  sfx('equip');
}

// Успешный блок не наказывается: если стан сорвался без добивания, моб
// остаётся на месте и просто становится уязвимее — это награда за попытку,
// а не штраф игроку.
function markVulnerable(mob) {
  mob.vulnMult = Math.min(VULN_CAP, (mob.vulnMult || 1) + VULN_STEP);
  S.flash = 0.35; S.flashColor = '#ffb84d';
  sfx('vuln');
  floatText('УЯЗВИМ', '#ffb84d', 0, 0, false);
}

// Промах блока: игрок пропустил крит. Если у моба, который его нанёс,
// мало здоровья, он прячется за следующего в очереди — тот сразу встаёт
// в щит. Если защитника не добить вовремя, раненый сбегает насовсем.
function retreatBehindProtector(mob, now) {
  var i = S.pack.indexOf(mob);
  if (i < 0 || i >= S.pack.length - 1 || mob.guardedBy) return;
  // Ищем валидного защитника дальше в очереди — Хилер и дальнобойщик не
  // годятся: у них 1 HP, прятаться за них бессмысленно (герой сносит их с
  // одного удара, и «прикрытие» исчезает мгновенно, что выглядит нелепо,
  // особенно если это делает сам вожак).
  var pi = i + 1;
  while (pi < S.pack.length && (S.pack[pi].type === 'ranged' || S.pack[pi].type === 'healer' || S.pack[pi].type === 'bat')) pi++;
  if (pi >= S.pack.length) return; // некого поставить в прикрытие — отступление не удаётся
  var protector = S.pack[pi];
  S.pack[i] = protector; S.pack[pi] = mob;
  protector.shield = true;
  protector.pulse = { start: now, hitAt: now + dur(PULSE_LEAD) };
  protector.guarding = mob;
  mob.guardedBy = protector;
  mob.retreatDeadline = now + dur(TUNE.retreatWindow);
  mob.staggerUntil = 0;
  S.flash = 0.5; S.flashColor = '#4a9fe8';
  sfx('retreat');
  floatText('прячется', '#8fb4d6', 0, 0, false);
}

function fleeWounded(mob, now) {
  var i = S.pack.indexOf(mob);
  if (i < 0) return;
  if (mob.guardedBy) mob.guardedBy.guarding = null;
  mob.guardedBy = null; mob.retreatDeadline = 0;
  S.pack.splice(i, 1);
  S.resist = Math.min(MEM_CAP, S.resist + 1);
  S.memLeft = MEM_PACKS;                         // новый побег — отсчёт забывания заново
  S.tm.flees++;
  pushLog({ kind: 'flee', resist: S.resist });
  markSave();
  S.flash = 0.5; S.flashColor = '#3fdcc4';
  sfx('flee');
  floatText('сбежал', '#8fd6c9', 0, 0, false);
  if (!S.pack.length && S.phase === 'fight') { S.phase = 'walk'; S.phaseUntil = now + dur(ri(900, 1500)); }
}

// Рюкзак (S.log) хранит только вещи; «Уровень N», «сбежал» и прочие
// события уходят во вкладку «Инфо» (S.info) и вещи не вытесняют.
var BAG_CAP = 36;           // сколько ненадетых вещей помещается в рюкзак
var INFO_CAP = 60;          // сколько последних событий держит «Инфо»
function bagCount() {
  var n = 0;
  for (var i = 0; i < S.log.length; i++) {
    var it = S.log[i].item;
    if (it && S.gear[it.slot.id] !== it) n++;
  }
  return n;
}
function pushLog(entry) {
  if (entry.item) {
    if (bagCount() >= BAG_CAP) {
      // Рюкзак полон: выбрасываем самую слабую вещь (по подсказке item.score),
      // это может быть и сама новая. Запись об этом — в «Инфо».
      var wi = -1;
      for (var k = 0; k < S.log.length; k++) {
        var w = S.log[k].item;
        if (w && S.gear[w.slot.id] !== w && (wi < 0 || w.score < S.log[wi].item.score)) wi = k;
      }
      if (wi < 0 || entry.item.score <= S.log[wi].item.score) { pushInfo({ kind: 'full', item: entry.item }); return; }
      var out = S.log.splice(wi, 1)[0].item;
      if (S.selItem === out) S.selItem = null;
      pushInfo({ kind: 'full', item: out });
    }
    S.log.unshift(entry);
    dirty.loot = true;
    return;
  }
  pushInfo(entry);
}
function pushInfo(entry) {
  S.info.unshift(entry);
  if (S.info.length > INFO_CAP) S.info.pop();
  dirty.info = true;
}
