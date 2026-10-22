// Обработчики: журнал лута, вопрос после смертей, рюкзак, обучение, кнопки, клавиатура.
"use strict";

/* ── Клик «надеть» в журнале лута ───────────────────────────────── */

el.loot.addEventListener('click', function (e) {
  var d = e.target.closest('[data-del]');
  if (d) {
    var di = +d.getAttribute('data-del');
    var de = S.log[di];
    // Надетое не трогаем — крестика на нём и не рисуем, но проверяем
    // на всякий случай, если список успел перерисоваться под пальцем.
    if (de && de.kind === 'item' && S.gear[de.item.slot.id] !== de.item) {
      if (S.selItem === de.item) S.selItem = null;
      S.log.splice(di, 1);
      dirty.loot = true;
      markSave();
      renderLoot();
    }
    return;
  }
  var b = e.target.closest('[data-eq]');
  if (b) {
    var entry = S.log[+b.getAttribute('data-eq')];
    if (entry && entry.kind === 'item') equipItem(entry.item);
    renderLoot();
    return;
  }
  // Тап по самому предмету — выбрать его для сравнения (повторный тап снимает выбор).
  var sel = e.target.closest('[data-sel]');
  if (sel) {
    var se = S.log[+sel.getAttribute('data-sel')];
    if (se && se.kind === 'item') {
      S.selItem = S.selItem === se.item ? null : se.item;
      renderLoot();
    }
    return;
  }
  // Тап по верхней карточке — снять выбор.
  if (e.target.closest('[data-unsel]')) { S.selItem = null; renderLoot(); }
});

/* ── Оверлей вопроса после 2-й смерти подряд ────────────────────── */

$('death-next').addEventListener('pointerdown', function (e) { e.preventDefault(); closeDeath(); });
$('prompt-retreat').addEventListener('pointerdown', function (e) { e.preventDefault(); resolvePrompt('retreat'); });
$('offline-ok').addEventListener('pointerdown', function (e) { e.preventDefault(); closeOffline(); });
$('prompt-ack').addEventListener('pointerdown', function (e) { e.preventDefault(); resolvePrompt('ack'); });

/* ── Рюкзак ──────────────────────────────────────────────────────── */

el.bagBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); openBackpack(); });
el.tutOk.addEventListener('click', tutClose);
el.tutSkip.addEventListener('click', tutSkip);
$('tut-start').addEventListener('click', function () { closeBackpack(); startTutorial(); });
el.backpackClose.addEventListener('pointerdown', function (e) { e.preventDefault(); closeBackpack(); });

// Рюкзак открывается на pointerdown, а палец отпускают уже над открытым окном:
// браузер шлёт click в то, что теперь под пальцем (обычно вкладка «Инфо»).
// Этот click глотаем — срабатывает только следующее, новое касание.
var bagGhostClick = false;
el.bagBtn.addEventListener('pointerdown', function () { bagGhostClick = true; });
window.addEventListener('pointerdown', function (e) {
  if (e.target.closest && !e.target.closest('#btn-bag')) bagGhostClick = false;
}, true);
window.addEventListener('click', function (e) {
  if (!bagGhostClick || !e.isTrusted) return;
  bagGhostClick = false;
  if (el.backpackOverlay.hidden) return;
  e.preventDefault(); e.stopPropagation();
}, true);

// Ползунки в «Настройке»: сначала тап по строке выбирает ползунок, и только
// выбранный двигается. Прокрутка списка снимает выбор — пальцем, листающим
// настройки, ничего случайно не сдвинуть.
var tuneBox = document.querySelector('.tune');
tuneBox.addEventListener('click', function (e) {
  var row = e.target.closest('.tune-row');
  if (!row) return;
  var was = tuneBox.querySelector('.tune-row.active');
  if (was && was !== row) was.classList.remove('active');
  row.classList.add('active');
});
function tuneUnselect() {
  var was = tuneBox.querySelector('.tune-row.active');
  if (was) was.classList.remove('active');
}
$('pane-tune').addEventListener('scroll', tuneUnselect, { passive: true });
el.bagBtn.addEventListener('pointerdown', tuneUnselect);

/* ── Кнопки: pointerdown, а не click — на телефоне это десятки мс ── */

// Кнопки теперь — большие угловые зоны, и на них легко лечь вторым
// пальцем/ладонью: каждый новый контакт — новый pointerdown. Поэтому одно
// нажатие = один палец: пока первый не отпущен, остальные касания этой
// кнопки игнорируются (плюс общий антидребезг в самих pressGuard/pressStrike).
function wire(node, fn) {
  var held = null;
  node.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (e.isPrimary === false && held !== null) return;
    if (held !== null) return;
    held = e.pointerId;
    fn();
  });
  var release = function (e) { if (held === e.pointerId) held = null; };
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', release);
  node.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  node.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fn(); }
  });
}
wire(el.guard, pressGuard);
wire(el.strike, pressStrike);

window.addEventListener('keydown', function (e) {
  if (e.repeat) return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '')) return;
  // e.code — та же клавиша и в русской раскладке
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' || e.code === 'KeyA') { e.preventDefault(); pressGuard(); }
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd' || e.code === 'KeyD') { e.preventDefault(); pressStrike(); }
});
