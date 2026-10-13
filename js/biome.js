// Биомы: по чекпоинту — какая местность, её фон, иконка и модификатор боя.
"use strict";

/* ── Биомы ───────────────────────────────────────────────────────── */

// Один биом — TUNE.bossEvery стай подряд (по чекпоинту), последняя из них
// в будущем станет стаей главаря. После последнего биома — круг заново,
// каждый пройденный круг поднимает уровень стай на BIOME_LOOP_BONUS.
// Модификаторы: healer — прибавка к шансу хилера, lead — множитель замаха
// крита, leaderRage — сколько стаков злости у вожака с самого спавна.
var BIOMES = [
  { id: 'river',  name: 'Русло реки',      bg: ['#86bfe0', '#d6ecf3'], icon: '#4fa3c7', mob: 'fish' },
  { id: 'cave',   name: 'Пещера',          bg: ['#05060a', '#0c0e15'], icon: '#5aa6e8', lead: 0.9, note: 'замах крита короче', mob: 'bat' },
  { id: 'city',   name: 'Пустынный город', bg: ['#7fb6de', '#f2dcaa'], icon: '#d8a84e', healer: 0.10, note: 'хилеров больше', mob: 'snake' },
  { id: 'meteor', name: 'Метеорит',        bg: ['#080818', '#1c0e1a'], icon: '#e8643c', leaderRage: 1, note: 'вожак сразу зол', mob: 'golem' }
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

// Мобы биомов. Обычный (красный) моб с шансом TUNE.biomeMobRate заменяется
// мобом биома: своим или уже пройденных биомов (у тех вес BIOME_MOB_OLD),
// чтобы разнообразие копилось.
var BIOME_MOB_OLD = 0.4;
// Здоровье и урон мобов биомов относительно красного.
var BIOME_MOB_STATS = { fish: { hp: 0.8, atk: 0.8 }, bat: { hp: 0.8, atk: 0.8 }, snake: { hp: 0.9, atk: 0.9 }, golem: { hp: 1.6, atk: 1 } };
function biomeMobType(type) {
  if (!TUNE.biomes || !TUNE.adapt || type !== 'normal') return type;
  var idx = biomeIndexAt(S.progress), pool = [], total = 0;
  for (var b = 0; b < BIOMES.length; b++) {
    if (!BIOMES[b].mob || b > idx) continue;      // биом ещё не открыт (на втором круге открыты все)
    var w = b === idx % BIOMES.length ? 1 : BIOME_MOB_OLD;
    pool.push({ type: BIOMES[b].mob, w: w }); total += w;
  }
  if (!pool.length || rnd() >= TUNE.biomeMobRate) return type;
  var r = rnd() * total;
  for (var i = 0; i < pool.length; i++) { if (r < pool[i].w) return pool[i].type; r -= pool[i].w; }
  return pool[pool.length - 1].type;
}

function biomeHealerRate() { return TUNE.healerRate + (TUNE.biomes ? curBiome().healer || 0 : 0); }
function biomeLead() { return TUNE.lead * (TUNE.biomes ? curBiome().lead || 1 : 1); }

// Вызывается на спавне обычной стаи: запоминает биом и объявляет смену.
function enterBiome(now) {
  var idx = biomeIndexAt(S.progress);
  var prevIdx = BIOME.pack;
  BIOME.pack = idx;
  if (!TUNE.biomes) return;
  if (prevIdx == null ? idx > 0 : prevIdx !== idx) {
    var b = BIOMES[idx % BIOMES.length], loop = Math.floor(idx / BIOMES.length);
    BIOME.banner = { name: b.name + (loop ? ' · круг ' + (loop + 1) : ''), note: b.note || '', start: now };
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
var CHIEF_HP = 2.5;            // здоровье главаря — во столько раз больше, чем у вожака
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
