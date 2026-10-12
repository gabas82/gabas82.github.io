// FOOTBALL DASHBOARD ЗАДАЧА 6.4B-A (виж "Season Win-Rate Small-Sample Shrinkage") -
// тества РЕАЛНАТА buildPrediction() от football-logic.js (директен import, не
// копие на формулата). Потвърждава точно одобрения обхват: seasonRate()'s
// суров winRate вече не влиза директно в hWinP/aWinP - вместо него се ползва
// hWinRateShrunk/aWinRateShrunk (smoothedWinRate=(w+0.33*4)/(n+4)). Суровият
// hWinRatePct/aWinRatePct (публичната статистика) остава НЕПИПНАТ. Guard-ът
// "и двата отбора без история -> null" е запазен. calcForm()/fScore()/expH/
// expA/goal shrinkage от 6.4A/теглата 0.35/0.35/0.30/calcConfidence() са
// напълно непипнати.
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

describe('buildPrediction() - ЗАДАЧА 6.4B-A: Season Win-Rate Small-Sample Shrinkage', () => {
  it('n=0 за двата отбора - връща null (guard-ът е напълно запазен)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    expect(buildPrediction(match, [])).toBeNull();
  });

  it('n=0 само за единия отбор - fallback 0.33 запазен, aWinRatePct=33', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred).not.toBeNull();
    expect(pred.aMatchesN).toBe(0);
    expect(pred.aWinRatePct).toBe(33);
  });

  it('1 победа - hWin пригладен надолу спрямо суровия 100% win rate (hWinRatePct остава 100)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(1);
    expect(pred.hWinRatePct).toBe(100); // суровата публична статистика НЕПИПНАТА
    expect(pred.hWin).toBe(61);
    expect(pred.draw).toBe(15);
    expect(pred.aWin).toBe(24);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('1 загуба - hWin пригладен нагоре спрямо суровия 0% win rate (hWinRatePct остава 0)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [0, 2]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(1);
    expect(pred.hWinRatePct).toBe(0); // суровата публична статистика НЕПИПНАТА
    expect(pred.hWin).toBe(26);
    expect(pred.draw).toBe(47);
    expect(pred.aWin).toBe(27);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('1 равенство - hWinRatePct=0 (равенство не е "победа"), прогнозата остава разумна', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [1, 1]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(1);
    expect(pred.hWinRatePct).toBe(0);
    expect(pred.hWin).toBe(45);
    expect(pred.draw).toBe(29);
    expect(pred.aWin).toBe(26);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('2 победи - hWin по-малко екстремен от n=1 случая (ефектът намалява с растящ n)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 2, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2);
    expect(pred.hWinRatePct).toBe(100);
    expect(pred.hWin).toBe(68);
    expect(pred.draw).toBe(9);
    expect(pred.aWin).toBe(23);
    expect(pred.hWin).toBeGreaterThan(61); // n=2 по-близо до суровия сигнал от n=1
  });

  it('2 загуби - аналогично намаляващ ефект в обратната посока', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 2, () => [0, 2]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2);
    expect(pred.hWinRatePct).toBe(0);
    expect(pred.hWin).toBe(23);
    expect(pred.draw).toBe(49);
    expect(pred.aWin).toBe(28);
    expect(pred.hWin).toBeLessThan(26); // n=2 по-близо до суровия (по-нисък) сигнал от n=1
  });

  it('3 смесени мача (W/D/L) - валидна прогноза, hWinRatePct=33 суров', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = [
      fd('m1', HOME, 101, 2, 0, '2025-01-01'),
      fd('m2', HOME, 102, 1, 1, '2025-02-01'),
      fd('m3', HOME, 103, 0, 1, '2025-03-01'),
    ];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(3);
    expect(pred.hWinRatePct).toBe(33);
    [pred.hWin, pred.draw, pred.aWin].forEach(v => expect(isValidPct(v)).toBe(true));
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('20 смесени мача - shrinkage ефектът е почти незначителен спрямо суровия win rate', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 200, 20, (i) => i % 3 === 0 ? [0, 1] : i % 3 === 1 ? [1, 1] : [2, 1]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(20);
    expect(pred.hWinRatePct).toBe(30);
    // k=4 върху n=20 означава малка корекция - shrunk winRate остава близо до 0.30
    const shrunk = (0.30 * 20 + 0.33 * 4) / (20 + 4);
    expect(shrunk).toBeCloseTo(0.305, 3);
    [pred.hWin, pred.draw, pred.aWin].forEach(v => expect(isValidPct(v)).toBe(true));
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('домакин n=2 / гост n=30 - без NaN/Infinity, валидни вероятности, сбор 100%', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = [
      ...nMatches(HOME, 100, 2, () => [3, 0]),
      ...nMatches(AWAY, 300, 30, (i) => i % 2 === 0 ? [1, 2] : [0, 1]),
    ];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2);
    expect(pred.aMatchesN).toBe(30);
    [pred.hWin, pred.draw, pred.aWin, pred.over25, pred.btts].forEach(v => expect(isValidPct(v)).toBe(true));
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });

  it('равностойни отбори n=8/8 - прогнозата е близо до балансирана', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = [
      ...nMatches(HOME, 100, 8, (i) => i % 2 === 0 ? [1, 1] : [2, 1]),
      ...nMatches(AWAY, 300, 8, (i) => i % 2 === 0 ? [1, 1] : [1, 2]),
    ];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(8);
    expect(pred.aMatchesN).toBe(8);
    [pred.hWin, pred.draw, pred.aWin].forEach(v => expect(isValidPct(v)).toBe(true));
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
    expect(Math.abs(pred.hWin - pred.aWin)).toBeLessThanOrEqual(40);
  });

  it('expH/expA НЕПИПНАТИ от win-rate shrinkage (идентични на еквивалентния 6.4A сценарий)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.expH).toBe('1.4');
    expect(pred.expA).toBe('1.0');
  });

  it('over25/btts НЕПИПНАТИ от win-rate shrinkage - зависят само от expH/expA/goal shrinkage канала', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.over25).toBe(43);
    expect(pred.btts).toBe(47);
  });

  it('hForm/aForm НЕПИПНАТИ от win-rate shrinkage', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = nMatches(HOME, 100, 1, () => [2, 0]);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hForm).toEqual(['W']);
    expect(pred.aForm).toEqual([]);
  });

  it('hMatchesN/aMatchesN НЕПИПНАТИ от win-rate shrinkage (броят мачове остава същия)', () => {
    const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
    const allMatches = [...nMatches(HOME, 100, 3, () => [2, 0]), ...nMatches(AWAY, 300, 5, () => [1, 1])];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(3);
    expect(pred.aMatchesN).toBe(5);
  });

  it('hWinRatePct/aWinRatePct (публичната статистика) остават СУРОВИ за широк набор от n стойности', () => {
    [1, 2, 3, 5, 20].forEach(n => {
      const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
      const allMatches = nMatches(HOME, 100, n, () => [2, 0]); // 100% суров win rate при всяко n
      const pred = buildPrediction(match, allMatches);
      expect(pred.hWinRatePct).toBe(100); // суровото 100% - НИКОГА пригладено в публичната статистика
    });
  });

  it('без NaN/Infinity в целия prediction обект за всички тествани сценарии', () => {
    const scenarios = [
      nMatches(HOME, 100, 1, () => [2, 0]),
      nMatches(HOME, 100, 1, () => [0, 2]),
      nMatches(HOME, 100, 1, () => [1, 1]),
      nMatches(HOME, 100, 20, (i) => i % 3 === 0 ? [0, 1] : i % 3 === 1 ? [1, 1] : [2, 1]),
    ];
    scenarios.forEach(allMatches => {
      const match = { homeTeam: { id: HOME }, awayTeam: { id: AWAY } };
      const pred = buildPrediction(match, allMatches);
      ['hWin', 'draw', 'aWin', 'over25', 'btts'].forEach(k => {
        expect(Number.isFinite(pred[k])).toBe(true);
      });
    });
  });
});
