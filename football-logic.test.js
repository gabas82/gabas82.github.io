import { describe, it, expect, beforeEach } from 'vitest';
import {
  calcPct, poissonProb, calcGoalMarkets, goalBefore10, computeRegularScore,
  durationBadge, HIST_KEY, getHistory, saveHistory, migrateHistory,
  calcForm, buildPrediction, calcConfidence, formatMatchDateTime,
  normalizeFootballDataScorers, normalizeApiSportsScorers, topTwoScorers
} from './football-logic.js';

describe('calcPct', () => {
  it('изчислява процент коректно от два числови низа', () => {
    expect(calcPct('3', '1')).toBe(75); // 3/(3+1)
  });
  it('връща 0, когато и двете стойности липсват (избягва деление на 0 чрез ||1)', () => {
    expect(calcPct(null, undefined)).toBe(0);
  });
  it('третира невалиден вход като 0', () => {
    expect(calcPct('abc', '2')).toBe(0); // 0/(0+2)
  });
});

describe('poissonProb', () => {
  it('за lambda=0 връща 1 при k=0 (сигурно събитие)', () => {
    expect(poissonProb(0, 0)).toBeCloseTo(1);
  });
  it('стойностите намаляват с нарастване на k при фиксирана малка lambda', () => {
    const p0 = poissonProb(0.5, 0), p3 = poissonProb(0.5, 3);
    expect(p3).toBeLessThan(p0);
  });
  it('сборът на вероятностите за k=0..30 е близо до 1 (валидно разпределение)', () => {
    let sum = 0;
    for (let k = 0; k <= 30; k++) sum += poissonProb(1.5, k);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('calcGoalMarkets', () => {
  it('over25 расте с по-високо очаквани голове', () => {
    const low = calcGoalMarkets(0.5, 0.5);
    const high = calcGoalMarkets(2.5, 2.5);
    expect(high.over25).toBeGreaterThan(low.over25);
  });
  it('всички проценти са в границите [3,97]', () => {
    const gm = calcGoalMarkets(1.2, 1.1);
    Object.values(gm).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(97);
    });
  });
  it('over05 >= over15 >= over25 >= over35 >= over45 (монотонност на прага)', () => {
    const gm = calcGoalMarkets(1.4, 1.3);
    expect(gm.over05).toBeGreaterThanOrEqual(gm.over15);
    expect(gm.over15).toBeGreaterThanOrEqual(gm.over25);
    expect(gm.over25).toBeGreaterThanOrEqual(gm.over35);
    expect(gm.over35).toBeGreaterThanOrEqual(gm.over45);
  });
});

describe('goalBefore10', () => {
  it('никога не пада под 8%', () => {
    expect(goalBefore10(0.01, 0.01)).toBeGreaterThanOrEqual(8);
  });
  it('никога не надвишава 45%', () => {
    expect(goalBefore10(10, 10)).toBeLessThanOrEqual(45);
  });
  it('расте с повече очаквани голове', () => {
    expect(goalBefore10(3, 3)).toBeGreaterThan(goalBefore10(0.5, 0.5));
  });
});

describe('computeRegularScore / durationBadge', () => {
  it('връща резултата, когато мачът е решен в редовното време', () => {
    const m = { score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 } } };
    expect(computeRegularScore(m)).toEqual({ home: 2, away: 1 });
    expect(durationBadge(m)).toBe('');
  });
  it('връща null, когато е решен с продължения', () => {
    const m = { score: { duration: 'EXTRA_TIME', fullTime: { home: 2, away: 2 } } };
    expect(computeRegularScore(m)).toBeNull();
    expect(durationBadge(m)).toBe(' · ПРОДЪЛЖ.');
  });
  it('връща null, когато е решен с дузпи, и подходящ бадж', () => {
    const m = { score: { duration: 'PENALTY_SHOOTOUT', fullTime: { home: 1, away: 1 } } };
    expect(computeRegularScore(m)).toBeNull();
    expect(durationBadge(m)).toBe(' · ДЗ');
  });
  it('третира липсващ duration като REGULAR', () => {
    const m = { score: { fullTime: { home: 0, away: 0 } } };
    expect(computeRegularScore(m)).toEqual({ home: 0, away: 0 });
  });
});

describe('история (localStorage персистентност)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getHistory връща празен масив при липса на данни', () => {
    expect(getHistory()).toEqual([]);
  });
  it('saveHistory + getHistory кръгова съвместимост', () => {
    const arr = [{ id: 'm1', pred: { hWin: 60 } }];
    saveHistory(arr);
    expect(getHistory()).toEqual(arr);
  });
  it('getHistory не гърми при повредени данни в localStorage', () => {
    localStorage.setItem(HIST_KEY, '{invalid json');
    expect(getHistory()).toEqual([]);
  });
  it('migrateHistory мигрира стария ключ, само ако новият липсва', () => {
    localStorage.setItem('football_pred_history', JSON.stringify([{ id: 'old' }]));
    migrateHistory();
    expect(getHistory()).toEqual([{ id: 'old' }]);
  });
  it('migrateHistory не презаписва вече съществуващ нов ключ', () => {
    saveHistory([{ id: 'new' }]);
    localStorage.setItem('football_pred_history', JSON.stringify([{ id: 'old' }]));
    migrateHistory();
    expect(getHistory()).toEqual([{ id: 'new' }]);
  });
});

describe('calcForm', () => {
  const teamId = 1;
  it('връща празен масив, ако няма изиграни мачове', () => {
    expect(calcForm([], teamId)).toEqual([]);
  });
  it('маркира победа (W), реми (D) и загуба (L) коректно от гледна точка на отбора', () => {
    const matches = [
      { status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { fullTime: { home: 2, away: 0 } } }, // W
      { status: 'FINISHED', homeTeam: { id: 3 }, awayTeam: { id: 1 }, score: { fullTime: { home: 1, away: 1 } } }, // D (away)
      { status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 4 }, score: { fullTime: { home: 0, away: 2 } } }, // L
    ];
    expect(calcForm(matches, teamId)).toEqual(['W', 'D', 'L']);
  });
  it('игнорира недовършени мачове и връща само последните 5', () => {
    const finished = Array.from({ length: 7 }, (_, i) => ({
      status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 99 },
      score: { fullTime: { home: 1, away: 0 } }
    }));
    const scheduled = { status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 99 }, score: { fullTime: {} } };
    const form = calcForm([...finished, scheduled], teamId);
    expect(form).toHaveLength(5);
    expect(form.every(f => f === 'W')).toBe(true);
  });
});

describe('buildPrediction', () => {
  function win(homeId, awayId, hg, ag) {
    return { status: 'FINISHED', homeTeam: { id: homeId }, awayTeam: { id: awayId }, score: { fullTime: { home: hg, away: ag }, halfTime: { home: Math.min(hg,1), away: Math.min(ag,1) } } };
  }

  it('връща null, ако мачът няма и двата отборски ID-та', () => {
    expect(buildPrediction({ homeTeam: {}, awayTeam: { id: 2 } }, [])).toBeNull();
  });

  it('връща null, ако няма никаква историческа статистика за отборите', () => {
    expect(buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, [])).toBeNull();
  });

  it('силен домашен фаворит спрямо слаб гост -> hWin > aWin и коректни суми', () => {
    const history = [
      // отбор 1: 5 победи с 2:0
      win(1, 9, 2, 0), win(9, 1, 0, 2), win(1, 8, 2, 0), win(8, 1, 0, 2), win(1, 7, 2, 0),
      // отбор 2: 5 загуби 0:2
      win(2, 6, 0, 2), win(6, 2, 2, 0), win(2, 5, 0, 2), win(5, 2, 2, 0), win(2, 4, 0, 2),
    ];
    const pred = buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, history);
    expect(pred).not.toBeNull();
    expect(pred.hWin).toBeGreaterThan(pred.aWin);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
    expect(pred.over25 + pred.under25).toBe(100);
    expect(pred.btts + pred.noBtts).toBe(100);
    expect(pred.hForm).toEqual(['W', 'W', 'W', 'W', 'W']);
    expect(pred.aForm).toEqual(['L', 'L', 'L', 'L', 'L']);
  });

  it('топ 4 най-вероятни резултата (topScores) са подредени низходящо по вероятност', () => {
    const history = [win(1, 9, 1, 1), win(2, 8, 1, 1)];
    const pred = buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, history);
    for (let i = 1; i < pred.topScores.length; i++) {
      expect(pred.topScores[i - 1].p).toBeGreaterThanOrEqual(pred.topScores[i].p);
    }
  });
});

describe('calcConfidence', () => {
  it('връща null без прогноза', () => {
    expect(calcConfidence(null, null)).toBeNull();
  });

  it('високо доверие при силен фаворит + ясни над/под и Г/Г сигнали + голяма разлика във форма', () => {
    const pred = {
      hWin: 75, draw: 15, aWin: 10, over25: 85, btts: 20,
      hForm: ['W','W','W','W','W'], aForm: ['L','L','L','L','L']
    };
    const conf = calcConfidence(pred, null);
    expect(conf.score).toBeGreaterThanOrEqual(75);
    expect(conf.factors).toContain('Силен фаворит');
    expect(conf.factors).toContain('Голяма разлика във форма');
  });

  it('ниско доверие при балансирана прогноза без ясни сигнали', () => {
    const pred = {
      hWin: 40, draw: 30, aWin: 30, over25: 50, btts: 50,
      hForm: ['W','L','D','W','L'], aForm: ['L','W','D','L','W']
    };
    const conf = calcConfidence(pred, null);
    expect(conf.score).toBeLessThan(50);
  });

  it('открива VALUE, когато прогнозата се разминава силно с implied вероятностите от коефициентите', () => {
    const pred = { hWin: 70, draw: 15, aWin: 15, over25: 50, btts: 50, hForm: [], aForm: [] };
    const odds = { homeWin: 4.0, draw: 3.5, awayWin: 2.0 }; // implied hWin ~25%, далеч под 70%
    const conf = calcConfidence(pred, odds);
    expect(conf.factors).toContain('VALUE засечен');
  });

  it('резултатът винаги е между 10 и 98', () => {
    const pred = { hWin: 99, draw: 0, aWin: 1, over25: 99, btts: 99, hForm: [], aForm: [] };
    const conf = calcConfidence(pred, null);
    expect(conf.score).toBeGreaterThanOrEqual(10);
    expect(conf.score).toBeLessThanOrEqual(98);
  });
});

describe('formatMatchDateTime', () => {
  it('връща празен низ при липсваща дата', () => {
    expect(formatMatchDateTime(null)).toBe('');
    expect(formatMatchDateTime(undefined)).toBe('');
  });
  it('връща празен низ при невалидна дата', () => {
    expect(formatMatchDateTime('not-a-date')).toBe('');
  });
  it('форматира валидна ISO дата като "дд.мм · чч:мм"', () => {
    const result = formatMatchDateTime('2026-03-15T18:30:00Z');
    expect(result).toMatch(/^\d{2}\.\d{2} · \d{2}:\d{2}$/);
  });
});

describe('normalizeFootballDataScorers', () => {
  it('връща празен масив при липсващи данни', () => {
    expect(normalizeFootballDataScorers(null)).toEqual([]);
    expect(normalizeFootballDataScorers({})).toEqual([]);
  });
  it('филтрира голмайстори с 0 гола', () => {
    const json = { scorers: [{ player: { name: 'A' }, team: { name: 'X' }, goals: 0 }] };
    expect(normalizeFootballDataScorers(json)).toEqual([]);
  });
  it('сортира низходящо по голове, дори ако входът не е сортиран', () => {
    const json = {
      scorers: [
        { player: { name: 'Slow' }, team: { name: 'X' }, goals: 3 },
        { player: { name: 'Fast' }, team: { name: 'Y' }, goals: 10 },
      ]
    };
    const result = normalizeFootballDataScorers(json);
    expect(result.map(s => s.name)).toEqual(['Fast', 'Slow']);
  });
  it('предпочита team.shortName пред team.name', () => {
    const json = { scorers: [{ player: { name: 'A' }, team: { shortName: 'FCX', name: 'Football Club X' }, goals: 5 }] };
    expect(normalizeFootballDataScorers(json)[0].team).toBe('FCX');
  });
});

describe('normalizeApiSportsScorers', () => {
  it('връща празен масив при липсващи данни', () => {
    expect(normalizeApiSportsScorers(null)).toEqual([]);
    expect(normalizeApiSportsScorers({})).toEqual([]);
  });
  it('извлича име, отбор и голове от statistics[0]', () => {
    const json = {
      response: [
        { player: { name: 'Player A' }, statistics: [{ team: { name: 'Team A' }, goals: { total: 12 } }] }
      ]
    };
    expect(normalizeApiSportsScorers(json)).toEqual([{ name: 'Player A', team: 'Team A', goals: 12 }]);
  });
  it('филтрира записи без голове и сортира низходящо', () => {
    const json = {
      response: [
        { player: { name: 'Zero' }, statistics: [{ team: { name: 'Z' }, goals: { total: 0 } }] },
        { player: { name: 'Low' }, statistics: [{ team: { name: 'L' }, goals: { total: 2 } }] },
        { player: { name: 'High' }, statistics: [{ team: { name: 'H' }, goals: { total: 9 } }] },
      ]
    };
    const result = normalizeApiSportsScorers(json);
    expect(result.map(s => s.name)).toEqual(['High', 'Low']);
  });
});

describe('topTwoScorers', () => {
  it('връща само първите 2 елемента', () => {
    const list = [{ name: 'A', team: 'X', goals: 10 }, { name: 'B', team: 'Y', goals: 8 }, { name: 'C', team: 'Z', goals: 5 }];
    expect(topTwoScorers(list)).toEqual([list[0], list[1]]);
  });
  it('връща целия масив, ако е с по-малко от 2 елемента', () => {
    expect(topTwoScorers([])).toEqual([]);
    const one = [{ name: 'A', team: 'X', goals: 3 }];
    expect(topTwoScorers(one)).toEqual(one);
  });
});
