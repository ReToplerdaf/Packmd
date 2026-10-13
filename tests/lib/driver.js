// Встраивается в страницу ДО скриптов игры (Playwright addInitScript).
// Делает бой детерминированным и даёт тестам управлять им:
//   • Math.random — генератор с фиксированным seed;
//   • performance.now и requestAnimationFrame — виртуальные часы, кадр
//     двигает только тест (window.__drv.run), поэтому результат не зависит
//     от скорости машины;
//   • бот жмёт «Защиту»/«Атаку» теми же клавишами, что и игрок.
// Параметры приходят в window.__DRV_CFG (см. harness.mjs).
(function () {
  var cfg = window.__DRV_CFG || {};

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(cfg.seed || 1);
  var botRnd = mulberry32((cfg.seed || 1) * 7919 + 17);   // свой генератор бота, игру не трогает

  var vt = 1000, rafQ = [];
  performance.now = function () { return vt; };
  window.requestAnimationFrame = function (cb) { rafQ.push(cb); return rafQ.length; };
  window.cancelAnimationFrame = function () {};

  try {
    localStorage.clear();
    if (!cfg.tutorial) localStorage.setItem('arena.tutorial.done', '1');
    if (cfg.tune) localStorage.setItem('arena.tune.v2', JSON.stringify(cfg.tune));
  } catch (e) {}

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  // Снимок состояния: мобы внутри S.pack пишутся целиком, а ссылки на них из
  // других мест (цель крита, контры, каста…) — как «@id», чтобы не было циклов.
  var ids = new WeakMap(), nextId = 1;
  function mobId(m) { if (!ids.has(m)) ids.set(m, nextId++); return ids.get(m); }
  function snapshot(P) {
    var S = P.S;
    S.pack.forEach(mobId);
    return JSON.stringify(S, function (k, v) {
      if (v && typeof v === 'object' && 'maxHp' in v && 'type' in v && this !== S.pack) return '@' + mobId(v);
      if (typeof v === 'number' && !isFinite(v)) return String(v);
      return v;
    });
  }

  function key(k) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }
  function tap(node, type) {
    if (!node) return false;
    node.dispatchEvent(new PointerEvent(type || 'pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    return true;
  }
  function visible(id) { var n = document.getElementById(id); return n && !n.hidden; }

  // ── Бот ──────────────────────────────────────────────────────────────
  // skill — доля угроз, на которые бот реагирует (0 — пассивная игра).
  // Решение «реагировать или нет» бросается один раз на угрозу.
  var decided = new WeakMap();
  function wants(threat, skill) {
    if (!decided.has(threat)) decided.set(threat, skill >= 1 ? true : botRnd() < skill);
    return decided.get(threat);
  }
  var done = new WeakSet();
  var lastCounter = null;

  function botStep(P, now, b) {
    var S = P.S, T = P.TUNE;
    if (visible('tut-overlay')) { document.getElementById('tut-ok').click(); return; }
    // Кадр смерти: «Дальше» — через ту же паузу (1,6 с ÷ speed), что раньше длилась пауза смерти.
    // noDeathTap — бот не трогает кадр смерти и вопрос (проверка авто-режима).
    if (b.noDeathTap && (visible('death-overlay') || visible('prompt-overlay'))) return;
    if (visible('death-overlay')) {
      if (!b._deadAt) b._deadAt = now;
      if (now - b._deadAt >= P.dur(1600)) { b._deadAt = 0; tap(document.getElementById('death-next')); }
      return;
    }
    if (visible('prompt-overlay')) { tap(document.getElementById(b.prompt === 'ack' ? 'prompt-ack' : 'prompt-retreat')); return; }
    if (S.paused || S.phase !== 'fight' || !b.skill) return;

    var gw = P.dur(P.guardWindow());
    // Защита: крит ближнего и выстрелы — жмём в середине окна блока.
    var defs = [];
    if (S.telegraph) defs.push(S.telegraph);
    for (var i = 0; i < S.pack.length; i++) {
      var rm = S.pack[i];
      if (rm.type === 'ranged' && rm.rangedTelegraph && rm.hp > 0) defs.push(rm.rangedTelegraph);
    }
    for (var d = 0; d < defs.length; d++) {
      var a = defs[d];
      if (done.has(a) || now < a.hitAt - gw * 0.5 || now >= a.hitAt) continue;
      done.add(a);
      if (wants(a, b.skill)) { key('ArrowLeft'); break; }
    }

    // Атака: щит жёлтого / каст хилера — в середине окна; контра — сразу.
    var good = P.dur(P.pulseGoodMs()), late = P.dur(P.pulseLateMs());
    var fm = P.front();
    var pulses = [];
    if (fm && fm.shield && fm.pulse) pulses.push(fm.pulse);
    var ah = P.activeHealer();
    if (ah) pulses.push(ah.healPulse);
    for (var p = 0; p < pulses.length; p++) {
      var pl = pulses[p];
      if (done.has(pl) || now < pl.hitAt + (late - good) * 0.5) continue;
      done.add(pl);
      if (wants(pl, b.skill)) { key('ArrowRight'); return; }
    }
    if (now < S.counterUntil && fm && fm === S.counterMob && now >= S.strikeCoolAt && lastCounter !== S.counterUntil) {
      lastCounter = S.counterUntil;
      if (botRnd() < b.skill || b.skill >= 1) key('ArrowRight');
    }
  }

  // Действия с интерфейсом по расписанию (кадр → действие) — для проверки
  // рюкзака, вкладок и ползунков.
  function uiStep(frame, P) {
    var plan = cfg.ui;
    if (!plan) return;
    var act = plan[frame];
    if (!act) return;
    if (act === 'open') tap(document.getElementById('btn-bag'));
    else if (act === 'close') tap(document.getElementById('backpack-close'));
    else if (act === 'equip') { var btn = document.querySelector('#pane-loot [data-eq]'); if (btn) btn.click(); }
    else if (act === 'select') { var s = document.querySelector('#pane-loot [data-sel]'); if (s) s.click(); }
    else if (act === 'delete') { var x = document.querySelector('#pane-loot [data-del]'); if (x) x.click(); }
    else if (act.indexOf('tab:') === 0) document.getElementById(act.slice(4)).click();
    else if (act.indexOf('slider:') === 0) {
      var parts = act.split(':'), sl = document.getElementById(parts[1]);
      sl.value = parts[2]; sl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else if (act.indexOf('toggle:') === 0 || act.indexOf('click:') === 0) document.getElementById(act.slice(act.indexOf(':') + 1)).click();
    else if (act === 'guard') key('ArrowLeft');
    else if (act === 'strike') key('ArrowRight');
  }

  // Надеть из рюкзака всё, что по подсказке игры (item.score) лучше надетого, —
  // то же, что нажать «надеть». Только для симуляции баланса.
  function autoEquip(S) {
    for (var i = 0; i < S.log.length; i++) {
      var it = S.log[i].item;
      if (!it) continue;
      var on = S.gear[it.slot.id];
      if (on !== it && (!on || it.score > on.score)) equipItem(it);
    }
  }
  var cleared = 0, lastProg = 0;   // зачищенные стаи (рост чекпоинта на 1)
  function sample(S, fr) {
    return { f: fr, t: (fr / 60), level: S.level, xp: S.xp, kills: S.kills, deaths: S.tm.deaths, flees: S.tm.flees,
      cleared: cleared, retreats: S.tm.retreats, progress: S.progress, crits: S.tm.crits, blocked: S.tm.blocked, resist: S.resist };
  }

  window.__drv = {
    fnv: fnv,
    snapshot: function () { return snapshot(window.__pack); },
    now: function () { return vt; },
    // Прогнать n кадров по 1/60 с. Каждые every кадров — хэш состояния и
    // текста интерфейса, каждые canvasEvery — хэш картинки.
    run: function (n, opt) {
      opt = opt || {};
      var P = window.__pack, out = [], frame0 = window.__drv.frame || 0;
      var bot = opt.bot || { skill: 0 };
      var cv = document.getElementById('arena');
      for (var f = 0; f < n; f++) {
        var fr = frame0 + f;
        vt += 1000 / 60;
        if (P) botStep(P, vt, bot);
        uiStep(fr, P);
        var q = rafQ; rafQ = [];
        for (var i = 0; i < q.length; i++) q[i](vt);
        if (P) { if (P.S.progress === lastProg + 1) cleared++; lastProg = P.S.progress; }
        if (bot.equip && fr % 30 === 0 && typeof equipItem === 'function') autoEquip(P.S);
        if (opt.sample && fr % opt.sample === 0) out.push(sample(P.S, fr));
        if (opt.every && fr % opt.every === 0) {
          var rec = { f: fr, s: fnv(snapshot(P)), ui: fnv(document.body.innerText) };
          if (opt.canvasEvery && fr % opt.canvasEvery === 0) rec.cv = fnv(cv.toDataURL());
          out.push(rec);
        }
      }
      window.__drv.frame = frame0 + n;
      return out;
    }
  };
})();
