// Тества РЕАЛНАТА API-оптимизационна логика от football.html (не копия),
// извлечена с текстова екстракция (огледално на техниката за buildBetBuilder/
// loadASLeagueTab/loadUpcoming в другите *.test.js файлове). Компоненти:
// (А) backgroundHistorySync пита само за лигите с реално нерешени AS прогнози;
// (Б) request-level dedup в apiFetchAS, ключуван по ТОЧНИЯ path;
// (В) single-flight lock за backgroundHistorySync;
// (Г) apiFetchAS разпознава errors.rateLimit при HTTP 200;
// (Д) брояч на активни foreground AS зареждания, фонът им отстъпва.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import {
  getUnresolvedAsLeagueIds, getHistory, saveHistory, HIST_KEY,
  findMatchingRecord, computeRegularScore,
} from './football-logic.js';

const html = fs.readFileSync('./football.html', 'utf8');

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

// Комбинира няколко реални, но НЕ-съседни парчета от football.html в един
// споделен scope - точно защото в реалния файл те споделят модулно състояние
// (asInflightRequests/asForegroundActiveCount/historySyncInFlight) чрез
// обикновени затворени променливи, не чрез параметри.
const combinedSrc = [
  extractStatement(html, 'const asInflightRequests={};'),
  extractBraced(html, 'async function apiFetchAS('),
  extractStatement(html, 'let asForegroundActiveCount=0;'),
  extractBraced(html, 'function beginAsForeground('),
  extractBraced(html, 'function endAsForeground('),
  extractBraced(html, 'async function updateHistoryResultsAS('),
  // ЗАДАЧА 9.1 (виж "History Single-Flight") - updateHistoryResults() вече
  // ползва собствен module-level historyResultsInFlight (shared-promise
  // single-flight), отделен от backgroundHistorySync()'s historySyncInFlight
  // по-долу - двата guard-а са независими слоеве, виж коментара в football.html.
  'let historyResultsInFlight=null;',
  extractBraced(html, 'async function updateHistoryResults('),
  extractStatement(html, 'let historySyncInFlight=false;'),
  extractBraced(html, 'async function backgroundHistorySync('),
  extractBraced(html, 'async function loadLive('),
].join('\n');

const FREE_VARS = [
  'WORKER_AS', 'WORKER', 'fetch', 'currentSeasonYear', 'AS_LEAGUES', 'getUnresolvedAsLeagueIds',
  'getHistory', 'saveHistory', 'apiFetch', 'getDateMinus', 'getToday', 'findMatchingRecord',
  'computeRegularScore', 'currentTab', 'loadHistory', 'document', 'asFixtureToMatch',
  'renderMatch', 'extractASLiveStats',
];

function buildHarness({
  fetchImpl, apiFetchImpl, currentTab = 'live', loadHistoryStub,
  asFixtureToMatch, renderMatch, extractASLiveStats, asLeagues, seasonYear = 2026,
} = {}) {
  const fn = new Function(...FREE_VARS, combinedSrc + `
    return {
      apiFetchAS, updateHistoryResultsAS, updateHistoryResults, backgroundHistorySync, loadLive,
      beginAsForeground, endAsForeground,
      getAsForegroundActiveCount: () => asForegroundActiveCount,
      getHistorySyncInFlight: () => historySyncInFlight,
    };
  `);
  return fn(
    'https://worker.test/apisports', 'https://worker.test/football', fetchImpl,
    () => seasonYear,
    asLeagues || [{ id: 172 }, { id: 203 }, { id: 79 }],
    getUnresolvedAsLeagueIds,
    getHistory, saveHistory,
    apiFetchImpl || (async () => ({ matches: [] })),
    (d) => '2026-08-01', () => '2026-10-10',
    findMatchingRecord, computeRegularScore,
    currentTab, loadHistoryStub || (() => {}), document,
    asFixtureToMatch || (f => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED' })),
    renderMatch || (() => '<div>MATCH</div>'),
    extractASLiveStats || (() => ({})),
  );
}

function asHistEntry(id, leagueId, overrides = {}) {
  return { id: 'as_' + id, compId: leagueId != null ? 'as_' + leagueId : null, home: 'H', away: 'A', date: '2026-10-01T00:00:00Z', result: null, ...overrides };
}
function okResponse(body) { return { ok: true, json: async () => body }; }

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="live-content"></div>';
});

describe('apiFetchAS - (Б) request-level dedup', () => {
  it('два ПАРАЛЕЛНИ извиквания с ИДЕНТИЧЕН path водят до ЕДИН реален fetch', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [{ id: 1 }] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const p = '/fixtures?league=172&season=2026&last=30';
    const [a, b] = await Promise.all([h.apiFetchAS(p), h.apiFetchAS(p)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
  it('заявки с РАЗЛИЧНИ параметри (last= срещу next=) НЕ се сливат - двете пращат отделно', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    await Promise.all([
      h.apiFetchAS('/fixtures?league=172&season=2026&last=30'),
      h.apiFetchAS('/fixtures?league=172&season=2026&next=30'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('след приключване на заявката, следващо (не-паралелно) извикване прави НОВ реален fetch', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const p = '/fixtures?league=172&season=2026&last=30';
    await h.apiFetchAS(p);
    await h.apiFetchAS(p);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('apiFetchAS - (Г) разпознаване на errors.rateLimit при HTTP 200', () => {
  it('{"errors":{"rateLimit":"..."}} при HTTP 200 -> apiFetchAS отхвърля, НЕ връща като валиден празен отговор', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'Too many requests.' }, results: 0, response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    await expect(h.apiFetchAS('/fixtures?league=172&season=2026&last=30')).rejects.toThrow();
  });
  it('легитимен празен отговор с errors:[] (api-sports масив-форма) продължава да се третира като успех', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: [], results: 0, response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const data = await h.apiFetchAS('/fixtures?league=172&season=2026&last=30');
    expect(data.response).toEqual([]);
  });
  it('легитимен празен отговор с errors:{} (обектна форма) продължава да се третира като успех', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: {}, results: 0, response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const data = await h.apiFetchAS('/fixtures?league=172&season=2026&last=30');
    expect(data.response).toEqual([]);
  });
  it('липсващо errors поле изобщо продължава да се третира като успех (regression)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [{ id: 1 }] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const data = await h.apiFetchAS('/fixtures?league=172&season=2026&last=30');
    expect(data.response).toEqual([{ id: 1 }]);
  });
});

describe('updateHistoryResultsAS - (А) заявява само лигите с реално нерешени прогнози', () => {
  it('0 активни лиги (празна/изцяло решена история) -> нулеви AS заявки', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const changed = await h.updateHistoryResultsAS([asHistEntry(1, 172, { result: { hg: 1, ag: 0 } })]);
    expect(changed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('1 активна лига -> точно 1 AS заявка, за точната лига', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    await h.updateHistoryResultsAS([asHistEntry(1, 172)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('league=172');
  });
  it('2 активни лиги -> точно 2 AS заявки, за точните лиги (не всички конфигурирани)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, asLeagues: [{ id: 172 }, { id: 203 }, { id: 79 }, { id: 2 }, { id: 3 }] });
    await h.updateHistoryResultsAS([asHistEntry(1, 172), asHistEntry(2, 203)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('league=172'))).toBe(true);
    expect(urls.some(u => u.includes('league=203'))).toBe(true);
    expect(urls.some(u => u.includes('league=79'))).toBe(false);
  });
  it('11 активни лиги (всички конфигурирани с нерешени записи) -> всички се питат (worst case, regression)', async () => {
    const elevenIds = [2, 3, 848, 172, 39, 78, 135, 140, 61, 203, 79];
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, asLeagues: elevenIds.map(id => ({ id })) });
    const hist = elevenIds.map((id, i) => asHistEntry(i, id));
    await h.updateHistoryResultsAS(hist);
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });
  it('легаси запис без compId -> безопасен fallback към ВСИЧКИ конфигурирани лиги (не тихо пропускане)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, asLeagues: [{ id: 172 }, { id: 203 }] });
    await h.updateHistoryResultsAS([{ id: 'as_999', compId: undefined, result: null }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('(Д) докато тече foreground AS зареждане - AS частта се пропуска тая обиколка, нулеви заявки', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    h.beginAsForeground();
    const changed = await h.updateHistoryResultsAS([asHistEntry(1, 172)]);
    expect(changed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    h.endAsForeground();
  });
  it('(Д) брояч, не boolean - две паралелни foreground зареждания не се освобождават предварително', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    h.beginAsForeground();
    h.beginAsForeground();
    expect(h.getAsForegroundActiveCount()).toBe(2);
    h.endAsForeground();
    expect(h.getAsForegroundActiveCount()).toBe(1);
    await h.updateHistoryResultsAS([asHistEntry(1, 172)]);
    expect(fetchMock).not.toHaveBeenCalled(); // все още 1 активно зареждане
    h.endAsForeground();
    expect(h.getAsForegroundActiveCount()).toBe(0);
    await h.updateHistoryResultsAS([asHistEntry(1, 172)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('rate limit - запазване на кеша + възстановяване', () => {
  it('при rate-limit отговор засегнатият запис остава НЕпроменен (не презаписан с невалидни данни)', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'Too many requests.' }, results: 0, response: [] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const hist = [asHistEntry(1, 172)];
    const changed = await h.updateHistoryResultsAS(hist);
    expect(changed).toBe(false);
    expect(hist[0].result).toBeNull();
  });
  it('възстановяване - следващ успешен цикъл коректно продължава съпоставянето след предходен rate-limit', async () => {
    let call = 0;
    const fetchMock = vi.fn(() => {
      call++;
      if (call === 1) return okResponse({ errors: { rateLimit: 'Too many requests.' }, results: 0, response: [] });
      return okResponse({ response: [{ fixture: { id: 1, status: { short: 'FT' } }, goals: { home: 2, away: 1 } }] });
    });
    const h = buildHarness({ fetchImpl: fetchMock });
    const hist = [asHistEntry(1, 172)];
    const changed1 = await h.updateHistoryResultsAS(hist);
    expect(changed1).toBe(false);
    expect(hist[0].result).toBeNull();
    const changed2 = await h.updateHistoryResultsAS(hist);
    expect(changed2).toBe(true);
    expect(hist[0].result).toEqual({ hg: 2, ag: 1, total: 3, gg: true, winner: '1' });
  });
  it('коректно приключване на прогноза (end-to-end, непроменена логика за съпоставяне)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [{ fixture: { id: 42, status: { short: 'FT' } }, goals: { home: 0, away: 0 } }] }));
    const h = buildHarness({ fetchImpl: fetchMock });
    const hist = [asHistEntry(42, 172)];
    const changed = await h.updateHistoryResultsAS(hist);
    expect(changed).toBe(true);
    expect(hist[0].result).toEqual({ hg: 0, ag: 0, total: 0, gg: false, winner: 'X' });
  });
});

describe('backgroundHistorySync - (В) single-flight lock', () => {
  it('едновременни извиквания -> второто е no-op, общ брой заявки отговаря само на ЕДИН цикъл', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    await Promise.all([h.backgroundHistorySync(), h.backgroundHistorySync()]);
    // fd.org частта на updateHistoryResults праща точно 2 заявки (dateFrom.. + WC) на ЕДИН цикъл
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(h.getHistorySyncInFlight()).toBe(false);
  });
  it('след приключване на цикъла, следващо (не-паралелно) извикване стартира нов цикъл нормално', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    await h.backgroundHistorySync();
    await h.backgroundHistorySync();
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });
});

// ЗАДАЧА 9.1 (виж "History Single-Flight", одита от Задача №9.0 -
// "loadHistory() вика updateHistoryResults() директно, без да минава през
// backgroundHistorySync()'s historySyncInFlight - двете могат да се
// застъпят"). updateHistoryResults() самата вече е single-flight (shared
// promise, НЕ само backgroundHistorySync()'s wrapper) - loadHistory()'s
// директно (fire-and-forget) извикване симулирано тук чрез директен
// h.updateHistoryResults() вместо през backgroundHistorySync().
describe('updateHistoryResults() - ЗАДАЧА 9.1: single-flight на самото ниво на функцията', () => {
  it('H) конкурентни backgroundHistorySync() + updateHistoryResults() (симулира loadHistory()) -> ЕДНА history-resolution операция', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    // backgroundHistorySync() вика updateHistoryResults() вътрешно;
    // директното h.updateHistoryResults() симулира loadHistory()'s
    // собствен, непазен от historySyncInFlight, fire-and-forget извикване.
    await Promise.all([h.backgroundHistorySync(), h.updateHistoryResults()]);
    // fd.org частта на updateHistoryResults прави точно 2 заявки (FINISHED
    // история + WC) ЗА ЦЯЛОТО извикване - ако двете операции бяха
    // независими, щяхме да видим 4, не 2.
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('I) след приключване на history sync, следваща (не-паралелна) операция стартира нормално', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    await Promise.all([h.backgroundHistorySync(), h.updateHistoryResults()]);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    // записът остава нерезолвнат (AS fixture никога не идва с FT статус в
    // тоя мок) - затова updateHistoryResults() ПАК има работа и трябва пак
    // реално да заяви, доказвайки registry-то е изчистено, не "заклещено".
    await h.updateHistoryResults();
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });

  it('конкурентни извиквания НЕ дублират действителната резолюция (loadHistoryStub извикан точно веднъж от backgroundHistorySync, независимо от race-а)', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const loadHistoryStub = vi.fn();
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock, currentTab: 'history', loadHistoryStub });
    await Promise.all([h.backgroundHistorySync(), h.updateHistoryResults()]);
    expect(loadHistoryStub).toHaveBeenCalledTimes(1); // само backgroundHistorySync() го вика, точно веднъж
  });
});

describe('регресия: едновременно LIVE зареждане и backgroundHistorySync, без загуба на резултати', () => {
  it('LIVE получава своите live мачове И backgroundHistorySync решава своята AS прогноза - паралелно, без взаимна намеса', async () => {
    saveHistory([asHistEntry(7, 172)]);
    const fdLiveFixture = { homeTeam: { name: 'Team A' }, awayTeam: { name: 'Team B' }, status: 'IN_PLAY' };
    const apiFetchMock = vi.fn(async (p) => {
      if (p.startsWith('/matches?status=')) return { matches: [fdLiveFixture] };
      return { matches: [] }; // updateHistoryResults fd.org заявки
    });
    const fetchMock = vi.fn((url) => {
      if (url.includes('live=all')) return okResponse({ response: [] });
      // updateHistoryResultsAS за лига 172 - връща решен мач 7
      return okResponse({ response: [{ fixture: { id: 7, status: { short: 'FT' } }, goals: { home: 3, away: 0 } }] });
    });
    const renderMatch = vi.fn(() => '<div>LIVE-CARD</div>');
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock, renderMatch, currentTab: 'live' });

    await Promise.all([h.loadLive(), h.backgroundHistorySync()]);

    // LIVE резултатът не е загубен - картата е рендерирана
    expect(document.getElementById('live-content').innerHTML).toContain('LIVE-CARD');
    // backgroundHistorySync резултатът не е загубен - прогнозата е решена
    const hist = getHistory();
    expect(hist[0].result).toEqual({ hg: 3, ag: 0, total: 3, gg: false, winner: '1' });
  });
});
