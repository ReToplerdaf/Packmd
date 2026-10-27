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
function raidOn() { return !CIRCLE_MODE && TUNE.bats && (!S.tut || !!S.tut.bat); }   // в обучении — только своя мышь
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
// Высохшее русло: вместо мыши — сухопутная рыба (анабас, от автора). Механика
// та же, крыльев нет, не анимируется — только смотрит туда, куда перелетит
// (картинка смотрит влево, вправо — зеркалом). Центр картинки — в точке мыши.
var FISH_PNG = 'data:image/webp;base64,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';
var FISH = { im: null, tints: {}, face: 1 };
function batIsFish() { return !CIRCLE_MODE && TUNE.biomes && !S.tut && curBiome().id === 'river'; }

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
  var fi = new Image();
  fi.onload = function () { FISH.im = fi; };
  fi.src = FISH_PNG;
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

function drawFish(x, y, color, glow, scale) {
  var key = color + glow;
  if (!FISH.tints[key]) FISH.tints[key] = batTint(FISH.im, color, glow);
  var tn = FISH.tints[key], to = batTarget();
  if (to.x > CIRCLE.x + 1) FISH.face = -1; else if (to.x < CIRCLE.x - 1) FISH.face = 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * BAT_PX * FISH.face, scale * BAT_PX);
  ctx.drawImage(tn.c, -FISH.im.width / 2 - tn.pad, -FISH.im.height / 2 - tn.pad);
  ctx.restore();
}
function drawBat(x, y, t, color, glow, scale) {
  if (FISH.im && batIsFish()) { drawFish(x, y, color, glow, scale); return; }
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
