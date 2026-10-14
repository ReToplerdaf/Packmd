// Отрисовка: выстрелы, рикошеты, всплывающие цифры, отладка, кадр целиком (render).
"use strict";

// Доля пути от (x0,y0) к (x1,y1), на которой отрезок впервые касается
// дуги кнопки щита (окружность с центром в её нижнем левом углу и
// радиусом = размер кнопки). Если пересечения нет — весь путь.
function edgeReach(x0, y0, x1, y1) {
  var cx = 0, cy = H - 56, r = wedgeSize();
  var dx = x1 - x0, dy = y1 - y0;
  var fx = x0 - cx, fy = y0 - cy;
  var a = dx * dx + dy * dy;
  var b = 2 * (fx * dx + fy * dy);
  var c = fx * fx + fy * fy - r * r;
  if (a === 0 || c <= 0) return c <= 0 ? 0 : 1;
  var disc = b * b - 4 * a * c;
  if (disc < 0) return 1;
  var sq = Math.sqrt(disc);
  var s1 = (-b - sq) / (2 * a);
  if (s1 >= 0 && s1 <= 1) return s1;
  var s2 = (-b + sq) / (2 * a);
  if (s2 >= 0 && s2 <= 1) return s2;
  return 1;
}

// ровно к rangedTelegraph.hitAt, тому же моменту, когда решается блок.
function drawRangedShots(gy, t) {
  for (var i = 0; i < S.pack.length; i++) {
    var m = S.pack[i];
    if (m.type !== 'ranged' || !m.rangedTelegraph || m.hp <= 0) continue;
    var rt = m.rangedTelegraph;
    var p = Math.min(1, Math.max(0, (t - rt.start) / (rt.hitAt - rt.start)));
    // Вылетает из центра сферы посоха.
    var op = orbPoint(m, i);
    var fromX = op.x, fromY = op.y;
    // Летит в сторону центра кнопки щита, но удар засчитывается в момент
    // касания её КРАЯ — поэтому к rangedTelegraph.hitAt точка проходит
    // только долю пути до центра, ровно до пересечения с дугой кнопки.
    var aimX = heroX(), aimY = heroY();
    var reach = edgeReach(fromX, fromY, aimX, aimY);
    var toX = fromX + (aimX - fromX) * reach, toY = fromY + (aimY - fromY) * reach;
    var x = fromX + (toX - fromX) * p;
    var y = fromY + (toY - fromY) * p;
    var tailP = Math.max(0, p - 0.16);
    var tx = fromX + (toX - fromX) * tailP;
    var ty = fromY + (toY - fromY) * tailP;
    ctx.save();
    // Летящий в игрока выстрел — ярко-красный (опасно); отбитый — оранжевый.
    // Свирепость видна по самому шару: крупнее, ярче, с горячим ядром
    // и пульсирующим ореолом на максимуме.
    var rg = (m.rangedRage || 0) > 0 ? RANGED_RAGE_LOOK : 0, rk2 = rg ? 1 : 0;
    var ballR = (9.6 + 4.8 * p) * (1 + 0.3 * rg);
    ctx.strokeStyle = 'rgba(255,40,30,' + (0.6 * (1 - p) + 0.2) + ')';
    ctx.lineWidth = 6 * (1 + 0.3 * rg);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.shadowColor = '#ff1a10';
    ctx.shadowBlur = 24 + 22 * rk2;
    ctx.fillStyle = '#ff3b2f';
    ctx.beginPath(); ctx.arc(x, y, ballR, 0, 6.2832); ctx.fill();
    if (rg > 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = rg >= 2 ? '#fff1c2' : '#ffb36a';
      ctx.beginPath(); ctx.arc(x, y, ballR * (0.3 + 0.12 * rg), 0, 6.2832); ctx.fill();
    }
    if (rg >= RANGED_RAGE_LOOK) {
      ctx.strokeStyle = 'rgba(255,90,60,' + (0.45 + 0.35 * Math.sin(t / 45)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, ballR * 1.55, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }
}

// Отбитый блоком выстрел дальнобойщика — вторая, короткая дуга от щита
// к той цели в стае, в которую он на самом деле попал.
function drawDeflects(t) {
  for (var i = S.deflects.length - 1; i >= 0; i--) {
    var d = S.deflects[i];
    if (t >= d.hitAt && d.done) { S.deflects.splice(i, 1); continue; }
    if (t >= d.hitAt) continue;
    var p = Math.min(1, Math.max(0, (t - d.start) / (d.hitAt - d.start)));
    var x = d.x0 + (d.x1 - d.x0) * p;
    var y = d.y0 + (d.y1 - d.y0) * p;
    var tailP = Math.max(0, p - 0.25);
    var tx = d.x0 + (d.x1 - d.x0) * tailP;
    var ty = d.y0 + (d.y1 - d.y0) * tailP;
    var bk = d.big ? 1.9 : 1;                 // яростный шар и отскакивает крупным
    var dR = (10.2 + 4.8 * p) * bk;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,145,48,' + (0.6 * (1 - p) + 0.15) + ')';
    ctx.lineWidth = 5.4 * bk;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.shadowColor = '#ff9130';
    ctx.shadowBlur = d.big ? 40 : 20;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(x, y, dR, 0, 6.2832); ctx.fill();
    if (d.big) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff1c2';
      ctx.beginPath(); ctx.arc(x, y, dR * 0.66, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,60,' + (0.45 + 0.35 * Math.sin(t / 45)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, dR * 1.55, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFloats(t) {
  for (var i = S.floats.length - 1; i >= 0; i--) {
    var f = S.floats[i];
    var age = t - f.born;
    if (age > 950) { S.floats.splice(i, 1); continue; }
    var p = age / 950;
    // Где всплывают надписи:
    //   • урон по мобам (числа) — от кнопки удара (правый угол) вверх;
    //   • урон по персонажу (f.x === -1) — сверху вниз, к кнопке щита;
    //   • текстовые события боя («ОТБИТО», «ЩИТ», «прячется»…) — над
    //     кнопкой рюкзака, немного всплывают.
    var vw = window.innerWidth || W;
    var ws = wedgeSize();
    var EDGE_K = 0.28;                            // доля ширины кнопки от края экрана
    var wedgeTop = H - 56 - ws * Math.sqrt(1 - EDGE_K * EDGE_K); // верх дуги кнопки в этой точке
    var bagH = Math.min(90, vw * 0.23);
    var isNum = /^[✦]?[−+\-]?\d+$/.test(String(f.t));
    var fx, fy, align = 'center', rise;
    var isMobHeal = f.x !== -1 && /^\+\d+$/.test(String(f.t));
    if (isMobHeal) {
      // лечение мобов хилером — по центру, над рюкзаком, высоко вверх к мобам
      rise = 130;
      fx = W / 2;
      fy = H - 54 - bagH - 12 - p * rise;
    } else if (f.x === -1 && isNum) {
      rise = 80;
      fx = ws * EDGE_K;
      fy = wedgeTop - 8 - rise + p * rise;
    } else if (isNum) {
      rise = 80;
      fx = W - ws * EDGE_K;
      fy = wedgeTop - 8 - p * rise;
    } else {
      rise = 40;
      fx = W / 2;
      fy = H - 54 - bagH - 12 - p * rise;
    }
    fy -= (f.slot || 0) * 20;               // раздвижка одновременных надписей
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    ctx.fillStyle = f.c === 'var(--accent)' ? '#c9954a' : (f.c === 'var(--telegraph)' ? '#ff4d34' : f.c);
    ctx.font = (f.big ? '700 19px ' : '600 14px ') + '"IBM Plex Mono", monospace';
    ctx.textAlign = align;
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4;
    ctx.fillText(f.t, fx, fy);
    ctx.restore();
  }
}

function drawDebug(t) {
  var y = 10, bw = W - 20;
  ctx.save();
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(10, y, bw, 7);

  if (S.telegraph) {
    var tp = Math.min(1, (t - S.telegraph.start) / (S.telegraph.hitAt - S.telegraph.start));
    ctx.fillStyle = '#ff4d34';
    ctx.fillRect(10, y, bw * tp, 7);
    ctx.fillStyle = '#ffb3a4'; ctx.textAlign = 'left';
    ctx.fillText('удар через ' + Math.max(0, Math.round(S.telegraph.hitAt - t)) + ' мс', 10, y + 19);
  }
  if (t < S.guardUntil) {
    var gp = (S.guardUntil - t) / dur(guardWindow());
    ctx.fillStyle = 'rgba(63,220,196,.85)';
    ctx.fillRect(10, y + 9, bw * gp, 5);
    ctx.fillStyle = '#3fdcc4'; ctx.textAlign = 'right';
    ctx.fillText('блок ' + Math.round(S.guardUntil - t) + ' мс', W - 10, y + 19);
  } else if (t < S.guardCoolUntil) {
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(10, y + 9, bw * ((S.guardCoolUntil - t) / Math.max(1, S.guardCoolMs || dur(TUNE.cool))), 5);
  }
  ctx.restore();
}

var lastRenderT = 0;
function render(t) {
  ctx.clearRect(0, 0, W, H);

  var gy = groundY();

  // фон
  // фоны биомов тяжёлые для телефона — по умолчанию выключены (тумблер «Фоны биомов»)
  var bio = TUNE.biomes && TUNE.biomeBg && !S.tut ? curBiome() : BIOME_PLAIN;
  var grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, bio.bg[0]); grd.addColorStop(1, bio.bg[1]);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  if (bio !== BIOME_PLAIN) drawBiomeBack(bio, gy, t);

  ctx.save();
  var sh = S.shake > 0 ? S.shake : 0;
  if (sh > 0) ctx.translate(rr(-5, 5) * sh, rr(-3, 3) * sh);

  // Вид от первого лица — герой не отрисовывается, стая видна целиком:
  // хвост очереди уходит мелкой цепочкой в верхний левый угол, активный
  // моб — крупно по центру кадра, как цель прямо перед игроком.
  var dt = lastRenderT ? Math.min(100, t - lastRenderT) : 16;
  lastRenderT = t;
  for (var e = 0; e < S.pack.length; e++) easeMob(S.pack[e], e, dt);

  ctx.save();
  if (S.phase === 'dead') ctx.globalAlpha = 0.45;
  for (var i = S.pack.length - 1; i >= 1; i--) {
    var qm = S.pack[i];
    ctx.save();
    ctx.translate(qm.vx, qm.vy);
    ctx.scale(qm.vs, qm.vs);
    drawMob(qm, 0, 0, t, false);
    ctx.restore();
  }
  if (S.pack.length) {
    var fm0 = S.pack[0];
    ctx.save();
    ctx.translate(fm0.vx, fm0.vy);
    ctx.scale(fm0.vs, fm0.vs);
    drawMob(fm0, 0, 0, t, true);
    ctx.restore();
  }
  ctx.restore();
  drawCircle(t);                       // «кружок» или мышь налёта
  drawRangedShots(gy, t);
  drawDeflects(t);

  drawFloats(t);
  ctx.restore();

  // вспышка по краям
  if (S.flash > 0.01) {
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    var vgc = S.flashColor === '#3fdcc4' ? 'rgba(63,220,196,' : (S.flashColor === '#5cb85c' ? 'rgba(92,184,92,' : 'rgba(255,77,52,');
    vg.addColorStop(1, vgc + (S.flash * 0.5) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  drawChiefBar();
  drawBiomeBanner(t);
  if (TUNE.debug) drawDebug(t);
}

/* ── Биомы: фон и надпись ────────────────────────────────────────── */

// Детерминированный «шум» для декораций: без rnd(), чтобы фон не сбивал
// случайные числа боя.
function bhash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// Коридор биома: дно уходит к дальней точке очереди стаи (влево вверх),
// по бокам — сплошные стены биома (заросли тростника, скалы, дома, валы
// кратеров), огромные у зрителя и мельчающие к дальней точке.
var CORRIDOR_N = 26;           // сколько участков стены с каждой стороны
function corridorGeom(gy) {
  return {
    vx: W * 0.15, vy: gy * 0.06,                 // дальняя точка
    lx: -W * 0.06, ly: gy + H * 0.30,            // левый берег у зрителя
    rx: W * 1.04, ry: gy + H * 0.10              // правый берег у зрителя
  };
}
// Точка на стене: side −1 — левая, +1 — правая; f 0 — у зрителя, 1 — у дальней точки.
function corridorPt(c, side, f) {
  var x0 = side < 0 ? c.lx : c.rx, y0 = side < 0 ? c.ly : c.ry;
  return { x: x0 + (c.vx - x0) * f, y: y0 + (c.vy - y0) * f, k: 1.7 * (1 - f) };
}
// Границы участков: −1 — за краем экрана у зрителя, дальше — к дальней точке.
function corridorF(i) { return i < 0 ? -0.8 : 1 - Math.pow(0.86, i); }

// Высота стены (в «экранных» единицах при k = 1) на границе участка.
var WALL_H = { river: 330, cave: 230, city: 300, meteor: 260 };
function wallH(id, side, i) {
  var h = bhash(i * 2 + (side > 0 ? 1 : 0) + 500);
  return WALL_H[id] * (id === 'city' ? 0.75 + 0.5 * h : 0.85 + 0.3 * h);
}

var BIOME_FLOOR = { river: ['#5aa7c8', '#2f7394'], cave: ['#1a1e28', '#0c0e14'], city: ['#e6c992', '#c9a064'], meteor: ['#2a161c', '#120a0e'] };

function drawBiomeBack(bio, gy, t) {
  var c = corridorGeom(gy), id = bio.id;
  ctx.save();
  // небо: ночью — звёзды, над метеоритом — зарево
  if (id === 'meteor' || id === 'cave') {
    for (var sn = 0; sn < 40; sn++) {
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 1300 + sn * 1.7));
      ctx.fillStyle = 'rgba(220,225,255,' + (0.6 * tw * bhash(sn + 200)).toFixed(3) + ')';
      ctx.fillRect(bhash(sn + 210) * W, bhash(sn + 220) * gy * 0.6, 1.5, 1.5);
    }
  }
  if (id === 'meteor') {
    var mg = ctx.createRadialGradient(c.vx, c.vy, 0, c.vx, c.vy, W * 0.6);
    mg.addColorStop(0, 'rgba(255,110,50,.45)'); mg.addColorStop(1, 'rgba(255,110,50,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
  }
  if (id === 'river' || id === 'city') {
    var sg = ctx.createRadialGradient(W * 0.3, -gy * 0.1, 0, W * 0.3, -gy * 0.1, W * 0.7);
    sg.addColorStop(0, 'rgba(255,250,220,.55)'); sg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  }

  // дно коридора
  var fc = BIOME_FLOOR[id];
  var fg = ctx.createLinearGradient(c.vx, c.vy, W * 0.5, H);
  fg.addColorStop(0, fc[0]); fg.addColorStop(1, fc[1]);
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(c.vx, c.vy); ctx.lineTo(c.rx, c.ry); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.lineTo(c.lx, c.ly); ctx.closePath(); ctx.fill();

  if (id === 'river') {
    // струи текут по руслу к зрителю
    ctx.strokeStyle = 'rgba(235,250,255,.45)'; ctx.lineCap = 'round';
    for (var r = 0; r < 22; r++) {
      var ph = ((t * 0.00012 * (0.7 + bhash(r) * 0.6)) + bhash(r + 30)) % 1;
      var f = 1 - ph, lane = 0.12 + bhash(r + 3) * 0.76;
      var a = corridorPt(c, -1, f), b = corridorPt(c, 1, f);
      var px = a.x + (b.x - a.x) * lane, py = a.y + (b.y - a.y) * lane;
      var len = 6 + 26 * a.k, dx = c.vx - px, dy = c.vy - py, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      ctx.lineWidth = 0.6 + 1.6 * a.k;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx / dl * len, py + dy / dl * len); ctx.stroke();
    }
  } else if (id === 'meteor') {
    // раскалённые трещины в выжженной земле
    ctx.strokeStyle = 'rgba(255,100,40,' + (0.35 + 0.2 * Math.sin(t / 700)).toFixed(3) + ')';
    for (var cr = 0; cr < 7; cr++) {
      var cf = 0.1 + bhash(cr + 300) * 0.7, cl = 0.2 + bhash(cr + 310) * 0.6;
      var ca = corridorPt(c, -1, cf), cb = corridorPt(c, 1, cf);
      var cx0 = ca.x + (cb.x - ca.x) * cl, cy0 = ca.y + (cb.y - ca.y) * cl;
      ctx.lineWidth = Math.max(0.6, 1.6 * ca.k);
      ctx.beginPath(); ctx.moveTo(cx0 - 20 * ca.k, cy0); ctx.lineTo(cx0 - 6 * ca.k, cy0 - 4 * ca.k); ctx.lineTo(cx0 + 8 * ca.k, cy0 + 2 * ca.k); ctx.lineTo(cx0 + 22 * ca.k, cy0 - 3 * ca.k); ctx.stroke();
    }
  }

  // сплошные стены, от дальних участков к ближним
  for (var i = CORRIDOR_N - 1; i >= -1; i--) {
    for (var side = -1; side <= 1; side += 2) {
      var f0 = corridorF(i), f1 = corridorF(i + 1);
      var A = corridorPt(c, side, f0), B = corridorPt(c, side, f1);
      drawWallSeg(id, A, B, wallH(id, side, i), wallH(id, side, i + 1), side, i, t);
    }
  }
  if (id === 'cave') drawCaveVault(c, t);

  if (id === 'meteor' || id === 'city') {
    // искры над кратерами / песок в воздухе
    for (var e = 0; e < 20; e++) {
      var life = 4000 + bhash(e + 7) * 3000, ph2 = ((t + bhash(e) * life) % life) / life;
      if (id === 'meteor') {
        var ex = bhash(e + 60) * W + Math.sin(t / 700 + e) * 8, ey = H * 0.9 - ph2 * H * 0.8;
        ctx.fillStyle = 'rgba(255,' + Math.round(120 + 80 * (1 - ph2)) + ',60,' + (0.7 * (1 - ph2)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(ex, ey, 1.2 + bhash(e + 90) * 1.4, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,240,200,' + (0.4 * (1 - Math.abs(ph2 - 0.5) * 2)).toFixed(3) + ')';
        ctx.fillRect(ph2 * W, gy * 0.2 + bhash(e + 8) * H * 0.6, 2, 1);
      }
    }
  }
  ctx.restore();
}

// Участок стены между точками основания A (ближе) и B (дальше);
// ha, hb — высоты стены на этих границах (при k = 1).
function drawWallSeg(id, A, B, ha, hb, side, i, t) {
  var Ah = A.y - ha * A.k, Bh = B.y - hb * B.k;
  var quad = function (ta, tb) { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y - tb); ctx.lineTo(A.x, A.y - ta); ctx.closePath(); };
  var seed = i * 2 + (side > 0 ? 1 : 0) + 40;
  var lerp = function (u) { return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, k: A.k + (B.k - A.k) * u }; };
  if (id === 'river') {
    // стена тростника: плотная масса и стебли с метёлками поверх
    quad(ha * A.k * 0.82, hb * B.k * 0.82);
    ctx.fillStyle = (i & 1) ? '#557a34' : '#4c6f2f'; ctx.fill();
    var sway = Math.sin(t / 900 + i) * 5;
    for (var q = 0; q < 6; q++) {
      var u = (q + bhash(seed * 7 + q)) / 6, p = lerp(u), sk = Math.max(0.06, p.k);
      var hh = (ha + (hb - ha) * u) * sk * (0.9 + 0.15 * bhash(seed * 5 + q));
      var tx = p.x + sway * sk, ty = p.y - hh;
      ctx.strokeStyle = q % 2 ? '#8a9a52' : '#a2ad62'; ctx.lineWidth = Math.max(0.5, 2.2 * sk); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x, p.y - hh * 0.6, tx, ty); ctx.stroke();
      // листья
      ctx.strokeStyle = '#6f8a3e'; ctx.lineWidth = Math.max(0.5, 2.6 * sk);
      var dir = q % 2 ? 1 : -1, lfy = p.y - hh * 0.55;
      ctx.beginPath(); ctx.moveTo(p.x, lfy); ctx.quadraticCurveTo(p.x + dir * 18 * sk, lfy - 16 * sk, p.x + dir * 30 * sk, lfy + 6 * sk); ctx.stroke();
      // метёлка
      ctx.strokeStyle = 'rgba(214,192,150,.95)'; ctx.lineWidth = Math.max(0.5, 1.5 * sk);
      for (var pl = 0; pl < 6; pl++) {
        var ang = -0.4 + pl * 0.22, plen = (12 + pl * 2) * sk, py0 = ty + pl * 2.4 * sk;
        ctx.beginPath(); ctx.moveTo(tx, py0);
        ctx.quadraticCurveTo(tx + Math.cos(ang) * plen * 0.6, py0 - 4 * sk, tx + Math.cos(ang) * plen, py0 + Math.sin(ang + 0.9) * plen * 0.7);
        ctx.stroke();
      }
    }
  } else if (id === 'cave') {
    // скальная стена с неровным верхом и кристаллами
    quad(ha * A.k, hb * B.k);
    ctx.fillStyle = (i & 1) ? '#262b38' : '#20242f'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(0.5, 2 * A.k);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x, Ah); ctx.stroke();
    if (bhash(seed + 9) > 0.5) {
      var cp = lerp(0.5), ch = 26 * cp.k, glow = 0.45 + 0.3 * Math.sin(t / 900 + i);
      ctx.fillStyle = 'rgba(90,166,232,' + glow.toFixed(3) + ')';
      var cy = cp.y - (ha + hb) / 2 * cp.k * (0.25 + 0.4 * bhash(seed + 3));
      ctx.beginPath(); ctx.moveTo(cp.x - ch * 0.3, cy); ctx.lineTo(cp.x, cy - ch); ctx.lineTo(cp.x + ch * 0.3, cy); ctx.closePath(); ctx.fill();
    }
  } else if (id === 'city') {
    // сплошной ряд глинобитных домов: у каждого своя высота (плоская крыша)
    quad(ha * A.k, ha * B.k);
    var lit = side < 0 ? ['#e2bd84', '#d5ad74'] : ['#c99d63', '#bb9058'];
    ctx.fillStyle = lit[i & 1]; ctx.fill();
    // карниз
    ctx.strokeStyle = '#9a7442'; ctx.lineWidth = Math.max(0.6, 4 * A.k);
    ctx.beginPath(); ctx.moveTo(A.x, A.y - ha * A.k); ctx.lineTo(B.x, B.y - ha * B.k); ctx.stroke();
    // купол на некоторых
    if (bhash(seed + 17) > 0.65) {
      var dp = lerp(0.5), dr = Math.abs(B.x - A.x) * 0.3;
      ctx.fillStyle = lit[i & 1];
      ctx.beginPath(); ctx.arc(dp.x, dp.y - ha * dp.k, dr, Math.PI, 0); ctx.fill();
    }
    // окна и дверь
    ctx.fillStyle = '#4a3418';
    for (var wn = 0; wn < 2; wn++) {
      var wu = 0.28 + wn * 0.44, wp = lerp(wu), ww = 9 * wp.k, wh = 14 * wp.k;
      for (var fl = 1; fl <= Math.floor(ha / 110); fl++) ctx.fillRect(wp.x - ww / 2, wp.y - fl * 95 * wp.k - wh, ww, wh);
    }
    if (bhash(seed + 23) > 0.4) { var dpp = lerp(0.5); ctx.fillRect(dpp.x - 8 * dpp.k, dpp.y - 30 * dpp.k, 16 * dpp.k, 30 * dpp.k); }
  } else if (id === 'meteor') {
    // гигантский вал кратера: горб с раскалёнными трещинами
    var mx = (A.x + B.x) / 2, my = Math.min(Ah, Bh) - (ha * A.k) * 0.35;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, Bh); ctx.quadraticCurveTo(mx, my, A.x, Ah); ctx.closePath();
    ctx.fillStyle = (i & 1) ? '#2c1820' : '#24131a'; ctx.fill();
    var gl = 0.5 + 0.35 * Math.sin(t / 600 + i);
    ctx.strokeStyle = 'rgba(255,' + Math.round(90 + 50 * gl) + ',40,' + gl.toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.6, 2.4 * A.k);
    var p1 = lerp(0.3), p2 = lerp(0.6);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - 10 * p1.k); ctx.lineTo(p1.x + 6 * p1.k, p1.y - ha * p1.k * 0.4);
    ctx.lineTo(p2.x, p2.y - ha * p2.k * 0.55); ctx.lineTo(p2.x + 4 * p2.k, p2.y - ha * p2.k * 0.8);
    ctx.stroke();
  }
}

// Свод пещеры: арки-рёбра с верха левой стены на верх правой, мельчают к
// дальней точке; всё выше ближней видимой арки — камень потолка.
function drawCaveVault(c, t) {
  var arch = function (f, i) {
    var a = corridorPt(c, -1, f), b = corridorPt(c, 1, f);
    var ha = wallH('cave', -1, i) * a.k, hb = wallH('cave', 1, i) * b.k;
    return { x0: a.x, y0: a.y - ha, x1: b.x, y1: b.y - hb, cx: (a.x + b.x) / 2, cy: Math.min(a.y - ha, b.y - hb) - 110 * a.k, k: a.k };
  };
  var n = arch(corridorF(2), 2);
  ctx.fillStyle = '#161922';
  ctx.beginPath();
  ctx.moveTo(n.x0, n.y0); ctx.quadraticCurveTo(n.cx, n.cy, n.x1, n.y1);
  ctx.lineTo(W + 20, n.y1); ctx.lineTo(W + 20, -20); ctx.lineTo(-20, -20); ctx.lineTo(-20, n.y0);
  ctx.closePath(); ctx.fill();
  for (var i = CORRIDOR_N - 1; i >= 2; i--) {
    var r = arch(corridorF(i), i);
    ctx.strokeStyle = i > 2 ? 'rgba(44,50,66,.95)' : '#2a3040';
    ctx.lineWidth = Math.max(1, 14 * r.k);
    ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.quadraticCurveTo(r.cx, r.cy, r.x1, r.y1); ctx.stroke();
  }
  // сталактиты с ближней арки, с них капает
  for (var st = 0; st < 9; st++) {
    var u = 0.08 + bhash(st + 1) * 0.84, iu = 1 - u;
    var sx = iu * iu * n.x0 + 2 * iu * u * n.cx + u * u * n.x1;
    var sy = iu * iu * n.y0 + 2 * iu * u * n.cy + u * u * n.y1;
    var sh = 16 + bhash(st + 20) * 30, sw = sh * 0.28;
    ctx.fillStyle = '#2a3040';
    ctx.beginPath(); ctx.moveTo(sx - sw, sy - 4); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx + sw, sy - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(90,166,232,' + (0.3 + 0.3 * Math.sin(t / 1100 + st)).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(sx, sy + sh + 2, 1.4, 0, 6.2832); ctx.fill();
  }
}

// Надпись с названием нового биома: появляется, держится, гаснет.
function drawBiomeBanner(t) {
  var b = BIOME.banner;
  if (!b) return;
  var k = (t - b.start) / dur(BIOME_BANNER_MS);
  if (k >= 1 || k < 0) { if (k >= 1) BIOME.banner = null; return; }
  var a = Math.min(1, k / 0.15, (1 - k) / 0.25);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var by = groundY() + 70;              // под передним мобом, над кнопками
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(0, by - 32, W, 64);
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 24px "IBM Plex Mono", monospace';
  ctx.fillText(b.name.toUpperCase(), W / 2, by - (b.note ? 8 : 0));
  if (b.note) {
    ctx.fillStyle = '#b8bccb'; ctx.font = '13px "IBM Plex Mono", monospace';
    ctx.fillText(b.note, W / 2, by + 17);
  }
  ctx.restore();
}

// Полоса здоровья главаря — широкая, вверху между плашками, с отметками фаз.
function drawChiefBar() {
  var m = chiefMob();
  if (!m) return;
  var x0 = 84, x1 = W - 84, y = 26, bw = x1 - x0;
  if (bw < 60) return;
  var frac = Math.max(0, m.hp / m.maxHp);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffb0c4'; ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.fillText('ГЛАВАРЬ · ФАЗА ' + (m.chiefPhase || 1), W / 2, y - 3);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0, y, bw, 8);
  ctx.fillStyle = m.chiefPhase === 3 ? '#ff4d34' : '#c8325a'; ctx.fillRect(x0, y, bw * frac, 8);
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillRect(x0 + bw * 0.33 - 1, y - 2, 2, 12);
  ctx.fillRect(x0 + bw * 0.66 - 1, y - 2, 2, 12);
  ctx.restore();
}
