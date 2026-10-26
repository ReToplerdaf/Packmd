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
  chiefRaidShift(d);
}

/* ── Налёт летучих мышей (основная игра) ─────────────────────────── */

// Посреди боя время от времени (TUNE.batEvery, ±30%) прилетает летучая мышь —
// тот же «кружок»: бегает по дугам у кнопок, перепрыгивает между ними, краснеет.
// Пока она в дуге у кнопки, эта кнопка не работает (и авто-блок/авто-раскол
// по ней тоже). Урона мышь не наносит. Касание по красной — мышь убита,
// кнопка свободна; не успел — просто следующий круг. Одна мышь за раз.
var RAID = { at: 0 };          // когда прилетит следующая (0 — ещё не назначено)
function raidOn() { return !CIRCLE_MODE && TUNE.bats && (!S.tut || !!S.tut.bat); }   // в обучении — только своя мышь
function raidNext(now) { RAID.at = now + dur(TUNE.batEvery * rr(0.7, 1.3)); }
function raidClear() { CIRCLE.mob = null; CIRCLE.red = null; CIRCLE.hop = null; RAID.at = 0; chiefRaidClear(); }
// Кнопку 'guard' или 'strike' держит мышь?
function batBlocks(which) {
  var ai = which === 'strike' ? 1 : 0;
  if (CIRCLE_MODE) return false;
  if (CIRCLE.mob && !CIRCLE.hop && CIRCLE.ai === ai) return true;
  for (var i = 0; i < CHIEF_RAID.bats.length; i++) { var b = CHIEF_RAID.bats[i]; if (b.mob && !b.hop && b.ai === ai) return true; }
  return false;
}
// Каждый кадр боя.
function raidTick(now) {
  if (!raidOn()) { if (CIRCLE.mob || chiefRaidActive()) raidClear(); return; }
  chiefRaidTick(now);
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

/* ── Налёт главаря (3-я фаза) ────────────────────────────────────── */

// Главарь в 3-й фазе зовёт налёт: до CHIEF_RAID_BATS мышей сразу (вместе с
// обычной мышью налёта, если она уже здесь). Каждая — такая же мышь, как
// обычная: бегает по дугам у кнопок, глушит кнопку, краснеет, сбивается
// касанием. Их состояние лежит в отдельных объектах; для хода, касания и
// отрисовки мышь на время подставляется в CIRCLE (вместе со своими
// взмахами крыльев), так код одной мыши работает для всех.
var CHIEF_RAID = { bats: [], queue: [], reShieldAt: 0, swapped: false };
var CHIEF_BAT_KEYS = ['mob', 'x', 'y', 'hop', 'stopUntil', 'last', 'redAt', 'redUntil', 'red', 'coolStart', 'coolUntil', 'pace', 'u', 'v', 'tu', 'tv', 'ai', 'area'];
function chiefRaidOn() { return raidOn() && !!TUNE.chiefRaid; }
function chiefRaidActive() { return CHIEF_RAID.bats.length > 0 || CHIEF_RAID.queue.length > 0; }
function chiefRaidClear() { CHIEF_RAID.bats = []; CHIEF_RAID.queue = []; CHIEF_RAID.reShieldAt = 0; }
function chiefRaidShift(d) {
  for (var i = 0; i < CHIEF_RAID.queue.length; i++) CHIEF_RAID.queue[i] += d;
  for (var j = 0; j < CHIEF_RAID.bats.length; j++) {
    var b = CHIEF_RAID.bats[j];
    b.stopUntil += d; b.last += d; b.redAt += d; b.redUntil += d; b.coolStart += d; b.coolUntil += d;
  }
  if (CHIEF_RAID.reShieldAt) CHIEF_RAID.reShieldAt += d;
}
// Новый налёт только добирает мышей до полной: одновременно не больше CHIEF_RAID_BATS.
function chiefRaidStart(at) {
  var n = CHIEF_RAID_BATS - CHIEF_RAID.bats.length - CHIEF_RAID.queue.length - (CIRCLE.mob ? 1 : 0);
  CHIEF_RAID.reShieldAt = 0;
  if (n <= 0) return;
  var t0 = CHIEF_RAID.queue.length ? CHIEF_RAID.queue[CHIEF_RAID.queue.length - 1] + dur(CHIEF_RAID_GAP) : at;
  for (var i = 0; i < n; i++) CHIEF_RAID.queue.push(t0 + dur(CHIEF_RAID_GAP * i));
  floatText('НАЛЁТ', '#ff9130', 0, 0, true);
}
// Подставить мышь b в CIRCLE (и обратно — тем же вызовом).
function chiefBatSwap(b) {
  for (var i = 0; i < CHIEF_BAT_KEYS.length; i++) { var k = CHIEF_BAT_KEYS[i], v = CIRCLE[k]; CIRCLE[k] = b[k]; b[k] = v; }
  var f = BAT_FLAP; BAT_FLAP = b.flap; b.flap = f;
  var tl = BAT_TILT; BAT_TILT = b.tilt; b.tilt = tl;
}
function withChiefBat(b, fn) {
  chiefBatSwap(b); CHIEF_RAID.swapped = true;
  try { return fn(); } finally { CHIEF_RAID.swapped = false; chiefBatSwap(b); }
}
function chiefBatNew(now) {
  var b = { flap: { ph: 0, t: 0, fly: false, flyAt: -1e9, landAt: -1e9, e: 0 }, tilt: { a: 0 }, area: CIRCLE.areas[0] };
  for (var i = 0; i < CHIEF_BAT_KEYS.length; i++) if (!(CHIEF_BAT_KEYS[i] in b)) b[CHIEF_BAT_KEYS[i]] = 0;
  b.mob = null; b.hop = null; b.red = null;
  withChiefBat(b, function () {
    // прилетает сверху в случайную дугу — как обычная мышь налёта
    circleReset({ bat: true, chiefRaid: true }, now);
    var target = CIRCLE.ai;
    CIRCLE.ai = 1 - target; CIRCLE.area = CIRCLE.areas[CIRCLE.ai];
    CIRCLE.hop = { fx: W * rr(0.3, 0.7), fy: -40, p: 0.001 };
    CIRCLE.x = CIRCLE.hop.fx; CIRCLE.y = CIRCLE.hop.fy;
  });
  CHIEF_RAID.bats.push(b);
  sfx('shield');
}
function chiefRaidTick(now) {
  if (!chiefRaidActive()) return;
  while (CHIEF_RAID.queue.length && now >= CHIEF_RAID.queue[0]) { CHIEF_RAID.queue.shift(); chiefBatNew(now); }
  for (var i = 0; i < CHIEF_RAID.bats.length; i++) {
    var b = CHIEF_RAID.bats[i];
    withChiefBat(b, function () { circleTick(CIRCLE.mob, now); });
    if (S.phase !== 'fight') return;
  }
  chiefRaidSweep(now);
}
// Сбитые мыши улетают; налёт отбит — главарь скоро снова в щите.
function chiefRaidSweep(now) {
  var had = CHIEF_RAID.bats.length;
  CHIEF_RAID.bats = CHIEF_RAID.bats.filter(function (b) { return !!b.mob; });
  if (had && !chiefRaidActive()) CHIEF_RAID.reShieldAt = now + dur(CHIEF_RESHIELD);
}
function chiefBatTap(b, x, y) {
  withChiefBat(b, function () { circleTap(x, y); });
  chiefRaidSweep(performance.now());
}
// Клавиша касания (десктоп): сначала по красной мыши, потом по обычной.
function batKeyTap() {
  if (!(CIRCLE.mob && CIRCLE.red)) {
    for (var i = 0; i < CHIEF_RAID.bats.length; i++) {
      var b = CHIEF_RAID.bats[i];
      if (b.mob && b.red) { chiefBatTap(b, b.x, b.y); return; }
    }
    if (!CIRCLE.mob && CHIEF_RAID.bats.length) { var f = CHIEF_RAID.bats[0]; chiefBatTap(f, f.x, f.y); return; }
  }
  circleTap(CIRCLE.x, CIRCLE.y);
}
function drawChiefRaid(t) {
  if (S.phase !== 'fight' && S.phase !== 'dead') return;
  for (var i = 0; i < CHIEF_RAID.bats.length; i++) withChiefBat(CHIEF_RAID.bats[i], function () { drawCircle(t); });
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
  // покраснел — только на остановке (не в перебежке и не в прыжке);
  // мышь налёта не краснеет, пока идёт откат после тычка (она зелёная)
  if (!CIRCLE.red && now >= CIRCLE.redAt && !CIRCLE.hop && now < CIRCLE.stopUntil &&
      (CIRCLE_MODE || now >= CIRCLE.coolUntil)) {
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
  if (!CIRCLE_MODE) { CIRCLE.hop = null; if (!CHIEF_RAID.swapped) raidNext(now); return; }   // мышь налёта: кнопка свободна
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
    if ((!CIRCLE.mob && !CHIEF_RAID.bats.length) || S.paused || S.phase !== 'fight') return;
    var p = canvasXY(e), best = null, bd = CIRCLE_HIT_R;
    if (CIRCLE.mob && Math.hypot(p.x - CIRCLE.x, p.y - CIRCLE.y) <= bd) { best = 'main'; bd = Math.hypot(p.x - CIRCLE.x, p.y - CIRCLE.y); }
    for (var i = 0; i < CHIEF_RAID.bats.length; i++) {
      var b = CHIEF_RAID.bats[i], d = Math.hypot(p.x - b.x, p.y - b.y);
      if (b.mob && d <= bd) { best = b; bd = d; }
    }
    if (!best) return;
    e.preventDefault(); e.stopPropagation();
    if (best === 'main') circleTap(p.x, p.y);
    else chiefBatTap(best, p.x, p.y);
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

// Мышь-картинка: тело и левое крыло (правое — то же, зеркально). Крыло
// машет поворотом вокруг плеча, тело рисуется поверх и прячет шов.
// Цвет (зелёный / красный) и свечение запекаются один раз в отдельные
// холсты на каждый цвет. Пока картинки не загрузились — рисуется старая
// мышь из фигур (drawBatShape).
var BAT_PNG = {
  body: 'data:image/webp;base64,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',
  wing: 'data:image/webp;base64,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'
};
var BAT_PX = 1 / 3;            // картинки нарисованы втрое крупнее, чем на экране
// Положение частей в пикселях картинки от центра мыши: левый верхний угол
// тела и крыла, плечо — точка, вокруг которой поворачивается крыло.
var BAT_BODY_AT = [-43.5, -61.4], BAT_WING_AT = [-120, -34.4], BAT_SHOULDER = [-21.3, 14.8];
var BAT_IMG = { body: null, wing: null, ready: 0, tints: {} };
// Наклон в сторону полёта: начинается уже на первых взмахах перед вылетом,
// держится в перелёте, после посадки мышь плавно выпрямляется.
var BAT_TILT_MAX = 0.2;        // рад
var BAT_TILT = { a: 0 };
// Взмахи: частые на взлёте и посадке (по 2 взмаха ещё стоя — перед вылетом и
// после приземления, так видно, что мышь сейчас улетит / только что села),
// реже в перелёте, медленные, когда сидит. Фаза копится, чтобы смена
// частоты шла без рывков. Числа — мс на радиан фазы (взмах = 2π).
var BAT_FLAP_FAST = 34, BAT_FLAP_CRUISE = 68, BAT_FLAP_SIT = 190;
var BAT_FLAP = { ph: 0, t: 0, fly: false, flyAt: -1e9, landAt: -1e9, e: 0 };
// Куда мышь летит (или полетит со следующей остановки).
function batTarget() {
  var ai = CIRCLE.hop ? 1 - CIRCLE.ai : CIRCLE.ai;
  return circleUV(circleArc(ai), CIRCLE.tu, CIRCLE.tv);
}
// Сколько мс мыши осталось до точки, где она сядет.
function batArriveMs(to) {
  var v = TUNE.circleSpeed * CIRCLE.pace / 1000 * (TUNE.speed || 1);
  return Math.hypot(to.x - CIRCLE.x, to.y - CIRCLE.y) / Math.max(0.01, v);
}
(function () {
  if (typeof Image === 'undefined') return;
  ['body', 'wing'].forEach(function (k) {
    var im = new Image();
    im.onload = function () { BAT_IMG[k] = im; BAT_IMG.ready++; };
    im.src = BAT_PNG[k];
  });
})();
// Перекраска: серое тело становится цвета мыши (светлое — светлее, тёмное —
// темнее), белая обводка остаётся белой, жёлтые глаза не трогаем.
function batTint(im, color, glow) {
  var w = im.width, h = im.height, pad = Math.ceil(glow / BAT_PX * 1.5);
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  if (!color) return { c: c, pad: 0 };                    // серая — как нарисована
  var d = g.getImageData(0, 0, w, h), a = d.data;
  var tr = parseInt(color.slice(1, 3), 16) / 255, tgc = parseInt(color.slice(3, 5), 16) / 255, tb = parseInt(color.slice(5, 7), 16) / 255;
  var ov = function (base, l) { return l < 0.5 ? base * 2 * l : base + (1 - base) * (2 * l - 1); };
  for (var i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue;
    var r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255;
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx > 0.3 && (mx - mn) / mx > 0.35 && b < r && b < gg) continue;   // глаза
    var l = 0.3 * r + 0.59 * gg + 0.11 * b;
    var k = 0.9;
    a[i] = 255 * (r + (ov(tr, l) - r) * k);
    a[i + 1] = 255 * (gg + (ov(tgc, l) - gg) * k);
    a[i + 2] = 255 * (b + (ov(tb, l) - b) * k);
  }
  g.putImageData(d, 0, 0);
  var out = document.createElement('canvas');
  out.width = w + pad * 2; out.height = h + pad * 2;
  var o = out.getContext('2d');
  o.shadowColor = color; o.shadowBlur = glow / BAT_PX;
  o.drawImage(c, pad, pad);
  o.shadowBlur = 0;
  o.drawImage(c, pad, pad);
  return { c: out, pad: pad };
}
function batTints(color, glow) {
  var key = color + glow;
  if (!BAT_IMG.tints[key]) BAT_IMG.tints[key] = { body: batTint(BAT_IMG.body, color, glow), wing: batTint(BAT_IMG.wing, color, glow) };
  return BAT_IMG.tints[key];
}

function drawBat(x, y, t, color, glow, scale) {
  if (BAT_IMG.ready < 2) { drawBatShape(x, y, t, color, glow, scale); return; }
  var now = performance.now();
  // прыжок, назначенный на следующую перебежку (hop.p = 0), — ещё не полёт
  var flying = (!!CIRCLE.hop && CIRCLE.hop.p > 0) || now >= CIRCLE.stopUntil;
  var to = batTarget(), takeoff = false;
  var F = BAT_FLAP, two = 2 * 6.2832 * BAT_FLAP_FAST;     // 2 частых взмаха, мс
  if (flying !== F.fly) { if (flying) F.flyAt = t; else F.landAt = t; F.fly = flying; }
  var per;
  if (flying) {
    var fast = t - F.flyAt < two / 2 || batArriveMs(to) < two / 2;   // разгон и подлёт
    per = fast ? BAT_FLAP_FAST : BAT_FLAP_CRUISE;
  } else {
    takeoff = CIRCLE.stopUntil - now < two && !S.paused && !CIRCLE.red;   // перед вылетом
    per = takeoff || t - F.landAt < two ? BAT_FLAP_FAST : BAT_FLAP_SIT;  // и после посадки
  }
  var fdt = F.t ? Math.max(0, Math.min(100, t - F.t)) : 16;
  F.t = t;
  if (!S.paused) F.ph += fdt / per;
  var active = per !== BAT_FLAP_SIT;
  F.e += ((active ? 1 : 0) - F.e) * (1 - Math.exp(-fdt / 90));
  var flap = Math.sin(F.ph);                               // −1 … 1
  var ang = flap * (0.1 + 0.23 * F.e);                     // поворот крыла: + — конец вверх
  var fold = 0.82 + 0.18 * F.e;                            // сидит — крылья полусложены
  var tn = batTints(color, glow);
  var want = 0;
  if (flying || takeoff) want = BAT_TILT_MAX * Math.max(-1, Math.min(1, (to.x - CIRCLE.x) / 80));
  BAT_TILT.a += (want - BAT_TILT.a) * (1 - Math.exp(-fdt / 160));
  ctx.save();
  ctx.translate(x, y + (flying ? -flap * 2 : 0));
  ctx.rotate(BAT_TILT.a);
  ctx.scale(scale * BAT_PX, scale * BAT_PX);
  for (var side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.scale(side, 1);                                   // −1 — левое, 1 — правое (зеркально)
    ctx.translate(BAT_SHOULDER[0], BAT_SHOULDER[1]);
    ctx.rotate(ang);
    ctx.scale(fold, 1);
    ctx.drawImage(tn.wing.c, BAT_WING_AT[0] - BAT_SHOULDER[0] - tn.wing.pad, BAT_WING_AT[1] - BAT_SHOULDER[1] - tn.wing.pad);
    ctx.restore();
  }
  ctx.drawImage(tn.body.c, BAT_BODY_AT[0] - tn.body.pad, BAT_BODY_AT[1] - tn.body.pad);
  ctx.restore();
}

// Прежняя мышь из фигур — пока не загрузились картинки.
function drawBatShape(x, y, t, color, glow, scale) {
  color = color || '#8a8f9c';
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
  if (CIRCLE.red && !CIRCLE_MODE) {
    // мышь налёта, красная: время видно по трём ярким вспышкам — третья
    // гаснет, когда красное кончается
    var rp = Math.max(0, Math.min(1, (t - CIRCLE.red.start) / Math.max(1, CIRCLE.redUntil - CIRCLE.red.start)));
    var fl = 0.5 - 0.5 * Math.cos(rp * 3 * 6.2832);        // 0 … 1, три пика
    drawBat(x, y, t, '#ff3b30', 14, 1 + 0.06 * fl);
    if (fl > 0.01) {
      ctx.globalAlpha = fl;
      drawBat(x, y, t, '#ff7a5c', 36, 1 + 0.06 * fl);
      ctx.globalAlpha = 1;
    }
  } else if (CIRCLE.red) {
    var left = Math.max(0, (CIRCLE.redUntil - t) / Math.max(1, CIRCLE.redUntil - CIRCLE.red.start));
    var pulse = 1 + 0.08 * Math.sin(t / 45);
    drawBat(x, y, t, '#ff3b30', 22, pulse);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, CIRCLE_R + 7, -Math.PI / 2, -Math.PI / 2 + 6.2832 * left); ctx.stroke();
  } else if (!CIRCLE_MODE) {
    // мышь налёта: обычная — серая; после тычка мимо красного (откат, бить
    // бесполезно) — зелёная и плавно сереет: снова серая — откат кончился
    drawBat(x, y, t, null, 0, 1);
    if (t < CIRCLE.coolUntil) {
      ctx.globalAlpha = (CIRCLE.coolUntil - t) / Math.max(1, CIRCLE.coolUntil - CIRCLE.coolStart);
      drawBat(x, y, t, '#4cd964', 14, 1);
      ctx.globalAlpha = 1;
    }
  } else {
    drawBat(x, y, t, '#4cd964', 14, 1);
  }

  // откат — циферблат поверх кружка (в «кружке»; у мыши — зелёный цвет)
  if (CIRCLE_MODE && t < CIRCLE.coolUntil) {
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
