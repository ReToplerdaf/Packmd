// Версия «кружок» (index.html?circle): у переднего моба в одной из двух
// областей — дугах по краю кнопок блока и удара, от края экрана до рюкзака — мельтешит
// зелёный кружок с остановками, в случайный момент краснеет —
// пока он красный, по нему надо ударить пальцем. Попал — моб умирает, не
// успел — урон герою. Тычок мимо или по зелёному — откат (циферблат).
// Долгое удержание на кружке — двигать ту область, где он сейчас.
"use strict";

/* ── Состояние ───────────────────────────────────────────────────── */

var CIRCLE_R = 24;             // радиус кружка на экране
var CIRCLE_HIT_R = 40;         // радиус, в котором касание засчитывается
var CIRCLE_HOLD_MS = 450;      // столько держать палец на кружке, чтобы двигать область
var CIRCLE_STOP = [100, 1100]; // остановки между перебежками (игровые мс), каждая — своя
var CIRCLE_PACE = [0.5, 1.8];  // скорость каждой перебежки — circleSpeed × случайное из этих
var CIRCLE_AREA_KEY = 'arena.circle.arcs';
// Две области — дуги вдоль скруглённого края кнопок «Защита» (0) и «Атака» (1):
// от края экрана до рюкзака, у края экрана толще, к рюкзаку сужаются.
// Положение кружка в дуге — u (0 у края экрана … 1 у рюкзака) и v (0 у кнопки … 1 снаружи).
// Сдвиг области удержанием — x, y в долях ширины и высоты экрана.
// Каждый новый кружок (новый моб или после пропущенного красного) — в случайной из них.
var CIRCLE_ARC_GAP = 2;        // зазор между кнопкой и дугой, px
var CIRCLE_ARC_THICK = [0.62, 0.3];  // толщина дуги у края экрана и у рюкзака — доли радиуса кнопки
var CIRCLE_HOP = 0.35;         // шанс, что следующая перебежка — прыжок в другую дугу (через рюкзак)
var CIRCLE_HOP_LIFT = 70;      // высота прыжка, px

var CIRCLE = {
  mob: null,                   // передний моб, которому принадлежит кружок
  x: 0, y: 0,                  // где кружок на экране
  hop: null,                   // прыжок в другую дугу: { fx, fy, p } — откуда и доля пути
  stopUntil: 0, last: 0,
  redAt: 0, redUntil: 0, red: null,   // red — текущая «угроза» (объект на каждое покраснение)
  coolStart: 0, coolUntil: 0, pace: 1,
  u: 0, v: 0, tu: 0, tv: 0,
  areas: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
  ai: 0, area: null, hold: null
};
if (CIRCLE_MODE) try {
  var savedAreas = JSON.parse(localStorage.getItem(CIRCLE_AREA_KEY) || 'null');
  if (savedAreas && savedAreas.length === 2 && savedAreas.every(function (a) { return a && isFinite(a.x) && isFinite(a.y); })) CIRCLE.areas = savedAreas;
} catch (e) {}
CIRCLE.area = CIRCLE.areas[0];

// Геометрия дуги ai по текущему положению кнопок на экране.
function circleArc(ai) {
  var cr = cv.getBoundingClientRect();
  var b = document.getElementById(ai ? 'btn-strike' : 'btn-guard').getBoundingClientRect();
  var bag = document.getElementById('btn-bag').getBoundingClientRect();
  var s = ai ? -1 : 1;                                   // 1 — дуга слева, −1 — справа (зеркально)
  var cx = (ai ? b.right : b.left) - cr.left, cy = b.bottom - cr.top, R = b.width || 1;
  // конец дуги — над плечом рюкзака
  var ex = (ai ? bag.right - bag.width * 0.25 : bag.left + bag.width * 0.25) - cr.left, ey = bag.top - cr.top;
  var a1 = Math.atan2(cy - ey, s * (ex - cx));
  var off = CIRCLE.areas[ai] || { x: 0, y: 0 };
  return { cx: cx + off.x * W, cy: cy + off.y * H, R: R, s: s, a0: Math.PI / 2, a1: Math.max(0.1, Math.min(1.4, a1)) };
}
// Точка дуги: u — вдоль (0 у края экрана, 1 у рюкзака), v — поперёк (0 у кнопки, 1 снаружи).
function circleArcPoint(g, u, v) {
  var a = g.a0 + (g.a1 - g.a0) * u;
  var thick = g.R * (CIRCLE_ARC_THICK[0] + (CIRCLE_ARC_THICK[1] - CIRCLE_ARC_THICK[0]) * u);
  var r = g.R + CIRCLE_ARC_GAP + thick * v;
  return { x: g.cx + g.s * Math.cos(a) * r, y: g.cy - Math.sin(a) * r, thick: thick };
}
// Где может стоять центр кружка: так, чтобы он целиком был в дуге и на экране.
function circleUV(g, u, v) {
  var thick = g.R * (CIRCLE_ARC_THICK[0] + (CIRCLE_ARC_THICK[1] - CIRCLE_ARC_THICK[0]) * u);
  var m = Math.min(0.5, CIRCLE_R / Math.max(1, thick));
  var p = circleArcPoint(g, u, m + (1 - 2 * m) * v);
  p.x = Math.max(CIRCLE_R, Math.min(W - CIRCLE_R, p.x));
  return p;
}
function circlePlace() {
  var p = circleUV(circleArc(CIRCLE.ai), CIRCLE.u, CIRCLE.v);
  CIRCLE.x = p.x; CIRCLE.y = p.y;
}
function circleGreenMs() { return rr(TUNE.circleGreen * 0.4, TUNE.circleGreen); }

// Все мобы стаи в этой версии — кружок.
function circlePack() {
  for (var i = 0; i < S.pack.length; i++) { S.pack[i].type = 'circle'; S.pack[i].shield = false; }
  CIRCLE.mob = null;
}

// Новый кружок — в случайной из двух областей.
function circlePickArea() {
  CIRCLE.ai = rnd() < 0.5 ? 0 : 1;   // area — сдвиг этой дуги
  CIRCLE.area = CIRCLE.areas[CIRCLE.ai];
}
function circleReset(mob, now) {
  circlePickArea();
  CIRCLE.mob = mob; CIRCLE.pace = rr(CIRCLE_PACE[0], CIRCLE_PACE[1]);
  CIRCLE.u = rnd(); CIRCLE.v = rnd(); CIRCLE.tu = rnd(); CIRCLE.tv = rnd();
  CIRCLE.hop = null;
  circlePlace();
  CIRCLE.stopUntil = 0; CIRCLE.last = now;
  CIRCLE.red = null; CIRCLE.redAt = now + dur(circleGreenMs());
}

function circleShift(d) {
  CIRCLE.stopUntil += d; CIRCLE.last += d; CIRCLE.redAt += d; CIRCLE.redUntil += d;
  CIRCLE.coolStart += d; CIRCLE.coolUntil += d;
  if (RAID.at) RAID.at += d;
}

/* ── Налёт летучих мышей (основная игра) ─────────────────────────── */

// Посреди боя время от времени (TUNE.batEvery, ±30%) прилетает летучая мышь —
// тот же «кружок»: бегает по дугам у кнопок, перепрыгивает между ними, краснеет.
// Пока она в дуге у кнопки, эта кнопка не работает (и авто-блок/авто-раскол
// по ней тоже). Урона мышь не наносит. Касание по красной — мышь убита,
// кнопка свободна; не успел — просто следующий круг. Одна мышь за раз.
var RAID = { at: 0 };          // когда прилетит следующая (0 — ещё не назначено)
function raidOn() { return !CIRCLE_MODE && TUNE.bats && !S.tut; }
function raidNext(now) { RAID.at = now + dur(TUNE.batEvery * rr(0.7, 1.3)); }
function raidClear() { CIRCLE.mob = null; CIRCLE.red = null; CIRCLE.hop = null; RAID.at = 0; }
// Кнопку 'guard' или 'strike' держит мышь?
function batBlocks(which) {
  return !CIRCLE_MODE && !!CIRCLE.mob && !CIRCLE.hop && CIRCLE.ai === (which === 'strike' ? 1 : 0);
}
// Каждый кадр боя.
function raidTick(now) {
  if (!raidOn()) { if (CIRCLE.mob) raidClear(); return; }
  if (!CIRCLE.mob) {
    if (!RAID.at) { raidNext(now); return; }
    if (now < RAID.at) return;
    // прилетает сверху в случайную дугу
    circleReset({ bat: true }, now);
    var target = CIRCLE.ai;
    CIRCLE.ai = 1 - target; CIRCLE.area = CIRCLE.areas[CIRCLE.ai];
    CIRCLE.hop = { fx: W * rr(0.3, 0.7), fy: -40, p: 0.001 };
    CIRCLE.x = CIRCLE.hop.fx; CIRCLE.y = CIRCLE.hop.fy;
    sfx('shield');
  }
  circleTick(CIRCLE.mob, now);
}

/* ── Ход кружка (каждый кадр боя) ────────────────────────────────── */

function circleTick(mob, now) {
  if (CIRCLE.mob !== mob) circleReset(mob, now);
  var dt = Math.max(0, Math.min(100, now - CIRCLE.last));
  CIRCLE.last = now;

  // перебежки с остановками; красный стоит на месте, пока не кончится его время
  if (now >= CIRCLE.stopUntil && !CIRCLE.red) {
    // бежит вдоль дуги: шаг в пикселях переводится в долю пути от точки до цели
    // прыжок — по прямой с подъёмом над рюкзаком в цель (tu, tv) другой дуги
    var hop = CIRCLE.hop;
    var g = circleArc(hop ? 1 - CIRCLE.ai : CIRCLE.ai), to = circleUV(g, CIRCLE.tu, CIRCLE.tv);
    var step = TUNE.circleSpeed * CIRCLE.pace / 1000 * dt * (TUNE.speed || 1);
    if (hop) {
      var len = Math.max(1, Math.hypot(to.x - hop.fx, to.y - hop.fy));
      hop.p = Math.min(1, hop.p + step / len);
      if (hop.p >= 1) { CIRCLE.hop = null; CIRCLE.ai = 1 - CIRCLE.ai; CIRCLE.area = CIRCLE.areas[CIRCLE.ai]; CIRCLE.x = to.x; CIRCLE.y = to.y; }
      else {
        CIRCLE.x = hop.fx + (to.x - hop.fx) * hop.p;
        CIRCLE.y = hop.fy + (to.y - hop.fy) * hop.p - Math.sin(Math.PI * hop.p) * CIRCLE_HOP_LIFT;
        return circleTickRed(mob, now);
      }
    }
    var dist = Math.hypot(to.x - CIRCLE.x, to.y - CIRCLE.y);
    if (dist <= step || hop) {
      CIRCLE.u = CIRCLE.tu; CIRCLE.v = CIRCLE.tv;
      CIRCLE.stopUntil = now + dur(rr(CIRCLE_STOP[0], CIRCLE_STOP[1]));
      CIRCLE.tu = rnd(); CIRCLE.tv = rnd();
      CIRCLE.pace = rr(CIRCLE_PACE[0], CIRCLE_PACE[1]);
      if (rnd() < CIRCLE_HOP) CIRCLE.hop = { fx: 0, fy: 0, p: 0 };   // следующая перебежка — прыжок
    } else {
      var k = step / dist;
      CIRCLE.u += (CIRCLE.tu - CIRCLE.u) * k; CIRCLE.v += (CIRCLE.tv - CIRCLE.v) * k;
    }
  }
  if (CIRCLE.hop && CIRCLE.hop.p === 0) { CIRCLE.hop.fx = CIRCLE.x; CIRCLE.hop.fy = CIRCLE.y; }
  if (!CIRCLE.hop) circlePlace();
  circleTickRed(mob, now);
}

// Покраснение и пропущенный красный.
function circleTickRed(mob, now) {
  // покраснел — только на остановке (не в перебежке и не в прыжке)
  if (!CIRCLE.red && now >= CIRCLE.redAt && !CIRCLE.hop && now < CIRCLE.stopUntil) {
    CIRCLE.red = { start: now };
    CIRCLE.redUntil = now + dur(TUNE.circleRed);
    CIRCLE.stopUntil = Math.max(CIRCLE.stopUntil, CIRCLE.redUntil);   // стоит, пока красный
    sfx('telegraph');
    if (autoBlocks()) { circleKill(now, false); return; }   // авто: с шансом бьёт сам
  }
  // не успели: мышь налёта урона не наносит — просто следующий круг
  if (CIRCLE.red && now > CIRCLE.redUntil && !CIRCLE_MODE) {
    CIRCLE.red = null; CIRCLE.redAt = now + dur(circleGreenMs());
    return;
  }
  // не успели — моб бьёт
  if (CIRCLE.red && now > CIRCLE.redUntil) {
    circleReset(mob, now);                               // следующий кружок — снова в случайной области
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
  if (!CIRCLE_MODE) { CIRCLE.hop = null; raidNext(now); return; }   // мышь налёта: кнопка свободна
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

// Основная игра: касание по мыши важнее кнопки под ней. Ловим раньше всех
// (фаза перехвата на window), остальные касания идут как обычно.
if (!CIRCLE_MODE) {
  window.addEventListener('pointerdown', function (e) {
    if (!CIRCLE.mob || S.paused || S.phase !== 'fight') return;
    var p = canvasXY(e);
    if (Math.hypot(p.x - CIRCLE.x, p.y - CIRCLE.y) > CIRCLE_HIT_R) return;
    e.preventDefault(); e.stopPropagation();
    circleTap(p.x, p.y);
  }, true);
}

if (CIRCLE_MODE) {
  cv.style.touchAction = 'none';
  // кнопки в этой версии не нужны, касания у их края должны доходить до канваса
  document.getElementById('btn-guard').style.pointerEvents = 'none';
  document.getElementById('btn-strike').style.pointerEvents = 'none';
  cv.addEventListener('pointerdown', function (e) {
    var p = canvasXY(e);
    var onCircle = !!CIRCLE.mob && Math.hypot(p.x - CIRCLE.x, p.y - CIRCLE.y) <= CIRCLE_HIT_R;
    CIRCLE.hold = { id: e.pointerId, x0: p.x, y0: p.y, t0: performance.now(), on: onCircle, drag: false, a0: { x: CIRCLE.area.x, y: CIRCLE.area.y }, ai: CIRCLE.ai };
    circleTap(p.x, p.y);
  });
  cv.addEventListener('pointermove', function (e) {
    var h = CIRCLE.hold;
    if (!h || h.id !== e.pointerId || !h.on) return;
    if (!h.drag && performance.now() - h.t0 < CIRCLE_HOLD_MS) return;
    if (!h.drag) { h.drag = true; CIRCLE.coolUntil = 0; }  // это было удержание, а не тычок — откат снимаем
    var p = canvasXY(e), a = CIRCLE.areas[h.ai];
    a.x = Math.max(-0.5, Math.min(0.5, h.a0.x + (p.x - h.x0) / W));
    a.y = Math.max(-0.8, Math.min(0.1, h.a0.y + (p.y - h.y0) / H));
    if (CIRCLE.ai === h.ai && !CIRCLE.hop) circlePlace();               // кружок едет вместе с областью
  });
  var holdEnd = function (e) {
    var h = CIRCLE.hold;
    if (!h || h.id !== e.pointerId) return;
    CIRCLE.hold = null;
    if (h.drag) { try { localStorage.setItem(CIRCLE_AREA_KEY, JSON.stringify(CIRCLE.areas)); } catch (err) {} }
  };
  cv.addEventListener('pointerup', holdEnd);
  cv.addEventListener('pointercancel', holdEnd);
}

/* ── Отрисовка ───────────────────────────────────────────────────── */

// Летучая мышь — вместо кружка: тело и крылья цвета кружка (зелёный / красный).
// В полёте машет крыльями часто, на остановке — медленно, крылья полусложены.
var BAT_SPAN = 34;             // полуразмах крыльев, px
function drawBat(x, y, t, color, glow, scale) {
  var flying = !!CIRCLE.hop || performance.now() >= CIRCLE.stopUntil;
  var flap = Math.sin(t / (flying ? 38 : 160));            // −1 … 1
  var lift = flap * (flying ? 0.55 : 0.18);               // взмах: концы крыльев вверх/вниз
  var span = BAT_SPAN * scale * (flying ? 1 : 0.82);
  ctx.save();
  ctx.translate(x, y + (flying ? -flap * 2 : 0));
  ctx.shadowColor = color; ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  for (var side = -1; side <= 1; side += 2) {
    var tipX = side * span, tipY = -span * (0.35 + lift);
    ctx.beginPath();
    ctx.moveTo(side * 6, -6);
    ctx.quadraticCurveTo(side * span * 0.5, -span * (0.55 + lift * 0.8), tipX, tipY);   // верхний край
    // нижний край — фестонами («пальцы» крыла)
    var px = [0.78, 0.52, 0.27], py = [0.15, 0.22, 0.18];
    var prevX = tipX, prevY = tipY;
    for (var i = 0; i < 3; i++) {
      var nx = side * span * px[i], ny = span * py[i] - span * lift * px[i] * 0.6;
      ctx.quadraticCurveTo((prevX + nx) / 2, (prevY + ny) / 2 - span * 0.16, nx, ny);
      prevX = nx; prevY = ny;
    }
    ctx.quadraticCurveTo(side * 8, 6, side * 5, 8);
    ctx.closePath(); ctx.fill();
  }
  ctx.shadowBlur = 0;
  // тело, уши
  ctx.beginPath(); ctx.ellipse(0, 1, 9 * scale, 13 * scale, 0, 0, 6.2832); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -8); ctx.lineTo(-5, -20 * scale); ctx.lineTo(-1, -10);
  ctx.moveTo(7, -8); ctx.lineTo(5, -20 * scale); ctx.lineTo(1, -10);
  ctx.fill();
  // тёмная окантовка, глаза
  ctx.strokeStyle = 'rgba(10,12,18,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, 1, 9 * scale, 13 * scale, 0, 0, 6.2832); ctx.stroke();
  ctx.fillStyle = '#14161e';
  ctx.beginPath(); ctx.arc(-3.5, -3, 2.2, 0, 6.2832); ctx.arc(3.5, -3, 2.2, 0, 6.2832); ctx.fill();
  ctx.restore();
}

function drawCircle(t) {
  if (S.phase !== 'fight' && S.phase !== 'dead') return;
  if (!CIRCLE_MODE && !CIRCLE.mob) return;
  var h = CIRCLE.hold;
  var holding = h && h.on && (h.drag || t - h.t0 >= CIRCLE_HOLD_MS);
  ctx.save();
  // рамка дуги видна только пока её двигают удержанием
  for (var ai = 0; ai < CIRCLE.areas.length; ai++) {
    var g = circleArc(ai);
    if (!(holding && ai === h.ai)) continue;
    ctx.strokeStyle = 'rgba(255,210,122,.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    for (var i = 0; i <= 24; i++) { var q = circleArcPoint(g, i / 24, 0); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
    for (var j = 24; j >= 0; j--) { var o = circleArcPoint(g, j / 24, 1); ctx.lineTo(o.x, o.y); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (!CIRCLE.mob) { ctx.restore(); return; }

  var x = CIRCLE.x, y = CIRCLE.y;
  if (CIRCLE.red) {
    var left = Math.max(0, (CIRCLE.redUntil - t) / Math.max(1, CIRCLE.redUntil - CIRCLE.red.start));
    var pulse = 1 + 0.08 * Math.sin(t / 45);
    drawBat(x, y, t, '#ff3b30', 22, pulse);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, CIRCLE_R + 7, -Math.PI / 2, -Math.PI / 2 + 6.2832 * left); ctx.stroke();
  } else {
    drawBat(x, y, t, '#4cd964', 14, 1);
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
