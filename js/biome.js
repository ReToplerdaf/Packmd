// Биомы: по чекпоинту — какая местность, её фон, иконка и модификатор боя.
"use strict";

/* ── Биомы ───────────────────────────────────────────────────────── */

// Один биом — TUNE.bossEvery стай подряд (по чекпоинту), последняя из них
// в будущем станет стаей главаря. После последнего биома — круг заново,
// каждый пройденный круг поднимает уровень стай на BIOME_LOOP_BONUS.
// Модификаторы: healer — прибавка к шансу хилера, lead — множитель замаха
// крита, leaderRage — сколько стаков злости у вожака с самого спавна.
var BIOMES = [
// flat — простой фон цветом (сверху, снизу), когда фоны биомов выключены (по умолчанию).
  { id: 'river',  name: 'Высохшее русло',  bg: ['#86bfe0', '#d6ecf3'], flat: ['#4f6260', '#6e5c44'], icon: '#4fa3c7' },
  { id: 'cave',   name: 'Пещера',          bg: ['#05060a', '#0c0e15'], flat: ['#0a0b0e', '#050506'], icon: '#5aa6e8', lead: 0.9, note: 'замах крита короче' },
  { id: 'city',   name: 'Пустынный город', bg: ['#7fb6de', '#f2dcaa'], flat: ['#8a3b22', '#c98a3a'], icon: '#d8a84e', healer: 0.10, note: 'хилеров больше' },
  { id: 'meteor', name: 'Метеорит',        bg: ['#080818', '#1c0e1a'], flat: ['#5e5b57', '#9a8b6e'], icon: '#e8643c', leaderRage: 1, note: 'вожак сразу зол' }
];
// Фон, когда биомы выключены, и в обучении — как было до биомов.
var BIOME_PLAIN = { id: 'plain', bg: ['#161a26', '#0b0e15'] };
var BIOME_LOOP_BONUS = 2;      // +уровень стаи за каждый пройденный круг биомов
var BIOME_BANNER_MS = 1500;    // сколько висит надпись с названием нового биома
// Биом текущей стаи (номер с начала игры; фиксируется на спавне) и надпись о смене.
var BIOME = { pack: null, banner: null };

function biomeLen() { return Math.max(1, Math.round(TUNE.bossEvery) || 10); }
// Номер биома с начала игры (0, 1, 2, …), без деления на круги.
function biomeIndexAt(progress) {
  if (!TUNE.biomes || !TUNE.adapt) return 0;
  return Math.max(0, Math.floor(progress / biomeLen()));
}
function biomeAt(progress) { return BIOMES[biomeIndexAt(progress) % BIOMES.length]; }
function biomeLoop(progress) { return Math.floor(biomeIndexAt(progress) / BIOMES.length); }
// Биом текущей стаи; до первой стаи — по чекпоинту.
function curBiome() { return BIOME.pack != null ? BIOMES[BIOME.pack % BIOMES.length] : biomeAt(S.progress); }

// Прибавка к уровню стаи от чекпоинта и пройденных кругов биомов.
function packLevelBonus() {
  if (!TUNE.adapt) return 0;
  return Math.floor(S.progress / 4) + biomeLoop(S.progress) * BIOME_LOOP_BONUS;
}
// Ниже какого чекпоинта отступление не уводит: пройденный биом закреплён.
function retreatFloor() {
  var b = biomeIndexAt(S.progress);
  return b > 0 && TUNE.biomePin ? b * biomeLen() : -4;
}

// Модификаторы боя у биомов — по тумблеру «Модификаторы биомов» (biomeMods, по
// умолчанию выключен: автор решил, что биом пока отличается только цветом).
function biomeMod(key) { return TUNE.biomes && TUNE.biomeMods ? curBiome()[key] : undefined; }
function biomeHealerRate() { return TUNE.healerRate + (biomeMod('healer') || 0); }
function biomeLead() { return TUNE.lead * (biomeMod('lead') || 1); }

// Вызывается на спавне обычной стаи: запоминает биом и объявляет смену.
function enterBiome(now) {
  var idx = biomeIndexAt(S.progress);
  var prevIdx = BIOME.pack;
  BIOME.pack = idx;
  if (!TUNE.biomes) return;
  if (prevIdx == null ? idx > 0 : prevIdx !== idx) {
    var b = BIOMES[idx % BIOMES.length], loop = Math.floor(idx / BIOMES.length);
    BIOME.banner = { name: b.name + (loop ? ' · круг ' + (loop + 1) : ''), note: TUNE.biomeMods ? b.note || '' : '', start: now };
    if (prevIdx != null) {
      pushInfo({ kind: 'biome', biome: idx });
      markSave();
    }
  }
}

/* ── Главарь ─────────────────────────────────────────────────────── */

// Последняя стая каждого биома — стая главаря: главарь и двое обычных
// мобов свиты перед ним. Главарь не сбегает и не прячется; злость и короны —
// как у вожака. Три фазы по здоровью, переход — пауза, вспышка, «ФАЗА N».
var CHIEF_HP = 4;              // здоровье главаря — во столько раз больше, чем у вожака
var CHIEF_ATK = 1.1;           // и урон
var CHIEF_XP = 5;              // опыт — ×5 от вожака
var CHIEF_SIZE = 1.4;            // вожак — 1.25
var CHIEF_ESCORT = 2;          // мобов свиты
var CHIEF_PHASE_PAUSE = 1000;  // пауза на переходе фазы
var CHIEF_LEAD = 0.85;         // фаза 1: замах крита короче
var CHIEF_RAGE_ATK = 1.25;     // фаза 3: урон
var CHIEF_RAGE_RATE = 0.8;     // фаза 3: ходы чаще
var CHIEF_DOUBLE_GAP = 1200;   // фаза 2: между ударами двойного удара (больше отката щита)
var CHIEF_MIN_RARITY = 2;      // гарантированная вещь — «Редкий» или выше (индекс в RARITY)
var CHIEF_FEINT = 0.3;         // фаза 3: доля критов, которые начинаются с ложного замаха

function isChiefPack() {
  if (!TUNE.biomes || !TUNE.adapt || !TUNE.chief || S.tut || S.progress < 0) return false;
  return S.progress % biomeLen() === biomeLen() - 1;
}
function chiefPhaseFor(m) { var f = m.hp / m.maxHp; return f > 0.66 ? 1 : (f > 0.33 ? 2 : 3); }
function chiefLeadMult(m) { return m && m.chief && m.chiefPhase === 1 ? CHIEF_LEAD : 1; }
function chiefRateMult(m) { return m && m.chief && m.chiefPhase === 3 ? CHIEF_RAGE_RATE : 1; }
function chiefAtkMult(m) { return m && m.chief && m.chiefPhase === 3 ? CHIEF_RAGE_ATK : 1; }
function chiefMob() { for (var i = 0; i < S.pack.length; i++) if (S.pack[i].chief) return S.pack[i]; return null; }

// Проверка фазы — каждый кадр боя, пока главарь впереди.
function chiefTick(m, now) {
  if (!m || !m.chief || m.hp <= 0) return;
  var ph = chiefPhaseFor(m);
  if (ph <= m.chiefPhase) return;
  m.chiefPhase = ph;
  S.telegraph = null;                                   // замах прерывается переходом
  S.mobSwingAt = Math.max(S.mobSwingAt, now + dur(CHIEF_PHASE_PAUSE));
  S.flash = 0.9; S.flashColor = '#ff4d34'; S.shake = 0.6;
  sfx('enrage');
  floatText('ФАЗА ' + ph, '#ff9130', 0, 0, true);
  if (ph === 2) {                                        // фаза 2 начинается со щита
    m.shield = true;
    m.pulse = { start: now + dur(CHIEF_PHASE_PAUSE) - dur(PULSE_LEAD), hitAt: now + dur(CHIEF_PHASE_PAUSE) };
  }
}

// Крит главаря: фаза 1 — короче замах, фаза 3 — иногда ложный замах (меч
// поднимается и раскаляется, но опускается назад; подсказки и метронома нет).
function chiefCrit(m, now) {
  if (m.chiefPhase === 3 && rnd() < CHIEF_FEINT) return { start: now, hitAt: now + dur(pace(biomeLead())), mob: m, feint: true };
  return { start: now, hitAt: now + dur(pace(biomeLead()) * chiefLeadMult(m)), mob: m };
}

// Ложный замах закончился без удара — сразу настоящий крит. Нажатая на финт
// «Защита» ушла в откат, и настоящий удар уже не поймать.
function chiefFeintEnd(tg, now) {
  var burned = S.guardPressedAt > tg.start;
  floatText(burned ? 'ФИНТ · щит сгорел' : 'ФИНТ', '#ff9130', 0, 0, false);
  if (burned) comboBreak();
  if (!tg.mob || tg.mob.hp <= 0 || S.phase !== 'fight' || S.pack.indexOf(tg.mob) < 0) return;
  S.telegraph = { start: now, hitAt: now + dur(pace(biomeLead())), mob: tg.mob };
  sfx('telegraph');
}

// Первая встреча — карточка в стиле обучения (та же панель и та же пауза).
// В авто карточку некому закрыть — покажем, когда игрок вернётся.
function chiefIntroDue(m) { return m && m.chief && !S.chiefSeen && !AUTO.on && !S.tut; }
function chiefIntro() {
  S.chiefSeen = true;
  markSave();
  el.tutStep.textContent = 'НОВЫЙ ВРАГ';
  el.tutOverlay.classList.remove('tut-top');
  el.tutH.textContent = 'Главарь';
  el.tutText.innerHTML = 'Последняя стая каждого биома — главарь со свитой. Он не сбегает, злится как вожак, а по здоровью меняет приёмы (полоса вверху).<ul>' +
     '<li><b>Фаза 1.</b> Бьёт как обычный моб, но замах короче.</li>' +
     '<li><b>Фаза 2.</b> Встаёт в щит: раскалывайте <b>Атакой</b> в такт. После раскола — <b>двойной удар</b>, блокируйте оба. Контра — после второго.</li>' +
     '<li><b>Фаза 3.</b> Ярость: бьёт сильнее и чаще, иногда замахивается ложно. Кнопка щита на ложный замах не светится — нажмёте, и щит сгорит.</li></ul>';
  el.tutSkip.hidden = true;
  el.tutOk.textContent = 'В бой';
  if (!S.paused) { S.paused = true; S.pauseStart = performance.now(); }
  S.tutPaused = true;
  el.tutOverlay.hidden = false;
}
