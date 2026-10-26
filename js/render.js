// Отрисовка: canvas, раскладка экрана, очередь стаи, меч, точки на мобах.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   РИСОВАНИЕ
   ════════════════════════════════════════════════════════════════════ */

var cv = document.getElementById('arena');
var ctx = cv.getContext('2d');
var W = 0, H = 0, dpr = 1;
var walkOffset = 0;
var dirty = { loot: true, gear: true, stats: true, telem: true, info: true };

function resize() {
  var r = cv.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = Math.max(240, r.width); H = Math.max(140, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
window.addEventListener('resize', resize);

// Низ экрана теперь занят полосами ХП/опыта и кнопками — земля должна
// быть заметно выше их, чтобы активный моб не прятался за интерфейсом.
function groundY() { return H * 0.58; }
// Вид от первого лица: героя на экране нет, поэтому «точка попадания» по
// игроку — это кнопка щита внизу слева (единственное, что на экране
// физически представляет персонажа). Дальние атаки летят прямо в её
// центр; как долетели до края — считается, что удар прошёл по персонажу.
// Размер угловой кнопки — та же формула, что в CSS: min(200px, 46vw).
function wedgeSize() { return Math.min(200, (window.innerWidth || W) * 0.46); }
function heroX() { return wedgeSize() * 0.34; }
function heroY() { return H - 56 - wedgeSize() * 0.5; }
// Очередь стаи — фиксированные «места»: первое место прямо за активным
// мобом, каждое следующее чуть дальше и мельче (шаг сокращается, как в
// перспективе). Место зависит только от номера в очереди, поэтому когда
// активного добили, все сдвигаются на одно место ближе. Цепочка
// асимптотически стремится к точке (farX, farY) и в угол не улетает.
var QUEUE_STEP = 0.72;
// Задник-картинка с берегами (render ставит в каждом кадре) — тогда
// очередь стоит на земле вдоль левого берега русла, уходя к дальней точке.
var BG_XF = null;
function queuePos(i) {
  var k = i - 1;                                   // 0 — ближайшее место
  var d = (1 - Math.pow(QUEUE_STEP, k)) / (1 - QUEUE_STEP); // 0, 1, 1.72, 2.24…
  var dMax = 1 / (1 - QUEUE_STEP);                 // предел цепочки
  var f = d / dMax;
  if (BG_XF && BG_XF.banks) {
    var bl = BG_XF.banks.left, un = bankVisible(bl) * 0.8, near = bankPt(bl, un), far = bankPt(bl, 0.03);
    var p = bgToScreen([near[0] + (far[0] - near[0]) * f + 30 * (1 - f), near[1] + (far[1] - near[1]) * f]);
    return { x: p[0], y: p[1], scale: 0.84 * Math.pow(0.8, k) };
  }
  var gy = groundY();
  var nearX = W * 0.36, nearY = gy * 0.42;
  var farX = W * 0.17, farY = gy * 0.14;
  return {
    x: nearX + f * (farX - nearX),
    y: nearY + f * (farY - nearY),
    scale: 0.84 * Math.pow(0.8, k)   // ×1.35 к прежнему — очередь крупнее
  };
}

// Плавное перемещение: экранные позиция и масштаб каждого моба
// подтягиваются к целевым, так сдвиг очереди и выход нового активного
// моба в центр видны как движение, а не как скачок.
function easeMob(m, i, dt) {
  var tx = mobX(i), ty = mobY(i), ts = mobScale(i);
  if (m.vx == null) { m.vx = tx; m.vy = ty; m.vs = ts; return; }
  var a = 1 - Math.exp(-dt / 140);
  m.vx += (tx - m.vx) * a;
  m.vy += (ty - m.vy) * a;
  m.vs += (ts - m.vs) * a;
}
function mobX(i) { return BG_XF && BG_XF.path ? pathPos(i).x : (i === 0 ? W * 0.52 : queuePos(i).x); }
function mobY(i) { return BG_XF && BG_XF.path ? pathPos(i).y : (i === 0 ? groundY() : queuePos(i).y); }
function mobScale(i) { return i === 0 ? 2.5 : (BG_XF && BG_XF.path ? pathPos(i).scale : queuePos(i).scale); }
// Стая на задника с линией ракурса: ноги на линии (y — по картинке),
// задние мельче по перспективе (w — ширина моба на картинке, px).
function pathLineX(path, y) { var a = path.line[0], b = path.line[1]; return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); }
function pathPos(i) {
  var pa = BG_XF.path, y, w;
  if (i === 0) y = pa.front;
  else if (i - 1 < pa.slots.length) { y = pa.slots[i - 1][0]; w = pa.slots[i - 1][1]; }
  else {   // дальше — к дальней точке, всё мельче
    var last = pa.slots[pa.slots.length - 1], n = i - pa.slots.length;
    y = pa.line[0][1] + (last[0] - pa.line[0][1]) * Math.pow(0.6, n); w = last[1] * Math.pow(0.7, n);
  }
  var x = BG_XF.bx + pathLineX(pa, y) * BG_XF.bk, sy = BG_XF.by + y * BG_XF.bk;
  var s0 = Math.min(1.6, Math.max(0.88, H / 178));
  return { x: x, y: sy, scale: i === 0 ? 2.5 : w * BG_XF.bk / (43 * s0) };
}

function drawHero(x, gy, t) {
  var swing = 0, lean = 0;
  var sinceSwing = t - (S.heroSwingAt - heroSwingMs());
  if (S.phase === 'fight' && sinceSwing >= 0 && sinceSwing < 220) {
    swing = Math.sin((sinceSwing / 220) * Math.PI);
    lean = swing * 5;
  }
  var bob = S.phase === 'walk' ? Math.sin(t / 130) * 2.2 : Math.sin(t / 420) * 0.9;
  var s = Math.min(1.7, Math.max(0.95, H / 165));
  var hgt = 52 * s;

  ctx.save();
  ctx.translate(x + lean, gy + bob);

  // тень
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 2, 17 * s, 4.2 * s, 0, 0, 6.2832); ctx.fill();

  // ноги
  ctx.strokeStyle = '#7a5c2c'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  var stride = S.phase === 'walk' ? Math.sin(t / 130) * 7 * s : 4 * s;
  ctx.beginPath(); ctx.moveTo(-1, -hgt * 0.42); ctx.lineTo(-stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1, -hgt * 0.42); ctx.lineTo(stride, 0); ctx.stroke();

  // корпус — угловатый силуэт
  ctx.fillStyle = '#c9954a';
  ctx.beginPath();
  ctx.moveTo(-9 * s, -hgt * 0.40);
  ctx.lineTo(-7 * s, -hgt * 0.80);
  ctx.lineTo(7 * s, -hgt * 0.80);
  ctx.lineTo(9 * s, -hgt * 0.40);
  ctx.closePath(); ctx.fill();

  // голова
  ctx.beginPath(); ctx.arc(1 * s, -hgt * 0.92, 6.4 * s, 0, 6.2832); ctx.fill();

  // клинок
  ctx.strokeStyle = '#e8eaf2'; ctx.lineWidth = 3.2 * s;
  var a = -0.45 - swing * 1.25;
  ctx.beginPath();
  ctx.moveTo(7 * s, -hgt * 0.62);
  ctx.lineTo(7 * s + Math.cos(a) * 26 * s, -hgt * 0.62 + Math.sin(a) * 26 * s);
  ctx.stroke();

  // щит, пока блок поднят
  if (t < S.guardUntil) {
    var gleft = (S.guardUntil - t) / dur(guardWindow());
    ctx.strokeStyle = 'rgba(63,220,196,' + (0.35 + 0.55 * gleft) + ')';
    ctx.lineWidth = 3.4 * s;
    ctx.beginPath();
    ctx.arc(0, -hgt * 0.60, 24 * s, -1.15, 1.15);
    ctx.stroke();
  }
  ctx.restore();
}

// Меч: (hx, hy) — гарда, ang — направление клинка, len/w — длина и
// ширина клинка. glow — цвет свечения клинка (блок / заряд крита) или null.
function drawSword(hx, hy, ang, len, w, s, glow, bladeColor) {
  var dx = Math.cos(ang), dy = Math.sin(ang);
  var px = -dy, py = dx;                 // перпендикуляр
  var tipX = hx + dx * len, tipY = hy + dy * len;
  ctx.save();
  // рукоять и навершие
  var grip = len * 0.26;
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = w * 0.9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * grip, hy - dy * grip); ctx.stroke();
  ctx.fillStyle = '#2a2015';
  ctx.beginPath(); ctx.arc(hx - dx * grip, hy - dy * grip, w * 0.6, 0, 6.2832); ctx.fill();
  // клинок
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12 * s; }
  ctx.fillStyle = bladeColor || (glow ? '#f2f6ff' : '#dfe3ee');
  ctx.beginPath();
  ctx.moveTo(hx + px * w * 0.5, hy + py * w * 0.5);
  ctx.lineTo(tipX - dx * w + px * w * 0.5, tipY - dy * w + py * w * 0.5);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - dx * w - px * w * 0.5, tipY - dy * w - py * w * 0.5);
  ctx.lineTo(hx - px * w * 0.5, hy - py * w * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // крестовина
  var gw = w * 2.6;
  ctx.strokeStyle = '#2a2015'; ctx.lineWidth = w * 0.8; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(hx + px * gw, hy + py * gw); ctx.lineTo(hx - px * gw, hy - py * gw); ctx.stroke();
  ctx.restore();
}

// Сфера посоха в локальных координатах моба: x = ORB_DX·s,
// y = ORB_DY_H·hgt + ORB_DY_S·s (центр сферы).
var ORB_DX = -10, ORB_DY_H = -1.08, ORB_DY_S = -7.2;    // сфера ×2 к исходной
var RANGED_WINDUP = 700;   // сколько мс дальнобойщик поднимает посох перед выстрелом
var RANGED_LIFT_DX = -2, RANGED_LIFT_DY = 10;   // насколько смещается поднятый посох (в s)
function mobBaseScale(m) { return Math.min(1.6, Math.max(0.88, H / 178)) * m.size; }
function mobScreen(m, i) {
  return {
    x: m.vx != null ? m.vx : mobX(i),
    y: m.vy != null ? m.vy : mobY(i),
    k: m.vs != null ? m.vs : mobScale(i)
  };
}
// Центр сферы ПОДНЯТОГО посоха на экране — выстрел дальнобойщика
// вылетает из верхней точки замаха.
function orbPoint(m, i) {
  var p = mobScreen(m, i), s = mobBaseScale(m), hgt = 40 * s;
  var bob = Math.sin(performance.now() / 300 + m.wob) * 1.8;
  return {
    x: p.x + p.k * (ORB_DX + RANGED_LIFT_DX) * s,
    y: p.y + p.k * (bob + ORB_DY_H * hgt + (ORB_DY_S - RANGED_LIFT_DY) * s)
  };
}
// Середина тела моба на экране — сюда прилетает отбитый выстрел.
function bodyPoint(m, i) {
  var p = mobScreen(m, i), s = mobBaseScale(m), hgt = 40 * s;
  return { x: p.x, y: p.y - p.k * hgt * 0.5 };
}
