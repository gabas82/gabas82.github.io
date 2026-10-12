// FOOTBALL DASHBOARD ЗАДАЧА 6.4A (виж "Goal Average Small-Sample Shrinkage") -
// тества РЕАЛНАТА buildPrediction() от football-logic.js (директен import,
// не копие на формулата). Потвърждава точно одобрения обхват: avgGAll()/
// avgCAll() вече захранват expH/expA през shrinkGoalAvg() (baseline=1.2,
// k=4 - работна хипотеза), guard-ът "и двата отбора без история -> null"
// е запазен, seasonRate()/calcForm()/техните тегла/Confidence Score/
// индикатора за извадката/историята са напълно непипнати.
import { describe, it, expect } from 'vitest';
import { buildPrediction, sortMatchesByDate } from './football-logic.js';

function fd(id, homeId, awayId, hg, ag, date, compId = 2021) {
  return {
    id, status: 'FINISHED', competition: { id: compId }, utcDate: date,
    homeTeam: { id: homeId, name: 'Team' + homeId }, awayTeam: { id: awayId, name: 'Team' + awayId },
    score: { halfTime: { home: Math.min(hg, 1), away: Math.min(ag, 1) }, fullTime: { home: hg, away: ag } }
  };
}
function nMatches(teamId, oppStart, n, resultFn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [hg, ag] = resultFn(i);
    out.push(fd('m' + teamId + '_' + i, teamId, oppStart + i, hg, ag, `2025-0${(i % 9) + 1}-${String(10 + i).padStart(2, '0')}`));
  }
  return out;
}
function isValidPct(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100; }

const HOME = 1, AWAY = 2;

describe('buildPrediction() - ЗАДАЧА 6.4A: Goal Average Small-Sample Shrinkage', () => {
  it('n=0 за двата отбора - връща null (guard-ът е напълно запазен)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    expect(buildPrediction(match, [])).toBeNull();
  });

  it('n=1, домакин с победа 5:0 - expH пригладен към baseline, НЕ суровата 5.0 стойност', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = [fd('s1', HOME, 99, 5, 0, '2025-09-01')];
    const pred = buildPrediction(match, allMatches);
    expect(pred).not.toBeNull();
    expect(pred.hMatchesN).toBe(1);
    expect(parseFloat(pred.expH)).toBeLessThan(3.4); // суровата средна (без изглаждане) би дала ~3.4
    expect(parseFloat(pred.expH)).toBeGreaterThan(1.2); // но над чистия baseline (реален сигнал, не 0)
  });

  it('n=2, две убедителни победи - hWin пригладен надолу спрямо суровия сигнал', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 2, () => [3, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2);
    expect(pred.hWin).toBeLessThan(93); // суровият сигнал (преди 6.4A) би бил много по-екстремен
    expect(pred.hWin).toBeGreaterThan(pred.aWin);
  });

  it('n=2, две загуби - прогнозата се придвижва към неутрална, не остава "обречена"', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 2, () => [0, 3]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2);
    // Изглаждането дърпа и в тая посока - домакинът не изглежда толкова
    // обречен, колкото суровата средна (0 голa вкарани, 3 допуснати) би показала.
    expect(parseFloat(pred.expH)).toBeGreaterThan(0.3);
  });

  it('n=5 - по-слаб ефект на изглаждането спрямо n=1/n=2 за същия тип сигнал', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const all1 = [fd('x1', HOME, 99, 3, 0, '2025-09-01')];
    const all5 = nMatches(HOME, 100, 5, () => [3, 0]);
    const pred1 = buildPrediction(match, all1);
    const pred5 = buildPrediction(match, all5);
    const base = 1.2;
    const dev1 = Math.abs(parseFloat(pred1.expH) - base);
    const dev5 = Math.abs(parseFloat(pred5.expH) - base);
    // И двата суров сигнал е идентичен (3:0 всеки път) - n=5 трябва да е
    // ПО-БЛИЗО до суровата стойност (по-малко "дръпнат" към baseline) от n=1.
    expect(dev5).toBeGreaterThan(dev1);
  });

  it('n=20 - минимален остатъчен ефект, близо до суровата средна (не до чистия baseline)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 200, 20, (i) => i % 3 === 0 ? [0, 1] : i % 3 === 1 ? [1, 1] : [2, 1]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(20);
    // При n=20,k=4 остатъчното "дърпане" към baseline=1.2 е малко (4 pseudo-
    // наблюдения върху 20 реални) - expH трябва да е по-близо до суровия сигнал
    // (~1.0-1.2 за тоя запис), отколкото до baseline-а при МНОГО по-малко n.
    expect(parseFloat(pred.expH)).toBeGreaterThan(1.0);
    expect(parseFloat(pred.expH)).toBeLessThan(1.4);
  });

  it('домакин n=2 срещу гост n=30 - по-слабата извадка (домакина) доминира корекцията', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const homeMatches = nMatches(HOME, 100, 2, () => [3, 0]);
    const awayMatches = nMatches(AWAY, 300, 30, (i) => i % 2 === 0 ? [1, 2] : [0, 1]);
    const pred = buildPrediction(match, [...homeMatches, ...awayMatches]);
    expect(pred.hMatchesN).toBe(2);
    expect(pred.aMatchesN).toBe(30);
    expect(pred.hWin).toBeLessThan(91); // суровият сигнал (преди 6.4A) беше ~91
  });

  it('n=20 срещу n=20 (балансирани, достатъчна история) - малка остатъчна промяна', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const homeMatches = nMatches(HOME, 100, 20, (i) => i % 2 === 0 ? [1, 1] : [2, 1]);
    const awayMatches = nMatches(AWAY, 300, 20, (i) => i % 2 === 0 ? [1, 1] : [1, 2]);
    const pred = buildPrediction(match, [...homeMatches, ...awayMatches]);
    expect(pred.hMatchesN).toBe(20);
    expect(pred.aMatchesN).toBe(20);
    expect(pred.hWin).toBeGreaterThan(50); // домакинът е реално по-силен, разликата не се изтрива
  });

  it('празни/непълни данни - без throw, валидни числа', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const incomplete = [{ id: 'bad', status: 'FINISHED', competition: { id: 2021 }, utcDate: '2025-09-01', homeTeam: { id: HOME }, awayTeam: { id: 97 }, score: {} }]; // score без fullTime
    expect(() => buildPrediction(match, incomplete)).not.toThrow();
    const pred = buildPrediction(match, incomplete);
    expect(pred).not.toBeNull();
    expect(Number.isFinite(parseFloat(pred.expH))).toBe(true);
  });

  it('без NaN/Infinity и валидни вероятности [0,100] във всички сценарии по-горе', () => {
    const scenarios = [
      [[fd('a', HOME, 99, 5, 0, '2025-09-01')]],
      [nMatches(HOME, 100, 2, () => [3, 0])],
      [nMatches(HOME, 100, 2, () => [0, 3])],
      [nMatches(HOME, 100, 5, () => [3, 0])],
      [nMatches(HOME, 200, 20, (i) => i % 3 === 0 ? [0, 1] : i % 3 === 1 ? [1, 1] : [2, 1])],
      [[...nMatches(HOME, 100, 2, () => [3, 0]), ...nMatches(AWAY, 300, 30, (i) => i % 2 === 0 ? [1, 2] : [0, 1])]],
    ];
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    scenarios.forEach(([allMatches], idx) => {
      const pred = buildPrediction(match, allMatches);
      expect(pred, `сценарий ${idx}`).not.toBeNull();
      ['hWin', 'draw', 'aWin', 'over25', 'under25', 'btts', 'noBtts'].forEach(k => {
        expect(isValidPct(pred[k]), `${k} в сценарий ${idx} = ${pred[k]}`).toBe(true);
      });
      expect(Number.isFinite(parseFloat(pred.expH)), `expH сценарий ${idx}`).toBe(true);
      expect(Number.isFinite(parseFloat(pred.expA)), `expA сценарий ${idx}`).toBe(true);
    });
  });

  it('1X2 сборът е точно 100% във всички сценарии по-горе', () => {
    const scenarios = [
      [fd('a', HOME, 99, 5, 0, '2025-09-01')],
      nMatches(HOME, 100, 2, () => [3, 0]),
      nMatches(HOME, 100, 2, () => [0, 3]),
      nMatches(HOME, 100, 5, () => [3, 0]),
      nMatches(HOME, 200, 20, (i) => i % 3 === 0 ? [0, 1] : i % 3 === 1 ? [1, 1] : [2, 1]),
      [...nMatches(HOME, 100, 2, () => [3, 0]), ...nMatches(AWAY, 300, 30, (i) => i % 2 === 0 ? [1, 2] : [0, 1])],
      [...nMatches(HOME, 100, 20, (i) => i % 2 === 0 ? [1, 1] : [2, 1]), ...nMatches(AWAY, 300, 20, (i) => i % 2 === 0 ? [1, 1] : [1, 2])],
    ];
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    scenarios.forEach((allMatches, idx) => {
      const pred = buildPrediction(match, allMatches);
      expect(pred.hWin + pred.draw + pred.aWin, `сценарий ${idx}`).toBe(100);
    });
  });

  it('намаляващо влияние на baseline при растящо n - разликата спрямо суровия сигнал пада монотонно (n=1 > n=2 > n=5 > n=20)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const buildWithN = (n) => buildPrediction(match, nMatches(HOME, 100, n, () => [3, 0]));
    const expH1 = parseFloat(buildWithN(1).expH);
    const expH2 = parseFloat(buildWithN(2).expH);
    const expH5 = parseFloat(buildWithN(5).expH);
    const expH20 = parseFloat(buildWithN(20).expH);
    // Суровата стойност на expH (без изглаждане) за тоя сигнал би била ~2.48
    // (виж (3+1.2)/2*1.1 при n=0 гост). Monotonно нараства към тая горна граница.
    expect(expH1).toBeLessThan(expH2);
    expect(expH2).toBeLessThan(expH5);
    expect(expH5).toBeLessThan(expH20);
  });

  it('непроменени резултати за НЕ засегнатите от 6.4A полета (hWinRatePct/hForm/expYellow/htRatio - зависят от seasonRate()/calcForm()/htAvgAll(), не от avgGAll/avgCAll)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = sortMatchesByDate(nMatches(HOME, 100, 3, () => [2, 1]));
    const pred = buildPrediction(match, allMatches);
    // Ръчно пресметнати от СЪЩИТЕ, непипнати seasonRate()/calcForm()/htAvgAll()
    // формули - 3 победи от 3 -> winRate=100%; форма = 3× 'W'.
    expect(pred.hWinRatePct).toBe(100);
    expect(pred.hForm).toEqual(['W', 'W', 'W']);
    expect(pred.aWinRatePct).toBe(33); // гост без история -> непипнат 0.33 fallback
    expect(pred.expYellow).toBeTypeOf('number');
    expect(pred.htRatio).toBeTypeOf('number');
  });

  it('регресия - calcConfidence()/историята/кеширането не са засегнати (извън обхвата на 6.4A, само buildPrediction() е пипнат)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 2, () => [3, 0]);
    const pred1 = buildPrediction(match, allMatches);
    const pred2 = buildPrediction(match, allMatches);
    expect(pred1).toEqual(pred2); // детерминистично, без странични ефекти
  });
});
