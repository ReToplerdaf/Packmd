// Звук: синтез эффектов и метроном таймингов.
"use strict";

/* ════════════════════════════════════════════════════════════════════
   ЗВУК — синтез на месте, файлы грузить нельзя
   ════════════════════════════════════════════════════════════════════ */

var actx = null;
function unlockAudio() {
  if (!TUNE.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}

function tone(freq, freq2, dur, type, vol) {
  if (!TUNE.sound || !actx) return;
  try {
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}

/* ── Звуковой метроном таймингов ─────────────────────────────────────
   Каждая угроза, на которую надо реагировать, получает свой «звуковой
   отсчёт»: нарастающий по высоте гул от начала замаха и чёткий щелчок
   ровно в тот момент, когда пора жать. Звуки ставятся заранее на шкалу
   Web Audio — так щелчок звучит точно в срок, а не «как получится» по
   кадрам. Два тембра, чтобы различать на слух, какую кнопку жать:
     • defend — крит / выстрел дальнобойщика → «Блок»: низкий пилообразный
       гул и сухой металлический «тик»;
     • strike — блок мечом / щит жёлтого / лечение хилера → «Удар»:
       светлый гул и звонкий «дзинь».
   Щелчок стоит в СЕРЕДИНЕ окна нажатия: попал в такт — попал в окно. */
var cues = [];

function cueTargets(now) {
  var want = [];
  if (S.phase !== 'fight') return want;
  var gw = dur(guardWindow());
  if (S.telegraph) {
    // блок засчитан, если щит поднят в hitAt; держится gw → жать в [hitAt−gw, hitAt]
    want.push({ ref: S.telegraph, kind: 'defend', start: S.telegraph.start, click: S.telegraph.hitAt - gw * 0.5 });
  }
  var fm = front();
  var good = dur(pulseGoodMs()), late = dur(pulseLateMs());
  if (fm && fm.shield && fm.pulse) {
    want.push({ ref: fm.pulse, kind: 'strike', start: fm.pulse.start, click: fm.pulse.hitAt + (late - good) * 0.5 });
  }
  var ah = activeHealer();
  if (ah) {
    want.push({ ref: ah.healPulse, kind: 'strike', start: ah.healPulse.start, click: ah.healPulse.hitAt + (late - good) * 0.5 });
  }
  for (var i = 0; i < S.pack.length; i++) {
    var rm = S.pack[i];
    if (rm.type === 'ranged' && rm.rangedTelegraph && rm.hp > 0) {
      want.push({ ref: rm.rangedTelegraph, kind: 'defend', start: rm.rangedTelegraph.start, click: rm.rangedTelegraph.hitAt - gw * 0.5 });
    }
  }
  return want;
}

function startCue(w, now) {
  var cue = { ref: w.ref, nodes: [] };
  try {
    var t0 = actx.currentTime;
    var at = function (ms) { return t0 + Math.max(0, (ms - now) / 1000); };
    var rs = at(Math.max(now, w.start)), rc = at(w.click);
    var defend = w.kind === 'defend';
    // нарастающий гул до щелчка
    if (w.click > now && rc - rs > 0.06) {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = defend ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(defend ? 150 : 330, rs);
      o.frequency.exponentialRampToValueAtTime(defend ? 600 : 1150, rc);
      g.gain.setValueAtTime(0.0001, rs);
      g.gain.exponentialRampToValueAtTime(defend ? 0.04 : 0.05, rc - 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, rc + 0.015);
      o.connect(g); g.connect(actx.destination);
      o.start(rs); o.stop(rc + 0.05);
      cue.nodes.push({ o: o, g: g });
    }
    // щелчок — момент нажатия
    if (w.click > now) {
      var c = actx.createOscillator(), cg = actx.createGain();
      c.type = defend ? 'square' : 'sine';
      c.frequency.setValueAtTime(defend ? 1500 : 2100, rc);
      if (defend) c.frequency.exponentialRampToValueAtTime(650, rc + 0.06);
      cg.gain.setValueAtTime(0.0001, rc);
      cg.gain.exponentialRampToValueAtTime(defend ? 0.18 : 0.2, rc + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.0001, rc + (defend ? 0.07 : 0.14));
      c.connect(cg); cg.connect(actx.destination);
      c.start(rc); c.stop(rc + 0.18);
      cue.nodes.push({ o: c, g: cg });
    }
  } catch (e) {}
  return cue;
}

function stopCue(cue) {
  if (!actx) return;
  var t = actx.currentTime;
  for (var i = 0; i < cue.nodes.length; i++) {
    var n = cue.nodes[i];
    try { n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t); } catch (e) {}
    try { n.o.stop(t + 0.02); } catch (e) {}
  }
}

function stopAllCues() {
  for (var i = 0; i < cues.length; i++) stopCue(cues[i]);
  cues = [];
}

// Вызывается каждый кадр боя: заводит отсчёт для новых угроз и глушит
// отсчёт тех, что пропали (щит сбит, лечение прервано, моб умер…).
function audioCues() {
  if (!TUNE.sound || !actx || S.paused) { if (cues.length) stopAllCues(); return; }
  var now = performance.now();
  var want = cueTargets(now);
  for (var i = cues.length - 1; i >= 0; i--) {
    var keep = false;
    for (var j = 0; j < want.length; j++) if (want[j].ref === cues[i].ref) { keep = true; break; }
    if (!keep) { stopCue(cues[i]); cues.splice(i, 1); }
  }
  for (var k = 0; k < want.length; k++) {
    var has = false;
    for (var c = 0; c < cues.length; c++) if (cues[c].ref === want[k].ref) { has = true; break; }
    if (!has) cues.push(startCue(want[k], now));
  }
}

var RARITY_PITCH = { common: 520, uncommon: 620, rare: 740, epic: 880, legendary: 1040 };

function sfx(kind, arg) {
  if (!TUNE.sound || !actx) return;
  switch (kind) {
    case 'telegraph': tone(300, 520, 0.16, 'square', 0.13); setTimeout(function () { tone(520, 640, 0.12, 'square', 0.10); }, 90); break;
    case 'block':     tone(880, 1460, 0.16, 'triangle', 0.16); break;
    case 'guard':     tone(420, 420, 0.04, 'sine', 0.05); break;
    case 'counter':   tone(200, 700, 0.20, 'sawtooth', 0.13); break;
    case 'poke':      tone(300, 260, 0.04, 'sine', 0.04); break;
    case 'crit':      tone(150, 70, 0.26, 'sawtooth', 0.17); break;
    case 'death':     tone(180, 50, 0.55, 'sawtooth', 0.15); break;
    case 'level':     [0, 90, 180].forEach(function (d, i) { setTimeout(function () { tone(520 + i * 180, 0, 0.14, 'triangle', 0.10); }, d); }); break;
    case 'loot':      tone(RARITY_PITCH[arg] || 520, (RARITY_PITCH[arg] || 520) * 1.5, 0.13, 'triangle', 0.09); break;
    case 'flee':      tone(500, 300, 0.18, 'sine', 0.09); break;
    case 'equip':     tone(660, 900, 0.10, 'triangle', 0.09); break;
    case 'vuln':      tone(620, 780, 0.10, 'triangle', 0.08); break;
    case 'shield':    tone(300, 460, 0.16, 'sine', 0.10); break;
    case 'shieldbreak': tone(520, 180, 0.14, 'square', 0.13); break;
    case 'retreat':   tone(420, 320, 0.14, 'sine', 0.08); break;
    case 'heal':      [0, 70].forEach(function (d, i) { setTimeout(function () { tone(520 + i * 140, 0, 0.12, 'sine', 0.09); }, d); }); break;
    case 'enrage':    tone(160, 110, 0.22, 'sawtooth', 0.14); break;
    case 'miss':      tone(260, 180, 0.10, 'square', 0.08); break;
    case 'lost':      tone(220, 90, 0.30, 'sawtooth', 0.13); break;
    case 'fatigue':   tone(240, 140, 0.16, 'square', 0.10); break;
  }
}
