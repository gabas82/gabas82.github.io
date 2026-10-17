// PHASE 2C-A (виж discussion-а "comp scorers като LOW-PRIORITY enrichment") -
// тества РЕАЛНИЯ scorer enrichment scheduler от football.html (не копие),
// извлечен с текстова екстракция, огледално на
// football-phase2a-asqueue.test.js/football-phase2b-fdqueue.test.js.
// apiFetchAS()/apiFetch()/acquireAsFetchSlot()/releaseAsFetchSlot()/
// acquireFdFetchSlot()/releaseFdFetchSlot() (PR #65/#66) са извлечени
// BYTE-FOR-BYTE, НЕПИПНАТИ - enrichment слоят само ЧЕТЕ тяхното module-level
// състояние (asActiveFetchCount/asFetchQueue/asProviderRateLimitedUntil и
// FD огледалата), никога не ги модифицира директно.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { findTeamTopScorer, normalizeApiSportsScorers, normalizeFootballDataScorers } from './football-logic.js';

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

const combinedSrc = [
  'const fdInflightRequests={};',
  'const FD_PROVIDER_COOLDOWN_MS=60*1000;',
  'let fdProviderRateLimitedUntil=0;',
  'const FD_MAX_CONCURRENT_FETCHES=2;',
  'let fdActiveFetchCount=0;',
  'const fdFetchQueue=[];',
  extractBraced(html, 'function acquireFdFetchSlot('),
  extractBraced(html, 'function releaseFdFetchSlot('),
  extractBraced(html, 'async function apiFetch('),
  'const asInflightRequests={};',
  'const AS_PROVIDER_COOLDOWN_MS=60*1000;',
  'let asProviderRateLimitedUntil=0;',
  'const AS_MAX_CONCURRENT_FETCHES=2;',
  'let asActiveFetchCount=0;',
  'const asFetchQueue=[];',
  extractBraced(html, 'function acquireAsFetchSlot('),
  extractBraced(html, 'function releaseAsFetchSlot('),
  extractBraced(html, 'async function apiFetchAS('),
  'const compTopScorersCache={};',
  extractBraced(html, 'async function fetchCompScorersList('),
  extractBraced(html, 'function applyCompScorersResult('),
  'let scorerRenderGeneration=0;',
  extractStatement(html, 'const SCORER_ENRICHMENT_PACING_MS='),
  extractStatement(html, 'const SCORER_ENRICHMENT_RETRY_MS='),
  extractBraced(html, 'function makeScorerEnrichmentState('),
  'const asScorerEnrichment=makeScorerEnrichmentState();',
  'const fdScorerEnrichment=makeScorerEnrichmentState();',
  extractBraced(html, 'function scorerEnrichmentStateFor('),
  extractBraced(html, 'function scorerProviderNameFor('),
  extractBraced(html, 'function pumpScorerEnrichment('),
  extractBraced(html, 'function enqueueScorerEnrichment('),
  extractBraced(html, 'function scheduleCompScorersEnrichment('),
].join('\n');

function buildHarness(fetchImpl) {
  const fn = new Function(
    'WORKER', 'WORKER_AS', 'fetch', 'document', 'findTeamTopScorer', 'normalizeApiSportsScorers', 'normalizeFootballDataScorers', 'currentSeasonYear',
    combinedSrc + `
    return {
      apiFetch, apiFetchAS, fetchCompScorersList, scheduleCompScorersEnrichment, enqueueScorerEnrichment,
      compTopScorersCache,
      getAsActiveFetchCount: () => asActiveFetchCount,
      getAsQueueLength: () => asFetchQueue.length,
      getFdActiveFetchCount: () => fdActiveFetchCount,
      getFdQueueLength: () => fdFetchQueue.length,
      getAsEnrichmentActive: () => asScorerEnrichment.active,
      getFdEnrichmentActive: () => fdScorerEnrichment.active,
      getAsEnrichmentQueueLength: () => asScorerEnrichment.queue.length,
      getFdEnrichmentQueueLength: () => fdScorerEnrichment.queue.length,
      getAsLastEnrichmentDispatchAt: () => asScorerEnrichment.lastDispatchAt,
      getFdLastEnrichmentDispatchAt: () => fdScorerEnrichment.lastDispatchAt,
      getScorerGeneration: () => scorerRenderGeneration,
      setAsProviderRateLimitedUntil: (v) => { asProviderRateLimitedUntil = v; },
      setFdProviderRateLimitedUntil: (v) => { fdProviderRateLimitedUntil = v; },
      PACING_MS: SCORER_ENRICHMENT_PACING_MS,
      RETRY_MS: SCORER_ENRICHMENT_RETRY_MS,
    };
  `);
  return fn('https://worker.test/football', 'https://worker.test/apisports', fetchImpl, document, findTeamTopScorer, normalizeApiSportsScorers, normalizeFootballDataScorers, () => 2026);
}

function okResponse(body, status = 200) { return { ok: true, status, json: async () => body }; }
// Непразен AS "players/topscorers" payload - fetchCompScorersList() има ПРЕДИШНО
// съществуваща (непипната от PHASE 2C-A) fallback логика: празен response ->
// автоматичен 2-ри реален fetch към предишния сезон. Тестовете за самия
// enrichment scheduler не целят тая fallback пътека, затова навсякъде ползват
// непразен response, за да остане точно 1 реален fetch на job.
function asScorersResponse(teamId = 1, goals = 5) {
  return okResponse({ response: [{ player: { name: 'P' }, statistics: [{ team: { id: teamId, name: 'T' }, goals: { total: goals } }] }] });
}

function makeSlot(compId, { homeId = 1, awayId = 2, homeName = 'Home', awayName = 'Away' } = {}) {
  const el = document.createElement('div');
  el.setAttribute('data-comp-scorers-id', compId);
  el.dataset.homeId = String(homeId);
  el.dataset.awayId = String(awayId);
  el.dataset.homeName = homeName;
  el.dataset.awayName = awayName;
  return el;
}
function makeContainer(slotsSpec) {
  const c = document.createElement('div');
  slotsSpec.forEach(spec => c.appendChild(makeSlot(spec.compId, spec)));
  document.body.appendChild(c);
  return c;
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

// A) Пълно премахване на глобалния polling - проверка на самия production source
describe('PHASE 2C-A - A) глобалният 2-секунден DOM polling е напълно премахнат', () => {
  it('football.html НЕ съдържа повече pollCompScorers() функция/setInterval извикване', () => {
    expect(html.includes('function pollCompScorers(')).toBe(false);
    expect(html.includes('setInterval(pollCompScorers')).toBe(false);
  });
  it('scheduleCompScorersEnrichment() съществува като замяна', () => {
    expect(html.includes('function scheduleCompScorersEnrichment(')).toBe(true);
  });
});

// B/C/D) Wiring - точно трите production renderer-а извикват новия trigger
describe('PHASE 2C-A - B/C/D) wiring в точните 3 renderer-а, нулево друго', () => {
  it('B) loadToday() извиква scheduleCompScorersEnrichment(c) непосредствено след рендъра', () => {
    const src = extractBraced(html, 'async function loadToday(');
    expect(src.includes('scheduleCompScorersEnrichment(c)')).toBe(true);
  });
  it('C) loadUpcoming() извиква scheduleCompScorersEnrichment(c) непосредствено след рендъра', () => {
    const src = extractBraced(html, 'async function loadUpcoming(');
    expect(src.includes('scheduleCompScorersEnrichment(c)')).toBe(true);
  });
  it('D) loadASLeagueTab() извиква scheduleCompScorersEnrichment(c) непосредствено след рендъра', () => {
    const src = extractBraced(html, 'async function loadASLeagueTab(');
    expect(src.includes('scheduleCompScorersEnrichment(c)')).toBe(true);
  });
  it('loadLive() НЕ извиква scheduleCompScorersEnrichment (LIVE мачовете никога нямат comp-scorers-slot)', () => {
    const src = extractBraced(html, 'async function loadLive(');
    expect(src.includes('scheduleCompScorersEnrichment')).toBe(false);
  });
});

// E) Cache hit
describe('PHASE 2C-A - E) cache hit -> 0 network enrichment jobs', () => {
  it('валиден current cache entry -> приложен веднага, нулева опашка, нулев fetch', async () => {
    const fetchMock = vi.fn();
    const h = buildHarness(fetchMock);
    h.compTopScorersCache['172'] = { data: [{ name: 'Player X', team: 'Home', teamId: 1, goals: 10 }], stale: false, ts: Date.now() };
    const c = makeContainer([{ compId: '172' }]);
    h.scheduleCompScorersEnrichment(c);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.getFdEnrichmentQueueLength()).toBe(0);
    expect(c.querySelector('[data-comp-scorers-id="172"]').innerHTML).toContain('Player X');
  });
});

// F) Duplicate compId dedup
describe('PHASE 2C-A - F) duplicate compId в един render -> 1 logical enrichment job', () => {
  it('2 слота със същия compId -> точно 1 queue entry, 1 реален fetch, и двата slot-а се update-ват', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse({ scorers: [{ player: { name: 'P1' }, team: { id: 1, shortName: 'H' }, goals: 5 }] })));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: '172', homeId: 1, awayId: 2 }, { compId: '172', homeId: 1, awayId: 3 }]);
    h.scheduleCompScorersEnrichment(c);
    // dedup-нато до 1 logical job - idle gate-ът го dispatch-ва веднага, синхронно
    // (opashkata вече е 0, НЕ 2, точно защото duplicate compId-то никога не е ставало 2 отделни job-а)
    expect(h.getFdEnrichmentQueueLength()).toBe(0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    await vi.waitFor(() => expect(h.getFdEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const slots = c.querySelectorAll('[data-comp-scorers-id="172"][data-comp-scorers-done]');
    expect(slots.length).toBe(2); // и двата получават резултата
  });
});

// G/H/I) max concurrency
describe('PHASE 2C-A - G/H/I) enrichment max 1 на provider, общо physical concurrency никога >2', () => {
  it('G) FD enrichment active никога >1 - 3 unique FD compId-та на опашка', async () => {
    let resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: '172' }, { compId: '2021' }, { compId: '2002' }]);
    h.scheduleCompScorersEnrichment(c);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    expect(h.getFdEnrichmentActive()).toBe(true);
    expect(h.getFdActiveFetchCount()).toBe(1); // точно 1, не повече, докато първият виси
    resolvers[0](okResponse({ scorers: [] }));
    await vi.waitFor(() => expect(h.getFdEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
  });

  it('H) AS enrichment active никога >1 - 3 unique AS compId-та на опашка', async () => {
    let resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: 'as_172' }, { compId: 'as_203' }, { compId: 'as_79' }]);
    h.scheduleCompScorersEnrichment(c);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    expect(h.getAsEnrichmentActive()).toBe(true);
    expect(h.getAsActiveFetchCount()).toBe(1);
    resolvers[0](asScorersResponse());
    await vi.waitFor(() => expect(h.getAsEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
  });

  it('I) foreground(2) + enrichment(1) на СЪЩИЯ provider никога не надвишава 2 общо', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: 'as_172' }]);
    h.scheduleCompScorersEnrichment(c);
    await vi.waitFor(() => expect(h.getAsActiveFetchCount()).toBe(1), { timeout: 1000, interval: 1 }); // enrichment zае 1
    const fg1 = h.apiFetchAS('/fixtures?league=203');
    const fg2 = h.apiFetchAS('/fixtures?league=79');
    await vi.waitFor(() => expect(h.getAsActiveFetchCount()).toBe(2), { timeout: 1000, interval: 1 }); // enrichment(1)+foreground(1)=2, 2-рия foreground опашка
    expect(h.getAsQueueLength()).toBe(1); // fg2 изчаква foreground опашката, не enrichment
    // индексирано resolve (НЕ forEach над растящ масив - enrichment-ът е непразен
    // response, затова няма вътрешен season-fallback 2-ри fetch тук)
    resolvers[0](asScorersResponse());
    resolvers[1](okResponse({ response: [] }));
    await vi.waitFor(() => expect(resolvers.length).toBeGreaterThanOrEqual(3), { timeout: 1000, interval: 1 });
    resolvers[2](okResponse({ response: [] }));
    await Promise.all([fg1, fg2]);
    expect(h.getAsActiveFetchCount()).toBeLessThanOrEqual(2);
  });
});

// J/K) priority semantics
describe('PHASE 2C-A - J/K) foreground приоритет над pending enrichment', () => {
  it('J) foreground job никога не чака зад pending (still queued) enrichment job-ове', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    // 3 AS enrichment job-а, само 1 ще dispatch-не (max active=1), другите 2 чакат в enrichment опашката.
    const c = makeContainer([{ compId: 'as_172' }, { compId: 'as_203' }, { compId: 'as_79' }]);
    h.scheduleCompScorersEnrichment(c);
    await vi.waitFor(() => expect(h.getAsActiveFetchCount()).toBe(1), { timeout: 1000, interval: 1 });
    expect(h.getAsEnrichmentQueueLength()).toBe(2); // 2 pending enrichment jobs чакат
    // Foreground пристига СЕГА - трябва да получи slot веднага, не зад enrichment опашката.
    const fgPromise = h.apiFetchAS('/fixtures?league=999');
    await vi.waitFor(() => expect(h.getAsActiveFetchCount()).toBe(2), { timeout: 1000, interval: 1 });
    expect(h.getAsQueueLength()).toBe(0); // foreground НЕ чакаше в никаква опашка
    resolvers.forEach(r => r(okResponse({ response: [] })));
    await fgPromise;
  });

  it('K) foreground пристигане докато 1 enrichment е active ползва другия slot; след enrichment completion pending enrichment НЕ прескача foreground backlog', async () => {
    vi.useFakeTimers();
    try {
      const resolvers = {};
      let call = 0;
      const fetchMock = vi.fn((url) => {
        const id = 'c' + (call++);
        return new Promise(res => { resolvers[id] = res; });
      });
      const h = buildHarness(fetchMock);
      const c = makeContainer([{ compId: 'as_172' }, { compId: 'as_203' }]);
      h.scheduleCompScorersEnrichment(c);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.getAsActiveFetchCount()).toBe(1); // job 1 (as_172) активен
      expect(h.getAsEnrichmentQueueLength()).toBe(1); // job 2 (as_203) чака

      const fg1 = h.apiFetchAS('/fixtures?league=991').catch(e => e);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.getAsActiveFetchCount()).toBe(2); // foreground взе другия slot веднага

      const fg2 = h.apiFetchAS('/fixtures?league=992').catch(e => e);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.getAsQueueLength()).toBe(1); // fg2 чака foreground опашката (двата slot-а заети)

      // enrichment job 1 резолвира (непразен response - без него fetchCompScorersList()
      // си има собствена, непипната season-fallback логика при празен списък, която
      // би объркала броенето на real fetch-ове в тоя тест)
      resolvers['c0'](asScorersResponse());
      await vi.advanceTimersByTimeAsync(0);
      // slot-ът, освободен от enrichment, отива към fg2 (foreground опашка), НЕ към job 2 (as_203)
      expect(h.getAsEnrichmentQueueLength()).toBe(1); // job 2 все още чака - НЕ прескочи foreground backlog
      expect(h.getAsQueueLength()).toBe(0); // fg2 вече взе slot-а

      // довършваме foreground-ите
      resolvers['c1'](okResponse({ response: [] }));
      resolvers['c2'](okResponse({ response: [] }));
      await Promise.all([fg1, fg2]);
      await vi.advanceTimersByTimeAsync(0);

      // сега всичко foreground е idle - job 2 (as_203) трябва eventually да дispatch-не (pacing elapsed, идва след job1's dispatch at t=0)
      await vi.advanceTimersByTimeAsync(h.PACING_MS + 100);
      expect(h.getAsActiveFetchCount()).toBe(1); // job 2 вече dispatch-на
      resolvers['c3'](asScorersResponse());
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// L/M) pacing
describe('PHASE 2C-A - L/M) pacing между последователни enrichment dispatch-и', () => {
  it('L) 2 последователни REAL enrichment dispatch-а към ЕДИН provider са >= SCORER_ENRICHMENT_PACING_MS (5000ms)', async () => {
    vi.useFakeTimers();
    try {
      const resolvers = [];
      const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
      const h = buildHarness(fetchMock);
      const c = makeContainer([{ compId: 'as_172' }, { compId: 'as_203' }]);
      h.scheduleCompScorersEnrichment(c);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstDispatchAt = h.getAsLastEnrichmentDispatchAt();
      resolvers[0](asScorersResponse());
      await vi.advanceTimersByTimeAsync(0);
      // веднага след completion - НЕ трябва да е dispatch-нал 2-рия все още (pacing)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(h.PACING_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1); // точно под прага - все още не
      await vi.advanceTimersByTimeAsync(2);
      expect(fetchMock).toHaveBeenCalledTimes(2); // сега да
      const secondDispatchAt = h.getAsLastEnrichmentDispatchAt();
      expect(secondDispatchAt - firstDispatchAt).toBeGreaterThanOrEqual(h.PACING_MS);
      resolvers[1](asScorersResponse());
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('M) FD и AS pacing са напълно независими - AS dispatch не бави FD pacing-а', async () => {
    vi.useFakeTimers();
    try {
      const resolversAs = [];
      const resolversFd = [];
      const fetchMock = vi.fn((url) => {
        if (url.includes('/apisports')) return new Promise(res => resolversAs.push(res));
        return new Promise(res => resolversFd.push(res));
      });
      const h = buildHarness(fetchMock);
      const c = makeContainer([{ compId: 'as_172' }, { compId: '2021' }]);
      h.scheduleCompScorersEnrichment(c);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.getAsEnrichmentActive()).toBe(true);
      expect(h.getFdEnrichmentActive()).toBe(true); // и двата стартираха веднага, независимо
      resolversAs[0](asScorersResponse());
      resolversFd[0](okResponse({ scorers: [] }));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// N/O/P) obsolete jobs
describe('PHASE 2C-A - N/O/P) obsolete pending jobs при tab switch/re-render', () => {
  it('N) pending job от стар render става obsolete - 0 real fetch за него, самостоятелно', async () => {
    vi.useFakeTimers();
    try {
      const resolvers = [];
      const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
      const h = buildHarness(fetchMock);
      const c1 = makeContainer([{ compId: 'as_172' }, { compId: 'as_203' }]);
      h.scheduleCompScorersEnrichment(c1); // generation 1, as_172 dispatch-ва, as_203 pending
      await vi.advanceTimersByTimeAsync(0);
      expect(h.getAsEnrichmentQueueLength()).toBe(1);
      // "tab switch" - нов render bump-ва generation-а
      const c2 = makeContainer([{ compId: 'as_848' }]);
      h.scheduleCompScorersEnrichment(c2); // generation 2
      expect(h.getScorerGeneration()).toBe(2);
      // освобождаваме job 1 (непразен response - без фалшивия season-fallback 2-ри fetch),
      // pacing elapsed - pump стига до as_203 (generation 1, вече obsolete) и го прескача
      resolvers[0](asScorersResponse());
      await vi.advanceTimersByTimeAsync(h.PACING_MS + 10);
      // следващият реален dispatch трябва да е as_848 (generation 2), НЕ as_203
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      const secondCallUrl = fetchMock.mock.calls[1][0];
      expect(secondCallUrl).toContain('league=848');
      expect(secondCallUrl).not.toContain('league=203');
      resolvers[1] && resolvers[1](asScorersResponse());
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('O) re-render на СЪЩИЯ compId инвалидира старите pending jobs (нов generation побеждава)', async () => {
    const h = buildHarness(vi.fn(() => new Promise(() => {})));
    const c1 = makeContainer([{ compId: 'as_172' }]);
    h.scheduleCompScorersEnrichment(c1);
    const genAfterFirst = h.getScorerGeneration();
    const c2 = makeContainer([{ compId: 'as_172' }]);
    h.scheduleCompScorersEnrichment(c2);
    expect(h.getScorerGeneration()).toBeGreaterThan(genAfterFirst);
  });

  it('P) вече започнал (active) enrichment fetch завършва нормално, независимо от generation bump', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise(res => { resolveFetch = res; }));
    const h = buildHarness(fetchMock);
    const c1 = makeContainer([{ compId: 'as_172' }]);
    h.scheduleCompScorersEnrichment(c1);
    await vi.waitFor(() => expect(h.getAsEnrichmentActive()).toBe(true), { timeout: 1000, interval: 1 });
    // "tab switch" - generation се сменя, ПОКА job-ът вече е in-flight
    const c2 = makeContainer([{ compId: 'as_848' }]);
    h.scheduleCompScorersEnrichment(c2);
    // вече-активният as_172 job НЕ се прекъсва (непразен response - fetchCompScorersList()
    // има собствена season-fallback логика при празен списък, която не е предмет на тоя тест)
    resolveFetch(asScorersResponse());
    await vi.waitFor(() => expect(h.getAsEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
    expect(c1.querySelector('[data-comp-scorers-id="as_172"]').hasAttribute('data-comp-scorers-done')).toBe(true);
  });
});

// Q) provider cooldown преди dispatch
describe('PHASE 2C-A - Q) provider cooldown преди enrichment dispatch -> 0 real fetch', () => {
  it('AS cooldown вече armed при scheduling -> enrichment job НЕ стига до fetch', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => Promise.resolve(asScorersResponse()));
      const h = buildHarness(fetchMock);
      h.setAsProviderRateLimitedUntil(Date.now() + 30000);
      const c = makeContainer([{ compId: 'as_172' }]);
      h.scheduleCompScorersEnrichment(c);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).not.toHaveBeenCalled(); // cooldown все още не е изтекъл
      await vi.advanceTimersByTimeAsync(26000);
      expect(fetchMock).toHaveBeenCalledTimes(1); // след изтичане - нормален dispatch
    } finally {
      vi.useRealTimers();
    }
  });
});

// R) failure не прави tab-level visible error
describe('PHASE 2C-A - R) enrichment failure никога не прави tab-level visible error', () => {
  it('network exception в enrichment -> slot просто скрит/непипнат, нулево изключение пропада навън', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network boom')));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: 'as_172' }]);
    expect(() => h.scheduleCompScorersEnrichment(c)).not.toThrow();
    await vi.waitFor(() => expect(h.getAsEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
    // fetchCompScorersList поглъща грешката - compTopScorersCache получава празен data, slot-ът се скрива, не се чупи
    const slot = c.querySelector('[data-comp-scorers-id="as_172"]');
    expect(slot.hasAttribute('data-comp-scorers-done')).toBe(true);
  });
});

// S) exact-path inflight dedup остава валиден
describe('PHASE 2C-A - S) exact-path inflight dedup непипнат', () => {
  it('enrichment dispatch + директен foreground извикване към ТОЧНО същия path споделят 1 реален fetch', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise(res => { resolveFetch = res; }));
    const h = buildHarness(fetchMock);
    const c = makeContainer([{ compId: 'as_172' }]);
    h.scheduleCompScorersEnrichment(c);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    // директен foreground extra извикване към ТОЧНО същия upstream path (topscorers league=172, текущ сезон 2026)
    const fgPromise = h.apiFetchAS('/players/topscorers?league=172&season=2026');
    resolveFetch(okResponse({ response: [{ player: { name: 'P' }, statistics: [{ team: { id: 1, name: 'T' }, goals: { total: 9 } }] }] }));
    await fgPromise;
    expect(fetchMock).toHaveBeenCalledTimes(1); // споделен, не 2-ри реален fetch
  });
});

describe('PHASE 2C-A - основна функционалност на scheduleCompScorersEnrichment', () => {
  it('събира unique compId-та само от подадения container, не от целия document', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const unrelated = makeContainer([{ compId: '999' }]); // различен, несвързан container в document-а
    const c = makeContainer([{ compId: '172' }]);
    h.scheduleCompScorersEnrichment(c); // подаваме САМО c
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    expect(fetchMock.mock.calls[0][0]).toContain('172');
    expect(fetchMock.mock.calls[0][0]).not.toContain('999');
    resolvers[0](okResponse({ scorers: [] }));
    await vi.waitFor(() => expect(h.getFdEnrichmentActive()).toBe(false), { timeout: 1000, interval: 1 });
  });

  it('празен container (без comp-scorers-slot елементи) -> no-op, нулев fetch', () => {
    const fetchMock = vi.fn();
    const h = buildHarness(fetchMock);
    const c = document.createElement('div');
    expect(() => h.scheduleCompScorersEnrichment(c)).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
