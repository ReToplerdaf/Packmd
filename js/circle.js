// Версия «кружок» (index.html?circle): у переднего моба по области экрана
// мельтешит зелёный кружок с остановками, в случайный момент краснеет —
// пока он красный, по нему надо ударить пальцем. Попал — моб умирает, не
// успел — урон герою. Тычок мимо или по зелёному — откат (циферблат).
// Долгое удержание на кружке — двигать саму область.
"use strict";

/* ── Состояние ───────────────────────────────────────────────────── */

var CIRCLE_R = 24;             // радиус кружка на экране
var CIRCLE_HIT_R = 40;         // радиус, в котором касание засчитывается
var CIRCLE_HOLD_MS = 450;      // столько держать палец на кружке, чтобы двигать область
var CIRCLE_STOP = [200, 700];  // остановки между перебежками (игровые мс)
var CIRCLE_AREA_KEY = 'arena.circle.area';
// Область — доли ширины и высоты канваса. По умолчанию — пол перед мобом.
var CIRCLE_AREA_DEFAULT = { x: 0.08, y: 0.52, w: 0.84, h: 0.2 };

var CIRCLE = {
  mob: null,                   // передний моб, которому принадлежит кружок
  x: 0, y: 0, tx: 0, ty: 0,    // где кружок и куда бежит
  stopUntil: 0, last: 0,
  redAt: 0, redUntil: 0, red: null,   // red — текущая «угроза» (объект на каждое покраснение)
  coolStart: 0, coolUntil: 0,
  area: CIRCLE_AREA_DEFAULT, hold: null
};
try {
  var savedArea = JSON.parse(localStorage.getItem(CIRCLE_AREA_KEY) || 'null');
  if (savedArea && savedArea.w > 0 && savedArea.h > 0) CIRCLE.area = savedArea;
} catch (e) {}

function circleRect() {
  var a = CIRCLE.area;
  return { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H };
}
function circleRandomPoint() {
  var r = circleRect(), m = CIRCLE_R;
  return { x: rr(r.x + m, r.x + Math.max(m, r.w - m)), y: rr(r.y + m, r.y + Math.max(m, r.h - m)) };
}
function circleGreenMs() { return rr(TUNE.circleGreen * 0.4, TUNE.circleGreen); }

// Все мобы стаи в этой версии — кружок.
function circlePack() {
  for (var i = 0; i < S.pack.length; i++) { S.pack[i].type = 'circle'; S.pack[i].shield = false; }
  CIRCLE.mob = null;
}

function circleReset(mob, now) {
  var p = circleRandomPoint(), q = circleRandomPoint();
  CIRCLE.mob = mob;
  CIRCLE.x = p.x; CIRCLE.y = p.y; CIRCLE.tx = q.x; CIRCLE.ty = q.y;
  CIRCLE.stopUntil = 0; CIRCLE.last = now;
  CIRCLE.red = null; CIRCLE.redAt = now + dur(circleGreenMs());
}

function circleShift(d) {
  CIRCLE.stopUntil += d; CIRCLE.last += d; CIRCLE.redAt += d; CIRCLE.redUntil += d;
  CIRCLE.coolStart += d; CIRCLE.coolUntil += d;
}

/* ── Ход кружка (каждый кадр боя) ────────────────────────────────── */

function circleTick(mob, now) {
  if (CIRCLE.mob !== mob) circleReset(mob, now);
  var dt = Math.max(0, Math.min(100, now - CIRCLE.last));
  CIRCLE.last = now;

  // перебежки с остановками
  if (now >= CIRCLE.stopUntil) {
    var dx = CIRCLE.tx - CIRCLE.x, dy = CIRCLE.ty - CIRCLE.y, dist = Math.hypot(dx, dy);
    var step = TUNE.circleSpeed / 1000 * dt * (TUNE.speed || 1);
    if (dist <= step) {
      CIRCLE.x = CIRCLE.tx; CIRCLE.y = CIRCLE.ty;
      CIRCLE.stopUntil = now + dur(rr(CIRCLE_STOP[0], CIRCLE_STOP[1]));
      var q = circleRandomPoint(); CIRCLE.tx = q.x; CIRCLE.ty = q.y;
    } else {
      CIRCLE.x += dx / dist * step; CIRCLE.y += dy / dist * step;
    }
  }

  // покраснел
  if (!CIRCLE.red && now >= CIRCLE.redAt) {
    CIRCLE.red = { start: now };
    CIRCLE.redUntil = now + dur(TUNE.circleRed);
    sfx('telegraph');
    if (autoBlocks()) { circleKill(now, false); return; }   // авто: с шансом бьёт сам
  }
  // не успели — моб бьёт
  if (CIRCLE.red && now > CIRCLE.redUntil) {
    CIRCLE.red = null;
    CIRCLE.redAt = now + dur(circleGreenMs());
    comboBreak(true);
    S.tm.taken++;
    var dmg = damage(mobAtk(mob), S.stats.def, CRIT_MULT);
    S.hp -= dmg;
    S.shake = 1; S.flash = 0.75; S.flashColor = '#ff4d34';
    sfx('crit');
    floatText('−' + dmg, '#ff7a63', -1, 0, true);
    if (S.hp <= 0) { S.hp = 0; heroDies(now); }
  }
}

function circleKill(now, manual) {
  var mob = CIRCLE.mob;
  if (manual) {
    var mid = CIRCLE.red.start + (CIRCLE.redUntil - CIRCLE.red.start) / 2;
    var perfect = comboOn() && Math.abs(now - mid) <= (CIRCLE.redUntil - CIRCLE.red.start) / 2 * TUNE.perfect;
    if (comboOn()) { COMBO.pack.threats++; COMBO.sess.threats++; COMBO.pack.blocked++; COMBO.sess.blocked++; if (perfect) { COMBO.pack.perfect++; COMBO.sess.perfect++; } }
    comboHit('circle', perfect);
    if (!perfect) floatText('ПОПАЛ', '#3fdcc4', 0, 0, true);
  } else {
    floatText('АВТО', '#3fdcc4', 0, 0, false);
  }
  S.tm.blocked++;
  S.flash = 0.6; S.flashColor = '#3fdcc4';
  sfx('block');
  CIRCLE.red = null; CIRCLE.mob = null;
  mob.hp = 0; mob.hurt = performance.now();
  killMob(mob);
}

/* ── Касания ─────────────────────────────────────────────────────── */

function circleTap(x, y) {
  if (S.paused || S.phase !== 'fight' || !CIRCLE.mob) return;
  autoTouch();
  var now = performance.now();
  if (now < CIRCLE.coolUntil) return;                    // откат: касания не считаются
  var near = Math.hypot(x - CIRCLE.x, y - CIRCLE.y) <= CIRCLE_HIT_R;
  if (CIRCLE.red && near) { circleKill(now, true); return; }
  // мимо или по зелёному — откат
  CIRCLE.coolStart = now; CIRCLE.coolUntil = now + dur(TUNE.circleCool);
  floatText(near ? 'РАНО' : 'МИМО', '#8a90a6', 0, 0, false);
}

function canvasXY(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

if (CIRCLE_MODE) {
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', function (e) {
    var p = canvasXY(e);
    var onCircle = !!CIRCLE.mob && Math.hypot(p.x - CIRCLE.x, p.y - CIRCLE.y) <= CIRCLE_HIT_R;
    CIRCLE.hold = { id: e.pointerId, x0: p.x, y0: p.y, t0: performance.now(), on: onCircle, drag: false, a0: { x: CIRCLE.area.x, y: CIRCLE.area.y } };
    circleTap(p.x, p.y);
  });
  cv.addEventListener('pointermove', function (e) {
    var h = CIRCLE.hold;
    if (!h || h.id !== e.pointerId || !h.on) return;
    if (!h.drag && performance.now() - h.t0 < CIRCLE_HOLD_MS) return;
    if (!h.drag) { h.drag = true; CIRCLE.coolUntil = 0; }  // это было удержание, а не тычок — откат снимаем
    var p = canvasXY(e), a = CIRCLE.area;
    var nx = Math.max(0, Math.min(1 - a.w, h.a0.x + (p.x - h.x0) / W));
    var ny = Math.max(0, Math.min(1 - a.h, h.a0.y + (p.y - h.y0) / H));
    var ddx = (nx - a.x) * W, ddy = (ny - a.y) * H;
    a.x = nx; a.y = ny;
    CIRCLE.x += ddx; CIRCLE.y += ddy; CIRCLE.tx += ddx; CIRCLE.ty += ddy;   // кружок едет вместе с областью
  });
  var holdEnd = function (e) {
    var h = CIRCLE.hold;
    if (!h || h.id !== e.pointerId) return;
    CIRCLE.hold = null;
    if (h.drag) { try { localStorage.setItem(CIRCLE_AREA_KEY, JSON.stringify(CIRCLE.area)); } catch (err) {} }
  };
  cv.addEventListener('pointerup', holdEnd);
  cv.addEventListener('pointercancel', holdEnd);
}

/* ── Отрисовка ───────────────────────────────────────────────────── */

function drawCircle(t) {
  if (S.phase !== 'fight' && S.phase !== 'dead') return;
  var r = circleRect(), h = CIRCLE.hold;
  var holding = h && h.on && (h.drag || t - h.t0 >= CIRCLE_HOLD_MS);
  ctx.save();
  // область
  ctx.strokeStyle = holding ? 'rgba(255,210,122,.9)' : 'rgba(255,255,255,.22)';
  ctx.lineWidth = holding ? 2 : 1.2;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);
  if (!CIRCLE.mob) { ctx.restore(); return; }

  var x = CIRCLE.x, y = CIRCLE.y;
  if (CIRCLE.red) {
    var left = Math.max(0, (CIRCLE.redUntil - t) / Math.max(1, CIRCLE.redUntil - CIRCLE.red.start));
    var pulse = 1 + 0.08 * Math.sin(t / 45);
    ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(x, y, CIRCLE_R * pulse, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, CIRCLE_R + 7, -Math.PI / 2, -Math.PI / 2 + 6.2832 * left); ctx.stroke();
  } else {
    ctx.shadowColor = '#4cd964'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#4cd964';
    ctx.beginPath(); ctx.arc(x, y, CIRCLE_R, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // откат — циферблат поверх кружка: тёмный сектор убывает по часовой
  if (t < CIRCLE.coolUntil) {
    var k = (CIRCLE.coolUntil - t) / Math.max(1, CIRCLE.coolUntil - CIRCLE.coolStart);
    var R = CIRCLE_R + 2;
    ctx.fillStyle = 'rgba(20,22,30,.72)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + 6.2832 * k); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * 6.2832;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 0.78, y + Math.sin(a) * R * 0.78); ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); ctx.stroke();
    }
    var ha = -Math.PI / 2 + 6.2832 * k;                   // стрелка
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ha) * R * 0.85, y + Math.sin(ha) * R * 0.85); ctx.stroke();
  }
  ctx.restore();
}
