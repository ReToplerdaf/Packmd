// Состояние игры S и пересчёт характеристик героя.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   СОСТОЯНИЕ
   ════════════════════════════════════════════════════════════════════ */

var S = {
  level: 1, xp: 0, hp: 100, kills: 0,
  gear: {},                       // slotId -> item
  stats: null,                    // сводка базы и шмота
  paused: false, pauseStart: 0,   // рюкзак открыт — бой стоит
  phase: 'walk', phaseUntil: 0,
  pack: [], packLevel: 1, packResist: 0, bossFled: false, memLeft: 0,
  progress: 0,                    // резинка по чекпоинтам: копится за пройденные стаи, тает при отступлении
  resist: 0,                      // память стаи о вашем уроне — переходит на следующий пак и затухает
  deathStreak: 0,                 // смертей подряд без победы между ними
  heroSwingAt: 0, mobSwingAt: 0,
  telegraph: null,                // { start, hitAt, mob, taken }
  guardUntil: 0, guardCoolUntil: 0, guardCoolMs: 0, guardPressedAt: 0,
  fatigueMult: 1, fatigueUntil: 0, guardPressStamps: [],
  counterUntil: 0, counterMob: null, strikeCoolAt: 0,
  shake: 0, flash: 0, flashColor: null,
  floats: [], log: [], info: [], deflects: [],
  tm: { crits: 0, blocked: 0, taken: 0, react: [], deaths: 0, drops: 0, equips: 0, flees: 0, retreats: 0, started: 0 }
};

function recalc() {
  var b = baseStats(S.level);
  for (var id in S.gear) {
    var st = S.gear[id].stats;
    for (var k in st) b[k] += st[k];
  }
  S.stats = b;
  if (S.hp > b.maxHp) S.hp = b.maxHp;
  return b;
}

function guardWindow() { return TUNE.guard + S.stats.guardBonus; }
function heroSwingMs() { return HERO_SWING / (1 + S.stats.atkSpeed); }
