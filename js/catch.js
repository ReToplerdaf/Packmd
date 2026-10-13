// Механика «поймай»: мобы биомов в свой ход показывают на экране цель,
// в неё надо попасть пальцем, пока она открыта. Летучая мышь летает и
// замирает, рыба прыгает по дну русла и лежит, змея бросается в случайную
// точку, у голема набухают нарывы.
"use strict";

/* ── Ход моба «поймай» ───────────────────────────────────────────── */

// lead — подготовка (полёт, прыжок, прицел, набухание), win — сколько цель
// открыта (игровые мс), r — радиус попадания, mult — урон по мобу при
// попадании, miss — урон по герою за промах (× обычного удара моба),
// n — сколько целей за ход.
var CATCH_KIND = {
  bat:   { lead: 900, win: 700, r: 40, mult: 3,   miss: CRIT_MULT, n: 1 },
  fish:  { lead: 800, win: 600, r: 38, mult: 3,   miss: CRIT_MULT, n: 1 },
  snake: { lead: 800, win: 550, r: 36, mult: 3,   miss: CRIT_MULT, n: 1 },
  golem: { lead: 900, win: 1000, r: 28, mult: 1.2, miss: 0.6,      n: 3 }   // по каждому нарыву
};
var CATCH_EARLY = 80;          // касание чуть раньше открытия цели ещё засчитывается (мс)
var CATCH_FLY_SCALE = 1.5;     // масштаб летучей мыши и рыбы впереди (вместо 2.5 — они двигаются по экрану)
var CATCH = { ev: null };      // текущий ход: { mob, kind, start, openAt, closeAt, targets: [{ x, y, hit }], from }

function isCatchMob(m) { return !!(m && CATCH_KIND[m.type]); }

// Свободная зона экрана для целей: под плашками сверху и над кнопками снизу.
function catchZone(kind) {
  var gy = groundY();
  if (kind === 'fish') return { x0: W * 0.14, x1: W * 0.86, y0: gy + H * 0.02, y1: gy + H * 0.10 };
  return { x0: W * 0.16, x1: W * 0.84, y0: Math.max(80, H * 0.14), y1: gy - H * 0.04 };
}

function catchStart(mob, now) {
  var k = CATCH_KIND[mob.type], z = catchZone(mob.type);
  var ev = { mob: mob, kind: mob.type, start: now, openAt: now + dur(k.lead), closeAt: now + dur(k.lead + k.win), targets: [] };
  if (mob.type === 'golem') {
    // нарывы — на теле голема (он стоит впереди и не двигается)
    var bx = mobX(0), by = mobY(0), bh = 40 * mobBaseScale(mob) * mobScale(0);
    for (var i = 0; i < k.n; i++) {
      ev.targets.push({ x: bx + (rr(-0.5, 0.5) + (i - 1) * 0.25) * bh * 0.55, y: by - bh * rr(0.2, 0.75), hit: false });
    }
  } else {
    ev.targets.push({ x: rr(z.x0, z.x1), y: rr(z.y0, z.y1), hit: false });
  }
  ev.from = catchRest(mob);
  CATCH.ev = ev;
  sfx('telegraph');
}

// Где моб «отдыхает» между ходами (точка тела на экране).
function catchRest(m) {
  if (m.restX == null) {
    if (m.type === 'fish') { m.restX = W * 0.52; m.restY = groundY() + H * 0.06; }
    else { m.restX = W * 0.52; m.restY = groundY() * 0.62; }
  }
  return { x: m.restX, y: m.restY };
}

function catchHitTarget(tg, now) {
  var ev = CATCH.ev, k = CATCH_KIND[ev.kind];
  tg.hit = true;
  var mid = (ev.openAt + ev.closeAt) / 2, half = (ev.closeAt - ev.openAt) / 2;
  var perfect = comboOn() && Math.abs(now - mid) <= half * TUNE.perfect;
  if (comboOn()) { COMBO.pack.threats++; COMBO.sess.threats++; COMBO.pack.blocked++; COMBO.sess.blocked++; if (perfect) { COMBO.pack.perfect++; COMBO.sess.perfect++; } }
  comboHit('catch', perfect);
  S.flash = 0.5; S.flashColor = '#3fdcc4';
  sfx('block');
  if (!perfect) floatText('ПОПАЛ', '#3fdcc4', 0, 0, true);
  var mob = ev.mob;
  if (ev.kind !== 'golem') { mob.restX = tg.x; mob.restY = tg.y; }
  var killed = hitMob(mob, k.mult);
  if (killed || ev.targets.every(function (x) { return x.hit; })) CATCH.ev = null;
}

// Касание по канвасу во время хода «поймай».
function catchTap(x, y) {
  var ev = CATCH.ev;
  if (!ev || S.paused || S.phase !== 'fight') return;
  autoTouch();
  var now = performance.now();
  if (now < ev.openAt - CATCH_EARLY || now > ev.closeAt) return;
  var k = CATCH_KIND[ev.kind], best = null, bd = 1e9;
  for (var i = 0; i < ev.targets.length; i++) {
    var tg = ev.targets[i];
    if (tg.hit) continue;
    var d = Math.hypot(x - tg.x, y - tg.y);
    if (d <= k.r && d < bd) { best = tg; bd = d; }
  }
  if (best) catchHitTarget(best, now);
  else floatText('МИМО', '#8a90a6', 0, 0, false);
}

// Каждый кадр боя, пока впереди моб «поймай» (или ход ещё не закончен).
function catchTick(front, now) {
  var ev = CATCH.ev;
  if (!ev) return;
  if (ev.mob !== front || ev.mob.hp <= 0) { CATCH.ev = null; return; }
  var k = CATCH_KIND[ev.kind];
  // авто: с шансом авто-блока цель гасится сама (без урона по мобу)
  if (AUTO.on && !ev.autoTried && now >= ev.openAt) {
    ev.autoTried = true;
    for (var a = 0; a < ev.targets.length; a++) if (!ev.targets[a].hit && autoBlocks()) { ev.targets[a].hit = true; ev.targets[a].auto = true; }
    if (ev.targets.every(function (x) { return x.hit; })) {
      floatText('БЛОК', '#3fdcc4', 0, 0, false);
      if (ev.kind !== 'golem') { ev.mob.restX = ev.targets[0].x; ev.mob.restY = ev.targets[0].y; }
      CATCH.ev = null; return;
    }
  }
  if (now <= ev.closeAt) return;
  // не попали — моб бьёт (у голема — каждый нарыв лопается отдельно)
  var missed = ev.targets.filter(function (x) { return !x.hit; });
  if (ev.kind !== 'golem') { ev.mob.restX = ev.targets[0].x; ev.mob.restY = ev.targets[0].y; }
  CATCH.ev = null;
  if (!missed.length) return;
  comboBreak(true);
  S.tm.taken++;
  var dmg = damage(mobAtk(ev.mob), S.stats.def, k.miss) * missed.length;
  S.hp -= dmg;
  S.shake = 1; S.flash = 0.75; S.flashColor = '#ff4d34';
  sfx('crit');
  floatText('−' + dmg, '#ff7a63', -1, 0, true);
  if (S.hp <= 0) { S.hp = 0; heroDies(now); }
}

/* ── Положение на экране ─────────────────────────────────────────── */

// Летучая мышь и рыба впереди двигаются сами: ставим им позицию на экране
// (точку тела) поверх обычного плавного подтягивания к месту в очереди.
function catchPlace(t) {
  var m = S.pack[0];
  if (!m || (m.type !== 'bat' && m.type !== 'fish') || S.phase !== 'fight') return;
  var ev = CATCH.ev && CATCH.ev.mob === m ? CATCH.ev : null;
  var rest = catchRest(m), px = rest.x, py = rest.y;
  if (ev && t < ev.openAt) {
    var u = Math.max(0, Math.min(1, (t - ev.start) / (ev.openAt - ev.start))), e = u * u * (3 - 2 * u);
    var tg = ev.targets[0];
    px = ev.from.x + (tg.x - ev.from.x) * e; py = ev.from.y + (tg.y - ev.from.y) * e;
    if (m.type === 'bat') {           // мечется
      px += Math.sin(u * 17 + m.wob) * 30 * (1 - u); py += Math.cos(u * 13 + m.wob) * 22 * (1 - u);
    } else {                          // два прыжка по дну
      py -= Math.abs(Math.sin(u * Math.PI * 2)) * H * 0.16;
    }
  } else if (ev) {
    px = ev.targets[0].x; py = ev.targets[0].y;
  } else if (m.type === 'bat') {      // кружит на месте
    px += Math.sin(t / 700 + m.wob) * 18; py += Math.cos(t / 900 + m.wob) * 10;
  }
  var vs = CATCH_FLY_SCALE, s = mobBaseScale(m);
  var off = m.type === 'bat' ? 1.01 * 40 * s * vs : 8 * s * vs;    // от точки тела до «ног»
  m.vx = px; m.vy = py + off; m.vs = vs;
}

/* ── Отрисовка целей ─────────────────────────────────────────────── */

function drawCatch(t) {
  var ev = CATCH.ev;
  if (!ev || S.phase !== 'fight') return;
  var k = CATCH_KIND[ev.kind];
  ctx.save();
  if (ev.kind === 'snake') drawSnakeLunge(ev, t);
  for (var i = 0; i < ev.targets.length; i++) {
    var tg = ev.targets[i];
    if (tg.hit) continue;
    if (ev.kind === 'golem') {
      // нарыв набухает и светится
      var g = Math.min(1, (t - ev.start) / (ev.openAt - ev.start));
      var br = (6 + 12 * g) * (t >= ev.openAt ? 1 + 0.12 * Math.sin(t / 60) : 1);
      ctx.shadowColor = '#ff6a2a'; ctx.shadowBlur = 14 * g;
      ctx.fillStyle = 'rgb(' + Math.round(170 + 85 * g) + ',' + Math.round(90 + 30 * g) + ',40)';
      ctx.beginPath(); ctx.arc(tg.x, tg.y, br, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,240,200,.7)';
      ctx.beginPath(); ctx.arc(tg.x - br * 0.3, tg.y - br * 0.35, br * 0.3, 0, 6.2832); ctx.fill();
    }
    if (t < ev.openAt) {
      // прицел: тонкое кольцо сходится к цели
      var p = (t - ev.start) / (ev.openAt - ev.start);
      ctx.strokeStyle = 'rgba(255,210,122,' + (0.25 + 0.45 * p).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, k.r * (2.2 - 1.2 * p), 0, 6.2832); ctx.stroke();
    } else {
      // открыта: яркое кольцо и убывающая дуга времени
      var left = Math.max(0, (ev.closeAt - t) / (ev.closeAt - ev.openAt));
      ctx.strokeStyle = 'rgba(255,210,122,' + (0.6 + 0.4 * Math.sin(t / 50)).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, k.r, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = '#ff6a4d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, k.r + 6, -Math.PI / 2, -Math.PI / 2 + 6.2832 * left); ctx.stroke();
    }
  }
  ctx.restore();
}

// Бросок змеи: шея тянется от головы к точке броска, голова — в точке.
function drawSnakeLunge(ev, t) {
  var m = ev.mob, tg = ev.targets[0];
  var s = mobBaseScale(m) * (m.vs || 2.5);
  var hx = m.vx + 6 * s, hy = m.vy - 30 * s;          // голова в стойке
  var u = t < ev.openAt ? 0 : Math.min(1, (t - ev.openAt) / (dur(120)));
  if (tg.hit || u <= 0) return;
  var x = hx + (tg.x - hx) * u, y = hy + (tg.y - hy) * u;
  ctx.strokeStyle = '#b89a45'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy);
  ctx.quadraticCurveTo((hx + x) / 2 + Math.sin(t / 40) * 10, (hy + y) / 2 - 20, x, y); ctx.stroke();
  ctx.strokeStyle = '#7a6528'; ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#c9ab52';
  ctx.beginPath(); ctx.ellipse(x, y, 13, 9, Math.atan2(y - hy, x - hx), 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#ff3b2f';
  ctx.beginPath(); ctx.arc(x - 3, y - 3, 2, 0, 6.2832); ctx.arc(x + 3, y - 3, 2, 0, 6.2832); ctx.fill();
}

cv.addEventListener('pointerdown', function (e) {
  if (!CATCH.ev) return;
  var r = cv.getBoundingClientRect();
  catchTap(e.clientX - r.left, e.clientY - r.top);
});
