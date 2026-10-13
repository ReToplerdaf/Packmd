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
  var grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#161a26'); grd.addColorStop(1, '#0b0e15');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

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

  if (TUNE.debug) drawDebug(t);
}
