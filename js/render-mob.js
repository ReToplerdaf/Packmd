// Отрисовка моба (drawMob).
"use strict";

function drawMob(m, x, gy, t, isFront) {
  var s = Math.min(1.6, Math.max(0.88, H / 178)) * m.size;
  var hgt = 40 * s;
  var bob = Math.sin(t / 300 + m.wob) * 1.8;
  var stagger = m.staggerUntil > t;
  var hurtT = t - m.hurt;
  var flashHurt = hurtT >= 0 && hurtT < 130;

  var tg = S.telegraph && S.telegraph.mob === m ? S.telegraph : null;
  var tp = tg ? Math.min(1, (t - tg.start) / (tg.hitAt - tg.start)) : 0;

  ctx.save();
  ctx.translate(x, gy + bob + (stagger ? 4 : 0));
  if (stagger) ctx.rotate(0.22);

  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 2, 15 * s, 4 * s, 0, 0, 6.2832); ctx.fill();

  if (m.type === 'bat') { drawBat(m, s, hgt, t, tg, tp, stagger, flashHurt); ctx.restore(); drawMobHp(m, x, gy, s, isFront); return; }

  // Крит больше не подсвечивается свечением тела — его читают по мечу:
  // замах вверх, вспышка красным в верхней точке, удар вниз (см. ниже).
  var hk = 0;
  if (!tg && m.healedAt && t - m.healedAt >= 0 && t - m.healedAt < 1100) {
    // Хилер подлечил этого моба — заметное зелёное сияние: свечение вокруг
    // и зелёная заливка поверх тела, затухает за ~1 с.
    hk = 1 - (t - m.healedAt) / 1100;
    ctx.shadowColor = 'rgba(124,236,140,' + Math.min(1, 1.2 * hk) + ')';
    ctx.shadowBlur = (14 + 30 * hk) * s;
  }

  // Злость красит моба всё гуще к красному — видно даже без короны.
  var RAGE_COLORS = ['#8f3f4c', '#a8453f', '#c23f2e', '#e2341c'];
  var rageColor = RAGE_COLORS[Math.min(RAGE_COLORS.length - 1, m.rage || 0)];
  var TYPE_COLORS = { healer: '#3f8f6a', yellow: '#c2a83f', ranged: '#4a6f9f' };
  var baseColor = TYPE_COLORS[m.type] || '#8f3f4c';
  var body = flashHurt ? '#ffffff' : (stagger ? '#6a4450' :
    ((m.rage || 0) > 0 ? rageColor : (m.vulnMult > 1 ? '#a8583f' : baseColor)));
  // Ближники (обычный, вожак, жёлтый) — форма с макета «Вид боя от первого
  // лица»: широкое шестигранное тело, два рога, круглые оранжевые глаза.
  // Дальнобойщик и хилер остаются узкими «капюшонами».
  var melee = m.type !== 'ranged' && m.type !== 'healer';
  if (melee) {
    // макет: тело 70…360 по высоте (290 ед.), ноги в y=360, центр x=195
    var k = hgt / 290;
    var P = function (mx, my) { return [(mx - 195) * k, (my - 360) * k]; };
    var pts = [P(115, 360), P(95, 200), P(150, 70), P(240, 70), P(295, 200), P(275, 360)];
    // рога — позади тела
    ctx.fillStyle = flashHurt ? '#ffffff' : 'rgba(0,0,0,.28)';
    var horn = function (a, b, c) {
      var A = P(a[0], a[1]), B = P(b[0], b[1]), C = P(c[0], c[1]);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
    };
    ctx.save();
    ctx.fillStyle = body; horn([150, 70], [132, 18], [166, 82]); horn([240, 70], [258, 18], [224, 82]);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; horn([150, 70], [132, 18], [166, 82]); horn([240, 70], [258, 18], [224, 82]);
    ctx.restore();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi][0], pts[pi][1]);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 2 * k;
    ctx.stroke();
    if (hk > 0) { ctx.fillStyle = 'rgba(124,236,140,' + (0.55 * hk) + ')'; ctx.fill(); }
    // глаза — пустые тёмные провалы, без свечения
    var e1 = P(163, 150), e2 = P(227, 150);
    ctx.fillStyle = stagger ? '#3a2b33' : '#1a0f14';
    ctx.beginPath(); ctx.arc(e1[0], e1[1], 2.3 * s, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(e2[0], e2[1], 2.3 * s, 0, 6.2832); ctx.fill();
  } else {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-13 * s, 0);
    ctx.lineTo(-9 * s, -hgt * 0.86);
    ctx.lineTo(0, -hgt);
    ctx.lineTo(9 * s, -hgt * 0.86);
    ctx.lineTo(13 * s, 0);
    ctx.closePath(); ctx.fill();
    if (hk > 0) { ctx.fillStyle = 'rgba(124,236,140,' + (0.55 * hk) + ')'; ctx.fill(); }
    ctx.shadowBlur = 0;

    // глаза дальнобойщика: пустые, пока он спокоен; загораются, когда
    // по тебе прошёл его выстрел, — и горят тем ярче и краснее, чем он злее.
    var rgRage = m.type === 'ranged' && (m.rangedRage || 0) > 0 ? RANGED_RAGE_LOOK : 0;
    if (rgRage > 0 && !stagger) {
      var rk = 1;
      var EYE_COLS = ['#ffd27a', '#ff9a4a', '#ff3b2f'];
      ctx.save();
      ctx.shadowColor = rk >= 1 ? '#ff1a10' : '#ff9130';
      ctx.shadowBlur = (6 + 10 * rk) * s;
      ctx.fillStyle = EYE_COLS[Math.min(EYE_COLS.length - 1, rgRage - 1)];
      var eR = (2.1 + 0.6 * rgRage) * s;
      ctx.beginPath(); ctx.arc(-4.4 * s, -hgt * 0.70, eR, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(4.4 * s, -hgt * 0.70, eR, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = stagger ? '#3a2b33' : '#1a0f14';
      ctx.beginPath(); ctx.arc(-4.4 * s, -hgt * 0.70, 2.1 * s, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(4.4 * s, -hgt * 0.70, 2.1 * s, 0, 6.2832); ctx.fill();
    }
  }

  if (m.leader) {
    // Каждый стак злости — ещё одна корона стопкой: видно сразу, без чисел.
    var crowns = 1 + Math.min(RAGE_COLORS.length - 1, m.rage || 0);
    for (var ci = 0; ci < crowns; ci++) {
      var cy = (melee ? -hgt * 1.2 : -hgt) - 3 * s - ci * 5 * s;   // у ближников — над рогами
      ctx.strokeStyle = ci === crowns - 1 ? rageColor : '#ff9130';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(-8 * s, cy); ctx.lineTo(-4 * s, cy - 6 * s);
      ctx.lineTo(0, cy); ctx.lineTo(4 * s, cy - 6 * s); ctx.lineTo(8 * s, cy);
      ctx.stroke();
    }
    if (m.chief) {
      // Метка главаря — багровый ромб над коронами.
      var my = (melee ? -hgt * 1.2 : -hgt) - 3 * s - crowns * 5 * s - 6 * s;
      ctx.fillStyle = '#c8325a'; ctx.strokeStyle = '#ffb0c4'; ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(0, my - 4 * s); ctx.lineTo(3.4 * s, my); ctx.lineTo(0, my + 4 * s); ctx.lineTo(-3.4 * s, my);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  // Оружие. Обычный моб и вожак — с большим двуручным мечом; в блок
  // («щит» по механике) они встают, наклонив меч почти горизонтально
  // перед корпусом. Жёлтый — меньший меч плюс настоящий круглый щит,
  // которым он и закрывается. У дальнобойщика и хилера оружия нет.
  var isYellow = m.type === 'yellow';
  var swordBlockState = 'steel';
  var armed = m.type !== 'ranged' && m.type !== 'healer';
  var swCx = 0, swCy = -hgt * 0.55;   // центр клинка
  var guardUp = !!m.shield;
  var blockCol = isYellow ? '224,194,79' : '74,159,232';

  if (armed) {
    // меч: (hx, hy) — гарда, ang — направление клинка
    var bladeLen = isYellow ? 20 * s : 34 * s;
    var bladeW = isYellow ? 2.4 * s : 3.4 * s;
    var hx, hy, ang;
    if (guardUp && !isYellow) {
      // Блок мечом — клинок поперёк корпуса. Моб «устаёт держать»:
      //   • пока идёт пульс, меч покачивается из стороны в сторону и
      //     дрожит, и дрожь всё чаще и сильнее к концу (это сведение);
      //   • в начале окна удара конец меча падает вниз — вот тут бить;
      //   • новый пульс начинается с того, что меч снова поднимается.
      ang = -0.2;
      var bcx = 0, bcy = -hgt * 0.58;
      hx = bcx - Math.cos(ang) * bladeLen * 0.5;
      hy = bcy - Math.sin(ang) * bladeLen * 0.5;
      var pl = m.pulse;
      var swState = 'steel';          // как у щита жёлтого: steel / flash / dropped
      if (pl) {
        var winStart = pl.hitAt - dur(pulseGoodMs());
        var holdT = Math.max(1, winStart - pl.start);
        var tau = Math.max(0, Math.min(holdT, t - pl.start));
        var prog = tau / holdT;
        var droop = 0;
        if (t < winStart) {
          // подъём в начале пульса (первые 15%)
          if (prog < 0.15) { var rq = 1 - prog / 0.15; droop = rq * rq; }
          // покачивание
          ang += 0.11 * Math.sin(t / 260 + m.wob);
          hy += 1.2 * s * Math.sin(t / 340 + m.wob);
          // дрожь: частота растёт от 3 до 18 Гц (фаза — интеграл частоты,
          // чтобы не было рывков), амплитуда — тоже к концу
          var f0 = 0.003, f1 = 0.018;
          var ph = 6.2832 * (f0 * tau + (f1 - f0) * tau * tau / (2 * holdT));
          var tamp = (0.25 + 1.35 * prog * prog);
          ang += 0.05 * tamp * Math.sin(ph);
          hy += 1.1 * s * tamp * Math.sin(ph * 1.37 + 1.1);
          hx += 0.7 * s * tamp * Math.sin(ph * 0.83 + 2.3);
          // на пике дрожи — короткая жёлтая вспышка клинка
          if (t >= winStart - dur(120)) swState = 'flash';
        } else {
          // окно удара: конец меча быстро падает и висит внизу
          var dq = Math.min(1, (t - winStart) / Math.max(1, dur(pulseGoodMs()) * 0.35));
          droop = dq * dq;
        }
        // опускание конца — поворот вокруг рукояти
        ang += droop * 1.05;
        if (t >= winStart && droop > 0.85) swState = 'dropped';   // опущен — серый
      }
      swordBlockState = swState;
    } else {
      // в покое: держит справа, клинок вверх с наклоном наружу
      hx = 11 * s; hy = -hgt * 0.4;
      ang = isYellow ? -1.15 : -1.2;
    }
    // Подсветка блока мечом — как у щита жёлтого: жёлтая вспышка на пике
    // дрожи, серый клинок, пока конец опущен (окно удара), иначе обычный.
    var bladeColor = null, swordGlow = null;
    if (guardUp && !isYellow) {
      if (swordBlockState === 'flash') { bladeColor = '#ffd83a'; swordGlow = '#ffe24a'; }
      else if (swordBlockState === 'dropped') { bladeColor = '#8a8d93'; }
    }

    // Крит — читается по мечу, а не по свечению:
    //   0 … CRIT_RAISE   — медленный замах вверх над головой (это «сведение»);
    //   CRIT_RAISE … CRIT_DROP — меч замер в верхней точке и вспыхивает
    //                     ярко-красным: сейчас ударит;
    //   CRIT_DROP … 1    — резкий удар вниз, долетает ровно к моменту удара
    //                     (tg.hitAt) — это и есть тайминг блока.
    if (tg) {
      var CRIT_RAISE = 0.55, CRIT_DROP = 0.88;   // замирание наверху — треть замаха
      var idleHx = hx, idleHy = hy, idleAng = ang;
      var topHx = 3 * s, topHy = -hgt * 1.02, topAng = -1.85;
      var dnHx = 7 * s, dnHy = -hgt * 0.38, dnAng = 1.15;
      var e, shake = 0;
      if (tp < CRIT_RAISE) {
        var lin = tp / CRIT_RAISE;
        e = 1 - (1 - lin) * (1 - lin);                           // ease-out
        hx = idleHx + (topHx - idleHx) * e;
        hy = idleHy + (topHy - idleHy) * e;
        ang = idleAng + (topAng - idleAng) * e;
        shake = lin * lin;                                       // дрожь нарастает к верху
        // цвет дублирует дрожь: клинок разгорается от стального к красному
        var heat = shake;
        var cr = Math.round(223 + (255 - 223) * heat);
        var cg = Math.round(227 + (42 - 227) * heat);
        var cb = Math.round(238 + (26 - 238) * heat);
        bladeColor = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        if (heat > 0.05) swordGlow = 'rgba(255,42,26,' + (0.9 * heat).toFixed(3) + ')';
      } else if (tp < CRIT_DROP) {
        hx = topHx; hy = topHy; ang = topAng;
        bladeColor = '#ff2a1a'; swordGlow = '#ff2a1a';
        shake = 1.25;                                            // в верхней точке — сильнее всего
      } else {
        e = (tp - CRIT_DROP) / (1 - CRIT_DROP); e = e * e;       // ease-in
        bladeColor = '#ff2a1a'; swordGlow = '#ff2a1a';           // удар вниз — тоже красный
        hx = topHx + (dnHx - topHx) * e;
        hy = topHy + (dnHy - topHy) * e;
        ang = topAng + (dnAng - topAng) * e;
      }
      // Дрожь от напряжения замаха: частая, неровная (две несоизмеримые
      // частоты), амплитуда растёт к верхней точке. На ударе вниз — нет.
      if (shake > 0) {
        var amp = shake * 1.8 * s;
        hx += amp * (Math.sin(t / 17) * 0.7 + Math.sin(t / 7.3) * 0.3);
        hy += amp * (Math.cos(t / 19) * 0.7 + Math.sin(t / 8.1) * 0.3);
        ang += shake * 0.07 * Math.sin(t / 11.7);
      }
    }
    drawSword(hx, hy, ang, bladeLen, bladeW, s, swordGlow, bladeColor);
    swCx = hx + Math.cos(ang) * bladeLen * 0.5;
    swCy = hy + Math.sin(ang) * bladeLen * 0.5;
  }

  // Посох: дальнобойщик — жёлтое древко с синей сферой, хилер — коричневое
  // с красной. Сфера разгорается, пока идёт выстрел/лечение.
  if (!armed) {
    var isRanged = m.type === 'ranged';
    var staffCol = isRanged ? '#d8b64a' : '#6b4a2a';
    var orbCol = isRanged ? '#4aa8ff' : '#ff3b3b';
    var orbGlowCol = isRanged ? '#7cc4ff' : '#ff7a6a';
    // Хилер: «действие» — канал лечения (healPulse).
    // Дальнобойщик: «действие» — замах ПЕРЕД выстрелом (последние
    // RANGED_WINDUP мс до rangedSwingAt); сам выстрел — вспышка и полёт.
    var act;
    if (isRanged) {
      var wu = dur(RANGED_WINDUP);
      act = (!m.rangedTelegraph && m.rangedSwingAt && t >= m.rangedSwingAt - wu && t < m.rangedSwingAt)
        ? { start: m.rangedSwingAt - wu, hitAt: m.rangedSwingAt } : null;
    } else {
      act = m.healPulse;
    }
    var actP = act ? Math.min(1, Math.max(0, (t - act.start) / (act.hitAt - act.start))) : 0;
    var sbx = 13 * s, sby = 2 * s;
    var stx = ORB_DX * s, sty = ORB_DY_H * hgt + (ORB_DY_S + 7.2) * s;
    // Дальнобойщик: вместо дрожи — поднимает посох над головой перед
    // выстрелом, стреляет из верхней точки и потом опускает посох.
    if (isRanged) {
      var lift = 0;
      if (act) {
        lift = 1 - (1 - actP) * (1 - actP);                     // ease-out подъём
      } else if (m.rangedTelegraph) {
        var rtt = m.rangedTelegraph;
        var fp = Math.min(1, Math.max(0, (t - rtt.start) / (rtt.hitAt - rtt.start)));
        lift = fp < 0.15 ? 1 : Math.max(0, 1 - (fp - 0.15) / 0.35); // держит, потом опускает
      }
      stx += RANGED_LIFT_DX * s * lift;
      sty -= RANGED_LIFT_DY * s * lift;
      sbx += 1 * s * lift;
      sby -= RANGED_LIFT_DY * s * lift;
    } else {
      // Хилер поднимает посох на касте так же, как дальнобойщик: быстро
      // вверх в начале канала, держит наверху, после лечения/срыва опускает.
      var hlift = 0, HEAL_LOWER = 320;
      if (act) {
        var lp = Math.min(1, Math.max(0, (t - act.start) / Math.max(1, (act.hitAt - act.start) * 0.35)));
        hlift = 1 - (1 - lp) * (1 - lp);
      } else if (m.healEndAt && t - m.healEndAt >= 0 && t - m.healEndAt < HEAL_LOWER) {
        hlift = 1 - (t - m.healEndAt) / HEAL_LOWER;
      }
      stx += RANGED_LIFT_DX * s * hlift;
      sty -= RANGED_LIFT_DY * s * hlift;
      sbx += 1 * s * hlift;
      sby -= RANGED_LIFT_DY * s * hlift;
    }
    // Хилер вместо кольца: посох дрожит, всё чаще и сильнее к моменту
    // лечения — это и есть сведение.
    if (act && !isRanged) {
      var hl = Math.max(1, act.hitAt - act.start);
      var htau = Math.max(0, Math.min(hl, t - act.start));
      var hprog = htau / hl;
      var hph = 6.2832 * (0.003 * htau + (0.02 - 0.003) * htau * htau / (2 * hl));
      var hamp = (0.2 + 1.6 * hprog * hprog) * s;
      // после hitAt (пока идёт «поздняя» часть окна) — дрожь на максимуме
      if (t > act.hitAt) { hamp = 1.8 * s; hph = 6.2832 * 0.02 * (t - act.start); }
      stx += hamp * Math.sin(hph);
      sty += hamp * 0.7 * Math.sin(hph * 1.31 + 1.7);
      sbx += hamp * 0.25 * Math.sin(hph * 0.9 + 0.4);
    }
    ctx.save();
    ctx.strokeStyle = staffCol; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sbx, sby); ctx.lineTo(stx, sty); ctx.stroke();
    // оправа под сферой
    ctx.strokeStyle = isRanged ? '#a8862a' : '#4a3018'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.arc(stx, sty - 6.4 * s, 8.8 * s, 0.35, Math.PI - 0.35); ctx.stroke();
    // сфера
    ctx.shadowColor = orbGlowCol;
    ctx.shadowBlur = (6 + 14 * actP) * s;
    ctx.fillStyle = orbCol;
    ctx.beginPath(); ctx.arc(stx, sty - 7.2 * s, (6.8 + 2.4 * actP) * s, 0, 6.2832); ctx.fill();
    // дальнобойщик заряжает выстрел — в сфере разгорается красное ядро
    if (isRanged && act) {
      ctx.shadowColor = '#ff1a10';
      ctx.shadowBlur = (4 + 10 * actP) * s;
      ctx.fillStyle = 'rgba(255,59,47,' + (0.35 + 0.5 * actP) + ')';
      ctx.beginPath(); ctx.arc(stx, sty - 7.2 * s, (2.8 + 4 * actP) * s, 0, 6.2832); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(stx - 2.2 * s, sty - 9.6 * s, 2 * s, 0, 6.2832); ctx.fill();
    // Хилер вылечил / дальнобойщик выстрелил — яркая вспышка сферы, быстро гаснет.
    var flashAt = isRanged ? m.castFlashAt : m.healFlashAt;
    if (flashAt && t - flashAt >= 0 && t - flashAt < 420) {
      var fk = 1 - (t - flashAt) / 420;
      ctx.globalAlpha = fk;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 30 * s * fk;
      var fg = ctx.createRadialGradient(stx, sty - 7.2 * s, 0, stx, sty - 7.2 * s, (12 + 32 * (1 - fk)) * s);
      fg.addColorStop(0, 'rgba(255,255,255,1)');
      fg.addColorStop(0.35, isRanged ? 'rgba(160,210,255,.9)' : 'rgba(255,170,150,.9)');
      fg.addColorStop(1, isRanged ? 'rgba(74,168,255,0)' : 'rgba(255,59,59,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(stx, sty - 7.2 * s, (12 + 32 * (1 - fk)) * s, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  if (isYellow) {
    // Блок щитом без колец, только анимацией:
    //   • щит поднят и не дрожит — пока пульса нет (моб ещё в очереди);
    //   • пошёл пульс — щит дрожит, всё чаще и сильнее (сведение);
    //   • на пике дрожи — короткая жёлтая вспышка;
    //   • в начале окна удара щит падает вниз — вот тут бить;
    //   • новый пульс начинается с того, что щит снова поднимается.
    // Три положения щита: поднят (перед корпусом), в руке (у бока, когда
    // блока нет) и упал (лежит плашмя на земле — окно удара).
    var upX = -5 * s, upY = -hgt * 0.4, upR = 10 * s;   // ниже глаз новой формы
    var dnR = 9 * s, dnX = upX, dnY = -dnR;               // падает строго вниз, к ногам, на ребро
    var handX = -12 * s, handY = -hgt * 0.36, handR = 7.5 * s;
    var lower = 0;                       // 0 — поднят, 1 — лежит на земле
    var jx = 0, jy = 0, yflash = false;
    var ypl = guardUp ? m.pulse : null;
    if (ypl) {
      var yWin = ypl.hitAt - dur(pulseGoodMs());
      var yFlashMs = dur(120);
      var yHold = Math.max(1, yWin - ypl.start);
      var ytau = Math.max(0, Math.min(yHold, t - ypl.start));
      var yprog = ytau / yHold;
      if (t < yWin) {
        if (yprog < 0.15) { var yq = 1 - yprog / 0.15; lower = yq * yq; }   // подъём
        var yph = 6.2832 * (0.003 * ytau + (0.018 - 0.003) * ytau * ytau / (2 * yHold));
        var yamp = (0.2 + 1.5 * yprog * yprog) * s;
        jx = yamp * Math.sin(yph);
        jy = yamp * 0.8 * Math.sin(yph * 1.29 + 1.3);
        if (t >= yWin - yFlashMs) yflash = true;
      } else {
        var ydq = Math.min(1, (t - yWin) / Math.max(1, dur(pulseGoodMs()) * 0.35));
        lower = ydq * ydq;                                                  // щит падает
      }
    }
    var shx, shy, shr, lean;
    if (!guardUp) {
      shx = handX; shy = handY; shr = handR; lean = 0;
    } else {
      // падение: щит опускается к ногам и встаёт на ребро, чуть завалившись
      shx = upX + (dnX - upX) * lower + jx;
      shy = upY + (dnY - upY) * lower + jy;
      shr = upR + (dnR - upR) * lower;
      lean = 0;
    }
    // упавший щит — серый (погас), так видно, что сейчас он не защищает
    var fallen = guardUp && lower > 0.85;
    var rim = yflash ? '#fff3a0' : (fallen ? '#9a9da3' : '#e0c24f');
    ctx.save();
    ctx.translate(shx, shy);
    ctx.rotate(lean);
    if (yflash) { ctx.shadowColor = '#ffe24a'; ctx.shadowBlur = 22 * s; }
    ctx.fillStyle = yflash ? '#ffd83a' : (fallen ? '#55585e' : '#7a6524');
    ctx.beginPath(); ctx.arc(0, 0, shr, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath(); ctx.arc(0, 0, shr, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(-shr * 0.8, 0); ctx.lineTo(shr * 0.8, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -shr * 0.8); ctx.lineTo(0, shr * 0.8); ctx.stroke();
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(0, 0, shr * 0.28, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  drawMobHp(m, x, gy, s, isFront);

  // Кольца у Хилера больше нет — канал лечения читается по дрожи посоха
  // и вспышке сферы (см. отрисовку посоха выше).
}

// Полоска здоровья — ровно под ногами моба.
function drawMobHp(m, x, gy, s, isFront) {
  if (isFront || m.hp < m.maxHp) {
    var bw = 34 * s, frac = Math.max(0, m.hp / m.maxHp);
    // ровно под ногами моба, под тенью — не мешает коронам и мечу сверху
    var barY = gy + 4 * s + 4;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - bw / 2, barY, bw, 4);
    ctx.fillStyle = m.leader ? '#ff9130' : '#d8563f';
    ctx.fillRect(x - bw / 2, barY, bw * frac, 4);
  }
}

// Летучая мышь: висит в воздухе, машет крыльями. Перед укусом крылья
// поднимаются и замирают, глаза разгораются красным; укусов два подряд.
function drawBat(m, s, hgt, t, tg, tp, stagger, flashHurt) {
  var rage = m.rage || 0;
  var body = flashHurt ? '#ffffff' : (stagger ? '#4a3a58' : (rage > 0 ? '#8a3a6a' : (m.vulnMult > 1 ? '#7a4a6a' : '#5b3f7a')));
  var hover = -hgt * 0.75 + Math.sin(t / 160 + m.wob) * 3 * s;
  var flap = tg ? (0.9 + 0.1 * Math.sin(t / 30)) * Math.min(1, tp * 1.6) : Math.sin(t / 85 + m.wob);
  var lunge = tg && tp > 0.85 ? (tp - 0.85) / 0.15 : 0;
  ctx.save();
  ctx.translate(0, hover + lunge * 10 * s);
  ctx.scale(1 + lunge * 0.25, 1 + lunge * 0.25);
  // крылья
  ctx.fillStyle = flashHurt ? '#ffffff' : '#3a2850';
  for (var side = -1; side <= 1; side += 2) {
    var up = flap * 0.9;
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-up * 0.6);
    ctx.beginPath();
    ctx.moveTo(4 * s, -hgt * 0.32);
    ctx.lineTo(30 * s, -hgt * 0.62);
    ctx.lineTo(26 * s, -hgt * 0.30);
    ctx.lineTo(20 * s, -hgt * 0.38);
    ctx.lineTo(16 * s, -hgt * 0.20);
    ctx.lineTo(10 * s, -hgt * 0.28);
    ctx.lineTo(4 * s, -hgt * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // тело и уши
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -hgt * 0.26, 8 * s, 11 * s, 0, 0, 6.2832); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6 * s, -hgt * 0.42); ctx.lineTo(-5 * s, -hgt * 0.62); ctx.lineTo(-1 * s, -hgt * 0.46); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6 * s, -hgt * 0.42); ctx.lineTo(5 * s, -hgt * 0.62); ctx.lineTo(1 * s, -hgt * 0.46); ctx.closePath(); ctx.fill();
  // глаза: тёмные, перед укусом разгораются
  var glow = tg ? Math.min(1, tp * 1.2) : 0;
  if (glow > 0) { ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 10 * s * glow; }
  ctx.fillStyle = glow > 0 ? 'rgba(255,' + Math.round(200 - 160 * glow) + ',60,1)' : '#1a0f14';
  ctx.beginPath(); ctx.arc(-3 * s, -hgt * 0.32, 1.7 * s, 0, 6.2832); ctx.fill();
  ctx.beginPath(); ctx.arc(3 * s, -hgt * 0.32, 1.7 * s, 0, 6.2832); ctx.fill();
  ctx.shadowBlur = 0;
  // клыки
  ctx.fillStyle = '#eee';
  ctx.beginPath(); ctx.moveTo(-2.5 * s, -hgt * 0.2); ctx.lineTo(-1.5 * s, -hgt * 0.13); ctx.lineTo(-0.6 * s, -hgt * 0.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2.5 * s, -hgt * 0.2); ctx.lineTo(1.5 * s, -hgt * 0.13); ctx.lineTo(0.6 * s, -hgt * 0.2); ctx.fill();
  ctx.restore();
}
