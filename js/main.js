// Игровой цикл и запуск. Подключается последним.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   ЦИКЛ
   ════════════════════════════════════════════════════════════════════ */

var prev = 0;
function frame(t) {
  var dt = prev ? Math.min(64, t - prev) : 16;
  prev = t;

  if (!S.paused) {
    var adt = dt * (TUNE.speed || 1);
    if (S.phase === 'walk') walkOffset += adt * 0.11;
    S.shake = Math.max(0, S.shake - adt / 260);
    S.flash = Math.max(0, S.flash - adt / 420);
    step(t);
  }
  audioCues();
  render(t);
  hud(t);
  if (SAVE.dirty) saveGame();
  requestAnimationFrame(frame);
}

function start(restored) {
  recalc();
  var loaded = loadGame();               // сохранённый прогресс, если есть
  if (!loaded) S.hp = S.stats.maxHp;
  S.phase = 'walk';
  S.phaseUntil = performance.now() + dur(700);
  S.tm.started = performance.now();
  // Закрыли вкладку на вопросе после 2-й смерти подряд — задаём его снова.
  if (loaded && TUNE.adapt && S.deathStreak >= 2) { S.phase = 'prompt'; showPrompt(); }
  if (!tutDone() || /[?&]tutorial\b/.test(location.search)) startTutorial();   // первый запуск — сразу обучение
  renderLoot(); renderGear(); renderTelem();
  requestAnimationFrame(frame);
}

resize();
if (window.claude && window.claude.hot) {
  try {
    window.claude.hot.snapshot(function () { return { level: S.level, kills: S.kills }; });
  } catch (e) {}
  window.claude.hot.ready ? window.claude.hot.ready(start) : start({});
} else {
  start({});
}
