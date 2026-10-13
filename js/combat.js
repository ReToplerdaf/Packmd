// Бой: удары, лечение, злость, смерть, пауза рюкзака, ход боя за кадр (step).
"use strict";

/* ════════════════════════════════════════════════════════════════════
   БОЙ
   ════════════════════════════════════════════════════════════════════ */

// Полоса, где всплывает надпись (см. drawFloats): урон по игроку, урон
// по мобам, лечение мобов, текстовые события.
function floatLane(t, x) {
  var str = String(t);
  if (x !== -1 && /^\+\d+$/.test(str)) return 'heal';
  var num = /^[✦]?[−+\-]?\d+$/.test(str);
  if (x === -1 && num) return 'player';
  return num ? 'mob' : 'text';
}
function floatText(text, color, x, y, big) {
  var now = performance.now(), lane = floatLane(text, x);
  // Раздвигаем одновременные надписи в одной полосе по высоте: каждая
  // следующая, появившаяся, пока предыдущие ещё «свежие», встаёт выше.
  var used = {};
  for (var i = 0; i < S.floats.length; i++) {
    var o = S.floats[i];
    if (o.lane === lane && now - o.born < 550) used[o.slot] = true;
  }
  var slot = 0; while (used[slot]) slot++;
  S.floats.push({ t: text, c: color, x: x, y: y, born: now, big: !!big, lane: lane, slot: slot });
  if (S.floats.length > 24) S.floats.shift();
}

// Возвращает true, если этот удар добил моба — нужно знать, например,
// чтобы полечить героя за добивание контратакой.
function hitMob(mob, mult, label, manual) {
  if (mob.shield) {
    if (!manual) {
      // Щит держит только кнопка «Удар» — авто-атака и реакция блока в него
      // просто утыкаются, ничего не пробивая. Молча: раньше тут каждые
      // ~0,9 с всплывало «ЩИТ» и моб мигал белым, и это выглядело как
      // лишние срабатывания удара по блоку.
      return false;
    }
    mob.shield = false;
    mob.pulse = null;
    mob.hurt = performance.now();
    S.flash = 0.3; S.flashColor = '#4a9fe8';
    sfx('shieldbreak');
    floatText('ЩИТ РАЗБИТ', '#4a9fe8', 0, 0, mult >= COUNTER_MULT);
    return false;
  }
  var crit = rnd() < S.stats.critChance;
  var dmg = damage(S.stats.atk, 0, mult * (crit ? 1 + S.stats.critDmg : 1));
  if (S.packResist) dmg = Math.max(1, Math.round(dmg * (1 - Math.min(MEM_CAP * MEM_STEP, S.packResist * MEM_STEP))));
  if (mob.vulnMult && mob.vulnMult > 1) dmg = Math.round(dmg * mob.vulnMult);
  mob.hp -= dmg;
  mob.hurt = performance.now();
  floatText((crit ? '✦' : '') + dmg, crit ? '#ffd27a' : '#e8eaf2', 0, 0, mult >= COUNTER_MULT);
  if (label) floatText(label, 'var(--accent)', 0, 0, true);
  if (mob.hp <= 0) { killMob(mob); return true; }
  return false;
}

function healHero(frac) {
  var amount = Math.round(S.stats.maxHp * (typeof frac === 'number' ? frac : HEAL_FRAC));
  if (amount <= 0) return;
  var before = S.hp;
  S.hp = Math.min(S.stats.maxHp, S.hp + amount);
  var gained = Math.round(S.hp - before);
  S.flash = 0.45; S.flashColor = '#5cb85c';
  sfx('heal');
  if (gained > 0) floatText('+' + gained, '#7cd88a', -1, 0, true);
  dirty.stats = true;
  // лечение героя — сияющий зелёный рюкзак
  el.bagBtn.classList.remove('healed'); void el.bagBtn.offsetWidth; el.bagBtn.classList.add('healed');
  clearTimeout(healHero._t);
  healHero._t = setTimeout(function () { el.bagBtn.classList.remove('healed'); }, 1100);
}

// Промах по пульсу щита: моб злится — крепчает и показывает это внешне
// (у вожака прибавляется корона, у рядового — краснеет).
function enrageMob(mob) {
  mob.rage = Math.min(RAGE_CAP, (mob.rage || 0) + 1);
  S.flash = 0.4; S.flashColor = '#ff4d34';
  sfx('enrage');
  floatText('ЗЛИТСЯ', '#ff6a4d', 0, 0, false);
}

function mobAtk(mob) { return mob.atk * (1 + TUNE.rageStep * (mob.rage || 0)) * chiefAtkMult(mob); }

function bossMob() {
  for (var i = 0; i < S.pack.length; i++) if (S.pack[i].leader) return S.pack[i];
  return null;
}

// Вожак набрал максимум усилений раньше, чем игрок дошёл до него как до
// фронтального таргета — он прячется в конец и сбегает вместе со всей
// стаей на следующей, как обычный «убежавший» моб (кормит нюх на резисты).
function checkBossFlee(leader, now) {
  if (leader.rage >= BOSS_FLEE_RAGE && !leader.noFlee && leader !== front()) {
    // Помечаем, что сбежал именно вожак — следующая стая обязана снова
    // получить лидера (иначе «появляется в следующей стае» превращалось бы
    // в пустые слова: без этого флага он мог сбежать в стаю без вожака вовсе).
    S.bossFled = true;
    fleeWounded(leader, now);
  }
}

// Стак злости на боса напрямую, в обход конкретного моба — источник любой
// промах по щиту в стае, не только промах самого вожака.
function enrageBoss(now) {
  var leader = bossMob();
  if (!leader) return;
  leader.rage = Math.min(RAGE_CAP, (leader.rage || 0) + 1);
  S.flash = 0.35; S.flashColor = '#ff4d34';
  sfx('enrage');
  checkBossFlee(leader, now);
}

// Пульс щита не поймали вовремя (или вообще не тронули) — щит остаётся,
// моб злится, и пульс запускается заново. Промах по щиту ЛЮБОГО рядового
// моба в стае дополнительно усиливает боса глобально; если промахнулся сам
// вожак — это и есть его собственный стак, второй раз считать не нужно.
function missShieldPulse(mob, now) {
  comboBreak();
  enrageMob(mob);
  mob.pulse = { start: now, hitAt: now + dur(PULSE_LEAD) };
  if (mob.leader) checkBossFlee(mob, now);
  else enrageBoss(now);
}

// Зелёный Хилер: обратный пульс, который лечит случайного союзника в стае,
// если его не прервать ударом в то же окно, что обычно разбивает щит.
function interruptHeal(mob, now) {
  mob.healPulse = null;
  mob.healEndAt = performance.now();
  mob.hurt = now;
  S.flash = 0.25; S.flashColor = '#3fdcc4';
  sfx('shieldbreak');
  floatText('ПРЕРВАНО', '#7cd88a', 0, 0, false);
  // Сорвал лечение — перехватил его: лечится сам герой по той же шкале,
  // что и хилер (чем меньше у героя здоровья, тем больше: 10% → +50%, 70% → +10%).
  healHero(healFracFor(S.hp / S.stats.maxHp));
}

function resolveHeal(mob, now) {
  var hp = mob.healPulse;
  comboHealMissed(hp);             // каст не прервали, хотя могли
  mob.healPulse = null;
  mob.healEndAt = performance.now();
  mob.healFlashAt = performance.now();   // яркая вспышка сферы посоха в момент лечения
  // Лечит ту цель, на которую начал каст (это был тот, кто стоял впереди).
  var target = hp && hp.target ? hp.target : front();
  if (target && target.hp > 0 && S.pack.indexOf(target) >= 0) {
    var amount = Math.round(target.maxHp * healFracFor(target.hp / target.maxHp));
    target.hp = Math.min(target.maxHp, target.hp + amount);
    target.healedAt = performance.now();   // лёгкое зелёное свечение на вылеченном
    floatText('+' + amount, '#7cd88a', 0, 0, false);
  }
  S.flash = 0.3; S.flashColor = '#5cb85c';
  sfx('heal');
}

function killMob(mob) {
  var i = S.pack.indexOf(mob);
  if (i < 0) return;
  S.pack.splice(i, 1);
  // Если этот моб кого-то прикрывал — подопечный спасён, прикрытие снято.
  if (mob.guarding) { mob.guarding.guardedBy = null; mob.guarding.retreatDeadline = 0; mob.guarding = null; }
  if (mob.guardedBy) { mob.guardedBy.guarding = null; mob.guardedBy = null; }
  // Умер тот, чья контратака ещё не потрачена, — окно контратаки не
  // переходит на следующего моба «бесплатно», гасим его.
  if (S.counterMob === mob) { S.counterUntil = 0; S.counterMob = null; }
  S.kills++;
  if (mob.chief) { pushInfo({ kind: 'chief', biome: BIOME.pack || 0 }); markSave(); }
  grantXp(comboXp(mob.xp));        // серия даёт бонус к опыту
  dropFrom(mob);
  if (S.telegraph && S.telegraph.mob === mob) S.telegraph = null;
  if (!S.pack.length && S.phase === 'fight') {   // герой уже пал — стая не зачтена
    S.phase = 'walk';
    S.phaseUntil = performance.now() + dur(ri(900, 1500));
    if (TUNE.adapt) { S.progress++; S.deathStreak = 0; }   // стая зачищена — шаг вперёд по чекпоинтам
    comboPackEnd();
    markSave();
  }
}

function heroDies(now) {
  if (S.phase === 'dead') return;  // второй смертельный удар в том же кадре
  if (S.tut) {                     // в обучении не умирают: остаётся 1 HP
    S.hp = 1;
    floatText('в обучении не умирают', '#8a90a6', 0, 0, false);
    return;
  }
  S.phase = 'dead';
  S.phaseUntil = Infinity;         // ждёт «Дальше» в кадре смерти
  S.tm.deaths++;
  S.deathStreak++;
  comboBreak();
  comboPackEnd();
  S.telegraph = null;
  S.shake = 1;
  sfx('death');
  floatText('пал', 'var(--telegraph)', 0, 0, true);
  // В авто-режиме смерть рюкзак не забирает, а кадр смерти закроется сам.
  var lost = AUTO.on ? -1 : loseUnequippedLoot();
  if (AUTO.on) AUTO.deathAt = now + AUTO_DEATH_MS;
  markSave();
  showDeath(lost);
}

// Кадр-прослойка после смерти: бой стоит, пока игрок не нажмёт «Дальше».
function showDeath(lost) {
  el.deathText.textContent = 'Стая ' + S.packLevel + ' уровня вас одолела. ' +
    (lost < 0 ? 'Герой был в авто-режиме — рюкзак цел.' :
     lost > 0 ? 'Потеряно ' + lost + ' ' + plural(lost, 'ненадетый предмет', 'ненадетых предмета', 'ненадетых предметов') + '.'
              : 'Рюкзак был пуст — всё надетое при вас.');
  el.deathOverlay.hidden = false;
}
function closeDeath() {
  if (S.phase !== 'dead' || el.deathOverlay.hidden) return;
  el.deathOverlay.hidden = true;
  AUTO.deathAt = 0; updateDeathNext();
  S.phaseUntil = 0;              // step сразу продолжит: вопрос или новая стая
}

// Смерть бьёт по рюкзаку: всё, что подобрали, но так и не надели, теряется.
// Держит смысл в «надеть сейчас», а не копить лут мёртвым грузом.
function loseUnequippedLoot() {
  var lost = 0;
  for (var i = S.log.length - 1; i >= 0; i--) {
    var e = S.log[i];
    if (e.item && S.gear[e.item.slot.id] !== e.item) { S.log.splice(i, 1); lost++; }
  }
  if (lost > 0) {
    pushLog({ kind: 'lost', count: lost });
    S.flash = 0.5; S.flashColor = '#ff4d34';
    sfx('lost');
  }
  return lost;
}

/* ── Вопрос после 2-й смерти подряд ─────────────────────────────── */

function showPrompt() {
  el.promptText.textContent = 'Дважды подряд не пережили эту стаю' +
    (S.resist ? ' — она запомнила ваш урон (память ×' + S.resist + ')' : '') +
    '. Сменить снаряжение или отступить туда, где мобы слабее?';
  el.promptOverlay.hidden = false;
}

function hidePrompt() { el.promptOverlay.hidden = true; }

/* ── Рюкзак: открыт — бой на паузе ──────────────────────────────── */

// Все запланированные события в S держат АБСОЛЮТНОЕ время (performance.now()).
// Пока рюкзак открыт, эти часы не трогаем; при закрытии сдвигаем их на то,
// сколько реально простояли, чтобы не получить взрыв пропущенных событий.
function shiftTimers(d) {
  S.heroSwingAt += d; S.mobSwingAt += d;
  S.guardUntil += d; S.guardCoolUntil += d; S.guardPressedAt += d;
  S.fatigueUntil += d;
  for (var gp = 0; gp < S.guardPressStamps.length; gp++) S.guardPressStamps[gp] += d;
  S.counterUntil += d; S.strikeCoolAt += d; S.phaseUntil += d;
  if (S.telegraph) { S.telegraph.start += d; S.telegraph.hitAt += d; }
  if (BIOME.banner) BIOME.banner.start += d;
  for (var i = 0; i < S.pack.length; i++) {
    var m = S.pack[i];
    if (m.staggerUntil) m.staggerUntil += d;
    if (m.retreatDeadline) m.retreatDeadline += d;
    if (m.pulse) { m.pulse.start += d; m.pulse.hitAt += d; }
    if (m.healPulse) { m.healPulse.start += d; m.healPulse.hitAt += d; }
    if (m.rangedTelegraph) { m.rangedTelegraph.start += d; m.rangedTelegraph.hitAt += d; }
    if (m.rangedSwingAt) m.rangedSwingAt += d;
    if (m.healSwingAt) m.healSwingAt += d;
  }
  for (var j = 0; j < S.floats.length; j++) S.floats[j].born += d;
  for (var k = 0; k < S.deflects.length; k++) { S.deflects[k].start += d; S.deflects[k].hitAt += d; }
  S.tm.started += d;
}

function openBackpack() {
  if (S.paused) return;
  autoTouch();
  S.paused = true;
  S.pauseStart = performance.now();
  // Открыли рюкзак — всё, что там лежит, уже увидено и больше не «новое».
  for (var i = 0; i < S.log.length; i++) if (S.log[i].item) S.log[i].seen = true;
  markSave();
  updateBagBadge();
  dirty.loot = true; dirty.gear = true;
  el.backpackOverlay.hidden = false;
}

function closeBackpack() {
  if (!S.paused) return;
  var elapsed = performance.now() - S.pauseStart;
  shiftTimers(elapsed);
  S.paused = false;
  el.backpackOverlay.hidden = true;
  autoTouch();
}

function resolvePrompt(choice, auto) {
  var now = performance.now();
  hidePrompt();
  S.deathStreak = 0;
  if (choice === 'retreat') {
    S.progress = Math.max(retreatFloor(), S.progress - 3);
    S.resist = Math.max(0, S.resist - 2);
    if (S.resist === 0) S.memLeft = 0;
    pushLog(auto ? { kind: 'retreat', progress: S.progress, auto: true } : { kind: 'retreat', progress: S.progress });
    S.tm.retreats++;
  } else {
    pushLog({ kind: 'ack' });
  }
  S.phase = 'walk';
  S.phaseUntil = now + dur(700);
  markSave();
}

function resolveCrit(now) {
  var tg = S.telegraph, mob = tg.mob;
  S.telegraph = null;
  if (!mob || mob.hp <= 0) return;

  S.tm.crits++;

  // В авто герой сам ловит часть критов — тот же блок, что и от кнопки
  // (окно контры откроется, но жать её будет некому).
  if (now < S.guardUntil || autoBlocks()) {
    // Заблокировано: урона нет, моб оглушён, открылось окно контратаки.
    S.tm.blocked++;
    if (S.guardPressedAt > tg.start) S.tm.react.push(S.guardPressedAt - tg.start);
    var perfect = now < S.guardUntil && comboPerfectBlock(tg.hitAt);
    if (now < S.guardUntil) comboHit('block', perfect);
    mob.staggerUntil = now + dur(STAGGER_MS);
    S.counterUntil = now + dur(COUNTER_MS);
    S.counterMob = mob;
    S.flash = 0.8; S.flashColor = '#3fdcc4';
    sfx('block');
    floatText(perfect ? 'ИДЕАЛЬНО' : 'БЛОК', perfect ? '#ffd27a' : '#3fdcc4', 0, 0, true);

    if (tg.first) {
      // Первый удар двойного удара главаря: блок гасит урон, но окна
      // контратаки не даёт — оно откроется после второго блока.
      mob.staggerUntil = 0; S.counterUntil = 0; S.counterMob = null;
    }
    var reflect = S.stats.blockReward;
    if (reflect > 0) hitMob(mob, reflect * 0.9);
  } else {
    S.tm.taken++;
    comboMissed(tg, false);
    var dmg = damage(mobAtk(mob), S.stats.def, CRIT_MULT);
    S.hp -= dmg;
    S.shake = 1; S.flash = 0.75; S.flashColor = '#ff4d34';
    sfx('crit');
    floatText('−' + dmg, '#ff7a63', -1, 0, true);
    if (S.hp <= 0) { S.hp = 0; heroDies(now); }
    else if (TUNE.adapt && !mob.chief && mob.hp > 0 && mob.hp / mob.maxHp < RETREAT_FRAC) {
      retreatBehindProtector(mob, now);
    }
    // Жёлтый моб: пропущенная реакция на его крит после снятия щита
    // усиливает боса дополнительно — со всеми последствиями, вплоть до побега.
    if (tg.yellowFollow) enrageBoss(now);
  }
  // Двойной удар: за первым сразу второй замах.
  if (tg.first && mob.hp > 0 && S.phase === 'fight' && S.pack.indexOf(mob) >= 0) {
    S.telegraph = { start: now, hitAt: now + dur(CHIEF_DOUBLE_GAP), mob: mob };
    sfx('telegraph');
  }
  dirty.stats = true;
}

function mobNormalHit(now, mob) {
  var dmg = damage(mobAtk(mob), S.stats.def, 1);
  S.hp -= dmg;
  floatText('−' + dmg, '#a8748a', -1, 0, false);
  if (S.hp <= 0) { S.hp = 0; heroDies(now); }
}

// Дальнобойщик: слабее ближнего боя, но бьёт по своему таймеру откуда
// угодно из пачки. Блок его отбивает; отбитый урон летит в случайного
// моба стаи (может достаться и самому дальнобойщику). Если ровно в этот
// же момент решается крит ближнего моба — блок приоритетно гасит ЕГО,
// а этот выстрел проходит так, будто блока не было.
function resolveRanged(mob, now) {
  var shot = mob.rangedTelegraph || { start: now, hitAt: now };
  var shotAt = shot.hitAt;
  mob.rangedTelegraph = null;
  var meleeClash = !!S.telegraph;
  var deflected = !meleeClash && now < S.guardUntil;
  // Авто-блок выстрел гасит, но в моба не отбивает — это заслуга кнопки.
  var absorbed = !deflected && autoBlocks();
  var enraged = (mob.rangedRage || 0) > 0;
  var dmg = damage(mobAtk(mob) * RANGED_FRAC * (enraged ? RANGED_RAGE_MULT : 1), S.stats.def, 1);
  mob.rangedRage = 0;               // яростный выстрел сделан — ярость прошла
  if (deflected) {
    var pool = S.pack.filter(function (m) { return m.hp > 0 && !m.dormant; });
    var target = pool.length ? pick(pool) : null;
    if (target) {
      // Снимок текущей позиции цели на экране — отбитый выстрел летит
      // именно туда, чтобы было видно, в кого попало.
      var ti = S.pack.indexOf(target);
      // Рикошет начинается там, где выстрел коснулся края кнопки щита.
      // Траектория — та же, что у летящего выстрела: от сферы посоха.
      var si = S.pack.indexOf(mob);
      var sp0 = si >= 0 ? orbPoint(mob, si) : { x: heroX(), y: heroY() };
      var sr = edgeReach(sp0.x, sp0.y, heroX(), heroY());
      // А летит рикошет в середину ТЕЛА моба-цели, не в ноги.
      var tb = ti >= 0 ? bodyPoint(target, ti) : { x: heroX(), y: heroY() };
      // Урон рикошета применяется, когда шар долетел (см. step) — с цифрой
      // урона и вспышкой цели, а яростный шар и летит обратно яростным.
      S.deflects.push({
        x0: sp0.x + (heroX() - sp0.x) * sr, y0: sp0.y + (heroY() - sp0.y) * sr,
        x1: tb.x, y1: tb.y,
        start: now, hitAt: now + dur(enraged ? 300 : 220),
        target: target, dmg: dmg, big: enraged, done: false
      });
    }
    S.flash = 0.4; S.flashColor = '#3fdcc4';
    sfx('block');
    var perfectShot = comboPerfectBlock(shotAt);
    floatText(perfectShot ? 'ИДЕАЛЬНО' : 'ОТБИТО', perfectShot ? '#ffd27a' : '#3fdcc4', 0, 0, false);
    comboHit('block', perfectShot);
  } else if (absorbed) {
    S.flash = 0.3; S.flashColor = '#3fdcc4';
    sfx('block');
    floatText('БЛОК', '#3fdcc4', 0, 0, false);
  } else {
    comboMissed(shot, meleeClash);
    S.hp -= dmg;
    floatText('−' + dmg, '#a8748a', -1, 0, false);
    if (!enraged) {                 // злит только пропущенный ОБЫЧНЫЙ выстрел
      mob.rangedRage = 1;
      sfx('enrage');
      floatText('СВИРЕПЕЕТ', '#ff6a4d', 0, 0, false);
    }
    if (S.hp <= 0) { S.hp = 0; heroDies(now); }
  }
}

function step(now) {
  if (S.phase === 'dead' && !el.deathOverlay.hidden) return;   // кадр смерти: всё стоит
  // Отбитые выстрелы долетели до цели — наносим урон.
  for (var dfi = 0; dfi < S.deflects.length; dfi++) {
    var dfl = S.deflects[dfi];
    if (dfl.done || now < dfl.hitAt) continue;
    dfl.done = true;
    var dtg = dfl.target;
    if (dtg && dtg.hp > 0 && S.pack.indexOf(dtg) >= 0) {
      dtg.hp -= dfl.dmg;
      dtg.hurt = performance.now();
      floatText(String(dfl.dmg), dfl.big ? '#ffb36a' : '#ffd27a', 0, 0, dfl.big);
      if (dtg.hp <= 0) killMob(dtg);
    }
  }
  if (S.phase === 'walk') {
    if (S.tut && S.tut.spawned) { tutFinish(); return; }   // стая обучения закончилась
    if (now >= S.phaseUntil) { S.phase = 'fight'; spawnPack(now); comboPackStart(); S.heroSwingAt = now + dur(250); }
    return;
  }
  if (S.phase === 'dead') {
    if (now >= S.phaseUntil) {
      S.hp = S.stats.maxHp;
      S.pack = [];
      if (TUNE.adapt && S.deathStreak >= 2 && AUTO.on) {
        resolvePrompt('retreat', true);   // в авто некому отвечать — отступаем сами
      } else if (TUNE.adapt && S.deathStreak >= 2) {
        S.phase = 'prompt';
        showPrompt();
      } else {
        S.phase = 'walk'; S.phaseUntil = now + dur(900);
      }
    }
    return;
  }
  if (S.phase === 'prompt') return;   // ждём выбора игрока в оверлее

  tutTick(now);
  if (S.paused) return;               // открылась карточка обучения

  // Прикрытие держится ограниченное время: не добили защитника — раненый сбегает.
  if (TUNE.adapt && S.pack.length) {
    for (var gi = S.pack.length - 1; gi >= 0; gi--) {
      var gm = S.pack[gi];
      if (gm.retreatDeadline && now >= gm.retreatDeadline) fleeWounded(gm, now);
    }
  }

  // Дальнобойщик действует по своему таймеру независимо от очереди фронта —
  // может выстрелить, даже стоя не первым в пачке.
  if (S.pack.length) {
    for (var ridx = 0; ridx < S.pack.length; ridx++) {
      var rm = S.pack[ridx];
      if (rm.type !== 'ranged' || rm.hp <= 0 || rm.dormant) continue;
      if (!rm.rangedTelegraph && now >= rm.rangedSwingAt) {
        rm.rangedTelegraph = { start: now, hitAt: now + dur(TUNE.rangedLead) };
        rm.castFlashAt = performance.now();   // вспышка сферы в момент выстрела
        rm.rangedSwingAt = now + dur(TUNE.rangedInterval * rr(0.8, 1.2));
        sfx('telegraph');
        if (rm.tutKey) tutShow(rm.tutKey);
      }
      if (rm.rangedTelegraph && now >= rm.rangedTelegraph.hitAt) {
        resolveRanged(rm, now);
        if (S.phase !== 'fight') return;   // выстрел добил героя — кадр боя окончен
      }
    }
    // Хилер тоже действует по своему таймеру из любого места стаи и лечит
    // того, кто впереди. Канал не начинается, если лечить некого (впереди
    // почти полное здоровье) — тогда просто ждёт следующего раза.
    var fr = S.pack[0];
    for (var hidx = 0; hidx < S.pack.length; hidx++) {
      var hm = S.pack[hidx];
      if (hm.type !== 'healer' || hm.hp <= 0 || hm.dormant) continue;
      // Хилер следит за своей целью: умерла (или ушла из стаи) — каст
      // обрывается сам, без лечения и без «перехвата» героем.
      if (hm.healPulse && hm.healPulse.target) {
        var ht = hm.healPulse.target;
        if (ht.hp <= 0 || S.pack.indexOf(ht) < 0) {
          hm.healPulse = null;
          hm.healEndAt = now;
          hm.healSwingAt = now;   // сразу переключается на нового переднего
          floatText('каст сорван', '#8a90a6', 0, 0, false);
        }
      }
      // Таймер готов — каст начинается сразу, как только впереди есть
      // кого лечить (а не ждёт следующего полного интервала).
      if (!hm.healPulse && now >= (hm.healSwingAt || 0)) {
        if (fr && fr.hp > 0 && fr.hp < fr.maxHp * 0.92) {
          hm.healSwingAt = now + dur(TUNE.healInterval * rr(0.85, 1.15));
          hm.healPulse = { start: now, hitAt: now + dur(PULSE_LEAD), target: fr };
          sfx('shield');
          floatText('ЛЕЧИТ', '#7cd88a', 0, 0, false);
          if (hm.tutKey) tutShow(hm.tutKey);
        }
      }
      // канал довели до конца, не прервав — долечивает
      if (hm.healPulse && now > hm.healPulse.hitAt + dur(pulseLateMs())) resolveHeal(hm, now);
    }
  }

  var mob = front();
  if (!mob) { S.phase = 'walk'; S.phaseUntil = now + dur(900); return; }
  if (mob.chief) chiefTick(mob, now);

  // Моб дошёл до фронта уже со щитом, но без активного пульса (жёлтый —
  // щит у него поднят с самого спавна) — запускаем отсчёт только теперь,
  // когда игрок реально может на него отреагировать.
  if (mob.shield && !mob.pulse) mob.pulse = { start: now, hitAt: now + dur(PULSE_LEAD) };

  // В авто герой сам раскалывает щит в такт с тем же шансом, что и блок:
  // иначе жёлтый со щитом стоит перед пассивным героем бесконечно.
  if (mob.shield && mob.pulse && !mob.pulse.autoTried && AUTO.on && now >= mob.pulse.hitAt) {
    mob.pulse.autoTried = true;
    if (autoBlocks()) breakShield(mob, now);
  }

  // Пульс щита не пойман вовремя — щит остаётся, моб злится, пульс заново.
  if (mob.shield && mob.pulse && now > mob.pulse.hitAt + dur(pulseLateMs())) {
    missShieldPulse(mob, now);
  }

  // Авто-атака героя — идёт сама, без участия игрока.
  if (now >= S.heroSwingAt) {
    S.heroSwingAt = now + dur(heroSwingMs());
    hitMob(mob, 1);
    mob = front();
    if (!mob || S.phase !== 'fight') return;
  }

  // Подсвеченный крит уже в полёте — ждём момента удара.
  if (S.telegraph) {
    if (now >= S.telegraph.hitAt) resolveCrit(now);
    return;
  }

  if (mob.staggerUntil > now) { S.mobSwingAt = Math.max(S.mobSwingAt, mob.staggerUntil + 200); return; }

  // Окно контратаки закрылось, а моб всё ещё жив — успешный блок не наказывается,
  // моб просто становится уязвимее к следующим ударам.
  if (mob.staggerUntil !== 0 && mob.hp > 0) {
    mob.staggerUntil = 0;
    if (TUNE.adapt) markVulnerable(mob);
    return;
  }

  if (now >= S.mobSwingAt) {
    S.mobSwingAt = now + dur(TUNE.mobRate * rr(0.85, 1.15) * chiefRateMult(mob));
    if (mob.shield || (mob.type === 'healer' && mob.healPulse)) {
      // Пока щит не разбит (или канал лечения не прерван) — моб держит его
      // и не замахивается ни на крит, ни на обычный удар. Иначе получался
      // баг: щит стоит, а моб при этом ещё и телеграфит крит поверх него.
      return;
    }
    if (mob.type === 'ranged') {
      // Дальнобойщик не участвует в обычной очереди ближнего боя — весь его
      // урон идёт отдельным таймером (см. выше), тут он просто стоит и тонет.
      return;
    }
    if (mob.type === 'healer') {
      // лечит по своему таймеру (см. выше), в ближнем бою не участвует
      return;
    }
    var canShield = !mob.noShieldNext;
    mob.noShieldNext = false;
    // Красный (обычный) моб сам в блок не встаёт — только когда прикрывает
    // раненого (см. retreatBehindProtector). Случайный щит — лишь у жёлтого.
    if (TUNE.adapt && canShield && (mob.type === 'yellow' || mob.chiefPhase === 2) && rnd() < TUNE.shieldRate) {
      mob.shield = true;
      mob.pulse = { start: now, hitAt: now + dur(PULSE_LEAD) };
      S.flash = 0.4; S.flashColor = '#4a9fe8';
      sfx('shield');
      floatText('ЩИТ', '#4a9fe8', 0, 0, false);
    } else if (rnd() < TUNE.critRate) {
      S.telegraph = { start: now, hitAt: now + dur(biomeLead() * chiefLeadMult(mob)), mob: mob };
      if (mob.type === 'bat') S.telegraph.first = true;   // летучая мышь: двойной укус
      sfx('telegraph');
    } else {
      mobNormalHit(now, mob);
    }
  }
}
