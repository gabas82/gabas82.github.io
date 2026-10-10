import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import {
  calcPct, poissonProb, calcGoalMarkets, goalBefore10, computeRegularScore,
  durationBadge, HIST_KEY, getHistory, saveHistory, migrateHistory,
  calcForm, formDotsHtml, buildPrediction, calcConfidence, formatMatchDateTime,
  normalizeFootballDataScorers, normalizeApiSportsScorers, topTwoScorers,
  calcDoubleChance, doubleChanceHit, doubleChanceLabel, findTeamTopScorer,
  currentSeasonYear, getAsSeasonStartDate, buildAsSeasonHistoryParams,
  buildAsSeasonHistoryQuery, findMatchingRecord, calcTopScorers,
  calibrationBucket, calcCalibration,
  isPreMatchPrediction, mapCompPairKey, teamNamesMatch, isCrossProviderDuplicate,
  pickCanonicalEntry, filterReliableHistory, buildCalibrationReport, calcOverBttsJoint,
  classifyAsLeagueTabEmptyState, sortMatchesByDate,
  limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage
} from './football-logic.js';

// Същата двойка, която football.html държи в COMPS_AS_MAP - копирана тук, за
// да тестваме mapCompPairKey/isCrossProviderDuplicate с реалистични стойности,
// без football.html да бъде зареждан в тестовата среда.
const TEST_COMPS_AS_MAP = { 2000:1,2021:39,2002:78,2019:135,2014:140,2015:61,2001:2,2018:3,2016:172,2003:88,2013:71 };

describe('calcTopScorers', () => {
  const match = { homeTeam: { id: 1, name: 'Домакин' }, awayTeam: { id: 2, name: 'Гост' } };
  it('връща [], ако липсва id на някой от отборите', () => {
    expect(calcTopScorers({ homeTeam: {}, awayTeam: { id: 2 } }, [], [])).toEqual([]);
  });
  it('ползва World Cup голмайсторски списък по teamId, когато е наличен', () => {
    const wcScorers = [{ id: 'p1', name: 'Играч А', teamId: 1, teamName: 'Домакин', goals: 3 }];
    const res = calcTopScorers(match, [], wcScorers);
    expect(res).toEqual([{ id: 'p1', name: 'Играч А', teamId: 1, goals: 3, recentGoals: 0, matchesPlayed: 1 }]);
  });
  it('пада към броене на голове от allMatches, когато няма wcScorers', () => {
    const allMatches = [
      { status: 'FINISHED', utcDate: '2026-01-10', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p2', name: 'Играч Б' }, team: { id: 1 }, type: 'REGULAR' }] },
      { status: 'FINISHED', utcDate: '2026-01-17', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p2', name: 'Играч Б' }, team: { id: 1 }, type: 'REGULAR' }] },
    ];
    const res = calcTopScorers(match, allMatches, []);
    expect(res[0]).toMatchObject({ id: 'p2', name: 'Играч Б', teamId: 1, goals: 2 });
  });
  it('игнорира автоголове (type OWN)', () => {
    const allMatches = [
      { status: 'FINISHED', utcDate: '2026-01-10', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p3', name: 'Играч В' }, team: { id: 1 }, type: 'OWN' }] },
    ];
    expect(calcTopScorers(match, allMatches, [])).toEqual([]);
  });
  it('брои recentGoals само от последните 2 (по дата) завършени мача на отбора', () => {
    const allMatches = [
      { status: 'FINISHED', utcDate: '2026-01-01', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p4', name: 'Играч Г' }, team: { id: 1 }, type: 'REGULAR' }] },
      { status: 'FINISHED', utcDate: '2026-01-08', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p4', name: 'Играч Г' }, team: { id: 1 }, type: 'REGULAR' }] },
      { status: 'FINISHED', utcDate: '2026-01-15', homeTeam: { id: 1 }, awayTeam: { id: 9 },
        goals: [{ scorer: { id: 'p4', name: 'Играч Г' }, team: { id: 1 }, type: 'REGULAR' }] },
    ];
    const res = calcTopScorers(match, allMatches, []);
    expect(res[0]).toMatchObject({ goals: 3, recentGoals: 2, matchesPlayed: 3 });
  });
  it('сортира по голове низходящо и връща максимум 5', () => {
    const wcScorers = Array.from({ length: 7 }, (_, i) => ({
      id: 'p' + i, name: 'Играч ' + i, teamId: 1, teamName: 'Домакин', goals: i + 1,
    }));
    const res = calcTopScorers(match, [], wcScorers);
    expect(res.length).toBe(5);
    expect(res[0].goals).toBe(7);
    expect(res[4].goals).toBe(3);
  });
});

describe('findMatchingRecord', () => {
  it('дава приоритет на точно ID съвпадение дори когато по-ранен кандидат съвпада само по имена', () => {
    const candidates = [
      { id: 'wrong-leg', home: 'Реал', away: 'Байерн', date: '2026-02-01' },
      { id: 'right-leg', home: 'Реал', away: 'Байерн', date: '2026-04-15' },
    ];
    const found = findMatchingRecord(candidates, 'right-leg', ['Реал'], ['Байерн'], '2026-04-15');
    expect(found.id).toBe('right-leg');
  });
  it('при липса на ID пада към единствения кандидат по двойка имена', () => {
    const candidates = [{ id: 'a1', home: 'Арсенал', away: 'Челси', date: '2026-03-01' }];
    const found = findMatchingRecord(candidates, 'no-such-id', ['Арсенал'], ['Челси'], '2026-03-01');
    expect(found.id).toBe('a1');
  });
  it('при реванш (два кандидата със същите отбори) избира най-близкия по дата', () => {
    const candidates = [
      { id: 'leg1', home: 'Ливърпул', away: 'Милан', date: '2026-01-10' },
      { id: 'leg2', home: 'Ливърпул', away: 'Милан', date: '2026-03-20' },
    ];
    const found = findMatchingRecord(candidates, null, ['Ливърпул'], ['Милан'], '2026-03-18');
    expect(found.id).toBe('leg2');
  });
  it('пробва всеки подаден вариант на името на отбора (shortName и пълно име)', () => {
    const candidates = [{ id: 'x', home: 'Man City', away: 'Man Utd', date: '2026-05-01' }];
    const found = findMatchingRecord(candidates, null, ['MCFC', 'Man City'], ['MUFC', 'Man Utd'], '2026-05-01');
    expect(found.id).toBe('x');
  });
  it('връща null без ID и без съвпадение по имена', () => {
    const candidates = [{ id: 'a', home: 'X', away: 'Y', date: '2026-01-01' }];
    expect(findMatchingRecord(candidates, null, ['Z'], ['W'], null)).toBeNull();
  });
});

describe('currentSeasonYear', () => {
  it('връща текущата година, когато сме от юли нататък (началото на новия сезон)', () => {
    expect(currentSeasonYear(new Date('2026-08-09'))).toBe(2026);
    expect(currentSeasonYear(new Date('2026-07-01'))).toBe(2026);
  });
  it('връща предходната година, когато сме преди юли (сезонът стартирал предната есен още тече)', () => {
    expect(currentSeasonYear(new Date('2026-06-30'))).toBe(2025);
    expect(currentSeasonYear(new Date('2026-01-15'))).toBe(2025);
  });
});

// PR A (виж discussion-а "надеждна сезонна история за Ефбет/Сюпер Лиг/БЛ2") -
// чисти season/from/to helper-и, подготвени за бъдещ PR B, но ОЩЕ невключени
// в реалните API заявки (football.html си продължава с last=N непроменено).
describe('getAsSeasonStartDate', () => {
  it('винаги 1 юли на годината на сезона - консервативна долна граница', () => {
    expect(getAsSeasonStartDate(2026)).toBe('2026-07-01');
    expect(getAsSeasonStartDate(2025)).toBe('2025-07-01');
  });
});

describe('buildAsSeasonHistoryParams', () => {
  it('юни (преди прага) -> сезон = предходна година, from = 1 юли на нея', () => {
    const p = buildAsSeasonHistoryParams(172, new Date('2026-06-30T12:00:00Z'));
    expect(p).toEqual({ league: 172, season: 2025, from: '2025-07-01', to: '2026-06-30' });
  });
  it('юли (на/след прага) -> сезон = текущата година, from = 1 юли на нея (преминаване към нов сезон)', () => {
    const p = buildAsSeasonHistoryParams(172, new Date('2026-07-01T12:00:00Z'));
    expect(p).toEqual({ league: 172, season: 2026, from: '2026-07-01', to: '2026-07-01' });
  });
  it('различни текущи дати в средата на сезона връщат стабилен season/from, променящо се само to', () => {
    const a = buildAsSeasonHistoryParams(203, new Date('2026-10-10T08:00:00Z'));
    const b = buildAsSeasonHistoryParams(203, new Date('2026-12-25T08:00:00Z'));
    expect(a.season).toBe(2026);
    expect(b.season).toBe(2026);
    expect(a.from).toBe('2026-07-01');
    expect(b.from).toBe('2026-07-01');
    expect(a.to).toBe('2026-10-10');
    expect(b.to).toBe('2026-12-25');
  });
  it('различна лига (БЛ2, id 79) носи своето league, без да пипа season/from/to логиката', () => {
    const p = buildAsSeasonHistoryParams(79, new Date('2026-10-10T08:00:00Z'));
    expect(p.league).toBe(79);
    expect(p.season).toBe(2026);
  });
  it('без подаден now използва реалната текуща дата (fallback, не throw)', () => {
    const p = buildAsSeasonHistoryParams(172);
    expect(typeof p.to).toBe('string');
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildAsSeasonHistoryQuery', () => {
  it('коректно форматиране на параметрите - league, season, from, to в този ред, без лишни символи', () => {
    const q = buildAsSeasonHistoryQuery(172, new Date('2026-10-10T08:00:00Z'));
    expect(q).toBe('league=172&season=2026&from=2026-07-01&to=2026-10-10');
  });
  it('съдържа точно същите season/from стойности като buildAsSeasonHistoryParams за същия вход (без разминаване между двата helper-а)', () => {
    const now = new Date('2026-03-15T00:00:00Z');
    const p = buildAsSeasonHistoryParams(203, now);
    const q = buildAsSeasonHistoryQuery(203, now);
    expect(q).toBe(`league=${p.league}&season=${p.season}&from=${p.from}&to=${p.to}`);
  });
  it('границата юни/юли се отразява коректно и в готовия query string', () => {
    expect(buildAsSeasonHistoryQuery(79, new Date('2026-06-30T23:59:00Z')))
      .toBe('league=79&season=2025&from=2025-07-01&to=2026-06-30');
    expect(buildAsSeasonHistoryQuery(79, new Date('2026-07-01T00:00:00Z')))
      .toBe('league=79&season=2026&from=2026-07-01&to=2026-07-01');
  });
});

describe('formDotsHtml', () => {
  it('връща индикатор "няма данни" за празна форма', () => {
    expect(formDotsHtml([])).toContain('няма данни');
  });
  it('рендира по една точка на резултат, в реда на подадения масив', () => {
    const html = formDotsHtml(['W', 'D', 'L']);
    expect((html.match(/class="fd /g) || []).length).toBe(3);
    expect(html).toContain('fd W');
    expect(html).toContain('fd D');
    expect(html).toContain('fd L');
  });
});

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

  // BIDIRECTIONAL MARKETS - "Под" полетата са чист комплемент 100-Над, никога
  // отделна формула (виж коментара в calcGoalMarkets) - затова всяка Над/Под
  // двойка трябва да сумира ТОЧНО 100, без изключение, за всякакви λ.
  it('всяка Над/Под двойка (overall + отборски) сумира точно до 100', () => {
    const gm = calcGoalMarkets(1.4, 1.3);
    expect(gm.over05 + gm.under05).toBe(100);
    expect(gm.over15 + gm.under15).toBe(100);
    expect(gm.over25 + gm.under25).toBe(100);
    expect(gm.over35 + gm.under35).toBe(100);
    expect(gm.over45 + gm.under45).toBe(100);
    expect(gm.hOver05 + gm.hUnder05).toBe(100);
    expect(gm.hOver15 + gm.hUnder15).toBe(100);
    expect(gm.aOver05 + gm.aUnder05).toBe(100);
    expect(gm.aOver15 + gm.aUnder15).toBe(100);
  });
  it('Над/Под сумират до 100 и в екстремни (почти 0 и много високи) λ стойности', () => {
    const extremeLow = calcGoalMarkets(0.01, 0.01);
    const extremeHigh = calcGoalMarkets(6, 6);
    [extremeLow, extremeHigh].forEach(gm => {
      expect(gm.over05 + gm.under05).toBe(100);
      expect(gm.over45 + gm.under45).toBe(100);
      expect(gm.hOver05 + gm.hUnder05).toBe(100);
      expect(gm.aOver15 + gm.aUnder15).toBe(100);
    });
  });
  it('Под 0.5 < Под 1.5 < Под 3.5 < Под 4.5 (огледална монотонност спрямо Над)', () => {
    const gm = calcGoalMarkets(1.4, 1.3);
    expect(gm.under05).toBeLessThanOrEqual(gm.under15);
    expect(gm.under15).toBeLessThanOrEqual(gm.under35);
    expect(gm.under35).toBeLessThanOrEqual(gm.under45);
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

  it('cornersOver + cornersUnder сумират точно до 100 (чист комплемент, огледално на under25/noBtts)', () => {
    const history = [win(1, 9, 2, 0), win(9, 1, 0, 2), win(2, 6, 0, 2), win(6, 2, 2, 0)];
    const pred = buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, history);
    expect(pred.cornersOver + pred.cornersUnder).toBe(100);
  });

  it('gm (overall) и gmHt (полувреме) и двата носят симетрични Под полета, понеже gmHt реюзва calcGoalMarkets', () => {
    const history = [win(1, 9, 2, 0), win(9, 1, 0, 2), win(2, 6, 0, 2), win(6, 2, 2, 0)];
    const pred = buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, history);
    expect(pred.gm.over25 + pred.gm.under25).toBe(100);
    expect(pred.gmHt.over15 + pred.gmHt.under15).toBe(100);
    expect(pred.gmHt.hOver05 + pred.gmHt.hUnder05).toBe(100);
  });
});

// НАД/ПОД 1X2 NaN GUARD (виж discussion-а "патологичен 1X2 случай") - hWinP/aWinP
// ТЕОРЕТИЧНО могат едновременно да закръглят до 0 (напр. при изроден вход), а
// старата формула hWinAdj=Math.round(hWinP*(100-drawP)/(hWinP+aWinP)) би делила
// на 0 -> NaN, което би счупило сумата до 100%. Двойна проверка: (1) структурна -
// че guard-ът реално съществува в shipped кода; (2) поведенческа - че точната
// формула от football-logic.js пази сумата=100 без NaN дори при hWinP=aWinP=0.
describe('1X2 NaN guard (патологичен случай hWinP=aWinP=0)', () => {
  const src = fs.readFileSync('./football-logic.js', 'utf8');
  it('guard-ът е реално присъстващ в football-logic.js (не е само в тестовете)', () => {
    expect(/const hWinAaWinDenom=hWinP\+aWinP;/.test(src)).toBe(true);
    expect(/hWinAaWinDenom>0\?Math\.round\(hWinP\*\(100-drawP\)\/hWinAaWinDenom\):Math\.round\(\(100-drawP\)\/2\)/.test(src)).toBe(true);
  });
  it('точната shipped формула пази сумата=100 без NaN, когато hWinP=aWinP=0', () => {
    const hWinP = 0, aWinP = 0;
    const drawP = Math.max(5, 100 - hWinP - aWinP);
    const hWinAaWinDenom = hWinP + aWinP;
    const hWinAdj = hWinAaWinDenom > 0 ? Math.round(hWinP * (100 - drawP) / hWinAaWinDenom) : Math.round((100 - drawP) / 2);
    const aWinAdj = 100 - drawP - hWinAdj;
    expect(Number.isNaN(hWinAdj)).toBe(false);
    expect(Number.isNaN(aWinAdj)).toBe(false);
    expect(hWinAdj + drawP + aWinAdj).toBe(100);
  });
  it('нормалният (не-патологичен) път остава непроменен - реален buildPrediction резултат пази сумата=100', () => {
    function win(homeId, awayId, hg, ag) {
      return { status: 'FINISHED', homeTeam: { id: homeId }, awayTeam: { id: awayId }, score: { fullTime: { home: hg, away: ag }, halfTime: { home: Math.min(hg,1), away: Math.min(ag,1) } } };
    }
    const history = [win(1, 9, 2, 0), win(9, 1, 0, 2), win(2, 6, 0, 2), win(6, 2, 2, 0)];
    const pred = buildPrediction({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }, history);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
  });
});

describe('calcOverBttsJoint', () => {
  it('четворната разбивка (overBttsYes/No + underBttsYes/No) сумира точно до 100', () => {
    const j = calcOverBttsJoint(1.4, 1.3, 2.5);
    expect(j.overBttsYes + j.overBttsNo + j.underBttsYes + j.underBttsNo).toBe(100);
  });
  it('сумира до 100 и в екстремни λ стойности (почти 0 и много високи)', () => {
    const low = calcOverBttsJoint(0.1, 0.1, 2.5);
    const high = calcOverBttsJoint(5, 5, 2.5);
    expect(low.overBttsYes + low.overBttsNo + low.underBttsYes + low.underBttsNo).toBe(100);
    expect(high.overBttsYes + high.overBttsNo + high.underBttsYes + high.underBttsNo).toBe(100);
  });
  it('по подразбиране (без n) ползва праг 2.5, идентично с изричен calcOverBttsJoint(expH,expA,2.5)', () => {
    const withDefault = calcOverBttsJoint(1.4, 1.3);
    const explicit = calcOverBttsJoint(1.4, 1.3, 2.5);
    expect(withDefault).toEqual(explicit);
  });
  it('трите директно клампнати компонента (overBttsYes/No, underBttsYes) са в границите [3,97], остатъкът underBttsNo >= 0', () => {
    const j = calcOverBttsJoint(1.4, 1.3, 2.5);
    expect(j.overBttsYes).toBeGreaterThanOrEqual(3);
    expect(j.overBttsYes).toBeLessThanOrEqual(97);
    expect(j.overBttsNo).toBeGreaterThanOrEqual(3);
    expect(j.overBttsNo).toBeLessThanOrEqual(97);
    expect(j.underBttsYes).toBeGreaterThanOrEqual(3);
    expect(j.underBttsYes).toBeLessThanOrEqual(97);
    expect(j.underBttsNo).toBeGreaterThanOrEqual(0);
  });
  it('съвместната overBttsYes+overBttsNo е в приемлив толеранс от съществуващия маргинален over25 за типична (не-екстремна) λ - проверка за консистентност между интерфейса и съвместната вероятност', () => {
    const expH = 1.4, expA = 1.3;
    const gm = calcGoalMarkets(expH, expA);
    const j = calcOverBttsJoint(expH, expA, 2.5);
    const jointOverMarginal = j.overBttsYes + j.overBttsNo;
    expect(Math.abs(jointOverMarginal - gm.over25)).toBeLessThanOrEqual(6); // толеранс заради независим [3,97] клампинг на всяка страна
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
    expect(normalizeApiSportsScorers(json)).toEqual([{ name: 'Player A', team: 'Team A', teamId: null, goals: 12 }]);
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

describe('findTeamTopScorer', () => {
  const list = [
    { name: 'Star Striker', team: 'Team A', teamId: 1, goals: 20 },
    { name: 'Backup Striker', team: 'Team A', teamId: 1, goals: 5 },
    { name: 'Rival Striker', team: 'Team B', teamId: 2, goals: 15 },
  ];
  it('намира голмайстора с най-много голове за даден teamId (списъкът вече е сортиран)', () => {
    expect(findTeamTopScorer(list, 1, 'Team A')).toEqual(list[0]);
    expect(findTeamTopScorer(list, 2, 'Team B')).toEqual(list[2]);
  });
  it('връща null, ако отборът няма нито един голмайстор в списъка', () => {
    expect(findTeamTopScorer(list, 999, 'Team C')).toBeNull();
  });
  it('пада обратно към съвпадение по име, когато teamId липсва в данните', () => {
    const noIdList = [{ name: 'Player X', team: 'Real Madrid', teamId: null, goals: 10 }];
    expect(findTeamTopScorer(noIdList, null, 'Real Madrid')).toEqual(noIdList[0]);
  });
  it('не бърка отбори с различен teamId дори при подобни имена', () => {
    expect(findTeamTopScorer(list, 2, 'Team A')).toEqual(list[2]);
  });
});

describe('calcDoubleChance', () => {
  it('изключва госта, когато той е най-малко вероятен -> 1X', () => {
    expect(calcDoubleChance(70, 20, 10)).toEqual({ pick: '1X', pct: 90 });
  });
  it('изключва домакина, когато той е най-малко вероятен -> X2', () => {
    expect(calcDoubleChance(10, 20, 70)).toEqual({ pick: 'X2', pct: 90 });
  });
  it('изключва равенството, когато то е най-малко вероятно -> 12', () => {
    expect(calcDoubleChance(45, 10, 45)).toEqual({ pick: '12', pct: 90 });
  });
});

describe('doubleChanceHit', () => {
  it('1X печели при победа на домакина или равенство', () => {
    expect(doubleChanceHit('1X', '1')).toBe(true);
    expect(doubleChanceHit('1X', 'X')).toBe(true);
    expect(doubleChanceHit('1X', '2')).toBe(false);
  });
  it('X2 печели при равенство или победа на госта', () => {
    expect(doubleChanceHit('X2', 'X')).toBe(true);
    expect(doubleChanceHit('X2', '2')).toBe(true);
    expect(doubleChanceHit('X2', '1')).toBe(false);
  });
  it('12 печели при победа на който и да е от двата тима, но не и равенство', () => {
    expect(doubleChanceHit('12', '1')).toBe(true);
    expect(doubleChanceHit('12', '2')).toBe(true);
    expect(doubleChanceHit('12', 'X')).toBe(false);
  });
});

describe('doubleChanceLabel', () => {
  it('връща четим етикет за всяка от трите комбинации', () => {
    expect(doubleChanceLabel('1X')).toContain('1X');
    expect(doubleChanceLabel('X2')).toContain('X2');
    expect(doubleChanceLabel('12')).toContain('12');
  });
});

describe('calibrationBucket', () => {
  it('групира по 10-пунктови кофи', () => {
    expect(calibrationBucket(55)).toBe('50-59%');
    expect(calibrationBucket(50)).toBe('50-59%');
    expect(calibrationBucket(59)).toBe('50-59%');
    expect(calibrationBucket(60)).toBe('60-69%');
  });
  it('капва на 90-99%, дори при 100%', () => {
    expect(calibrationBucket(100)).toBe('90-99%');
    expect(calibrationBucket(95)).toBe('90-99%');
  });
});

describe('calcCalibration', () => {
  function entry(pred, result) {
    return { pred, result };
  }
  it('празна история -> всеки пазар с празен rows масив, без throw', () => {
    const res = calcCalibration([]);
    expect(res.length).toBe(4);
    res.forEach(m => expect(m.rows).toEqual([]));
  });
  it('игнорира записи без result (все още неизиграни) и decidedAfterRegulation (продължения/дузпи)', () => {
    const hist = [
      entry({ hWin: 70, draw: 15, aWin: 15, over25: 60, btts: 55, g10: 20 }, null),
      entry({ hWin: 70, draw: 15, aWin: 15, over25: 60, btts: 55, g10: 20 }, { decidedAfterRegulation: true, fullHg: 2, fullAg: 1 }),
    ];
    const res = calcCalibration(hist);
    res.forEach(m => expect(m.rows).toEqual([]));
  });
  it('1X2: групира по вероятността на ПОСОЧЕНИЯ изход (не винаги hWin) и смята реално hit rate', () => {
    const hist = [
      // две прогнози с hWin=75% (кофа 70-79%), едната позна (winner=1), другата не (winner=2)
      entry({ hWin: 75, draw: 15, aWin: 10, over25: 50, btts: 50, g10: 20 }, { winner: '1', total: 2, gg: false }),
      entry({ hWin: 75, draw: 15, aWin: 10, over25: 50, btts: 50, g10: 20 }, { winner: '2', total: 2, gg: false }),
      // прогноза, в която ГОСТЪТ е посочения фаворит (aWin е max) - трябва да ползва aWin%, не hWin%
      entry({ hWin: 10, draw: 15, aWin: 75, over25: 50, btts: 50, g10: 20 }, { winner: '2', total: 2, gg: false }),
    ];
    const res = calcCalibration(hist);
    const m1x2 = res.find(m => m.market === '1x2');
    expect(m1x2.rows).toEqual([{ bucket: '70-79%', n: 3, avgPredictedPct: 75, actualPct: 67 }]);
  });
  it('НАД/ПОД 2.5: ползва 100-over25 когато ПОД е посоченият изход', () => {
    const hist = [
      // over25=30% -> моделът реално сочи ПОД 2.5 с 70% - кофа 70-79%, познава (total<=2.5)
      entry({ hWin: 40, draw: 30, aWin: 30, over25: 30, btts: 50, g10: 20 }, { winner: 'X', total: 2, gg: true }),
    ];
    const res = calcCalibration(hist);
    const mOver = res.find(m => m.market === 'over25');
    expect(mOver.rows).toEqual([{ bucket: '70-79%', n: 1, avgPredictedPct: 70, actualPct: 100 }]);
  });
  it('Г/Г: ползва 100-btts когато "Г/Г НЕ" е посоченият изход', () => {
    const hist = [
      // btts=20% -> моделът сочи "Г/Г НЕ" с 80% - реалност gg=false -> hit
      entry({ hWin: 40, draw: 30, aWin: 30, over25: 50, btts: 20, g10: 20 }, { winner: 'X', total: 1, gg: false }),
    ];
    const res = calcCalibration(hist);
    const mBtts = res.find(m => m.market === 'btts');
    expect(mBtts.rows).toEqual([{ bucket: '80-89%', n: 1, avgPredictedPct: 80, actualPct: 100 }]);
  });
  it('ДВОЕН ШАНС: верифицира чрез doubleChanceHit срещу реалния winner', () => {
    const hist = [
      // hWin=10,draw=20,aWin=70 -> най-малко вероятно е hWin -> pick X2, pct=90
      entry({ hWin: 10, draw: 20, aWin: 70, over25: 50, btts: 50, g10: 20 }, { winner: '2', total: 2, gg: false }),
    ];
    const res = calcCalibration(hist);
    const mDc = res.find(m => m.market === 'dc');
    expect(mDc.rows).toEqual([{ bucket: '90-99%', n: 1, avgPredictedPct: 90, actualPct: 100 }]);
  });
  it('totalN отразява броя resolved (верифицируеми) записи, не общия брой в history', () => {
    const hist = [
      entry({ hWin: 75, draw: 15, aWin: 10, over25: 50, btts: 50, g10: 20 }, { winner: '1', total: 2, gg: false }),
      entry({ hWin: 75, draw: 15, aWin: 10, over25: 50, btts: 50, g10: 20 }, null),
    ];
    const res = calcCalibration(hist);
    expect(res[0].totalN).toBe(1);
  });
});

// ============================================================================
// PRE-MATCH ONLY + CROSS-PROVIDER DEDUPLICATION (виж discussion-а "качество
// на статистиката")
// ============================================================================
const KICKOFF = '2026-11-01T18:00:00Z';
const KICKOFF_MS = new Date(KICKOFF).getTime();

describe('isPreMatchPrediction', () => {
  it('true: savedAt строго преди kickoff, няма statusAtSave (стар запис - fallback)', () => {
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS - 60000, date: KICKOFF })).toBe(true);
  });
  it('true: savedAt преди kickoff И statusAtSave е SCHEDULED/TIMED (нов запис)', () => {
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS - 60000, date: KICKOFF, statusAtSave: 'SCHEDULED' })).toBe(true);
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS - 60000, date: KICKOFF, statusAtSave: 'TIMED' })).toBe(true);
  });
  it('false: savedAt СЛЕД kickoff (записано, докато мачът вече тече)', () => {
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS + 60000, date: KICKOFF })).toBe(false);
  });
  it('false: savedAt точно = kickoff (строго "преди", не "преди или равно")', () => {
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS, date: KICKOFF })).toBe(false);
  });
  it('false: savedAt е преди kickoff, НО statusAtSave противоречи (IN_PLAY) - статусът override-ва', () => {
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS - 60000, date: KICKOFF, statusAtSave: 'IN_PLAY' })).toBe(false);
  });
  it('false: липсващ savedAt или date - не може да се потвърди, не се приема за pre-match', () => {
    expect(isPreMatchPrediction({ date: KICKOFF })).toBe(false);
    expect(isPreMatchPrediction({ savedAt: KICKOFF_MS - 60000 })).toBe(false);
    expect(isPreMatchPrediction(null)).toBe(false);
  });
});

describe('mapCompPairKey', () => {
  it('намира двойката от football-data.org числов id', () => {
    expect(mapCompPairKey(2021, TEST_COMPS_AS_MAP)).toBe('2021|39');
  });
  it('намира двойката от api-sports "as_"-префиксиран id (обратна посока)', () => {
    expect(mapCompPairKey('as_39', TEST_COMPS_AS_MAP)).toBe('2021|39');
  });
  it('null за лига, която не е в mapping-а (не е от 7-те застъпващи се)', () => {
    expect(mapCompPairKey(9999, TEST_COMPS_AS_MAP)).toBeNull();
    expect(mapCompPairKey('as_9999', TEST_COMPS_AS_MAP)).toBeNull();
  });
  it('null при липсващ compId или mapping', () => {
    expect(mapCompPairKey(null, TEST_COMPS_AS_MAP)).toBeNull();
    expect(mapCompPairKey(2021, null)).toBeNull();
  });
});

describe('teamNamesMatch', () => {
  it('точно съвпадение (case-insensitive)', () => {
    expect(teamNamesMatch('Aston Villa', 'aston villa')).toBe(true);
  });
  it('фъзи съвпадение чрез includes в двете посоки', () => {
    expect(teamNamesMatch('Aston Villa', 'Villa')).toBe(true);
    expect(teamNamesMatch('Villa', 'Aston Villa FC')).toBe(true);
  });
  it('false при различни имена', () => {
    expect(teamNamesMatch('Aston Villa', 'Brentford')).toBe(false);
  });
  it('false при липсващо име', () => {
    expect(teamNamesMatch('', 'Brentford')).toBe(false);
    expect(teamNamesMatch(null, 'Brentford')).toBe(false);
  });
});

describe('isCrossProviderDuplicate', () => {
  function fd(overrides) {
    return { id: 'fd1', compId: 2021, date: KICKOFF, home: 'Aston Villa', away: 'Brentford', ...overrides };
  }
  function as(overrides) {
    return { id: 'as_1', compId: 'as_39', date: KICKOFF, home: 'Aston Villa FC', away: 'Brentford FC', ...overrides };
  }
  it('true: един реален мач от два доставчика - сдвоена лига, близко kickoff, и двата отбора фъзи-съвпадат', () => {
    expect(isCrossProviderDuplicate(fd(), as(), TEST_COMPS_AS_MAP)).toBe(true);
  });
  it('true: kickoff разлика в рамките на толеранса (под 5 мин)', () => {
    expect(isCrossProviderDuplicate(fd(), as({ date: '2026-11-01T18:03:00Z' }), TEST_COMPS_AS_MAP)).toBe(true);
  });
  it('false: различни мачове с ПОДОБНИ имена, но kickoff разлика извън толеранса (напр. различен ден)', () => {
    expect(isCrossProviderDuplicate(fd(), as({ date: '2026-11-03T18:00:00Z' }), TEST_COMPS_AS_MAP)).toBe(false);
  });
  it('false: нееднозначно съвпадение - само ЕДНОТО от двете имена съвпада (различен гост отбор)', () => {
    expect(isCrossProviderDuplicate(fd(), as({ away: 'Fulham' }), TEST_COMPS_AS_MAP)).toBe(false);
  });
  it('false: СЪЩИЯТ доставчик (не cross-provider) - дори да съвпада всичко останало', () => {
    expect(isCrossProviderDuplicate(fd(), fd({ id: 'fd2' }), TEST_COMPS_AS_MAP)).toBe(false);
  });
  it('false: липсващ compId от едната страна - несигурно, не се обединява', () => {
    expect(isCrossProviderDuplicate(fd({ compId: null }), as(), TEST_COMPS_AS_MAP)).toBe(false);
  });
  it('false: лигата не е сдвоена в compsAsMap (несигурно - стар запис без metadata)', () => {
    expect(isCrossProviderDuplicate(fd({ compId: 9999 }), as({ compId: 'as_9999' }), TEST_COMPS_AS_MAP)).toBe(false);
  });
});

describe('pickCanonicalEntry', () => {
  it('избира НАЙ-РАННАТА валидна pre-match прогноза (по savedAt), не осреднява', () => {
    const group = [
      { id: 'a', savedAt: KICKOFF_MS - 120000, date: KICKOFF, pred: { hWin: 70 } },
      { id: 'b', savedAt: KICKOFF_MS - 60000, date: KICKOFF, pred: { hWin: 50 } },
    ];
    const res = pickCanonicalEntry(group);
    expect(res.id).toBe('a');
    expect(res.pred.hWin).toBe(70); // не средно (60), конкретният по-ранен запис
  });
  it('игнорира не-pre-match записи в групата, дори да са "по-ранни" по savedAt', () => {
    const group = [
      { id: 'live', savedAt: KICKOFF_MS + 10000, date: KICKOFF, statusAtSave: 'IN_PLAY' }, // не pre-match
      { id: 'pre', savedAt: KICKOFF_MS - 30000, date: KICKOFF, statusAtSave: 'SCHEDULED' },
    ];
    expect(pickCanonicalEntry(group).id).toBe('pre');
  });
  it('null, ако НИТО един запис в групата не е pre-match', () => {
    const group = [
      { id: 'a', savedAt: KICKOFF_MS + 1000, date: KICKOFF },
      { id: 'b', savedAt: KICKOFF_MS + 2000, date: KICKOFF },
    ];
    expect(pickCanonicalEntry(group)).toBeNull();
  });
});

describe('filterReliableHistory', () => {
  function entry(overrides) {
    return {
      id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
      savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED',
      pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 },
      result: { winner: '1', total: 2, gg: false },
      ...overrides,
    };
  }
  it('включва валиден pre-match запис, без дубликати', () => {
    const res = filterReliableHistory([entry({ id: 'a' })], TEST_COMPS_AS_MAP);
    expect(res.reliable.map(e => e.id)).toEqual(['a']);
    expect(res.totalHistory).toBe(1);
    expect(res.totalResolved).toBe(1);
    expect(res.preMatchCount).toBe(1);
    expect(res.excludedLate).toBe(0);
    expect(res.excludedDuplicate).toBe(0);
  });
  it('изключва закъснели (savedAt след kickoff) записи, пази ги извън reliable-а, но ги брои в excludedLate', () => {
    const late = entry({ id: 'late', savedAt: KICKOFF_MS + 60000, statusAtSave: 'IN_PLAY' });
    const res = filterReliableHistory([entry({ id: 'a' }), late], TEST_COMPS_AS_MAP);
    expect(res.reliable.map(e => e.id)).toEqual(['a']);
    expect(res.excludedLate).toBe(1);
  });
  it('игнорира незавършени (result:null) и decidedAfterRegulation записи - не влизат никъде в бройките за late/dup', () => {
    const notPlayed = entry({ id: 'np', result: null });
    const extraTime = entry({ id: 'et', result: { decidedAfterRegulation: true, fullHg: 2, fullAg: 1 } });
    const res = filterReliableHistory([entry({ id: 'a' }), notPlayed, extraTime], TEST_COMPS_AS_MAP);
    expect(res.totalHistory).toBe(3);
    expect(res.totalResolved).toBe(1); // само 'a'
    expect(res.reliable.map(e => e.id)).toEqual(['a']);
  });
  it('обединява cross-provider дубликат - избира по-ранния pre-match, брои другия в excludedDuplicate', () => {
    const fdEntry = entry({ id: 'fd1', compId: 2021, savedAt: KICKOFF_MS - 120000 });
    const asEntry = entry({ id: 'as1', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', savedAt: KICKOFF_MS - 30000 });
    const res = filterReliableHistory([asEntry, fdEntry], TEST_COMPS_AS_MAP);
    expect(res.reliable.length).toBe(1);
    expect(res.reliable[0].id).toBe('fd1'); // по-ранният savedAt
    expect(res.excludedDuplicate).toBe(1);
    expect(res.preMatchCount).toBe(2); // и двата бяха pre-match individually, дубликатът се маха СЛЕД това
  });
  it('НЕ обединява два различни мача с подобни имена (различен kickoff)', () => {
    const a = entry({ id: 'a', compId: 2021 });
    const b = entry({ id: 'b', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', date: '2026-11-08T18:00:00Z', savedAt: new Date('2026-11-08T18:00:00Z').getTime() - 60000 });
    const res = filterReliableHistory([a, b], TEST_COMPS_AS_MAP);
    expect(res.reliable.map(e => e.id).sort()).toEqual(['a', 'b']);
    expect(res.excludedDuplicate).toBe(0);
  });
  it('оригиналният масив не се мутира (без изтриване/презаписване)', () => {
    const hist = [entry({ id: 'a' }), entry({ id: 'late', savedAt: KICKOFF_MS + 60000 })];
    const snapshot = JSON.parse(JSON.stringify(hist));
    filterReliableHistory(hist, TEST_COMPS_AS_MAP);
    expect(hist).toEqual(snapshot);
  });
});

describe('buildCalibrationReport', () => {
  it('комбинира filterReliableHistory + calcCalibration (непроменен) в един отчет с прозрачни бройки', () => {
    const entries = [
      { id: 'a', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021, savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED', pred: { hWin: 75, draw: 15, aWin: 10, over25: 55, btts: 50, g10: 20 }, result: { winner: '1', total: 2, gg: false } },
    ];
    const res = buildCalibrationReport(entries, TEST_COMPS_AS_MAP);
    expect(res.totalHistory).toBe(1);
    expect(res.reliableCount).toBe(1);
    expect(res.markets.find(m => m.market === '1x2').rows[0]).toMatchObject({ n: 1, avgPredictedPct: 75, actualPct: 100 });
  });
  it('историческа извадка без metadata (стар запис без compId/statusAtSave) - все още влиза през timestamp fallback, не чупи отчета', () => {
    const legacy = { id: 'legacy', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', savedAt: KICKOFF_MS - 60000, pred: { hWin: 60, draw: 20, aWin: 20, over25: 50, btts: 50, g10: 20 }, result: { winner: '1', total: 2, gg: false } };
    const res = buildCalibrationReport([legacy], TEST_COMPS_AS_MAP);
    expect(res.reliableCount).toBe(1);
    expect(res.excludedDuplicate).toBe(0);
  });
});

// F1 ДИАГНОСТИКА (виж discussion-а "Празен API отговор да не се приема
// автоматично за незапочнал сезон") - loadASLeagueTab() в football.html ползва
// тази чиста функция, за да различи реално празен сезон от провалена заявка.
describe('classifyAsLeagueTabEmptyState', () => {
  it('всичките fulfilled -> EMPTY_SEASON (действително празен сезон)', () => {
    const res = [{ status: 'fulfilled', value: {} }, { status: 'fulfilled', value: {} }, { status: 'fulfilled', value: {} }];
    expect(classifyAsLeagueTabEmptyState(res)).toBe('EMPTY_SEASON');
  });
  it('поне едно rejected -> FETCH_ERROR, дори другите да са fulfilled', () => {
    const res = [{ status: 'fulfilled', value: {} }, { status: 'rejected', reason: new Error('boom') }, { status: 'fulfilled', value: {} }];
    expect(classifyAsLeagueTabEmptyState(res)).toBe('FETCH_ERROR');
  });
  it('всичките rejected -> FETCH_ERROR', () => {
    const res = [{ status: 'rejected' }, { status: 'rejected' }, { status: 'rejected' }];
    expect(classifyAsLeagueTabEmptyState(res)).toBe('FETCH_ERROR');
  });
  // Празен/невалиден вход НЕ е доказателство за празен сезон - преди
  // връщаше EMPTY_SEASON по подразбиране, което погрешно твърдеше "сезонът
  // не е започнал", докато всъщност просто нямаме надеждна информация.
  it('празен масив -> UNKNOWN_ERROR (не е доказателство за празен сезон)', () => {
    expect(classifyAsLeagueTabEmptyState([])).toBe('UNKNOWN_ERROR');
  });
  it('null/undefined вход -> UNKNOWN_ERROR, не хвърля', () => {
    expect(classifyAsLeagueTabEmptyState(null)).toBe('UNKNOWN_ERROR');
    expect(classifyAsLeagueTabEmptyState(undefined)).toBe('UNKNOWN_ERROR');
  });
  it('вход, който не е масив (напр. обект) -> UNKNOWN_ERROR', () => {
    expect(classifyAsLeagueTabEmptyState({ status: 'fulfilled' })).toBe('UNKNOWN_ERROR');
  });
  it('масив с развален запис (null елемент, липсващ/невалиден status) -> UNKNOWN_ERROR, дори другите да са валидни fulfilled', () => {
    expect(classifyAsLeagueTabEmptyState([{ status: 'fulfilled' }, null])).toBe('UNKNOWN_ERROR');
    expect(classifyAsLeagueTabEmptyState([{ status: 'fulfilled' }, {}])).toBe('UNKNOWN_ERROR');
    expect(classifyAsLeagueTabEmptyState([{ status: 'fulfilled' }, { status: 'pending' }])).toBe('UNKNOWN_ERROR');
  });
  it('EMPTY_SEASON се връща само при валиден непразен масив, изцяло от успешни (fulfilled) резултати', () => {
    const res = [{ status: 'fulfilled', value: { response: [] } }, { status: 'fulfilled', value: { response: [] } }];
    expect(classifyAsLeagueTabEmptyState(res)).toBe('EMPTY_SEASON');
  });
});

// F2a ХРОНОЛОГИЧНО СОРТИРАНЕ (виж discussion-а "прогнозите не трябва да
// зависят от реда на отваряне на табовете"). calcForm() (.slice(-5)) и
// football.html-овите form5Html()/htTrendHtml() предполагат allMatches да е
// ВЕЧЕ възходящо хронологично подреден. loadUpcoming() сглобява allMatches от
// няколко fetch-а без гаранция за общ ред - sortMatchesByDate() нормализира
// входа ПРЕДИ да стигне до buildPrediction/calcForm, без да ги пипа самите.
describe('sortMatchesByDate', () => {
  function m(utcDate) { return { utcDate, status: 'FINISHED' }; }

  it('подрежда разбъркан масив във възходящ хронологичен ред', () => {
    const shuffled = [m('2026-03-01'), m('2026-01-01'), m('2026-02-01')];
    const sorted = sortMatchesByDate(shuffled);
    expect(sorted.map(x => x.utcDate)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
  it('вече сортиран масив остава непроменен (idempotent)', () => {
    const already = [m('2026-01-01'), m('2026-02-01'), m('2026-03-01')];
    expect(sortMatchesByDate(already).map(x => x.utcDate)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
  it('не мутира входния масив (връща НОВ масив)', () => {
    const original = [m('2026-03-01'), m('2026-01-01')];
    const snapshot = original.map(x => x.utcDate);
    sortMatchesByDate(original);
    expect(original.map(x => x.utcDate)).toEqual(snapshot);
  });
  it('празен/null/undefined вход -> празен масив, не хвърля', () => {
    expect(sortMatchesByDate([])).toEqual([]);
    expect(sortMatchesByDate(null)).toEqual([]);
    expect(sortMatchesByDate(undefined)).toEqual([]);
  });
});

// БЕФО/СЛЕД СРАВНЕНИЕ върху фиксирани тестови данни (виж discussion-а точка 7:
// "ако сортирането променя прогнозни стойности, обясни точно защо"). Отбор 1
// има 7 FINISHED мача; в ИСТИНСКИ хронологичен ред (най-стар -> най-нов) те са
// Л,Л,Л,П,П,П,П - "последните 5" ТРЯБВА да са Л,П,П,П,П (fScore=0+3*4=12).
// Ако allMatches пристигне РАЗБЪРКАН (какъвто е рискът в loadUpcoming() без
// sortMatchesByDate), calcForm()'s .slice(-5) взима ПОГРЕШНА подгрупа от 5-те
// (не само погрешен РЕД на същите 5, а РАЗЛИЧНИ 5 мача), което реално променя
// pred.hWin - затова сортирането Е ОЧАКВАНО да променя прогнозни стойности
// при неподреден вход, което е именно фиксът, не регресия.
describe('buildPrediction - преди/след хронологично сортиране (fixed test data)', () => {
  function match(id, homeId, awayId, hg, ag, utcDate) {
    return { id, status: 'FINISHED', utcDate, homeTeam: { id: homeId }, awayTeam: { id: awayId }, score: { fullTime: { home: hg, away: ag }, halfTime: { home: Math.min(hg,1), away: Math.min(ag,1) } } };
  }
  // Отбор 1 (домакин в тестовия мач) - хронологично Л,Л,Л,П,П,П,П срещу отбори 90-96.
  const m1 = match('m1', 1, 97, 0, 2, '2026-01-01'); // Л
  const m2 = match('m2', 1, 96, 0, 1, '2026-01-08'); // Л
  const m3 = match('m3', 1, 95, 0, 3, '2026-01-15'); // Л
  const m4 = match('m4', 1, 94, 2, 0, '2026-01-22'); // П
  const m5 = match('m5', 1, 93, 3, 0, '2026-01-29'); // П
  const m6 = match('m6', 1, 92, 1, 0, '2026-02-05'); // П
  const m7 = match('m7', 1, 91, 2, 1, '2026-02-12'); // П (най-нов)
  // Отбор 2 (гост) - постоянна, малка история (не е фокус на теста).
  const a1 = match('a1', 2, 80, 1, 1, '2026-01-10');
  const a2 = match('a2', 2, 81, 1, 1, '2026-01-20');
  const fixture = { homeTeam: { id: 1 }, awayTeam: { id: 2 } };

  it('разбъркан allMatches (без sortMatchesByDate) води до ГРЕШНА "последни 5" подгрупа за отбор 1', () => {
    // Нарочна разбъркана подредба - не е нито хронологична, нито просто обърната.
    const shuffled = [m4, m5, m6, m7, m1, m2, m3, a1, a2];
    const pred = buildPrediction(fixture, shuffled);
    // В тази разбъркана подредба calcForm().slice(-5) взима [m6,m7,m1,m2,m3] = П,П,Л,Л,Л (fScore=6).
    expect(pred.hForm).toEqual(['W', 'W', 'L', 'L', 'L']);
  });

  it('същият allMatches, сортиран чрез sortMatchesByDate -> ПРАВИЛНАТА "последни 5" подгрупа (Л,П,П,П,П)', () => {
    const shuffled = [m4, m5, m6, m7, m1, m2, m3, a1, a2];
    const sorted = sortMatchesByDate(shuffled);
    const pred = buildPrediction(fixture, sorted);
    expect(pred.hForm).toEqual(['L', 'W', 'W', 'W', 'W']);
  });

  it('обяснение: hWin се покачва след сортирането, точно защото "последните 5" вече вярно включват 4 победи (не 2)', () => {
    const shuffled = [m4, m5, m6, m7, m1, m2, m3, a1, a2];
    const predBefore = buildPrediction(fixture, shuffled);
    const predAfter = buildPrediction(fixture, sortMatchesByDate(shuffled));
    expect(predAfter.hWin).toBeGreaterThan(predBefore.hWin);
  });

  it('вече правилно подреден allMatches (идва директно хронологично от API) -> sortMatchesByDate е no-op, прогнозата е идентична', () => {
    const alreadySorted = [m1, m2, m3, m4, m5, m6, m7, a1, a2];
    const predDirect = buildPrediction(fixture, alreadySorted);
    const predAfterSort = buildPrediction(fixture, sortMatchesByDate(alreadySorted));
    expect(predAfterSort).toEqual(predDirect);
  });
});

// F3a (виж discussion-а "лигите не трябва да изчезват без обяснение, но и не
// да се разгъват стотици мачове" + "сортирай ПРЕДИ тавана, за да останат
// действително най-близките").
describe('limitSortedUpcoming', () => {
  function m(utcDate) { return { utcDate, status: 'SCHEDULED' }; }
  it('сортира по дата и после отрязва до maxCount - пазят се НАЙ-РАННИТЕ, независимо от входния ред', () => {
    const shuffled = [m('2026-01-20'), m('2026-01-05'), m('2026-01-10'), m('2026-01-01')];
    const result = limitSortedUpcoming(shuffled, 2);
    expect(result.map(x => x.utcDate)).toEqual(['2026-01-01', '2026-01-05']);
  });
  it('maxCount >= брой елементи -> връща всички, сортирани', () => {
    const shuffled = [m('2026-01-10'), m('2026-01-05')];
    expect(limitSortedUpcoming(shuffled, 10).map(x => x.utcDate)).toEqual(['2026-01-05', '2026-01-10']);
  });
  it('празен/null вход -> празен масив', () => {
    expect(limitSortedUpcoming([], 10)).toEqual([]);
    expect(limitSortedUpcoming(null, 10)).toEqual([]);
  });
});

describe('hasRecentFinishedActivity', () => {
  const now = new Date('2026-01-20T00:00:00Z');
  it('true, когато има FINISHED мач в рамките на lookbackDays', () => {
    const matches = [{ status: 'FINISHED', utcDate: '2026-01-10T00:00:00Z' }];
    expect(hasRecentFinishedActivity(matches, now, 21)).toBe(true);
  });
  it('false, когато най-скорошният FINISHED мач е извън lookbackDays', () => {
    const matches = [{ status: 'FINISHED', utcDate: '2025-01-01T00:00:00Z' }];
    expect(hasRecentFinishedActivity(matches, now, 21)).toBe(false);
  });
  it('игнорира не-FINISHED мачове (SCHEDULED не брои като "активност")', () => {
    const matches = [{ status: 'SCHEDULED', utcDate: '2026-01-19T00:00:00Z' }];
    expect(hasRecentFinishedActivity(matches, now, 21)).toBe(false);
  });
  it('празен/null вход -> false, не хвърля (не твърди нищо при липса на данни - виж "не използвай липсата на исторически данни като доказателство за неактивен сезон")', () => {
    expect(hasRecentFinishedActivity([], now, 21)).toBe(false);
    expect(hasRecentFinishedActivity(null, now, 21)).toBe(false);
  });
});

describe('buildEmptyWindowMessage', () => {
  it('базов, честен текст - описва САМО проверения прозорец, нищо извън него', () => {
    expect(buildEmptyWindowMessage(21, false)).toBe('Няма мачове в следващите 21 дни.');
  });
  it('добавя "Възможна пауза" само при подадена скорошна активност - никога категорично твърдение', () => {
    expect(buildEmptyWindowMessage(21, true)).toBe('Няма мачове в следващите 21 дни. Възможна пауза.');
  });
  it('windowDays се отразява точно в текста (конфигурируем параметър)', () => {
    expect(buildEmptyWindowMessage(7, false)).toBe('Няма мачове в следващите 7 дни.');
  });
});
