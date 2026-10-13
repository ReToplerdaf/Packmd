// Биомы: по чекпоинту — какая местность, её фон, иконка и модификатор боя.
"use strict";

/* ── Биомы ───────────────────────────────────────────────────────── */

// Один биом — TUNE.bossEvery стай подряд (по чекпоинту), последняя из них
// в будущем станет стаей главаря. После последнего биома — круг заново,
// каждый пройденный круг поднимает уровень стай на BIOME_LOOP_BONUS.
// Модификаторы: healer — прибавка к шансу хилера, lead — множитель замаха
// крита, leaderRage — сколько стаков злости у вожака с самого спавна.
var BIOMES = [
  { id: 'waste',   name: 'Пустошь',  bg: ['#161a26', '#0b0e15'], icon: '#6b7aa8' },
  { id: 'thicket', name: 'Чаща',     bg: ['#14211b', '#08100c'], icon: '#5fb072', healer: 0.10, note: 'хилеров больше' },
  { id: 'caves',   name: 'Пещеры',   bg: ['#0e1016', '#040508'], icon: '#5aa6e8', lead: 0.9, note: 'замах крита короче' },
  { id: 'ash',     name: 'Пепелище', bg: ['#2a1416', '#110808'], icon: '#e8643c', leaderRage: 1, note: 'вожак сразу зол' }
];
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
