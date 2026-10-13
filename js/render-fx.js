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
  var bio = TUNE.biomes && !S.tut ? curBiome() : BIOME_PLAIN;
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
// по бокам — стены биома (тростник, скалы, дома, края кратеров), которые
// мельчают к дальней точке, как сама очередь.
var CORRIDOR_N = 22;           // сколько элементов стены с каждой стороны
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
function corridorF(i) { return 1 - Math.pow(0.84, i + 0.4); }

function drawBiomeBack(bio, gy, t) {
  var c = corridorGeom(gy);
  ctx.save();
  // дно коридора
  var floorCol = { river: ['rgba(40,110,150,.10)', 'rgba(50,130,170,.32)'], cave: ['rgba(40,46,60,.15)', 'rgba(36,40,52,.55)'],
    city: ['rgba(120,90,50,.12)', 'rgba(150,115,65,.38)'], meteor: ['rgba(60,24,24,.15)', 'rgba(50,20,22,.55)'] }[bio.id];
  var fg = ctx.createLinearGradient(c.vx, c.vy, W * 0.5, H);
  fg.addColorStop(0, floorCol[0]); fg.addColorStop(1, floorCol[1]);
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(c.vx, c.vy); ctx.lineTo(c.rx, c.ry); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.lineTo(c.lx, c.ly); ctx.closePath(); ctx.fill();

  if (bio.id === 'river') {
    // струи текут по руслу к зрителю
    ctx.strokeStyle = 'rgba(160,215,240,.22)'; ctx.lineCap = 'round';
    for (var r = 0; r < 18; r++) {
      var ph = ((t * 0.00012 * (0.7 + bhash(r) * 0.6)) + bhash(r + 30)) % 1;   // 0 — далеко, 1 — близко
      var f = 1 - ph, lane = 0.15 + bhash(r + 3) * 0.7;
      var a = corridorPt(c, -1, f), b = corridorPt(c, 1, f);
      var px = a.x + (b.x - a.x) * lane, py = a.y + (b.y - a.y) * lane;
      var len = (6 + 26 * a.k);
      var dx = c.vx - px, dy = c.vy - py, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      ctx.lineWidth = 0.6 + 1.6 * a.k;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx / dl * len, py + dy / dl * len); ctx.stroke();
    }
  } else if (bio.id === 'meteor') {
    // сам метеорит светится у дальней точки
    var mg = ctx.createRadialGradient(c.vx, c.vy, 0, c.vx, c.vy, W * 0.45);
    mg.addColorStop(0, 'rgba(255,110,50,.35)'); mg.addColorStop(1, 'rgba(255,110,50,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    var pulse = 0.6 + 0.4 * Math.sin(t / 500);
    ctx.fillStyle = 'rgba(255,' + Math.round(90 + 60 * pulse) + ',40,.95)';
    ctx.beginPath(); ctx.moveTo(c.vx - 9, c.vy + 4); ctx.lineTo(c.vx - 3, c.vy - 9); ctx.lineTo(c.vx + 7, c.vy - 6); ctx.lineTo(c.vx + 10, c.vy + 4); ctx.closePath(); ctx.fill();
  } else if (bio.id === 'cave') {
    // сталактиты под сводом
    for (var st = 0; st < 7; st++) {
      var sx = bhash(st + 1) * W, sh = 12 + bhash(st + 20) * 22;
      ctx.fillStyle = 'rgba(70,80,100,.8)';
      ctx.beginPath(); ctx.moveTo(sx - sh * 0.3, 0); ctx.lineTo(sx, sh); ctx.lineTo(sx + sh * 0.3, 0); ctx.closePath(); ctx.fill();
    }
  }

  // стены: от дальних к ближним, чтобы ближние перекрывали
  for (var i = CORRIDOR_N - 1; i >= 0; i--) {
    for (var side = -1; side <= 1; side += 2) {
      var seed = i * 2 + (side > 0 ? 1 : 0);
      var p = corridorPt(c, side, corridorF(i) + (bhash(seed + 400) - 0.5) * 0.03);
      drawWallPiece(bio.id, p.x, p.y, p.k, side, seed, t);
    }
  }

  if (bio.id === 'meteor' || bio.id === 'city') {
    // искры над кратерами / песок в воздухе
    for (var e = 0; e < 20; e++) {
      var life = 4000 + bhash(e + 7) * 3000, ph2 = ((t + bhash(e) * life) % life) / life;
      if (bio.id === 'meteor') {
        var ex = bhash(e + 60) * W + Math.sin(t / 700 + e) * 8, ey = H * 0.9 - ph2 * H * 0.8;
        ctx.fillStyle = 'rgba(255,' + Math.round(120 + 80 * (1 - ph2)) + ',60,' + (0.7 * (1 - ph2)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(ex, ey, 1.2 + bhash(e + 90) * 1.4, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(230,190,120,' + (0.25 * (1 - Math.abs(ph2 - 0.5) * 2)).toFixed(3) + ')';
        ctx.fillRect(ph2 * W, gy * 0.2 + bhash(e + 8) * H * 0.6, 2, 1);
      }
    }
  }
  ctx.restore();
}

// Один элемент стены коридора в точке (x, y) — у основания; k — масштаб.
function drawWallPiece(id, x, y, k, side, seed, t) {
  var s = Math.max(0.12, k);
  var h1 = bhash(seed + 11), h2 = bhash(seed + 23), h3 = bhash(seed + 37);
  if (id === 'river') {
    // пучок тростника с метёлками, слегка качается
    var stems = 5 + Math.floor(h1 * 4), sway = Math.sin(t / 900 + seed) * 3 * s;
    for (var q = 0; q < stems; q++) {
      var bx = x + (bhash(seed * 7 + q) - 0.5) * 44 * s, hh = (70 + bhash(seed * 5 + q) * 60) * s;
      ctx.strokeStyle = q % 2 ? '#3d5a2e' : '#4f6e36'; ctx.lineWidth = Math.max(0.8, 3 * s); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + sway * 0.5, y - hh * 0.6, bx + sway, y - hh); ctx.stroke();
      if (q % 2 === 0) {
        ctx.fillStyle = '#6b4a2a';
        ctx.beginPath(); ctx.ellipse(bx + sway, y - hh, Math.max(0.8, 2.6 * s), Math.max(2, 8 * s), 0, 0, 6.2832); ctx.fill();
      }
    }
  } else if (id === 'cave') {
    // скальный выступ с кристаллом
    var rw = (60 + h1 * 50) * s, rh = (90 + h2 * 80) * s;
    ctx.fillStyle = side < 0 ? '#2a303e' : '#232836';
    ctx.beginPath();
    ctx.moveTo(x - rw * 0.6, y); ctx.lineTo(x - rw * 0.5, y - rh * 0.6); ctx.lineTo(x - rw * 0.1, y - rh);
    ctx.lineTo(x + rw * 0.35, y - rh * 0.75); ctx.lineTo(x + rw * 0.6, y); ctx.closePath(); ctx.fill();
    if (h3 > 0.55) {
      var glow = 0.45 + 0.3 * Math.sin(t / 900 + seed);
      ctx.fillStyle = 'rgba(90,166,232,' + glow.toFixed(3) + ')';
      var cx = x + (h1 - 0.5) * rw * 0.5, ch = 22 * s;
      ctx.beginPath(); ctx.moveTo(cx - ch * 0.3, y - rh * 0.3); ctx.lineTo(cx, y - rh * 0.3 - ch); ctx.lineTo(cx + ch * 0.3, y - rh * 0.3); ctx.closePath(); ctx.fill();
    }
  } else if (id === 'city') {
    // глинобитный дом: стена, тёмные окна, иногда купол
    var hw = (55 + h1 * 40) * s, hh = (60 + h2 * 70) * s;
    var front = side < 0 ? '#8a6a3e' : '#7a5c34', shade = '#5e4626';
    ctx.fillStyle = front; ctx.fillRect(x - hw / 2, y - hh, hw, hh);
    ctx.fillStyle = shade; ctx.fillRect(side < 0 ? x + hw / 2 - hw * 0.15 : x - hw / 2, y - hh, hw * 0.15, hh);
    if (h3 > 0.6) { ctx.fillStyle = front; ctx.beginPath(); ctx.arc(x, y - hh, hw * 0.3, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#2a1e10';
    var ww = Math.max(1, 8 * s), wh = Math.max(1.5, 12 * s);
    ctx.fillRect(x - hw * 0.25 - ww / 2, y - hh * 0.7, ww, wh);
    ctx.fillRect(x + hw * 0.15 - ww / 2, y - hh * 0.7, ww, wh);
    if (h1 > 0.4) ctx.fillRect(x - ww * 0.7, y - wh * 1.7, ww * 1.4, wh * 1.7);   // дверной проём
  } else if (id === 'meteor') {
    // вал кратера: тёмный горб с раскалёнными трещинами
    var cw = (80 + h1 * 50) * s, chh = (40 + h2 * 40) * s;
    ctx.fillStyle = side < 0 ? '#2a1418' : '#221014';
    ctx.beginPath(); ctx.ellipse(x, y, cw / 2, chh, 0, Math.PI, 0); ctx.fill();
    var gl = 0.5 + 0.35 * Math.sin(t / 600 + seed);
    ctx.strokeStyle = 'rgba(255,' + Math.round(90 + 50 * gl) + ',40,' + gl.toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.6, 1.8 * s);
    ctx.beginPath();
    ctx.moveTo(x - cw * 0.25, y - chh * 0.2); ctx.lineTo(x - cw * 0.05, y - chh * 0.55); ctx.lineTo(x + cw * 0.1, y - chh * 0.4); ctx.lineTo(x + cw * 0.22, y - chh * 0.75);
    ctx.stroke();
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
