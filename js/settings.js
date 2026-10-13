// Вкладка «Настройка»: вкладки рюкзака, ползунки, тумблеры, сброс.
"use strict";

/* ── Вкладки ─────────────────────────────────────────────────────── */

var TABS = [['tab-loot', 'pane-loot'], ['tab-gear', 'pane-gear'], ['tab-tune', 'pane-tune'], ['tab-stats', 'pane-stats']];
TABS.forEach(function (pair) {
  $(pair[0]).addEventListener('click', function () {
    TABS.forEach(function (p) {
      var on = p[0] === pair[0];
      $(p[0]).setAttribute('aria-selected', on ? 'true' : 'false');
      $(p[1]).hidden = !on;
    });
  });
});

/* ── Ползунки ────────────────────────────────────────────────────── */

function bindSlider(sid, oid, key, fmt, scale) {
  var s = $(sid), o = $(oid);
  s.value = scale ? TUNE[key] * scale : TUNE[key];
  function apply() {
    TUNE[key] = scale ? (+s.value / scale) : +s.value;
    o.textContent = fmt(+s.value);
    saveTune();
    dirty.telem = true;
  }
  s.addEventListener('input', apply);
  apply();
}
bindSlider('s-speed', 'o-speed', 'speed',    function (v) { return (+v).toFixed(2) + '×'; });
bindSlider('s-lead',  'o-lead',  'lead',     function (v) { return v + ' мс'; });
bindSlider('s-guard', 'o-guard', 'guard',    function (v) { return v + ' мс'; });
bindSlider('s-cool',  'o-cool',  'cool',     function (v) { return v + ' мс'; });
bindSlider('s-crit',  'o-crit',  'critRate', function (v) { return v + ' %'; }, 100);
bindSlider('s-shield','o-shield','shieldRate', function (v) { return v + ' %'; }, 100);
bindSlider('s-rate',  'o-rate',  'mobRate',  function (v) { return v + ' мс'; });
bindSlider('s-flee',  'o-flee',  'retreatWindow', function (v) { return v + ' мс'; });
bindSlider('s-rage',  'o-rage',  'rageStep', function (v) { return v + ' %'; }, 100);
bindSlider('s-pulse', 'o-pulse', 'pulseWindow', function (v) { return v + ' мс'; });
bindSlider('s-healer','o-healer','healerRate', function (v) { return v + ' %'; }, 100);
bindSlider('s-yellow','o-yellow','yellowRate', function (v) { return v + ' %'; }, 100);
bindSlider('s-yellowcounter','o-yellowcounter','yellowCounter', function (v) { return v + ' мс'; });
bindSlider('s-ranged','o-ranged','rangedRate', function (v) { return v + ' %'; }, 100);
bindSlider('s-rangedrate','o-rangedrate','rangedInterval', function (v) { return v + ' мс'; });
bindSlider('s-healrate','o-healrate','healInterval', function (v) { return v + ' мс'; });
bindSlider('s-rangedlead','o-rangedlead','rangedLead', function (v) { return v + ' мс'; });
bindSlider('s-fatigue','o-fatigue','fatigueWindow', function (v) { return v + ' мс'; });
bindSlider('s-packmin','o-packmin','packMin', function (v) { return v; });
bindSlider('s-packmax','o-packmax','packMax', function (v) { return v; });

function bindToggle(id, key, after) {
  var c = $(id);
  c.checked = !!TUNE[key];
  c.addEventListener('change', function () { TUNE[key] = c.checked; saveTune(); if (after) after(); });
}
bindToggle('c-sound', 'sound', unlockAudio);
bindToggle('c-debug', 'debug');
bindToggle('c-ring',  'ring');
bindToggle('c-adapt', 'adapt');
bindToggle('c-fatigue', 'fatigue');

// Сброс всех ползунков и тумблеров к умолчаниям версии.
$('tune-reset').addEventListener('click', function () {
  for (var k in TUNE_DEFAULTS) TUNE[k] = TUNE_DEFAULTS[k];
  saveTune();
  location.reload();
});
