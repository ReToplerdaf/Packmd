// Ввод: кнопки «Защита» и «Атака».
"use strict";

/* ── Ввод ────────────────────────────────────────────────────────── */

function pressGuard() {
  if (S.paused) return;
  var now = performance.now();
  unlockAudio();
  if (now < S.guardCoolUntil) return;

  // Усталость от спама: больше 3 нажатий подряд быстро — откат ×2, а если
  // спам продолжается, пока эта усталость ещё не истекла — держим ×4
  // (дальше не растёт). Истекает сама по таймеру.
  if (TUNE.fatigue) {
    if (now >= S.fatigueUntil) S.fatigueMult = 1;
    S.guardPressStamps.push(now);
    var win = dur(TUNE.fatigueWindow);
    S.guardPressStamps = S.guardPressStamps.filter(function (ts) { return now - ts <= win; });
    if (S.guardPressStamps.length > 3) {
      S.fatigueMult = (S.fatigueMult >= 2 && now < S.fatigueUntil) ? 4 : 2;
      S.fatigueUntil = now + dur(FATIGUE_DECAY);
      S.guardPressStamps = [];
      sfx('fatigue');
      floatText('УСТАЛ', '#ff9130', -1, 0, false);
    }
  } else {
    S.fatigueMult = 1;
  }

  S.guardPressedAt = now;
  S.guardUntil = now + dur(guardWindow());
  var mult = (TUNE.fatigue && now < S.fatigueUntil) ? S.fatigueMult : 1;
  S.guardCoolMs = dur(TUNE.cool * mult);
  S.guardCoolUntil = S.guardUntil + S.guardCoolMs;
  sfx('guard');
}

// «Удар» — не свободный источник урона: он либо добивает контратакой после
// блока, либо ловит пульс щита. Вне этих двух окон нажатие ничего не даёт —
// обычный урон идёт только от авто-атаки героя.
function pressStrike() {
  if (S.paused) return;
  var now = performance.now();
  // Защита от «дребезга» одного нажатия: на телефоне один тап иногда
  // рождает несколько pointerdown подряд (двойное срабатывание сенсора,
  // случайный повторный тач) — без этого щит внезапно ловил 2-3 «удара»
  // за один клик игрока, и на промахах моб мгновенно улетал в фул стаков.
  if (now < S.strikeCoolAt) return;
  // антидребезг — в реальном времени, не зависит от скорости боя
  S.strikeCoolAt = now + STRIKE_DEBOUNCE_MS;
  unlockAudio();
  var mob = front();
  if (!mob || S.phase !== 'fight') return;

  if (mob.shield) {
    var p = mob.pulse;
    if (p && now >= p.hitAt - dur(pulseGoodMs()) && now <= p.hitAt + dur(pulseLateMs())) {
      hitMob(mob, 1, null, true);   // тайминг верный — щит разбит
      // Таймер хода моба тикал всё время, пока стоял блок, и мог уже
      // истечь — тогда моб ходил в тот же кадр и с шансом сразу снова
      // вставал в блок: выглядело так, будто удар не прошёл / прошёл дважды.
      // Даём полную паузу и запрещаем блок на ближайшем ходу.
      S.mobSwingAt = Math.max(S.mobSwingAt, now + dur(TUNE.mobRate));
      mob.noShieldNext = true;
      if (mob.type === 'yellow' && mob.hp > 0) {
        // Жёлтый моб: снятие щита сразу оборачивается его критом — но не
        // мгновенно, а коротким отдельным замахом (тот же принцип, что у
        // обычного крита любого моба): кольцо стягивается «Контрблок
        // жёлтого» миллисекунд, и решает всё та же точная синхронизация
        // с блоком в момент hitAt — reuse resolveCrit ничего не меняя.
        S.telegraph = { start: now, hitAt: now + dur(TUNE.yellowCounter), mob: mob, yellowFollow: true };
        sfx('telegraph');
      }
    } else {
      missShieldPulse(mob, now);
      sfx('miss');
      floatText('МИМО', '#ff9130', 0, 0, false);
    }
    return;
  }

  // Прервать лечение можно, где бы хилер ни стоял в стае.
  var hl = activeHealer();
  if (hl && now >= hl.healPulse.hitAt - dur(pulseGoodMs()) && now <= hl.healPulse.hitAt + dur(pulseLateMs())) {
    interruptHeal(hl, now);
    return;
  }

  if (now < S.counterUntil && mob === S.counterMob) {
    S.counterUntil = 0; S.counterMob = null;
    var killed = hitMob(mob, COUNTER_MULT, 'КОНТРА', true);
    sfx('counter');
    if (killed) healHero();
    return;
  }

  // Нажали не вовремя, пока идёт канал, — лечение срабатывает сразу.
  if (hl) {
    resolveHeal(hl, now);
    sfx('miss');
    floatText('МИМО', '#ff9130', 0, 0, false);
  }
}
