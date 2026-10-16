// Рюкзак: журнал лута, сравнение, снаряжение, статистика.
"use strict";

function fmtRoll(r) {
  var v, rg;
  if (r.kind === 'pct')       { v = '+' + r.value + '%';                       rg = Math.round(r.lo) + '–' + Math.round(r.hi) + '%'; }
  else if (r.kind === 'pctf') { v = '+' + (r.value * 100).toFixed(1) + '%';    rg = (r.lo * 100).toFixed(1) + '–' + (r.hi * 100).toFixed(1) + '%'; }
  else if (r.kind === 'ms')   { v = '+' + r.value + ' мс';                     rg = Math.round(r.lo) + '–' + Math.round(r.hi); }
  else                        { v = '+' + r.value;                             rg = Math.round(r.lo) + '–' + Math.round(r.hi); }
  return '<div class="af' + (r.signature ? ' sig' : '') + '"><b>' + v + '</b> ' + r.label +
         ' <span class="range">(' + rg + ')</span></div>';
}

// Рюкзак мигает, пока в нём есть хоть один ещё не увиденный предмет.
// Счётчика больше нет — только сам факт «есть новое».
function updateBagBadge() {
  var hasNew = false;
  for (var i = 0; i < S.log.length; i++) {
    var e = S.log[i];
    if (e.item && !e.seen) { hasNew = true; break; }
  }
  el.bagBadge.textContent = '';
  el.bagBtn.classList.toggle('lit', hasNew);
}

// Верхняя карточка рюкзака. Без выбора — основные характеристики героя.
// Выбран предмет — то, что сейчас надето в его ячейку (или «пусто»),
// чтобы сравнить с выбранным прямо под ним.
function topCardHtml() {
  var it = S.selItem;
  if (it && !S.log.some(function (e) { return e.item === it; })) { S.selItem = it = null; }
  if (!it) {
    var st = S.stats;
    var rows = [
      ['Атака', Math.round(st.atk)],
      ['Защита', Math.round(st.def)],
      ['Здоровье', Math.round(st.maxHp)],
      ['Шанс крита', (st.critChance * 100).toFixed(1) + '%'],
      ['Урон крита', '+' + Math.round(st.critDmg * 100) + '%'],
      ['Скорость атаки', '+' + Math.round(st.atkSpeed * 100) + '%'],
      ['Окно блока', guardWindow() + ' мс']
    ];
    var cells = '';
    for (var r = 0; r < rows.length; r++) {
      cells += '<div class="tc-stat"><span>' + rows[r][0] + '</span><b>' + rows[r][1] + '</b></div>';
    }
    return '<div class="top-card"><div class="tc-head">Персонаж · ур ' + S.level +
           '<span class="tc-hint">тап по предмету — сравнить</span></div>' +
           '<div class="tc-grid">' + cells + '</div></div>';
  }
  var on = S.gear[it.slot.id];
  var head = '<div class="tc-head">Надето · ' + it.slot.name +
             '<span class="tc-hint">тап — снять выбор</span></div>';
  if (!on) {
    return '<div class="top-card" data-unsel="1">' + head + '<div class="tc-empty">пусто</div></div>';
  }
  var af = '';
  for (var j = 0; j < on.rolls.length; j++) af += fmtRoll(on.rolls[j]);
  var same = on === it ? ' <span class="tc-hint">— это он</span>' : '';
  return '<div class="top-card" data-unsel="1" style="--rc:' + on.rarity.css + '">' + head +
         '<div class="nm">' + on.name + same + '</div>' +
         '<div class="slot">' + on.slot.name + ' · ур ' + on.ilvl + ' · ' + on.rarity.name + '</div>' +
         '<div class="affixes">' + af + '</div></div>';
}

// Вкладка «Инфо»: уровни, побеги, отступления, потери — всё, что не вещь.
function renderInfo() {
  if (!el.info) return;
  if (!S.info.length) { el.info.innerHTML = '<div class="gear-empty">Пока ничего не случилось.</div>'; return; }
  var html = '';
  for (var i = 0; i < S.info.length; i++) {
    var e = S.info[i];
    if (e.kind === 'level') {
      html += '<div class="drop" style="--rc:var(--accent)"><div class="rail"></div>' +
              '<div><div class="nm">Уровень ' + e.level + '</div>' +
              '<div class="slot">характеристики подняты сами</div></div>' +
              '<div class="verdict off">авто</div></div>';
      continue;
    }
    if (e.kind === 'flee') {
      html += '<div class="drop" style="--rc:var(--guard)"><div class="rail"></div>' +
              '<div><div class="nm">Раненый сбежал</div>' +
              '<div class="slot">защитника не добили вовремя — память ×' + e.resist + '</div></div>' +
              '<div class="verdict off">адаптация</div></div>';
      continue;
    }
    if (e.kind === 'retreat') {
      html += '<div class="drop" style="--rc:var(--ink-dim)"><div class="rail"></div>' +
              '<div><div class="nm">' + (e.auto ? 'Авто: отступили к чекпоинту' : 'Отступили к чекпоинту') + '</div>' +
              '<div class="slot">чекпоинт ' + e.progress + ' · дальше будет легче</div></div>' +
              '<div class="verdict off">' + (e.auto ? 'авто' : 'решение') + '</div></div>';
      continue;
    }
    if (e.kind === 'biome') {
      var bm = BIOMES[e.biome % BIOMES.length], bl = Math.floor(e.biome / BIOMES.length);
      html += '<div class="drop" style="--rc:' + bm.icon + '"><div class="rail"></div>' +
              '<div><div class="nm">Новый биом: ' + bm.name + (bl ? ' · круг ' + (bl + 1) : '') + '</div>' +
              '<div class="slot">' + (TUNE.biomeMods && bm.note || 'без особенностей') + (TUNE.biomePin ? ' · отступление сюда не уводит' : '') + '</div></div>' +
              '<div class="verdict off">биом</div></div>';
      continue;
    }
    if (e.kind === 'chief') {
      var cbm = BIOMES[e.biome % BIOMES.length];
      html += '<div class="drop" style="--rc:#ff9130"><div class="rail"></div>' +
              '<div><div class="nm">Главарь повержен</div>' +
              '<div class="slot">биом «' + cbm.name + '» пройден' + (TUNE.biomePin ? ' · дальше отступление сюда не уведёт' : '') + '</div></div>' +
              '<div class="verdict off">главарь</div></div>';
      continue;
    }
    if (e.kind === 'ack') {
      html += '<div class="drop" style="--rc:var(--ink-dim)"><div class="rail"></div>' +
              '<div><div class="nm">Решили не отступать</div>' +
              '<div class="slot">стоит проверить снаряжение</div></div>' +
              '<div class="verdict off">решение</div></div>';
      continue;
    }
    if (e.kind === 'lost') {
      html += '<div class="drop" style="--rc:var(--telegraph)"><div class="rail"></div>' +
              '<div><div class="nm">Потеряно ' + e.count + ' ' + plural(e.count, 'предмет', 'предмета', 'предметов') + '</div>' +
              '<div class="slot">не успели надеть до смерти</div></div>' +
              '<div class="verdict off">смерть</div></div>';
      continue;
    }
    if (e.kind === 'offline') {
      html += '<div class="drop" style="--rc:var(--accent)"><div class="rail"></div>' +
              '<div><div class="nm">Пока вас не было: ' + fmtDuration(e.ms) + '</div>' +
              '<div class="slot">убито ' + e.kills + ' · опыт +' + e.xp + '</div></div>' +
              '<div class="verdict off">оффлайн</div></div>';
      continue;
    }
    if (e.kind === 'broken') {
      html += '<div class="drop" style="--rc:var(--telegraph)"><div class="rail"></div>' +
              '<div><div class="nm">Сохранение повреждено</div>' +
              '<div class="slot">прочитать его не удалось — начата новая игра</div></div>' +
              '<div class="verdict off">сохранение</div></div>';
      continue;
    }
    if (e.kind === 'full') {
      html += '<div class="drop" style="--rc:var(--ink-dim)"><div class="rail"></div>' +
              '<div><div class="nm">Рюкзак полон</div>' +
              '<div class="slot">выброшена самая слабая вещь: ' + e.item.name + ' · ' + e.item.rarity.name + '</div></div>' +
              '<div class="verdict off">лут</div></div>';
      continue;
    }
  }
  el.info.innerHTML = html;
}

function renderLoot() {
  updateBagBadge();
  var cnt = '<div class="gear-empty">В рюкзаке ' + bagCount() + ' из ' + BAG_CAP + '</div>';
  if (!S.log.length) { el.loot.innerHTML = topCardHtml() + cnt + '<div class="gear-empty">Первая стая ещё впереди.</div>'; return; }
  var html = topCardHtml() + cnt;
  for (var i = 0; i < S.log.length; i++) {
    var e = S.log[i];
    if (!e.item) continue;
    var it = e.item, af = '';
    // Надетая вещь «переехала» в верхнюю карточку — в списке её не дублируем.
    if (S.selItem && it !== S.selItem && S.gear[S.selItem.slot.id] === it) continue;
    for (var j = 0; j < it.rolls.length; j++) af += fmtRoll(it.rolls[j]);
    var equipped = S.gear[it.slot.id] === it;
    var verdict = equipped
      ? '<div class="verdict on">надето</div>'
      : '<button type="button" class="verdict off" data-eq="' + i + '">надеть</button>';
    // Крестик удаления — только для того, что ещё не надето: снятое с себя
    // трогать так не даём, чтобы случайно не выкинуть активную экипировку.
    var del = equipped ? '' : '<button type="button" class="drop-del" data-del="' + i + '" aria-label="Удалить из журнала">×</button>';
    var selCls = S.selItem === it ? ' sel' : '';
    html += '<div class="drop pickable' + selCls + '" data-sel="' + i + '" style="--rc:' + it.rarity.css + '"><div class="rail"></div><div>' +
            '<div class="nm">' + it.name + '</div>' +
            '<div class="slot">' + it.slot.name + ' · ур ' + it.ilvl + ' · ' + it.rarity.name + '</div>' +
            '<div class="affixes">' + af + '</div></div>' +
            verdict + del + '</div>';
  }
  el.loot.innerHTML = html;
}

function renderGear() {
  var html = '';
  for (var i = 0; i < SLOTS.length; i++) {
    var s = SLOTS[i], it = S.gear[s.id];
    if (!it) {
      html += '<div class="gear-row"><div class="s">' + s.name + '</div>' +
              '<div class="gear-empty">пусто</div><div class="p">—</div></div>';
      continue;
    }
    var bits = [];
    if (it.stats.atk)        bits.push('+' + Math.round(it.stats.atk) + ' атк');
    if (it.stats.maxHp)      bits.push('+' + Math.round(it.stats.maxHp) + ' хп');
    if (it.stats.def)        bits.push('+' + Math.round(it.stats.def) + ' защ');
    if (it.stats.guardBonus) bits.push('+' + it.stats.guardBonus + ' мс блок');
    if (it.stats.atkSpeed)   bits.push('+' + Math.round(it.stats.atkSpeed * 100) + '% скор');
    if (it.stats.critChance) bits.push('+' + (it.stats.critChance * 100).toFixed(1) + '% крит');
    html += '<div class="gear-row" style="--rc:' + it.rarity.css + '">' +
            '<div class="s">' + s.name + '</div>' +
            '<div class="n">' + it.name + '</div>' +
            '<div class="p">' + (bits.join(' · ') || '—') + '</div></div>';
  }
  el.gear.innerHTML = html;
}

function renderTelem() {
  var m = S.tm;
  var rate = m.crits ? Math.round(m.blocked / m.crits * 100) : null;
  var avg = m.react.length ? Math.round(m.react.reduce(function (a, b) { return a + b; }, 0) / m.react.length) : null;
  var slack = avg === null ? null : TUNE.lead - avg;
  var mins = Math.max(0.1, (performance.now() - m.started) / 60000);

  var verdict;
  if (m.crits < 6) {
    verdict = 'Дайте пройти хотя бы десяток критов — потом здесь появится вывод о том, честное окно или нет.';
  } else if (rate >= 85 && slack !== null && slack > 320) {
    verdict = 'Блок ловится <b>слишком легко</b>. Убавьте подсветку или подрежьте окно блока — сейчас промахнуться почти нельзя.';
  } else if (rate < 55) {
    verdict = 'Блок <b>не успевает</b>. Если реакция около ' + avg + ' мс, подсветка должна быть минимум ' + (avg + 250) + ' мс.';
  } else {
    verdict = 'Похоже на <b>рабочий баланс</b>: успеваете, но не даром. Эти числа и стоит унести в Unity.';
  }

  el.stats.innerHTML =
    '<div class="telem">' +
      '<div class="cell"><div class="v ' + (rate === null ? '' : (rate >= 70 ? 'good' : 'bad')) + '">' +
        (rate === null ? '—' : rate + '%') + '</div><div class="l">Заблокировано</div>' +
        '<div class="h">' + m.blocked + ' из ' + m.crits + ' критов</div></div>' +
      '<div class="cell"><div class="v">' + (avg === null ? '—' : avg + ' мс') + '</div>' +
        '<div class="l">Реакция</div><div class="h">от вспышки до нажатия</div></div>' +
      '<div class="cell"><div class="v ' + (slack === null ? '' : (slack > 120 ? 'good' : 'bad')) + '">' +
        (slack === null ? '—' : (slack > 0 ? '+' : '') + slack + ' мс') + '</div>' +
        '<div class="l">Запас</div><div class="h">подсветка минус реакция</div></div>' +
      '<div class="cell"><div class="v">' + m.deaths + '</div><div class="l">Смертей</div>' +
        '<div class="h">' + (m.deaths / mins).toFixed(1) + ' в минуту</div></div>' +
      '<div class="cell"><div class="v">' + m.drops + '</div><div class="l">Дропов</div>' +
        '<div class="h">' + (m.drops / mins).toFixed(1) + ' в минуту</div></div>' +
      '<div class="cell"><div class="v">' + m.equips + '</div><div class="l">Надето</div>' +
        '<div class="h">' + (m.drops ? Math.round(m.equips / m.drops * 100) : 0) + '% дропа — вручную</div></div>' +
      '<div class="cell"><div class="v">' + S.progress + '</div><div class="l">Чекпоинт</div>' +
        '<div class="h">резинка по прогрессу</div></div>' +
      '<div class="cell"><div class="v">' + m.flees + '</div><div class="l">Сбежало</div>' +
        '<div class="h">раненых, чьих защитников не добили, память ×' + S.resist + '</div></div>' +
      '<div class="cell"><div class="v">' + m.retreats + '</div><div class="l">Отступлений</div>' +
        '<div class="h">после 2-й смерти подряд (в авто — сами)</div></div>' +
      '<div class="cell"><div class="v">' + Math.round(AUTO.ms / 60000) + ' мин</div><div class="l">В авто</div>' +
        '<div class="h">сам поймал ' + AUTO.blocks + ' раз (блок, щит)</div></div>' +
      '<div class="verdict-line">' + verdict + '</div>' +
      comboTelem() +
    '</div>';
}
