// Стартовая заставка: звук и музыка отдельно, сброс прогресса с подтверждением, «Старт».
"use strict";

/* ── Заставка ────────────────────────────────────────────────────────
   Показывается при каждом открытии игры, бой начинается по «Старту».
   Нажатие «Старт» — заодно жест, после которого браузер даёт играть
   звуку и музыке. Пока заставка на экране, игра ничего не сохраняет
   (SAVE.off), иначе закрытие вкладки затёрло бы сохранение пустым
   героем. Тесты пропускают заставку: window.PACK_NOSPLASH или ?nosplash. */

var SPLASH_SKIP = window.PACK_NOSPLASH === true || /[?&]nosplash\b/.test(location.search);

function splashThen(go) {
  if (SPLASH_SKIP) { go(); return; }
  var box = $('splash'), snd = $('splash-sound'), mus = $('splash-music');
  var reset = $('splash-reset'), ask = $('splash-confirm'), msg = $('splash-msg');
  var started = false;
  SAVE.off = true;

  function paint() {
    snd.setAttribute('aria-pressed', TUNE.sound ? 'true' : 'false');
    mus.setAttribute('aria-pressed', TUNE.music ? 'true' : 'false');
    snd.textContent = 'Звук: ' + (TUNE.sound ? 'вкл' : 'выкл');
    mus.textContent = 'Музыка: ' + (TUNE.music ? 'вкл' : 'выкл');
    var has = false;
    try { has = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
    reset.hidden = !has || !ask.hidden;
  }
  // тумблеры те же, что во вкладке «Настройка»: клик по ним сохраняет настройку
  snd.addEventListener('click', function () { $('c-sound').click(); paint(); if (TUNE.sound) sfx('equip'); });
  mus.addEventListener('click', function () { $('c-music').click(); paint(); });
  reset.addEventListener('click', function () { ask.hidden = false; msg.hidden = true; paint(); });
  $('splash-no').addEventListener('click', function () { ask.hidden = true; paint(); });
  $('splash-yes').addEventListener('click', function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    ask.hidden = true;
    msg.textContent = 'Прогресс удалён. Игра начнётся с начала.';
    msg.hidden = false;
    paint();
  });

  function begin() {
    if (started) return;
    started = true;
    box.hidden = true;
    SAVE.off = false;
    unlockAudio();
    musicUpdate();
    go();
  }
  $('splash-start').addEventListener('click', begin);
  // Enter / Пробел — «Старт» (или «Да»/«Отмена», если они в фокусе); бою клавиши не уходят
  window.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    e.stopImmediatePropagation();
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, own = t && t.tagName === 'BUTTON' && box.contains(t) && t.offsetParent !== null;
    if ((e.key === 'Enter' || e.key === ' ') && !own) { e.preventDefault(); begin(); }
    else if (e.code === 'KeyM') { snd.click(); }
  }, true);

  paint();
  box.hidden = false;
}
