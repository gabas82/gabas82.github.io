// FOOTBALL DASHBOARD ЗАДАЧА 8.3 (виж "Daily Candidate Universe — Data Layer",
// одита от Задача №8.2). Тества pure helper-ите (buildCandidateWrapper/
// dedupCandidateUniverse/isInBerlinDay/addCalendarDays/classifyUniverseStatus,
// football-logic.js, директен import) и РЕАЛНИТЕ fetchCandidateUniverse()/
// fetchDailyCandidateUniverse() (football.html, текстова екстракция,
// огледално на football-loadupcoming.test.js). Потвърждава точно одобрения
// обхват: explicit date window, БЕЗ UPCOMING_MAX_PER_COMP, cross-provider
// dedup чрез СЪЩЕСТВУВАЩАТА isCrossProviderDuplicate()/COMPS_AS_MAP логика,
// COMPLETE/PARTIAL/FAILED universe status, БЕЗ DOM side effects, БЕЗ
// savePrediction()/ranking/selector.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  buildCandidateWrapper, dedupCandidateUniverse, isInBerlinDay, addCalendarDays,
  classifyUniverseStatus, sortMatchesByDate, buildPrediction,
} from './football-logic.js';

const html = fs.readFileSync('./football.html', 'utf8');

function extractFunction(src, name) {
  const idx = src.indexOf(`async function ${name}(`);
  if (idx === -1) throw new Error(`не намерих function ${name}`);
  let depth = 0, start = src.indexOf('{', idx), i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}
function extractBraced(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error(`не намерих: ${startMarker}`);
  let depth = 0, start = src.indexOf('{', idx), i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}

const code = extractBraced(html, 'function apiErrorMessage(')
  + '\n' + extractFunction(html, 'fetchFdHistoryAndWc')
  + '\n' + extractFunction(html, 'fetchCandidateUniverse')
  + '\n' + extractFunction(html, 'fetchDailyCandidateUniverse');

const TEST_COMPS = [
  { id: 2000, name: 'World Cup 2026' },
  { id: 2021, name: 'Premier League' },
  { id: 2016, name: 'България' },
];
const TEST_EXTRA_AS_LEAGUE_IDS = [172];
const TEST_AS_LEAGUES = [{ id: 172, icon: '🇧🇬', title: 'Ефбет Лига' }];
const TEST_COMPS_AS_MAP = { 2016: 172 };

function asFixtureToMatch(f) {
  return {
    id: 'as_' + f.fixture.id, status: f.fixture.status?.short === 'FT' ? 'FINISHED' : 'SCHEDULED',
    utcDate: f.fixture.date, competition: { id: 'as_' + f.league.id, name: f.league.name },
    homeTeam: f.teams?.home, awayTeam: f.teams?.away,
    score: { fullTime: { home: f.goals?.home, away: f.goals?.away } },
  };
}

function buildFns({ apiFetch, apiFetchAS, fetchAsLeagueSeasonHistory, currentSeasonYear, getDateMinus, getToday, extraAsLeagueIds, asLeagues }) {
  const fn = new Function(
    'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear', 'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch',
    'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'COMPS_AS_MAP', 'fetchAsLeagueSeasonHistory',
    'buildCandidateWrapper', 'dedupCandidateUniverse', 'classifyUniverseStatus',
    'getToday', 'addCalendarDays', 'isInBerlinDay',
    code + '\nreturn { fetchCandidateUniverse, fetchDailyCandidateUniverse };'
  );
  return fn(
    apiFetch, getDateMinus || (() => '2026-05-01'), apiFetchAS, currentSeasonYear || (() => 2026),
    extraAsLeagueIds || TEST_EXTRA_AS_LEAGUE_IDS, asFixtureToMatch, sortMatchesByDate, TEST_COMPS, asLeagues || TEST_AS_LEAGUES, TEST_COMPS_AS_MAP,
    fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false })),
    buildCandidateWrapper, dedupCandidateUniverse, classifyUniverseStatus,
    getToday || (() => '2026-11-01'), addCalendarDays, isInBerlinDay
  );
}

function fdMatch(id, compId, utcDate, status, home, away) {
  return { id, status, utcDate, competition: { id: compId }, homeTeam: { name: home }, awayTeam: { name: away } };
}
function asFixture(id, leagueId, date, statusShort, home, away) {
  return { fixture: { id, date, status: { short: statusShort } }, league: { id: leagueId, name: 'Test' }, teams: { home: { name: home }, away: { name: away } }, goals: {} };
}

describe('fetchCandidateUniverse() - ЗАДАЧА 8.3: data layer, без DOM/ranking', () => {
  it('D) FD-only candidate - присъства в candidates', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'Arsenal', 'Chelsea')] };
      if (p.includes('status=FINISHED')) return { matches: [] };
      return { matches: [] }; // СП заявка
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates.map(m => m.id)).toEqual(['fd1']);
    expect(res.providersUsed).toContain('football-data.org');
  });

  it('E) AS-only candidate (EXTRA_AS_LEAGUE_IDS) - присъства в candidates', async () => {
    const apiFetch = async () => ({ matches: [] });
    const apiFetchAS = async (p) => {
      if (p.includes('from=')) return { response: [asFixture(1, 172, '2026-11-01T18:00:00Z', 'NS', 'Levski', 'CSKA')] };
      return { response: [] };
    };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates.map(m => m.id)).toEqual(['as_1']);
    expect(res.providersUsed).toContain('api-sports.io');
  });

  it('F) FD+AS duplicate (България 2016 / efbet 172) - ЕДИН candidate, excludedDuplicate=1', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2016, '2026-11-01T18:00:00Z', 'SCHEDULED', 'Levski', 'CSKA')] };
      return { matches: [] };
    };
    const apiFetchAS = async (p) => {
      if (p.includes('from=')) return { response: [asFixture(1, 172, '2026-11-01T18:02:00Z', 'NS', 'Levski Sofia', 'CSKA Sofia')] };
      return { response: [] };
    };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0].id).toBe('fd1'); // FD предпочетен пред AS
    expect(res.excludedDuplicate).toBe(1);
  });

  it('G) различни fixtures НЕ се дедуплицират погрешно', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'Arsenal', 'Chelsea')] };
      return { matches: [] };
    };
    const apiFetchAS = async (p) => {
      if (p.includes('from=')) return { response: [asFixture(1, 172, '2026-11-01T18:00:00Z', 'NS', 'Levski', 'CSKA')] };
      return { response: [] };
    };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates.length).toBe(2);
    expect(res.excludedDuplicate).toBe(0);
  });

  it('C) НЯМА UPCOMING_MAX_PER_COMP ограничение - 15 FD мача за ЕДНО competition всички присъстват', async () => {
    const manyMatches = Array.from({ length: 15 }, (_, i) => fdMatch('fd' + i, 2021, '2026-11-0' + ((i % 9) + 1) + 'T18:00:00Z', 'SCHEDULED', 'Team' + i, 'TeamX' + i));
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: manyMatches };
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-09');
    expect(res.candidates.length).toBe(15); // всичките, не само 10
  });

  it('H) COMPLETE status - всички configured competitions заредени успешно', async () => {
    const apiFetch = async () => ({ matches: [] });
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('COMPLETE');
    expect(res.competitionsLoaded).toBe(res.competitionsExpected);
  });

  it('I) PARTIAL status - AS лига fail-ва, FD успешен', async () => {
    const apiFetch = async () => ({ matches: [] });
    const apiFetchAS = async () => { throw new Error('AS down'); };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('PARTIAL');
    expect(res.competitionsLoaded).toBeLessThan(res.competitionsExpected);
    expect(res.competitionsLoaded).toBeGreaterThan(0);
  });

  it('J) FAILED status - И FD, И AS fail-ват', async () => {
    const apiFetch = async () => { throw new Error('FD down'); };
    const apiFetchAS = async () => { throw new Error('AS down'); };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('FAILED');
    expect(res.competitionsLoaded).toBe(0);
  });

  it('K) provider failure не хвърля - резултатът винаги е валиден обект', async () => {
    const apiFetch = async () => { throw new Error('FD completely down'); };
    const apiFetchAS = async () => { throw new Error('AS completely down'); };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    await expect(fetchCandidateUniverse('2026-11-01', '2026-11-01')).resolves.toBeDefined();
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('malformed/празен response не чупи резултата', async () => {
    const apiFetch = async () => ({}); // без .matches
    const apiFetchAS = async () => ({}); // без .response
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates).toEqual([]);
  });

  it('L) НЯМА DOM side effects - функцията не докосва document/localStorage', async () => {
    const apiFetch = async () => ({ matches: [] });
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    expect(() => fetchCandidateUniverse('2026-11-01', '2026-11-01')).not.toThrow();
    // самата код-екстракция не съдържа document./innerHTML - проверено структурно
    expect(code).not.toMatch(/document\.|innerHTML|localStorage/);
  });

  it('N) нула нови UI-only API зависимости - кодът не вика standings/scorers/cards/H2H', () => {
    expect(code).not.toMatch(/standings|scorers|Cards|H2H|h2h/i);
  });
});

describe('fetchCandidateUniverse() - ЗАДАЧА 8.4: historyStatus разграничен от universeStatus', () => {
  it('A) fixtures success + история fail (FD FINISHED) - universeStatus=COMPLETE, historyStatus=PARTIAL', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'A', 'B')] };
      if (p.includes('status=FINISHED')) throw new Error('FD history down');
      return { matches: [] }; // СП заявка - успешна
    };
    const apiFetchAS = async () => ({ response: [] }); // fixtures success; fetchAsLeagueSeasonHistory() по подразбиране също успешна
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('COMPLETE'); // всички fixture заявки успешни
    expect(res.historyStatus).toBe('PARTIAL'); // FD историята провалена - 2 от 3 history dataset-а
    expect(res.historyDatasetsLoaded).toBe(2);
    expect(res.historyDatasetsExpected).toBe(3);
  });

  it('B) fixtures success + история success - и universeStatus, и historyStatus = COMPLETE', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'A', 'B')] };
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('COMPLETE');
    expect(res.historyStatus).toBe('COMPLETE');
    expect(res.historyDatasetsLoaded).toBe(res.historyDatasetsExpected);
  });

  it('C) fixtures fail (FD SCHEDULED) + история success - universeStatus=PARTIAL, historyStatus=COMPLETE (обратна посока на A)', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) throw new Error('FD upcoming down');
      return { matches: [] }; // история (FINISHED) + СП - успешни
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('PARTIAL'); // предстоящите FD мачове не се заредиха
    expect(res.historyStatus).toBe('COMPLETE'); // но ЦЯЛАТА история (FD+WC+AS) е налична
  });

  it('D) частичен провал на AS история - само 1 от 2 extra лиги - historyStatus=PARTIAL, по-ниско от universeStatus', async () => {
    const extraAsLeagueIds = [172, 203];
    const asLeagues = [{ id: 172, icon: '🇧🇬', title: 'Ефбет Лига' }, { id: 203, icon: '🇹🇷', title: 'Süper Lig' }];
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [] };
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] }); // всички AS fixtures успешни
    const fetchAsLeagueSeasonHistory = async (id) => {
      if (id === 203) throw new Error('203 history down');
      return { matches: [], blendingPrevSeason: false };
    };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS, fetchAsLeagueSeasonHistory, extraAsLeagueIds, asLeagues });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.universeStatus).toBe('COMPLETE'); // всички fixture заявки (FD+AS) успешни
    expect(res.historyStatus).toBe('PARTIAL'); // 1 от 2 AS history заявки провалена
    // denominator: 1 FD + 1 WC + 2 AS лиги = 4; заредени: FD+WC+1 AS = 3
    expect(res.historyDatasetsExpected).toBe(4);
    expect(res.historyDatasetsLoaded).toBe(3);
  });

  it('E) FD история fail + Световно fail, при успешни FD daily fixtures и AS - historyStatus пада под PARTIAL, но не FAILED (AS история все пак успешна)', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'A', 'B')] };
      if (p.includes('status=FINISHED')) throw new Error('FD history down');
      throw new Error('WC down'); // СП заявка - също провалена
    };
    const apiFetchAS = async () => ({ response: [] }); // AS fixtures + история успешни
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.historyDatasetsLoaded).toBe(1); // само AS историята е успешна (FD hist + WC - и двете провалени)
    expect(res.historyStatus).toBe('PARTIAL'); // >0 и <expected
    // universeStatus също деградира (WC fixture-а провален), но независимо от historyStatus денумератора
    expect(res.universeStatus).toBe('PARTIAL');
  });

  it('historyStatus=FAILED, когато и FD, и WC, и ВСИЧКИ AS история се провалят', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'A', 'B')] };
      throw new Error('down'); // и FD FINISHED, и СП (Световно) провалени
    };
    const apiFetchAS = async () => ({ response: [] }); // AS fixtures успешни
    const fetchAsLeagueSeasonHistory = async () => { throw new Error('AS history down'); };
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS, fetchAsLeagueSeasonHistory });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.historyDatasetsLoaded).toBe(0);
    expect(res.historyStatus).toBe('FAILED');
    // universeStatus НЕ е COMPLETE тук - Световната заявка (/competitions/2000/matches)
    // служи и за двете цели (fixture списък + история), затова неуспехът й пада и
    // в competitionsLoaded/universeStatus (PARTIAL), не само в historyStatus.
    // Демонстрира, че при провал на СПОДЕЛЕН fetch и двата статуса реагират -
    // независимостта на historyStatus е от AS-per-league провал (виж тест D),
    // не от споделения FD/WC fetch.
    expect(res.universeStatus).toBe('PARTIAL');
  });

  it('fetchDailyCandidateUniverse() пренася historyStatus/historyDatasets* непроменени от fetchCandidateUniverse()', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [] };
      if (p.includes('status=FINISHED')) throw new Error('FD history down');
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchDailyCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchDailyCandidateUniverse('2026-11-01');
    expect(res.historyStatus).toBe('PARTIAL');
    expect(res.universeStatus).toBe('COMPLETE');
  });
});

describe('fetchDailyCandidateUniverse() - ЗАДАЧА 8.3: Europe/Berlin canonical ден', () => {
  it('A) точно един Europe/Berlin ден - мач извън деня се филтрира', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) {
        return { matches: [
          fdMatch('today', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'A', 'B'),
          fdMatch('tomorrow', 2021, '2026-11-02T18:00:00Z', 'SCHEDULED', 'C', 'D'),
        ] };
      }
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchDailyCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchDailyCandidateUniverse('2026-11-01');
    expect(res.candidates.map(m => m.id)).toEqual(['today']);
    expect(res.candidateDate).toBe('2026-11-01');
  });

  it('B) мач около Berlin полунощ (23:30 UTC = 00:30 Berlin следващия ден) попада в ПРАВИЛНИЯ ден', async () => {
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) {
        return { matches: [
          fdMatch('lateUtc', 2021, '2026-11-01T23:30:00Z', 'SCHEDULED', 'A', 'B'), // UTC 11-01, но Berlin 11-02 00:30 (зимно +1)
        ] };
      }
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchDailyCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const resDay1 = await fetchDailyCandidateUniverse('2026-11-01');
    const resDay2 = await fetchDailyCandidateUniverse('2026-11-02');
    expect(resDay1.candidates.map(m => m.id)).toEqual([]); // НЕ в 11-01 Berlin
    expect(resDay2.candidates.map(m => m.id)).toEqual(['lateUtc']); // В 11-02 Berlin
  });

  it('по подразбиране ползва getToday() (Europe/Berlin), ако няма подаден ден', async () => {
    const apiFetch = async () => ({ matches: [] });
    const apiFetchAS = async () => ({ response: [] });
    const { fetchDailyCandidateUniverse } = buildFns({ apiFetch, apiFetchAS, getToday: () => '2026-12-25' });
    const res = await fetchDailyCandidateUniverse();
    expect(res.candidateDate).toBe('2026-12-25');
  });
});

describe('ЗАДАЧА 8.3 - регресия M: buildPrediction() остава напълно непипнат, candidate+allMatches достатъчни', () => {
  it('candidate.match + result.allMatches могат директно да се подадат на buildPrediction()', async () => {
    const histMatches = [
      fdMatch('h1', 2021, '2025-09-01T18:00:00Z', 'FINISHED', 'Arsenal', 'X'),
    ];
    histMatches[0].homeTeam.id = 1; histMatches[0].awayTeam.id = 99;
    histMatches[0].score = { fullTime: { home: 3, away: 0 }, halfTime: { home: 1, away: 0 } };
    const candidateMatch = fdMatch('fd1', 2021, '2026-11-01T18:00:00Z', 'SCHEDULED', 'Arsenal', 'Chelsea');
    candidateMatch.homeTeam.id = 1; candidateMatch.awayTeam.id = 2;
    const apiFetch = async (p) => {
      if (p.includes('status=SCHEDULED')) return { matches: [candidateMatch] };
      if (p.includes('status=FINISHED')) return { matches: histMatches };
      return { matches: [] };
    };
    const apiFetchAS = async () => ({ response: [] });
    const { fetchCandidateUniverse } = buildFns({ apiFetch, apiFetchAS });
    const res = await fetchCandidateUniverse('2026-11-01', '2026-11-01');
    expect(res.candidates.length).toBe(1);
    const pred = buildPrediction(res.candidates[0], res.allMatches);
    expect(pred).not.toBeNull();
    expect(pred.hMatchesN).toBe(1);
  });
});
