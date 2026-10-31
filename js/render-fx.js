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

// Пламя вокруг шара дальника (картинка автора, камень вырезан — внутри
// рисуется прежний шар). Хвост смотрит против полёта: к щиту и после
// отбоя — в другую сторону. tail — угол хвоста на картинке.
var FIREBALL = { src: 'data:image/webp;base64,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',
  w: 163, h: 200, cx: 68.0, cy: 136.0, r: 46.2, tail: -0.998, im: null };

// Рисует пламя с центром в (x,y), летящее по (vx,vy); дыра в пламени —
// под шар радиуса ballR. false — картинка ещё не загрузилась.
function drawFlame(x, y, vx, vy, ballR) {
  if (!FIREBALL.im) { FIREBALL.im = new Image(); FIREBALL.im.src = FIREBALL.src; }
  var im = FIREBALL.im;
  if (!im.complete || !im.naturalWidth || (vx === 0 && vy === 0)) return false;
  var k = ballR / (FIREBALL.r * 1.04);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(vy, vx) - FIREBALL.tail - Math.PI);
  ctx.drawImage(im, -FIREBALL.cx * k, -FIREBALL.cy * k, FIREBALL.w * k, FIREBALL.h * k);
  ctx.restore();
  return true;
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
    if (!drawFlame(x, y, toX - fromX, toY - fromY, ballR)) {
      ctx.strokeStyle = 'rgba(255,40,30,' + (0.6 * (1 - p) + 0.2) + ')';
      ctx.lineWidth = 6 * (1 + 0.3 * rg);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    }
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
    if (!drawFlame(x, y, d.x1 - d.x0, d.y1 - d.y0, dR)) {
      ctx.strokeStyle = 'rgba(255,145,48,' + (0.6 * (1 - p) + 0.15) + ')';
      ctx.lineWidth = 5.4 * bk;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    }
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

// Задники биомов-картинки: ключ в CHIEF_IMG и дальняя точка (доля ширины картинки).
// третий элемент — картинка стебля на берегах ('stalk'); бамбук пока убран (автор)
var BIOME_BG_IMG = { river: ['bgRiver', 0.3], cave: ['bgCave', 0.4], city: ['bgCity', 0.4], meteor: ['bgMeteor', 0.4] };
// Берега русла на картинке задника (px картинки, от дальней точки к краю;
// последние точки — за кадром): на них сажаем бамбук. Картинка русла
// отзеркалена (автор), берега — тоже, через flipX.
function flipX(pts) { return pts.map(function (p) { return [1024 - p[0], p[1]]; }); }
var BIOME_BANKS = {
  river: {
    left: flipX([[292, 536], [470, 586], [640, 640], [780, 700], [1024, 800], [1200, 880]]),
    right: flipX([[282, 542], [180, 625], [60, 725], [0, 775], [-160, 905]])
  }
};
// Линия ракурса стаи на задника (от автора): от дальней точки к зрителю;
// front — где ноги переднего моба, slots — очередь: [y ног, ширина моба].
var PATH_LEFT = { line: [[292, 537], [505, 1020]], front: 830, slots: [[683, 70], [625, 55], [585, 38], [557, 25]] };
// Стаю при зеркале русла не трогаем (автор): у всех биомов эта линия.
var BIOME_PATH = { river: PATH_LEFT, cave: PATH_LEFT, city: PATH_LEFT, meteor: PATH_LEFT };
function bankPt(line, u) {   // точка на ломаной, u 0…1 по длине
  var L = 0, i, seg = [];
  for (i = 1; i < line.length; i++) { var l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); seg.push(l); L += l; }
  var r = u * L;
  for (i = 0; i < seg.length; i++) {
    if (r <= seg[i] || i === seg.length - 1) { var q = Math.min(1, r / seg[i]); return [line[i][0] + (line[i + 1][0] - line[i][0]) * q, line[i][1] + (line[i + 1][1] - line[i][1]) * q]; }
    r -= seg[i];
  }
}
// докуда (по длине ломаной) берег ещё на экране
function bankVisible(line) {
  for (var u = 0.02; u < 1; u += 0.02) { var x = bgToScreen(bankPt(line, u))[0]; if (x < -20 || x > W + 20) return u; }
  return 1;
}
function bgToScreen(p) { return [BG_XF.bx + p[0] * BG_XF.bk, BG_XF.by + p[1] * BG_XF.bk]; }
// Стебли поверх задника: по 9 с каждой стороны русла, стоят вдоль стен от
// дальней точки к краям экрана, только качаются на ветру. Без rnd() — бой не сбивают.
var BG_STALKS = (function () {
  var a = [];
  for (var i = 0; i < 18; i++) a.push({ side: i % 2 ? 1 : -1, u: ((i >> 1) + 0.5 + 0.35 * (((i * 53) % 7) / 7 - 0.5)) / 9, jit: ((i * 37) % 11) / 11, ph: i * 1.7 });
  return a;
})();
var BG_BOTTOM = 56;   // px: под задником — полосы здоровья и опыта (.footer-wedges bottom)
// Стебли сажаются на берег (или чуть дальше в заросли), высота — по
// перспективе: чем ниже на экране основание, тем ближе и выше стебель.
function drawBgStalks(im, t, banks) {
  var vy = bgToScreen(banks.left[0])[1], list = [];
  var uL = bankVisible(banks.left), uR = bankVisible(banks.right);
  for (var i = 0; i < BG_STALKS.length; i++) {
    var sk = BG_STALKS[i], u = (sk.side < 0 ? uL : uR) * Math.pow(sk.u, 1.2);
    var p = bankPt(sk.side < 0 ? banks.left : banks.right, u);
    var sp = bgToScreen([p[0] + sk.side * 14 * sk.jit, p[1] + 10 * sk.jit]);   // чуть за линией берега
    list.push({ sk: sk, x: sp[0], y: sp[1] });
  }
  list.sort(function (a, b) { return a.y - b.y; });
  for (i = 0; i < list.length; i++) {
    var it = list[i], dep = Math.max(0, it.y - vy);
    var hgt = dep * 3.6, k = hgt / im.height;
    if (hgt < 6) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.55 + dep / 220);   // вдали тают в дымке
    ctx.translate(it.x, it.y);
    ctx.rotate((0.02 + 0.03 * it.sk.jit) * Math.sin(t / 1700 + it.sk.ph));   // ветер
    ctx.scale(k * it.sk.side, k);
    ctx.drawImage(im, -im.width / 2, -im.height);
    ctx.restore();
  }
}

var lastRenderT = 0;
function render(t) {
  ctx.clearRect(0, 0, W, H);

  var gy = groundY();

  // фон
  // фоны биомов тяжёлые для телефона — по умолчанию выключены (тумблер «Фоны биомов»)
  // без картинок биом различается только цветом фона (flat)
  var bio = TUNE.biomes && !S.tut ? curBiome() : BIOME_PLAIN;
  var bgc = bio !== BIOME_PLAIN && !TUNE.biomeBg ? bio.flat : bio.bg;
  var grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, bgc[0]); grd.addColorStop(1, bgc[1]);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  // Задник-картинка (пока есть только у русла): лёгкий, рисуется всегда,
  // вместо и цвета, и тяжёлого фона. Растянут по высоте экрана, по ширине
  // сдвинут так, чтобы дальняя точка русла была левее середины.
  var bgImg = bio !== BIOME_PLAIN && BIOME_BG_IMG[bio.id] ? CHIEF_IMG[BIOME_BG_IMG[bio.id][0]] : null;
  BG_XF = null;
  if (bgImg) {
    var bH = H - BG_BOTTOM;   // низ задника — по нижнему краю кнопок
    var bk = Math.max(W / bgImg.width, bH / bgImg.height), bw2 = bgImg.width * bk;
    var bpa = BIOME_PATH[bio.id];
    // передний моб — по центру экрана; без линии ракурса — дальняя точка левее середины
    var bx = Math.min(0, Math.max(W - bw2, bpa ? 0.5 * W - pathLineX(bpa, bpa.front) * bk : 0.47 * W - BIOME_BG_IMG[bio.id][1] * bw2));
    ctx.drawImage(bgImg, bx, bH - bgImg.height * bk, bw2, bgImg.height * bk);
    BG_XF = { bx: bx, by: bH - bgImg.height * bk, bk: bk, banks: BIOME_BANKS[bio.id] || null, path: bpa || null };
    var stIm = BIOME_BG_IMG[bio.id][2] && CHIEF_IMG[BIOME_BG_IMG[bio.id][2]];
    if (stIm && BG_XF.banks) drawBgStalks(stIm, t, BG_XF.banks);
  } else if (bio !== BIOME_PLAIN && TUNE.biomeBg) drawBiomeBack(bio, gy, t);

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
  drawChiefRaid(t);                    // мыши налёта главаря
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
  if (LAYOUT.edit) drawLayoutMarks();
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
