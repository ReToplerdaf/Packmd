// Ручная расстановка мобов: в паузе тянешь моба пальцем, двумя пальцами
// или кнопками −/+ меняешь размер. Хранится сдвиг (в пикселях картинки
// задника) и множитель масштаба для каждого места стаи 0–4.
"use strict";

var LAYOUT_KEY = 'arena.layout', LAYOUT_SLOTS = 5;
var LAYOUT = { mobs: loadLayout(), edit: false, sel: -1, ptrs: {}, drag: null };
function loadLayout() {
  try {
    var v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
    return Array.isArray(v) ? v.slice(0, LAYOUT_SLOTS) : [];
  } catch (e) { return []; }
}
function saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(LAYOUT.mobs)); } catch (e) {} }
function layoutOf(i) {
  var o = i < LAYOUT_SLOTS ? LAYOUT.mobs[i] : null;
  return o && isFinite(o[0]) && isFinite(o[1]) && o[2] > 0 ? o : null;
}
// Пиксель картинки задника на экране; без задника — та же доля высоты.
function layoutUnit() { return BG_XF ? BG_XF.bk : (H - 56) / 1024; }
function layoutEnsure(i) {
  if (!layoutOf(i)) LAYOUT.mobs[i] = [0, 0, 1];
  for (var j = 0; j < i; j++) if (!LAYOUT.mobs[j]) LAYOUT.mobs[j] = null;
  return LAYOUT.mobs[i];
}
function layoutBox(i) {
  var s0 = Math.min(1.6, Math.max(0.88, H / 178)), h = 40 * s0 * mobScale(i);
  return { x: mobX(i), y: mobY(i), h: h };
}
function layoutHit(x, y) {
  for (var i = LAYOUT_SLOTS - 1; i >= 0; i--) {   // задние мельче — у них приоритет
    var b = layoutBox(i), r = Math.max(b.h * 0.45, 18);
    if (Math.abs(x - b.x) < r && y > b.y - Math.max(b.h * 1.15, 36) && y < b.y + 14) return i;
  }
  return -1;
}
function drawLayoutMarks() {
  ctx.save();
  ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (var i = 0; i < LAYOUT_SLOTS; i++) {
    var b = layoutBox(i), sel = i === LAYOUT.sel, ghost = i >= S.pack.length;
    if (ghost) {   // пустое место стаи — контур, чтобы его тоже можно было двигать
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x - b.h * 0.35, b.y - b.h, b.h * 0.7, b.h);
      ctx.setLineDash([]);
    }
    if (sel) {
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x - b.h * 0.45, b.y - b.h * 1.15, b.h * 0.9, b.h * 1.15 + 6);
    }
    ctx.fillStyle = sel ? '#ffd34d' : 'rgba(0,0,0,.65)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 9, 9, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = sel ? '#111' : '#fff';
    ctx.fillText(String(i + 1), b.x, b.y + 0.5);
  }
  ctx.restore();
}

var layoutEl = document.getElementById('layout-edit');
var layoutTip = document.getElementById('layout-tip');
function layoutSay(txt) { layoutTip.textContent = txt; }
function layoutStart() {
  closeBackpack();
  if (S.paused) return;               // карточка обучения или экран оффлайна
  S.paused = true; S.pauseStart = performance.now();
  LAYOUT.edit = true; LAYOUT.sel = -1; LAYOUT.ptrs = {}; LAYOUT.drag = null;
  layoutEl.hidden = false;
  layoutSay('Тяни моба пальцем. Размер — двумя пальцами или кнопками − и +');
}
function layoutDone() {
  if (!LAYOUT.edit) return;
  saveLayout();
  LAYOUT.edit = false; LAYOUT.sel = -1;
  layoutEl.hidden = true;
  shiftTimers(performance.now() - S.pauseStart);
  S.paused = false;
  autoTouch();
}
function layoutPt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function layoutPinch() {
  var ids = Object.keys(LAYOUT.ptrs);
  if (ids.length < 2) return null;
  var a = LAYOUT.ptrs[ids[0]], b = LAYOUT.ptrs[ids[1]];
  return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function layoutScale(f) {
  if (LAYOUT.sel < 0) { layoutSay('Сначала коснись моба'); return; }
  var o = layoutEnsure(LAYOUT.sel);
  o[2] = Math.max(0.3, Math.min(3, o[2] * f));
  layoutSay('Моб ' + (LAYOUT.sel + 1) + ': размер ×' + o[2].toFixed(2));
}
layoutEl.addEventListener('pointerdown', function (e) {
  if (e.target.closest('.layout-bar')) return;
  e.preventDefault();
  var p = layoutPt(e);
  LAYOUT.ptrs[e.pointerId] = p;
  try { layoutEl.setPointerCapture(e.pointerId); } catch (er) {}
  var pin = layoutPinch();
  if (pin) {                          // второй палец — меняем размер
    if (LAYOUT.sel < 0) LAYOUT.sel = layoutHit(pin.x, pin.y);
    if (LAYOUT.sel >= 0) LAYOUT.drag = { pinch: pin.d, k: layoutEnsure(LAYOUT.sel)[2] };
    return;
  }
  LAYOUT.sel = layoutHit(p.x, p.y);
  if (LAYOUT.sel < 0) { LAYOUT.drag = null; layoutSay('Коснись моба (номера — места в стае, 1 — передний)'); return; }
  var o = layoutEnsure(LAYOUT.sel);
  LAYOUT.drag = { x: p.x, y: p.y, ox: o[0], oy: o[1] };
  layoutSay('Моб ' + (LAYOUT.sel + 1) + ' — тяни, размер ×' + o[2].toFixed(2));
});
layoutEl.addEventListener('pointermove', function (e) {
  if (!LAYOUT.ptrs[e.pointerId] || !LAYOUT.drag || LAYOUT.sel < 0) return;
  var p = layoutPt(e); LAYOUT.ptrs[e.pointerId] = p;
  var o = layoutEnsure(LAYOUT.sel), d = LAYOUT.drag, pin = layoutPinch();
  if (pin && d.pinch) { o[2] = Math.max(0.3, Math.min(3, d.k * pin.d / d.pinch)); layoutSay('Моб ' + (LAYOUT.sel + 1) + ': размер ×' + o[2].toFixed(2)); return; }
  if (pin || d.pinch) return;
  var u = layoutUnit();
  o[0] = d.ox + (p.x - d.x) / u; o[1] = d.oy + (p.y - d.y) / u;
});
function layoutUp(e) {
  delete LAYOUT.ptrs[e.pointerId];
  if (LAYOUT.drag && LAYOUT.drag.pinch) {   // отпустили один из двух пальцев — дальше тянет оставшийся
    var ids = Object.keys(LAYOUT.ptrs);
    if (ids.length === 1 && LAYOUT.sel >= 0) {
      var p = LAYOUT.ptrs[ids[0]], o = layoutEnsure(LAYOUT.sel);
      LAYOUT.drag = { x: p.x, y: p.y, ox: o[0], oy: o[1] };
    } else if (!ids.length) LAYOUT.drag = null;
  } else if (!Object.keys(LAYOUT.ptrs).length) LAYOUT.drag = null;
}
layoutEl.addEventListener('pointerup', layoutUp);
layoutEl.addEventListener('pointercancel', layoutUp);
document.getElementById('layout-start').addEventListener('click', layoutStart);
document.getElementById('layout-done').addEventListener('click', layoutDone);
document.getElementById('layout-minus').addEventListener('click', function () { layoutScale(1 / 1.06); });
document.getElementById('layout-plus').addEventListener('click', function () { layoutScale(1.06); });
document.getElementById('layout-reset').addEventListener('click', function () {
  if (LAYOUT.sel >= 0) { LAYOUT.mobs[LAYOUT.sel] = null; layoutSay('Моб ' + (LAYOUT.sel + 1) + ' — на прежнем месте'); }
  else { LAYOUT.mobs = []; layoutSay('Все мобы — на прежних местах'); }
});
document.getElementById('layout-copy').addEventListener('click', function () {
  var txt = 'LAYOUT1:' + JSON.stringify(LAYOUT.mobs.map(function (o) {
    return o ? [Math.round(o[0]), Math.round(o[1]), Math.round(o[2] * 100) / 100] : null;
  }));
  var ok = function () { layoutSay('Скопировано — пришли эту строку в чат'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { window.prompt('Скопируй строку:', txt); });
  else window.prompt('Скопируй строку:', txt);
});
