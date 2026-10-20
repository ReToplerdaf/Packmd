// Обучение: особая стая и карточки про мобов.
"use strict";

/* ── Обучение ────────────────────────────────────────────────────── */

// Режим обучения: одна особая стая из всех видов мобов. Когда новый вид
// выходит вперёд (а дальник и хилер — когда впервые начинают действовать),
// бой встаёт на паузу и показывается карточка с объяснением.
// Дальник и хилер «спят», пока до них не дошла очередь в сценарии, чтобы
// объяснения шли по одному, а не все сразу. Летучая мышь налёта прилетает,
// когда вперёд выходит третий обычный (если налёт мышей включён).
var TUT_KEY = 'arena.tutorial.done';
var TUT_ORDER = ['normal', 'yellow', 'ranged', 'bat', 'healer', 'leader'];
function tutTotal() { return TUT_ORDER.length - (TUNE.bats ? 0 : 1); }
var TUT_TIPS = {
  normal: { h: 'Обычный моб',
    p: 'Бой идёт сам: герой бьёт переднего моба. Вы вмешиваетесь двумя кнопками.<ul>' +
       '<li>Меч моба поднимается и краснеет, кнопка щита светится <b>красным</b> — жмите <b>Защиту</b> в момент удара. Крит заблокирован, моб оглушён.</li>' +
       '<li>Сразу после блока кнопка меча светится <b>золотым</b> — жмите <b>Атаку</b>: контратака ×3. Добили ею — герой лечится.</li>' +
       '<li>Пропущенный крит бьёт ×2.5. Раненый моб может спрятаться за соседа и сбежать.</li></ul>' },
  yellow: { h: 'Жёлтый моб со щитом',
    p: 'Щит поднят с самого начала и пульсирует.<ul>' +
       '<li>Жмите <b>Атаку</b> в такт пульсу (кнопка меча светится золотым) — щит раскалывается.</li>' +
       '<li>Сразу после раскола моб быстро бьёт критом — успейте нажать <b>Защиту</b>.</li>' +
       '<li>Атака мимо такта злит моба и вожака.</li></ul>' },
  ranged: { h: 'Дальник',
    p: 'Стреляет из глубины стаи красным шаром по таймеру.<ul>' +
       '<li>Жмите <b>Защиту</b>, когда шар долетает до щита: он отлетит обратно в случайного моба.</li>' +
       '<li>Пропущенный выстрел злит дальника: следующий шар намного сильнее.</li></ul>' },
  bat: { h: 'Налёт',
    p: 'Налетает посреди боя и садится у одной из кнопок.<ul>' +
       '<li>Перелетает от кнопки к кнопке. Когда мышь остановилась и стала <b>красной</b> — коснитесь её пальцем, и налёт сбит. Не успели — ждите, пока покраснеет снова.</li>' +
       '<li>Урона не наносит. Пока мышь сидит у кнопки, эта кнопка <b>не работает</b> и темнеет.</li></ul>' },
  healer: { h: 'Хилер',
    p: 'Лечит переднего моба: чем сильнее тот ранен, тем больше лечит.<ul>' +
       '<li>Пока хилер поднял посох и дрожит — жмите <b>Атаку</b>: лечение прервано и достаётся герою.</li>' +
       '<li>Умирает с одного удара.</li></ul>' },
  leader: { h: 'Вожак',
    p: 'Крупный красный моб, есть в каждой стае из 3 и больше.<ul>' +
       '<li>Каждый промах по щиту жёлтого даёт ему корону злости: +50% урона.</li>' +
       '<li>С тремя коронами вожак, пока он не впереди, сбегает и вернётся злым в следующей стае.</li>' +
       '<li>Дерётся как обычный моб: блок крита, потом контратака.</li></ul>' },
  done: { h: 'Обучение пройдено',
    p: 'Вы встретили всех мобов. Дальше обычная игра.<br>Точные нажатия копят <b>серию</b> (счётчик под «стаей»): с 5 подряд опыт ×1.1, с 15 — ×1.25, с 30 — ×1.5. Нажатие ровно на щелчок — «идеально», +2. Пропущенный удар или промах серию сбрасывает.<br>Пройти обучение снова: Рюкзак → Настройка.' }
};

// Пройдено, если стоит флаг или уже есть сохранение (оно появляется только
// после обучения — «стая 0» пройдена).
function tutDone() { if (CIRCLE_MODE) return true; try { return !!(localStorage.getItem(TUT_KEY) || localStorage.getItem('arena.save')); } catch (e) { return true; } }
function tutMarkDone() { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }

function tutMob(type, leader, ms) {
  var m = {
    maxHp: ms.maxHp, hp: ms.maxHp, atk: ms.atk, xp: ms.xp,
    leader: leader, staggerUntil: 0, hurt: 0,
    wob: rnd() * 6.28, size: leader ? 1.25 : rr(0.85, 1.05),
    shield: type === 'yellow', pulse: null, rage: 0, vulnMult: 1, guarding: null, guardedBy: null, retreatDeadline: 0,
    type: type, healPulse: null, rangedTelegraph: null, rangedSwingAt: 0,
    tutKey: leader ? 'leader' : type
  };
  if (type === 'ranged' || type === 'healer') { m.maxHp = 1; m.hp = 1; m.dormant = true; }
  if (leader) m.noFlee = true;     // в обучении вожак должен дойти до фронта
  return m;
}

// Стая обучения: обычный → жёлтый → обычный (будит дальника) → обычный
// (зовёт мышь) → вожак (будит хилера), за ними дальник и хилер.
function spawnTutorialPack(now) {
  S.tut.spawned = true;
  S.packLevel = S.level;
  S.packResist = 0;                // память стаи в обучении не действует и не тратится
  var reg = function () { return mobStats(S.packLevel, false); };
  var n2 = tutMob('normal', false, reg());
  var ld = tutMob('normal', true, mobStats(S.packLevel, true));
  n2.tutKey = null; n2.tutWake = 'ranged';
  ld.tutWake = 'healer';
  var mid = [n2];
  if (TUNE.bats) {
    var n3 = tutMob('normal', false, reg());
    n3.tutKey = null; n3.tutWake = 'bat';
    mid.push(n3);
  }
  S.pack = [tutMob('normal', false, reg()), tutMob('yellow', false, reg())].concat(mid, [ld,
            tutMob('ranged', false, reg()), tutMob('healer', false, reg())]);
  S.mobSwingAt = now + dur(TUNE.mobRate * 0.7);
  S.telegraph = null;
}

function startTutorial() {
  S.tut = { spawned: false, shown: {}, step: 0 };
  S.pack = []; S.telegraph = null; S.deflects = [];
  S.counterUntil = 0; S.counterMob = null;
  el.deathOverlay.hidden = true;
  if (S.phase !== 'prompt') { S.phase = 'walk'; S.phaseUntil = performance.now() + dur(500); }
}

function tutShow(key) {
  if (!S.tut || S.tut.shown[key]) return;
  S.tut.shown[key] = true;
  var tip = TUT_TIPS[key];
  if (key !== 'done') S.tut.step++;
  el.tutStep.textContent = key === 'done' ? 'ОБУЧЕНИЕ' : 'ОБУЧЕНИЕ · ' + S.tut.step + ' / ' + tutTotal();
  el.tutOverlay.classList.toggle('tut-top', key === 'bat');
  el.tutH.textContent = tip.h;
  el.tutText.innerHTML = tip.p;
  el.tutSkip.hidden = key === 'done';
  el.tutOk.textContent = key === 'done' ? 'В бой' : 'Понятно';
  if (!S.paused) { S.paused = true; S.pauseStart = performance.now(); }
  S.tutPaused = true;
  el.tutOverlay.hidden = false;
}

function tutClose() {
  if (!S.tutPaused) return;
  S.tutPaused = false;
  el.tutOverlay.hidden = true;
  shiftTimers(performance.now() - S.pauseStart);
  S.paused = false;
  if (S.tut && S.tut.finished) S.tut = null;
}

function tutFinish() {
  S.tut.finished = true;
  tutMarkDone();
  markSave();
  tutShow('done');
}

function tutSkip() {
  tutMarkDone();
  if (S.tut) {
    // спящие дальник и хилер просыпаются — дальше обычный бой
    for (var i = 0; i < S.pack.length; i++) if (S.pack[i].dormant) { S.pack[i].dormant = false; S.pack[i].healSwingAt = 0; }
  }
  S.tut = null;
  markSave();
  tutClose();
}

// Будим спящих, когда вперёд вышел «будильник», и показываем карточку
// виду, который впервые вышел вперёд.
function tutTick(now) {
  if (!S.tut || !S.tut.spawned) return;
  if (!S.pack.length) { tutFinish(); return; }
  // Мышь обучения: карточка — когда она села у кнопки; сбили — больше не прилетает.
  if (S.tut.bat) {
    if (CIRCLE.mob && !CIRCLE.hop) { tutShow('bat'); if (S.tutPaused) return; }
    else if (!CIRCLE.mob && S.tut.shown.bat) S.tut.bat = false;
  }
  var fr = S.pack[0];
  if (fr.tutWake === 'bat') {
    S.tut.bat = true; RAID.at = now + dur(600);
    fr.tutWake = null;
  }
  if (fr.tutWake) {
    for (var i = 0; i < S.pack.length; i++) {
      var m = S.pack[i];
      if (m.dormant && m.type === fr.tutWake) {
        m.dormant = false;
        if (m.type === 'ranged') m.rangedSwingAt = now + dur(600);
        else m.healSwingAt = now;
      }
    }
    fr.tutWake = null;
  }
  if (fr.dormant) fr.dormant = false;
  if (fr.tutKey) tutShow(fr.tutKey);
}
