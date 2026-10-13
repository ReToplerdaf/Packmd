// Серия (комбо): точные нажатия копятся в серию, серия даёт ступень бонуса
// к опыту. Плюс «идеальный» тайминг — нажатие в центре окна — и статистика
// блоков за стаю, сессию и всё время (лучшая серия).
"use strict";

// Ступени: с какой серии и какой множитель опыта за убийство.
var COMBO_TIERS = [{ at: 5, mult: 1.1 }, { at: 15, mult: 1.25 }, { at: 30, mult: 1.5 }];
var COMBO_LOUD_BREAK = 15;     // с какой серии сброс показывается надписью «СЕРИЯ ПРЕРВАНА»

function comboStats() { return { threats: 0, blocked: 0, perfect: 0, best: 0 }; }

// Служебное состояние держим вне S, как AUTO и SAVE: с выключенной серией
// бой должен совпадать один в один с версией без неё (тест equivalence).
var COMBO = {
  n: 0, tier: 0,               // текущая серия и её ступень (0 — без бонуса)
  lost: 0,                     // какая серия сброшена последней (показываем зачёркнутой)
  blockPress: -1,              // нажатие «Защиты», которое уже что-то заблокировало
  reach: new WeakSet(),        // каст хилера, который можно было прервать «Атакой»
  bestEver: 0,                 // лучшая серия за всё время (в сохранении)
  upAt: 0, breakAt: 0,         // когда была новая ступень / сброс — для анимации счётчика
  sess: comboStats(),          // за сессию
  pack: comboStats(),          // за текущую стаю
  last: null,                  // итог прошлой стаи (для «Замеров»)
  tierMs: [0, 0, 0, 0]         // сколько времени боя прошло на каждой ступени
};

// Серия работает только в ручной игре: не в авто и не в обучении.
function comboOn() { return TUNE.combo && !AUTO.on && !S.tut; }

function comboMult() { return COMBO.tier ? COMBO_TIERS[COMBO.tier - 1].mult : 1; }
function comboXp(xp) { var m = comboMult(); return m === 1 ? xp : Math.round(xp * m); }

function comboTierFor(n) {
  var t = 0;
  for (var i = 0; i < COMBO_TIERS.length; i++) if (n >= COMBO_TIERS[i].at) t = i + 1;
  return t;
}

// Идеальный ли блок — только когда серия работает (иначе бой как без неё).
function comboPerfectBlock(hitAt) { return comboOn() && comboPerfectGuard(hitAt); }

// Блок (крит, выстрел): удар пришёл в центральную долю TUNE.perfect окна блока.
// Нажатие точно на щелчок метронома = удар ровно в середине окна.
function comboPerfectGuard(hitAt) {
  var gw = dur(guardWindow());
  return Math.abs(hitAt - (S.guardPressedAt + gw / 2)) <= gw * TUNE.perfect / 2;
}
// Атака в пульс (щит, каст хилера): нажатие в центральной доле окна пульса.
function comboPerfectPulse(pulse, now) {
  var good = dur(pulseGoodMs()), late = dur(pulseLateMs());
  return Math.abs(now - (pulse.hitAt + (late - good) / 2)) <= (good + late) * TUNE.perfect / 2;
}

// Точное действие: хорошо +1, идеально +2. kind 'block' — блок крита или выстрела
// (идёт в процент блоков), остальное — атака в окно.
function comboHit(kind, perfect) {
  if (!comboOn()) return;
  if (kind === 'block') {
    COMBO.blockPress = S.guardPressedAt;
    COMBO.pack.threats++; COMBO.sess.threats++;
    COMBO.pack.blocked++; COMBO.sess.blocked++;
    if (perfect) { COMBO.pack.perfect++; COMBO.sess.perfect++; }
  }
  // у блока «ИДЕАЛЬНО» пишется вместо «БЛОК»/«ОТБИТО» (см. combat.js)
  if (perfect && kind !== 'block') floatText('ИДЕАЛЬНО', '#ffd27a', 0, 0, false);
  COMBO.n += perfect ? 2 : 1;
  var best = COMBO.n;
  if (best > COMBO.pack.best) COMBO.pack.best = best;
  if (best > COMBO.sess.best) COMBO.sess.best = best;
  if (best > COMBO.bestEver) { COMBO.bestEver = best; markSave(); }
  var t = comboTierFor(COMBO.n);
  if (t > COMBO.tier) {
    COMBO.tier = t;
    COMBO.upAt = performance.now();
    sfx('comboUp', t);
    floatText('СЕРИЯ ×' + COMBO_TIERS[t - 1].mult, '#ffd27a', 0, 0, true);
  }
}

// Промах: пропущенный крит или выстрел, мимо такта, усталость, смерть.
// threat — это был удар по герою (идёт в процент блоков).
function comboBreak(threat) {
  if (!comboOn()) return;
  if (threat) { COMBO.pack.threats++; COMBO.sess.threats++; }
  if (!COMBO.n) return;
  var was = COMBO.n;
  COMBO.n = 0; COMBO.tier = 0; COMBO.lost = was;
  COMBO.breakAt = performance.now();
  sfx('comboBreak');
  if (was >= COMBO_LOUD_BREAK) floatText('СЕРИЯ ПРЕРВАНА', '#ff9130', 0, 0, false);
}

// Пропущенный крит или выстрел. Не сбивает серию, если поймать его было
// нельзя: щит ещё в откате после нажатия, которое уже заблокировало другой
// удар или было сделано до начала этого замаха, или выстрел пришёл в один
// кадр с критом (блок гасит крит). Нажали во время замаха мимо окна — промах.
function comboMissed(tg, clash) {
  // Щит был поднят под этот выстрел, но его забрал крит в полёте: нажатие
  // потрачено честно, следующий удар в его откате тоже не в счёт.
  if (clash) { if (tg.hitAt < S.guardUntil) COMBO.blockPress = S.guardPressedAt; return; }
  var busy = tg.hitAt < S.guardCoolUntil && (S.guardPressedAt < tg.start || S.guardPressedAt === COMBO.blockPress);
  if (busy) return;
  comboBreak(true);
}

// Каст хилера дошёл до конца. Сбивает серию, только если в его окне «Атака»
// прервала бы именно его: у переднего не было щита (удар ушёл бы в щит),
// и раньше не заканчивался каст другого хилера.
function comboHealMissed(pulse) {
  if (pulse && COMBO.reach.has(pulse)) comboBreak();
}
function comboWatchHeal(now) {
  var h = activeHealer(), fm = front();
  if (!h || (fm && fm.shield)) return;
  var p = h.healPulse;
  if (now >= p.hitAt - dur(pulseGoodMs()) && now <= p.hitAt + dur(pulseLateMs())) COMBO.reach.add(p);
}

function comboPackStart() { COMBO.pack = comboStats(); }
function comboPackEnd() {
  if (COMBO.pack.threats || COMBO.pack.best) COMBO.last = COMBO.pack;
  COMBO.pack = comboStats();
}

// Каждый кадр из main: в авто серия молча гаснет (игрок перестал играть),
// и копится время на ступенях.
function comboTick(t, dt) {
  if (COMBO.n && (AUTO.on || !TUNE.combo)) { COMBO.n = 0; COMBO.tier = 0; }
  if (!S.paused && S.phase === 'fight' && comboOn()) {
    COMBO.tierMs[COMBO.tier] += dt;
    comboWatchHeal(t);
  }
}

function comboHud(t) {
  var box = el.combo;
  if (!box) return;
  var show = comboOn() && (COMBO.n > 0 || t - COMBO.breakAt < 700);
  box.hidden = !show;
  if (!show) return;
  var next = COMBO_TIERS[COMBO.tier];
  var from = COMBO.tier ? COMBO_TIERS[COMBO.tier - 1].at : 0;
  el.comboMult.textContent = COMBO.tier ? '×' + comboMult() : 'серия';
  el.comboN.textContent = COMBO.n || COMBO.lost;
  el.comboFill.style.width = (next ? Math.min(1, (COMBO.n - from) / (next.at - from)) * 100 : 100) + '%';
  box.classList.toggle('t' + COMBO.tier, true);
  for (var i = 0; i <= COMBO_TIERS.length; i++) if (i !== COMBO.tier) box.classList.remove('t' + i);
  box.classList.toggle('up', t - COMBO.upAt < 600);
  box.classList.toggle('broke', COMBO.n === 0);
}

// Ячейки для вкладки «Замеры».
function comboTelem() {
  if (!TUNE.combo) return '';
  var s = COMBO.sess, l = COMBO.last;
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; };
  var fight = COMBO.tierMs.reduce(function (a, b) { return a + b; }, 0);
  var onTiers = fight ? Math.round((fight - COMBO.tierMs[0]) / fight * 100) : 0;
  return '<div class="cell"><div class="v ' + (s.best >= COMBO_TIERS[1].at ? 'good' : '') + '">' + s.best + '</div><div class="l">Лучшая серия</div>' +
           '<div class="h">за всё время ' + COMBO.bestEver + '</div></div>' +
         '<div class="cell"><div class="v">' + pct(s.blocked, s.threats) + '</div><div class="l">Блоков вручную</div>' +
           '<div class="h">' + s.blocked + ' из ' + s.threats + ' критов и выстрелов</div></div>' +
         '<div class="cell"><div class="v">' + pct(s.perfect, s.blocked) + '</div><div class="l">Идеально</div>' +
           '<div class="h">доля блоков в центре окна</div></div>' +
         '<div class="cell"><div class="v">' + onTiers + '%</div><div class="l">С бонусом</div>' +
           '<div class="h">времени боя на ступени ×1.1 и выше</div></div>' +
         (l ? '<div class="verdict-line">Прошлая стая: блоки ' + l.blocked + ' из ' + l.threats + ' (идеально ' + l.perfect + '), лучшая серия ' + l.best + '.</div>' : '');
}
