// PHASE 2E (виж discussion-а "Predictions >10-day Football-Data period bug") -
// тества РЕАЛНАТА loadUpcoming() от football.html (не копие), извлечена с
// текстова екстракция, огледално на football-loadupcoming.test.js. Production
// diagnostic (PR #140, [FD-WORKER-DIAG]) потвърди upstreamStatus=400
// "Specified period must not exceed 10 days." за единичната 21-дневна
// SCHEDULED,TIMED заявка - тоя файл доказва конкретно новия 2-chunk,
// ПОСЛЕДОВАТЕЛЕН (не Promise.all) fetch + deterministic merge/dedup fix.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage } from './football-logic.js';

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
function extractStatement(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error(`не намерих: ${startMarker}`);
  const end = src.indexOf(';', idx);
  return src.slice(idx, end + 1);
}

const html = fs.readFileSync('./football.html', 'utf8');
const code = extractBraced(html, 'function apiErrorMessage(')
  + '\nfunction scheduleCompScorersEnrichment(){}'
  + '\n' + extractFunction(html, 'fetchFdHistoryAndWc')
  + '\n' + extractFunction(html, 'loadUpcoming');

const TEST_COMPS = [{ id: 2021, name: 'Premier League', flag: '🏴' }];
const TEST_EXTRA_AS_LEAGUE_IDS = [];
const TEST_AS_LEAGUES = [];

// Фиксирана "днес" дата = точно датата от production diagnostic-а
// (dateFrom=2026-10-18&dateTo=2026-11-08 от оригиналния 400 отговор), за да
// могат assertions-ите за граници (т.3) да сверяват с реалните стойности,
// видени в production.
const TODAY = '2026-10-18';
function getDatePlus(d) {
  const dt = new Date(TODAY + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().split('T')[0];
}

function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch, fetchAsLeagueSeasonHistory, fetchH2HCached }) {
  const fn = new Function(
    'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
    'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
    'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity', 'buildEmptyWindowMessage',
    'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory', 'fetchH2HCached',
    code + `\nreturn loadUpcoming;`
  );
  return fn(
    () => TODAY, getDatePlus, apiFetch, () => '2026-07-05', apiFetchAS || (() => emptyAS()), () => 2026,
    TEST_EXTRA_AS_LEAGUE_IDS, (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture.date, competition: { id: 'as_' + f.league.id, name: f.league.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
    sortMatchesByDate, TEST_COMPS, TEST_AS_LEAGUES, renderMatch || (() => '<div>MATCH</div>'),
    21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
    () => {}, () => {},
    fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false })),
    fetchH2HCached || ((key, fetcher) => fetcher())
  );
}

function emptyAS() { return Promise.resolve({ response: [] }); }
function emptyFd() { return Promise.resolve({ matches: [] }); }

beforeEach(() => {
  document.body.innerHTML = '<div id="upcoming-content"></div>';
});

describe('PHASE 2E - loadUpcoming() SCHEDULED,TIMED chunking (>10-day FD period fix)', () => {
  it('(1) точно 2 реални SCHEDULED,TIMED заявки (не 1, не 3+)', async () => {
    const schedCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) { schedCalls.push(p); return emptyFd(); }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    expect(schedCalls.length).toBe(2);
  });

  it('(2) нито една SCHEDULED,TIMED заявка няма период >10 дни', async () => {
    const schedCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) schedCalls.push(p);
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    expect(schedCalls.length).toBeGreaterThan(0);
    schedCalls.forEach(p => {
      const dateFrom = /dateFrom=([\d-]+)/.exec(p)[1];
      const dateTo = /dateTo=([\d-]+)/.exec(p)[1];
      const diffDays = (new Date(dateTo + 'T00:00:00Z') - new Date(dateFrom + 'T00:00:00Z')) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeLessThanOrEqual(10);
    });
  });

  it('(3) точни граници: chunk A = today(day0)→day10, chunk B = day11→day21 (UPCOMING_WINDOW_DAYS)', async () => {
    const schedCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) schedCalls.push(p);
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    expect(schedCalls[0]).toContain('dateFrom=2026-10-18'); // today, day0
    expect(schedCalls[0]).toContain('dateTo=2026-10-28');   // day10
    expect(schedCalls[1]).toContain('dateFrom=2026-10-29'); // day11
    expect(schedCalls[1]).toContain('dateTo=2026-11-08');   // day21 = UPCOMING_WINDOW_DAYS, съвпада с production diagnostic-а
  });

  it('(4) matches от ДВата chunk-а се merge-ват в крайния upcoming (и двата видими в render-а)', async () => {
    const matchA = { id: 'mA', utcDate: '2026-10-20', status: 'SCHEDULED', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 } };
    const matchB = { id: 'mB', utcDate: '2026-11-01', status: 'SCHEDULED', homeTeam: { id: 3, name: 'C' }, awayTeam: { id: 4, name: 'D' }, competition: { id: 2021 } };
    let call = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) {
        call++;
        return Promise.resolve({ matches: call === 1 ? [matchA] : [matchB] });
      }
      return emptyFd();
    };
    const renderedIds = [];
    const renderMatch = (m) => { renderedIds.push(m.id); return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, renderMatch });
    await loadUpcoming();
    expect(renderedIds.sort()).toEqual(['mA', 'mB']);
  });

  it('(5) duplicate match id (присъства в отговора на ДВата chunk-а) се появява само веднъж', async () => {
    const dupMatch = { id: 'dup1', utcDate: '2026-10-28', status: 'SCHEDULED', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [dupMatch] });
      return emptyFd();
    };
    const renderedIds = [];
    const renderMatch = (m) => { renderedIds.push(m.id); return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, renderMatch });
    await loadUpcoming();
    expect(renderedIds).toEqual(['dup1']); // не ['dup1','dup1']
  });

  it('(6) failure на chunk A -> chunk B НИКОГА не се извиква (последователно, не Promise.all), запазва текущото error-box поведение', async () => {
    let chunkBCalled = false;
    let call = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) {
        call++;
        if (call === 1) return Promise.reject(new Error('chunk A boom'));
        chunkBCalled = true;
        return emptyFd();
      }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    expect(chunkBCalled).toBe(false); // sequential await - chunk B никога не тръгва
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('error-box'); // същото outer-catch поведение като преди
  });

  it('(7) chunk A успешен, failure на chunk B -> запазва текущото error-box поведение (не partial success)', async () => {
    let chunkACalled = false;
    let call = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) {
        call++;
        if (call === 1) { chunkACalled = true; return emptyFd(); }
        return Promise.reject(new Error('chunk B boom'));
      }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    expect(chunkACalled).toBe(true); // chunk A реално е бил извикан
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('error-box'); // resilience/provider isolation е ОТДЕЛНА, бъдеща задача - тук НЕ е поправено
  });

  it('(8) UPCOMING_WINDOW_DAYS остава точно 21 в production source-а (непроменено)', () => {
    const stmt = extractStatement(html, 'const UPCOMING_WINDOW_DAYS=');
    expect(stmt).toBe('const UPCOMING_WINDOW_DAYS=21;');
  });

  it('(9) prediction semantics непроменени - merged мачове стигат до renderMatch() със СЪЩАТА сигнатура (showPred=true, h2hMatches=null) като преди chunking-а', async () => {
    const matchFromChunkA = { id: 'predA', utcDate: '2026-10-20', status: 'SCHEDULED', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 } };
    const matchFromChunkB = { id: 'predB', utcDate: '2026-11-01', status: 'SCHEDULED', homeTeam: { id: 3, name: 'C' }, awayTeam: { id: 4, name: 'D' }, competition: { id: 2021 } };
    let call = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) {
        call++;
        return Promise.resolve({ matches: call === 1 ? [matchFromChunkA] : [matchFromChunkB] });
      }
      return emptyFd();
    };
    const captured = [];
    const renderMatch = (m, showPred, allMatches, h2hMatches, liveStats) => { captured.push({ id: m.id, showPred, h2hMatches, liveStats }); return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, renderMatch });
    await loadUpcoming();
    expect(captured.length).toBe(2);
    captured.forEach(c => {
      expect(c.showPred).toBe(true); // prediction UI се включва както преди
      expect(c.h2hMatches).toBeNull(); // H2H deferred (PR #68) - непроменено от тая задача
      expect(c.liveStats).toBeNull();
    });
  });
});
