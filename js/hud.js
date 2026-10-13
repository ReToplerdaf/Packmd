// HUD: элементы интерфейса, подсветка кнопок, полосы и плашки.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   ИНТЕРФЕЙС
   ════════════════════════════════════════════════════════════════════ */

var $ = function (id) { return document.getElementById(id); };
var el = {
  lvl: $('lvl'), hpFill: $('hp-fill'), hpTxt: $('hp-txt'),
  xpFill: $('xp-fill'), xpTxt: $('xp-txt'),
  atk: $('st-atk'), def: $('st-def'), kills: $('st-kills'), cp: $('cp'), cpBox: $('hud-cp'),
  cpCubes: document.querySelectorAll('#hud-cp .cp-stack i'), cpStack: document.querySelector('#hud-cp .cp-stack'), packLvl: $('pack-lvl'), packLvlN: $('pack-lvl-n'), cpMem: $('cp-mem'), cpMemN: $('cp-mem-n'),
  banner: $('banner'),
  guard: $('btn-guard'), guardSub: $('guard-sub'), guardMeter: $('guard-meter'),
  strike: $('btn-strike'), strikeSub: $('strike-sub'), strikeMeter: $('strike-meter'),
  loot: $('pane-loot'), gear: $('pane-gear'), stats: $('pane-stats'), info: $('pane-info'),
  promptOverlay: $('prompt-overlay'), promptText: $('prompt-text'),
  deathOverlay: $('death-overlay'), deathText: $('death-text'),
  bagBtn: $('btn-bag'), bagBadge: $('bag-badge'),
  backpackOverlay: $('backpack-overlay'), backpackClose: $('backpack-close'),
  tutOverlay: $('tut-overlay'), tutStep: $('tut-step'), tutH: $('tut-h'), tutText: $('tut-text'),
  tutOk: $('tut-ok'), tutSkip: $('tut-skip')
};

var BANNER = { walk: 'идёт к следующей стае', fight: '', dead: 'поднимается', prompt: 'ждёт решения' };

var lastHud = 0;
// Подсветка кнопок: какая кнопка нужна и насколько близко момент.
// Те же окна, что в логике боя и в звуковом отсчёте.
function buttonCues(t) {
  var gNeed = 0, gNow = false, sNeed = 0, sNow = false;
  if (S.phase === 'fight' && !S.paused) {
    var gwd = dur(guardWindow());
    var defs = [];
    if (S.telegraph) defs.push(S.telegraph);
    for (var i = 0; i < S.pack.length; i++) {
      var rm = S.pack[i];
      if (rm.type === 'ranged' && rm.rangedTelegraph && rm.hp > 0) defs.push(rm.rangedTelegraph);
    }
    for (var d = 0; d < defs.length; d++) {
      var a = defs[d];
      var openAt = a.hitAt - gwd;                     // с этого момента нажатие блока успевает
      var p = Math.max(0, Math.min(1, (t - a.start) / Math.max(1, openAt - a.start)));
      gNeed = Math.max(gNeed, p * p);
      if (t >= openAt && t <= a.hitAt) gNow = true;
    }
    var fm = front();
    var good = dur(pulseGoodMs()), late = dur(pulseLateMs());
    var sps = [];
    if (fm && fm.shield && fm.pulse) sps.push(fm.pulse);
    var ahb = activeHealer();
    if (ahb) sps.push(ahb.healPulse);
    for (var si = 0; si < sps.length; si++) {
      var sp = sps[si];
      var wS = sp.hitAt - good, wE = sp.hitAt + late;
      var q = Math.max(0, Math.min(1, (t - sp.start) / Math.max(1, wS - sp.start)));
      sNeed = Math.max(sNeed, q * q);
      if (t >= wS && t <= wE) sNow = true;
    }
    if (t < S.counterUntil) { sNeed = 1; sNow = true; }   // окно контратаки
  }
  el.guard.style.setProperty('--cue', gNow ? 1 : gNeed.toFixed(3));
  el.strike.style.setProperty('--cue', sNow ? 1 : sNeed.toFixed(3));
  el.guard.classList.toggle('cue-now', gNow);
  el.strike.classList.toggle('cue-now', sNow);
}

function hud(t) {
  buttonCues(t);
  // Метры кнопок — каждый кадр: это и есть визуальная обратная связь по таймингу.
  var gw = guardWindow();
  if (t < S.guardUntil) {
    el.guard.classList.add('armed'); el.guard.classList.remove('cool');
    el.guardMeter.style.width = ((S.guardUntil - t) / dur(gw) * 100) + '%';
    el.guardSub.textContent = 'поднят';
  } else if (t < S.guardCoolUntil) {
    el.guard.classList.remove('armed'); el.guard.classList.add('cool');
    el.guardMeter.style.width = ((S.guardCoolUntil - t) / Math.max(1, S.guardCoolMs || dur(TUNE.cool)) * 100) + '%';
    el.guardSub.textContent = (TUNE.fatigue && t < S.fatigueUntil) ? ('устал ×' + S.fatigueMult) : 'откат';
  } else {
    el.guard.classList.remove('armed', 'cool');
    el.guardMeter.style.width = '0%';
    el.guardSub.textContent = gw + ' мс';
  }

  var fm = front();
  if (fm && fm.shield && fm.pulse) {
    var pGood = fm.pulse.hitAt - dur(pulseGoodMs()), pEnd = fm.pulse.hitAt + dur(pulseLateMs());
    var inWindow = t >= pGood && t <= pEnd;
    el.strike.classList.toggle('window', inWindow);
    el.strikeMeter.style.width = (Math.max(0, Math.min(1, (t - fm.pulse.start) / (fm.pulse.hitAt - fm.pulse.start))) * 100) + '%';
    el.strikeSub.textContent = inWindow ? 'бей щит!' : 'ждёт пульса';
  } else if (fm && fm.type === 'healer' && fm.healPulse) {
    var hGood = fm.healPulse.hitAt - dur(pulseGoodMs()), hEnd = fm.healPulse.hitAt + dur(pulseLateMs());
    var hWindow = t >= hGood && t <= hEnd;
    el.strike.classList.toggle('window', hWindow);
    el.strikeMeter.style.width = (Math.max(0, Math.min(1, (t - fm.healPulse.start) / (fm.healPulse.hitAt - fm.healPulse.start))) * 100) + '%';
    el.strikeSub.textContent = hWindow ? 'прервать!' : 'лечит…';
  } else if (t < S.counterUntil) {
    el.strike.classList.add('window');
    el.strikeMeter.style.width = ((S.counterUntil - t) / dur(COUNTER_MS) * 100) + '%';
    el.strikeSub.textContent = 'контра ×' + COUNTER_MULT.toFixed(1);
  } else {
    el.strike.classList.remove('window');
    el.strikeMeter.style.width = '0%';
    el.strikeSub.textContent = 'ждёт блока';
  }

  if (t - lastHud < 90) return;
  lastHud = t;

  var st = S.stats;
  el.lvl.textContent = S.level;
  el.hpFill.style.width = Math.max(0, S.hp / st.maxHp * 100) + '%';
  el.hpTxt.textContent = Math.max(0, Math.round(S.hp)) + ' / ' + Math.round(st.maxHp);
  var need = xpToNext(S.level);
  el.xpFill.style.width = (S.xp / need * 100) + '%';
  el.xpTxt.textContent = Math.round(S.xp) + ' / ' + need;
  el.atk.textContent = Math.round(st.atk);
  el.def.textContent = Math.round(st.def);
  el.kills.textContent = S.kills;
  // Строка вверху: без числа мобов в стае и без чекпоинта (он теперь
  // отдельным бейджем слева) — иначе не влезала.
  var bannerTxt = S.phase === 'fight'
    ? ('ур ' + S.packLevel + (S.packResist ? ' · память ×' + S.packResist : ''))
    : (BANNER[S.phase] || '');
  el.banner.textContent = bannerTxt;
  // Слева — уровень мобов текущей стаи (вместо номера чекпоинта).
  // Цифра белая: цветной она теряется на кубиках памяти.
  el.cp.textContent = S.packLevel;
  el.cpBox.hidden = false;
  // Под уровнем героя — уровень текущей стаи (красный, если она выше,
  // зелёный, если ниже); под чекпоинтом — «память» стаи, если она есть.
  var inFight = S.phase === 'fight';
  el.packLvl.hidden = true;   // уровень стаи не показываем — хватает номера стаи слева
  if (inFight) {
    el.packLvlN.textContent = S.packLevel;
    el.packLvlN.style.color = S.packLevel > S.level ? '#ff7a63' : (S.packLevel < S.level ? '#7cd88a' : '');
  }
  // кубики: сколько стай (включая текущую) память ещё держится
  // кубики: сколько горит — уровень памяти; цвет — сколько стай (включая
  // текущую) до того, как память уменьшится на 1
  var memLvl = TUNE.adapt ? S.resist : 0;
  var left = memLvl > 0 ? (inFight && S.packResist > 0 ? S.memLeft + 1 : S.memLeft) : 0;
  left = Math.max(1, Math.min(3, left));
  for (var ci = 0; ci < el.cpCubes.length; ci++) {
    el.cpCubes[ci].classList.toggle('on', ci < memLvl);
    el.cpCubes[ci].classList.toggle('top', ci === memLvl - 1);
  }
  el.cpStack.classList.remove('t1', 't2', 't3');
  if (memLvl > 0) el.cpStack.classList.add('t' + left);
  el.cpMem.hidden = true;

  if (dirty.loot) { renderLoot(); dirty.loot = false; }
  if (dirty.gear) { renderGear(); dirty.gear = false; }
  if (dirty.info) { renderInfo(); dirty.info = false; }
  renderTelem();
}
