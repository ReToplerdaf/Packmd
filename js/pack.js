// Стая: типы мобов, появление стаи, передний моб, активный хилер.
"use strict";

/* ── Стая ────────────────────────────────────────────────────────── */

// Три новых типа рядовых мобов — только идея, но чтобы её можно было
// пощупать, они уже роллятся здесь. Вожак всегда обычный: он должен
// оставаться главной целью, а не превращаться в ещё один спецтип.
var MAX_HEALERS = 2;           // больше двух хилеров в одной стае не бывает
function rollMobType(noHealer) {
  // без хилера — бросаем только по «остальной» части шкалы, пропорции
  // жёлтых/дальников/обычных сохраняются
  var hr = biomeHealerRate();
  var r = noHealer ? hr + rnd() * Math.max(0, 1 - hr) : rnd();
  if (r < hr) return 'healer';
  r -= hr;
  if (r < TUNE.yellowRate) return 'yellow';
  r -= TUNE.yellowRate;
  if (r < TUNE.rangedRate) return 'ranged';
  return 'normal';
}

function spawnPack(now) {
  if (S.tut && !S.tut.spawned) { spawnTutorialPack(now); return; }
  savePackStart();                 // сохранение на переходе к новой стае
  enterBiome(now);
  var packMin = Math.max(2, TUNE.packMin || 2), packMax = Math.max(packMin, TUNE.packMax || 4);
  var n = ri(packMin, packMax);
  var progBonus = packLevelBonus();
  S.packLevel = Math.max(1, Math.min(S.level + 6, S.level + ri(-1, 1) + progBonus));
  // Память забывается медленно: одна и та же память действует MEM_PACKS
  // стай подряд и только потом уменьшается на 1 (и отсчёт идёт заново).
  if (TUNE.adapt) {
    if (S.resist > 0 && S.memLeft <= 0) {
      S.resist -= 1;
      S.memLeft = S.resist > 0 ? MEM_PACKS : 0;
    }
    S.packResist = S.resist;
    if (S.resist > 0) S.memLeft -= 1;           // эта стая расходует одну «порцию»
  } else {
    S.packResist = 0;
  }

  if (isChiefPack()) { spawnChiefPack(now); return; }

  // Если вожак только что сбежал, он гарантированно «появляется в
  // следующей стае» — без этого лидер мог укатиться в стаю, где n<3,
  // и просто исчезнуть из игры, что и было замечено при тесте.
  var hasLeader = n >= 3 || S.bossFled;
  if (S.bossFled && n < 3) n = 3;
  var bossReturns = S.bossFled;
  S.bossFled = false;
  var regularCount = hasLeader ? n - 1 : n;
  var regulars = [], healers = 0;
  for (var i = 0; i < regularCount; i++) {
    var ms = mobStats(S.packLevel, false);
    var type = rollMobType(healers >= MAX_HEALERS);
    if (type === 'healer') healers++;
    var m = {
      maxHp: ms.maxHp, hp: ms.maxHp, atk: ms.atk, xp: ms.xp,
      leader: false, staggerUntil: 0, hurt: 0,
      wob: rnd() * 6.28, size: rr(0.85, 1.05),
      shield: false, pulse: null, rage: 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
      type: type, healPulse: null, rangedTelegraph: null, rangedSwingAt: 0
    };
    if (type === 'ranged' || type === 'healer') {
      // Ни дальнобойщик, ни Хилер не дерутся в ближнем бою и не должны
      // путаться под ногами — оба гибнут от любого касания, хоть авто-атаки,
      // хоть контры, хоть отражённого блоком выстрела.
      m.maxHp = 1; m.hp = 1;
    }
    if (type === 'ranged') m.rangedSwingAt = now + dur(TUNE.rangedInterval * rr(0.6, 1.3));
    if (type === 'healer') m.healSwingAt = now;   // готов сразу: первый каст — как только переднего ранят
    if (type === 'yellow') {
      // Жёлтый моб держит щит с самого начала, а не по случайному роллу —
      // это его фирменная черта, должна быть видна сразу, ещё в очереди.
      // Сам отсчёт пульса запускаем позже, когда он реально станет
      // фронтальной целью (см. step()) — иначе таймер истечёт, пока моб
      // просто стоит в очереди, и первый же ход окажется промахом.
      m.shield = true;
    }
    regulars.push(m);
  }

  // Дальнобойщика и Хилера прячем не просто в хвост, а ЗА вожака — они
  // держатся позади всей стаи, включая лидера, и вступают в игру, только
  // когда до них дошла очередь (или пока живы за счёт своего таймера).
  var backline = [], frontline = [];
  for (var bi = 0; bi < regulars.length; bi++) {
    var rm0 = regulars[bi];
    (rm0.type === 'ranged' || rm0.type === 'healer' ? backline : frontline).push(rm0);
  }
  S.pack = frontline.slice();

  if (hasLeader) {
    var lms = mobStats(S.packLevel, true);
    S.pack.push({
      maxHp: lms.maxHp, hp: lms.maxHp, atk: lms.atk, xp: lms.xp,
      leader: true, staggerUntil: 0, hurt: 0,
      wob: rnd() * 6.28, size: 1.25,
      shield: false, pulse: null, rage: 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
      type: 'normal', healPulse: null, rangedTelegraph: null, rangedSwingAt: 0
    });
    if (bossReturns) {
      // Сбежавший вожак возвращается в этой стае сразу злым — с теми же
      // 3 коронами, — но второй раз уже не сбегает: дерётся до конца.
      var lb = S.pack[S.pack.length - 1];
      lb.rage = BOSS_FLEE_RAGE; lb.noFlee = true;
    } else if (TUNE.biomes && curBiome().leaderRage) {
      S.pack[S.pack.length - 1].rage = curBiome().leaderRage;   // Метеорит: вожак сразу зол
    }
  }

  S.pack = S.pack.concat(backline);

  S.mobSwingAt = now + dur(TUNE.mobRate * 0.7);
  S.telegraph = null;
}

// Стая главаря: свита из обычных мобов впереди, главарь последним.
// Сбежавший вожак ждёт следующей обычной стаи (S.bossFled не трогаем).
function spawnChiefPack(now) {
  S.pack = [];
  for (var i = 0; i < CHIEF_ESCORT; i++) {
    var ms = mobStats(S.packLevel, false);
    S.pack.push({
      maxHp: ms.maxHp, hp: ms.maxHp, atk: ms.atk, xp: ms.xp,
      leader: false, staggerUntil: 0, hurt: 0,
      wob: rnd() * 6.28, size: rr(0.85, 1.05),
      shield: false, pulse: null, rage: 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
      type: 'normal', healPulse: null, rangedTelegraph: null, rangedSwingAt: 0
    });
  }
  var cs = mobStats(S.packLevel, true);
  var chp = Math.round(cs.maxHp * CHIEF_HP);
  S.pack.push({
    maxHp: chp, hp: chp, atk: Math.round(cs.atk * CHIEF_ATK), xp: Math.round(cs.xp * CHIEF_XP),
    leader: true, chief: true, chiefPhase: 1, noFlee: true, staggerUntil: 0, hurt: 0,
    wob: rnd() * 6.28, size: CHIEF_SIZE,
    shield: false, pulse: null, rage: curBiome().leaderRage || 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
    type: 'normal', healPulse: null, rangedTelegraph: null, rangedSwingAt: 0
  });
  BIOME.banner = { name: 'Главарь', note: curBiome().name, start: now };
  sfx('enrage');
  S.mobSwingAt = now + dur(TUNE.mobRate * 0.7);
  S.telegraph = null;
}

function front() { return S.pack.length ? S.pack[0] : null; }
// Хилер, у которого сейчас идёт канал (ближайший к срабатыванию).
function activeHealer() {
  var best = null;
  for (var i = 0; i < S.pack.length; i++) {
    var m = S.pack[i];
    if (m.type === 'healer' && m.healPulse && m.hp > 0 && (!best || m.healPulse.hitAt < best.healPulse.hitAt)) best = m;
  }
  return best;
}
