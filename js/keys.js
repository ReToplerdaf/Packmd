// Десктоп: определение и управление с клавиатуры.
"use strict";

/* ── Десктоп или телефон ─────────────────────────────────────────── */

// Десктоп — есть мышь или тачпад и нет сенсора. Ширину экрана не смотрим:
// планшет с клавиатурой широкий, а окно браузера бывает узким. Ноутбук с
// сенсорным экраном считается телефоном, пока не нажали игровую клавишу.
// Вручную: ?desktop или ?mobile в адресе.
var DESKTOP_FORCED = /[?&]desktop\b/.test(location.search) ? true : /[?&]mobile\b/.test(location.search) ? false : null;
function desktopDetect() {
  if (DESKTOP_FORCED !== null) return DESKTOP_FORCED;
  if (!window.matchMedia) return false;
  return matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(any-pointer: coarse)').matches;
}
var DESKTOP = false;
function setDesktop(on) {
  DESKTOP = !!on;
  document.documentElement.classList.toggle('desktop', DESKTOP);
  $('keys-help').hidden = !DESKTOP;
}
setDesktop(desktopDetect());

/* ── Клавиши ─────────────────────────────────────────────────────── */

// Защита и Атака — A/← и D/→ (обработчик в controls.js). Здесь — остальное:
//   Пробел, W, ↑ — касание по летучей мыши (в версии «кружок» — по кружку)
//   B — рюкзак; в рюкзаке 1–5 — вкладки, Esc или B — закрыть
//   Enter, Пробел — главная кнопка карточки; на вопросе после 2 смертей 1 и 2
//   M — звук
function typing(e) {
  var t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
function visibleOverlay(id) { return !$(id).hidden; }

window.addEventListener('keydown', function (e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
  var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // кириллическая раскладка — те же физические клавиши
  var code = e.code || '';
  if (code === 'KeyB') k = 'b';
  if (code === 'KeyM') k = 'm';
  if (code === 'KeyW') k = 'w';
  if (code === 'KeyA') k = 'a';
  if (code === 'KeyD') k = 'd';
  var game = ['a', 'd', 'w', 'b', 'm', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp'];
  if (!DESKTOP && DESKTOP_FORCED === null && game.indexOf(k) >= 0) setDesktop(true);
  // A/D и стрелки уже нажал controls.js, Пробел/Enter — сама кнопка в фокусе
  if (e.defaultPrevented) return;
  var done = function () { e.preventDefault(); };
  var enter = k === 'Enter' || k === ' ';

  // Карточки поверх боя — по старшинству, как они лежат друг на друге.
  if (visibleOverlay('splash')) return;     // у заставки свои клавиши (splash.js)
  if (visibleOverlay('tut-overlay')) { if (enter) { done(); tutClose(); } return; }
  if (visibleOverlay('offline-overlay')) { if (enter) { done(); closeOffline(); } return; }
  if (visibleOverlay('death-overlay')) { if (enter) { done(); closeDeath(); } return; }
  if (visibleOverlay('prompt-overlay')) {
    if (k === '1' || enter) { done(); resolvePrompt('retreat'); }
    else if (k === '2') { done(); resolvePrompt('ack'); }
    return;
  }

  if (!el.backpackOverlay.hidden) {
    if (k === 'Escape' || k === 'b') { done(); closeBackpack(); return; }
    var n = +k;
    if (n >= 1 && n <= TABS.length) { done(); $(TABS[n - 1][0]).click(); return; }
    if (k === 'm') { done(); $('c-sound').click(); }
    return;
  }

  if (k === 'b') { done(); openBackpack(); return; }
  if (k === 'm') { done(); $('c-sound').click(); return; }
  if (k === ' ' || k === 'w' || k === 'ArrowUp') {
    done();
    unlockAudio();
    circleTap(CIRCLE.x, CIRCLE.y);
  }
});
