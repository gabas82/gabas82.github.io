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
  // ЗАДАЧА 9.5 (виж "Minimal Provider Pressure Guard") - apiFetchAS() вече
  // ползва собствен module-level AS_PROVIDER_COOLDOWN_MS/
  // asProviderRateLimitedUntil (универсален provider-level guard, отделен от
  // AS_HISTORY_RATE_LIMIT_COOLDOWN_MS по-долу) - екстрактваме ги явно.
  extractStatement(html, 'const AS_PROVIDER_COOLDOWN_MS='),
  extractStatement(html, 'let asProviderRateLimitedUntil='),
  // PHASE 2A (виж discussion-а "request-pressure root cause") -
  // apiFetchAS() вече минава през централен max-concurrency limiter
  // (AS_MAX_CONCURRENT_FETCHES/asActiveFetchCount/asFetchQueue +
  // acquireAsFetchSlot()/releaseAsFetchSlot()) - екстрактваме ги явно,
  // необходими dependencies на самата apiFetchAS().
  extractStatement(html, 'const AS_MAX_CONCURRENT_FETCHES='),
  extractStatement(html, 'let asActiveFetchCount='),
  extractStatement(html, 'const asFetchQueue='),
  extractBraced(html, 'function acquireAsFetchSlot('),
  extractBraced(html, 'function releaseAsFetchSlot('),
  extractBraced(html, 'async function apiFetchAS('),
  extractStatement(html, 'let asForegroundActiveCount=0;'),
  extractBraced(html, 'function beginAsForeground('),
  extractBraced(html, 'function endAsForeground('),
  // ЗАДАЧА 9.4 (виж "AS Background History Pressure Control") -
  // updateHistoryResultsAS() вече ползва собствен module-level
  // AS_HISTORY_RATE_LIMIT_COOLDOWN_MS/asHistorySyncRateLimitedUntil -
  // екстрактваме ги явно.
  extractStatement(html, 'const AS_HISTORY_RATE_LIMIT_COOLDOWN_MS='),
  extractStatement(html, 'let asHistorySyncRateLimitedUntil='),
  extractBraced(html, 'async function updateHistoryResultsAS('),
  // ЗАДАЧА 9.1 (виж "History Single-Flight") - updateHistoryResults() вече
  // ползва собствен module-level historyResultsInFlight (shared-promise
  // single-flight), отделен от backgroundHistorySync()'s historySyncInFlight
  // по-долу - двата guard-а са независими слоеве, виж коментара в football.html.
  'let historyResultsInFlight=null;',
  // PR #58 FINAL REVIEW FIX - foregroundHistoryRequestPending е нова
  // module-level променлива, ползвана вътре в updateHistoryResults() за да
  // неутрализира race-а между bootstrap skipAs и single-flight joining.
  'let foregroundHistoryRequestPending=false;',
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
  it('възстановяване - след ЗАДАЧА 9.4 cooldown изтичане, следващ цикъл коректно продължава съпоставянето след предходен rate-limit', async () => {
    // ЗАДАЧА 9.4 (виж "AS Background History Pressure Control") - rate-limit
    // вече активира asHistorySyncRateLimitedUntil cooldown (15 мин) - веднага
    // следващ опит (без изчакване) вече коректно НЕ retry-ва (виж новия тест
    // "cooldown активен" по-долу) - възстановяването тук изисква cooldown-ът
    // да е изтекъл, не просто "следващо извикване".
    vi.useFakeTimers();
    try {
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
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000); // след cooldown-а
      const changed2 = await h.updateHistoryResultsAS(hist);
      expect(changed2).toBe(true);
      expect(hist[0].result).toEqual({ hg: 2, ag: 1, total: 3, gg: true, winner: '1' });
    } finally {
      vi.useRealTimers();
    }
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

// ЗАДАЧА 9.4 (виж "AS Background History Pressure Control", incident
// follow-up от Задача №9.0-9.3) - background AS history резолюция вече:
// bootstrap цикъл изцяло пропуска AS; последователно изпълнение (max
// concurrency=1) с повторна foreground проверка на всяка стъпка; rate-limit
// cooldown. Нулева промяна в FD поведението/match-съпоставящата логика.
// apiFetchAS() е многослойна async обвивка (inflight registry + fetch() +
// r.json() + errors проверка) - резолвирането на мока отнема НЯКОЛКО
// microtask hop-а преди for-loop-ът в updateHistoryResultsAS() реално да
// стигне до следващото извикване. flushMicrotasks() изчаква достатъчно
// tick-ове детерминистично, без реално чакане (fake/real timers).
async function flushMicrotasks(n = 15) { for (let i = 0; i < n; i++) await Promise.resolve(); }

describe('updateHistoryResultsAS() - ЗАДАЧА 9.4: AS background history pressure control', () => {
  it('A) bootstrap цикъл (isBootstrapCycle=true) -> 0 background AS заявки, независимо от нерешена история', async () => {
    saveHistory([asHistEntry(1, 172), asHistEntry(2, 203)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    await h.backgroundHistorySync(true);
    expect(fetchMock).not.toHaveBeenCalled(); // нулеви AS заявки на bootstrap цикъла
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // FD частта си върви нормално, непипната
  });

  it('B) нормален (interval) цикъл - AS заявките са СТРИКТНО последователни, max concurrency=1', async () => {
    const hist = [asHistEntry(1, 172), asHistEntry(2, 203), asHistEntry(3, 79)];
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness({ fetchImpl: fetchMock });
    const p = h.updateHistoryResultsAS(hist);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1); // само първата - НЕ всичките 3 наведнъж
    resolvers[0](okResponse({ response: [] }));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2); // чак сега втората
    resolvers[1](okResponse({ response: [] }));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    resolvers[2](okResponse({ response: [] }));
    await p;
  });

  it('D) foreground стане активен ПО СРЕДА на цикъла -> следващата background заявка НЕ стартира', async () => {
    const hist = [asHistEntry(1, 172), asHistEntry(2, 203), asHistEntry(3, 79)];
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness({ fetchImpl: fetchMock });
    const p = h.updateHistoryResultsAS(hist);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    h.beginAsForeground(); // потребител стартира foreground AS зареждане ПО СРЕДА на цикъла
    resolvers[0](okResponse({ response: [] })); // първата заявка резолвира нормално
    await p; // цикълът трябва да спре тук - заявка 2 никога не стартира
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('E) rate-limit на заявка K (2-ра от 3) -> точно K заявки направени, 3-тата НИКОГА не стартира', async () => {
    const hist = [asHistEntry(1, 172), asHistEntry(2, 203), asHistEntry(3, 79)];
    let call = 0;
    const fetchMock = vi.fn(() => {
      call++;
      if (call === 2) return okResponse({ errors: { rateLimit: 'too many' }, response: [] });
      return okResponse({ response: [] });
    });
    const h = buildHarness({ fetchImpl: fetchMock });
    await h.updateHistoryResultsAS(hist);
    expect(fetchMock).toHaveBeenCalledTimes(2); // точно K=2, лигата на позиция 3 никога не е питана
  });

  it('F) активен rate-limit cooldown -> 0 background AS заявки на следващия опит (дори извън foreground)', async () => {
    vi.useFakeTimers();
    try {
      const hist = [asHistEntry(1, 172)];
      const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' }, response: [] }));
      const h = buildHarness({ fetchImpl: fetchMock });
      await h.updateHistoryResultsAS(hist);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * 1000); // 1 мин по-късно - cooldown-ът (15 мин) все още тече
      await h.updateHistoryResultsAS(hist);
      expect(fetchMock).toHaveBeenCalledTimes(1); // пак 1 - нулева нова заявка докато cooldown тече
    } finally {
      vi.useRealTimers();
    }
  });

  it('H) обикновен (НЕ rate-limit) провал на една лига -> следващата лига продължава да се обработва', async () => {
    const hist = [asHistEntry(1, 172), asHistEntry(2, 203)];
    const fetchMock = vi.fn((url) => {
      if (url.includes('league=172')) return Promise.reject(new Error('network boom'));
      return okResponse({ response: [{ fixture: { id: 2, status: { short: 'FT' } }, goals: { home: 1, away: 0 } }] });
    });
    const h = buildHarness({ fetchImpl: fetchMock });
    const changed = await h.updateHistoryResultsAS(hist);
    expect(changed).toBe(true); // лигата 203 е обработена нормално, въпреки провала на 172
    expect(hist[1].result).toEqual({ hg: 1, ag: 0, total: 1, gg: false, winner: '1' });
    expect(hist[0].result).toBeNull(); // лигата 172 остава нерезолвната - следващ цикъл ще опита пак
  });

  it('I) FD поведението на updateHistoryResults() остава непроменено (regression)', async () => {
    saveHistory([asHistEntry(1, 172)]);
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const apiFetchMock = vi.fn(async () => ({ matches: [] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });
    await h.backgroundHistorySync(); // interval-стил извикване, без isBootstrapCycle
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // FD частта - точно както преди 9.4
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

// PR #58 FINAL REVIEW FIX - race condition между bootstrap skipAs=true
// (ЗАДАЧА 9.4) и single-flight-то (ЗАДАЧА 9.1): ако loadHistory()'s директно
// updateHistoryResults() (без skipAs) се включи към вече стартирал bootstrap
// цикъл ДОКАТО неговите FD заявки са pending, single-flight guard-ът би
// върнал/изчакал СЪЩИЯ промис и изпълнението би се управлявало единствено от
// bootstrap-а (skipAs=true) - AS резолюцията на тоя цикъл би се пропуснала
// мълчаливо, въпреки изричното foreground ИСТОРИЯ действие. Тестовете по-долу
// доказват: (1) race-ът е реален за тая последователност - FIX-ът
// (foregroundHistoryRequestPending/effectiveSkipAs) го неутрализира; (2)
// обратният ред (foreground създава цикъла, bootstrap се включва после) НЕ е
// проблем още по дефиниция - creator-ът вече е foreground (skipAs=falsy), AS
// резолюцията никога не е била в риск да се пропусне. (Забележка: в реалната
// production последователност обратният ред е структурно невъзможен -
// backgroundHistorySync(true) тръгва синхронно, преди render-а на страницата,
// а currentTab стартира като 'live', не 'history' - потребител физически не
// може да натисне ИСТОРИЯ преди bootstrap-ът дори да е започнал. Тестваме го
// въпреки това, за пълнота на механизма.)
describe('updateHistoryResults() - PR #58 FINAL REVIEW FIX: foreground ИСТОРИЯ не трябва да губи AS резолюция заради bootstrap skip', () => {
  it('bootstrap FD pending -> foreground се включва -> AS резолюцията на цикъла СЕ случва (skip override), FD заявен ТОЧНО веднъж', async () => {
    saveHistory([asHistEntry(501, 172)]);
    const fdResolvers = [];
    const apiFetchMock = vi.fn(() => new Promise(res => fdResolvers.push(res)));
    const fetchMock = vi.fn(() => okResponse({ response: [{ fixture: { id: 501, status: { short: 'FT' } }, goals: { home: 2, away: 1 } }] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });

    // 2-4: bootstrap (skipAs=true) стартира, FD заявките тръгват и остават pending
    const bootstrapPromise = h.backgroundHistorySync(true);
    await flushMicrotasks();
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // bootstrap-ът вече е заявил FD, двете все още pending

    // 5-7: "потребителят натиска ИСТОРИЯ" = loadHistory()-стил директно
    // извикване, СЛЕД като FD вече е pending - historyResultsInFlight вече
    // съществува -> тоя caller е JOINER, не creator
    const foregroundPromise = h.updateHistoryResults();

    fdResolvers.forEach(r => r({ matches: [] })); // bootstrap-ът FD завършва
    await Promise.all([bootstrapPromise, foregroundPromise]);

    // AS резолюцията на ТОЗИ (единствения) цикъл СЕ Е СЛУЧИЛА, въпреки
    // skipAs=true на bootstrap-а (creator-а) - foreground join-ът по средата
    // е override-нал effectiveSkipAs за тоя цикъл
    expect(fetchMock).toHaveBeenCalledTimes(1); // точно 1 AS заявка (лига 172)
    expect(getHistory()[0].result).toEqual({ hg: 2, ag: 1, total: 3, gg: true, winner: '1' });
    // single-flight защитата си стои - FD е заявен ТОЧНО за 1 цикъл (2
    // заявки), НЕ дублирано заради втория (foreground) caller
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('обратен ред: foreground създава цикъла първи (без skipAs), bootstrap(true) се включва втори -> AS резолюцията пак не е пропусната (creator-ът вече е foreground)', async () => {
    saveHistory([asHistEntry(777, 203)]);
    const fdResolvers = [];
    const apiFetchMock = vi.fn(() => new Promise(res => fdResolvers.push(res)));
    const fetchMock = vi.fn(() => okResponse({ response: [{ fixture: { id: 777, status: { short: 'FT' } }, goals: { home: 0, away: 0 } }] }));
    const h = buildHarness({ fetchImpl: fetchMock, apiFetchImpl: apiFetchMock });

    const foregroundPromise = h.updateHistoryResults(); // потребителят пръв - става creator
    await flushMicrotasks();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    const bootstrapPromise = h.backgroundHistorySync(true); // bootstrap се включва ВТОРИ, към вече съществуващ цикъл

    fdResolvers.forEach(r => r({ matches: [] }));
    await Promise.all([foregroundPromise, bootstrapPromise]);

    expect(fetchMock).toHaveBeenCalledTimes(1); // AS резолюцията не е пропусната
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // нулев дублиран FD fetch
    expect(getHistory()[0].result).toEqual({ hg: 0, ag: 0, total: 0, gg: false, winner: 'X' });
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
