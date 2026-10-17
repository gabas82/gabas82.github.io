// PHASE 2A (виж discussion-а "request-pressure root cause" - централен
// max-concurrency limiter за apiFetchAS()'s реални fetch() извиквания към
// api-sports.io, одобрен explicit scope). Тества РЕАЛНИЯ apiFetchAS() от
// football.html (не копие), извлечен с текстова екстракция, огледално на
// football-providerguard.test.js/football-asdiagnosticlogging.test.js.
//
// Цел: само API-Sports. apiFetch()/football-data.org, UI/warnings, Worker,
// Signal-scanner, PR #61, prediction/storage/cache TTL - недокоснати тук.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

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

const asSrc = [
  'const asInflightRequests={};',
  'const AS_PROVIDER_COOLDOWN_MS=60*1000;',
  'let asProviderRateLimitedUntil=0;',
  'const AS_MAX_CONCURRENT_FETCHES=2;',
  'let asActiveFetchCount=0;',
  'const asFetchQueue=[];',
  extractBraced(html, 'function acquireAsFetchSlot('),
  extractBraced(html, 'function releaseAsFetchSlot('),
  extractBraced(html, 'async function apiFetchAS('),
].join('\n');

function buildHarness(fetchImpl) {
  const fn = new Function('WORKER_AS', 'fetch', asSrc + `
    return {
      apiFetchAS,
      getAsActiveFetchCount: () => asActiveFetchCount,
      getAsQueueLength: () => asFetchQueue.length,
      getAsInflightCount: () => Object.keys(asInflightRequests).length,
      getAsProviderRateLimitedUntil: () => asProviderRateLimitedUntil,
    };
  `);
  return fn('https://worker.test/apisports', fetchImpl);
}

function okResponse(body, status = 200) { return { ok: true, status, json: async () => body }; }

let consoleSpy;
beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { consoleSpy.mockRestore(); vi.useRealTimers(); });

// A) peak concurrency
describe('PHASE 2A - A) max concurrency', () => {
  it('4 unique paths едновременно - active real fetch count никога не надвишава 2', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const ids = [172, 203, 79, 848];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getAsActiveFetchCount()).toBeLessThanOrEqual(2);
    expect(h.getAsActiveFetchCount()).toBe(2);
    expect(h.getAsQueueLength()).toBe(2);
    // освобождаваме последователно - peak НИКОГА не се покачва над 2
    resolvers[0](okResponse({ response: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    expect(h.getAsActiveFetchCount()).toBe(2); // след hand-off пак точно 2, не 3
    resolvers[1](okResponse({ response: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 1000, interval: 1 });
    // hand-off директно на 4-тия (последния чакащ) - count остава 2, опашката вече празна
    expect(h.getAsActiveFetchCount()).toBe(2);
    expect(h.getAsQueueLength()).toBe(0);
    resolvers[2](okResponse({ response: [] }));
    resolvers[3](okResponse({ response: [] }));
    await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(h.getAsActiveFetchCount()).toBe(0);
  });

  it('всички 10 заявки успешни -> всички resolve-ват с правилните данни', async () => {
    const fetchMock = vi.fn((url) => {
      const m = /league=(\d+)/.exec(url);
      return Promise.resolve(okResponse({ response: [{ fixture: { id: Number(m[1]) } }] }));
    });
    const h = buildHarness(fetchMock);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = await Promise.all(ids.map(id => h.apiFetchAS('/fixtures?league=' + id)));
    expect(fetchMock).toHaveBeenCalledTimes(10);
    results.forEach((r, i) => expect(r.response[0].fixture.id).toBe(ids[i]));
    expect(h.getAsActiveFetchCount()).toBe(0);
    expect(h.getAsQueueLength()).toBe(0);
  });
});

// B) FIFO order
describe('PHASE 2A - B) FIFO опашка', () => {
  it('4 jobs - #3/#4 стартират в правилния ред след освобождаване на slot', async () => {
    const dispatchOrder = [];
    const resolvers = {};
    const fetchMock = vi.fn((url) => {
      const m = /league=(\w+)/.exec(url);
      const id = m[1];
      dispatchOrder.push(id);
      return new Promise(res => { resolvers[id] = res; });
    });
    const h = buildHarness(fetchMock);
    const ids = ['A', 'B', 'C', 'D'];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B']); // първите 2 по реда на извикване
    resolvers['A'](okResponse({ response: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B', 'C']); // C (3-тият поред) е следващият dispatch, НЕ D
    resolvers['B'](okResponse({ response: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B', 'C', 'D']); // D последен - строг FIFO
    resolvers['C'](okResponse({ response: [] }));
    resolvers['D'](okResponse({ response: [] }));
    await Promise.all(promises);
  });
});

// C) critical race test
describe('PHASE 2A - C) critical race - queued jobs re-check cooldown преди dispatch', () => {
  it('4 unique jobs, първите 2 dispatch, единият връща errors.rateLimit -> чакащите НЕ извикват fetch(), получават isProviderCooldown', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const ids = [172, 203, 79, 848];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    // job #1 (172) резолвира с РЕАЛЕН upstream rate limit
    resolvers[0](okResponse({ errors: { rateLimit: 'Too many requests.' } }));
    // job #2 (203) резолвира нормално
    resolvers[1](okResponse({ response: [] }));
    const results = await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(2); // НИКОГА 3 или 4
    expect(results[0]).toMatchObject({ isRateLimit: true }); // реален
    expect(results[1]).toEqual({ response: [] });
    expect(results[2]).toMatchObject({ isProviderCooldown: true }); // 79 - queued, re-check блокира
    expect(results[3]).toMatchObject({ isProviderCooldown: true }); // 848 - queued, re-check блокира
    expect(h.getAsProviderRateLimitedUntil()).toBeGreaterThan(Date.now() - 1000);

    const blockTags = consoleSpy.mock.calls.filter(c => c[0] === '[AS-DIAG] LOCAL_COOLDOWN_BLOCK');
    const startTags = consoleSpy.mock.calls.filter(c => c[0] === '[AS-DIAG] REAL_FETCH_START');
    expect(startTags.length).toBe(2); // само 172 и 203 реално dispatch-наха
    expect(blockTags.length).toBe(2); // 79 и 848 - pre-dispatch re-check block
    const blockedPaths = blockTags.map(c => c[1].path);
    expect(blockedPaths).toContain('/fixtures?league=79');
    expect(blockedPaths).toContain('/fixtures?league=848');
  });
});

// D) exact-path inflight dedup
describe('PHASE 2A - D) exact-path inflight dedup остава непипнат', () => {
  it('5 callers към ЕДИН path -> точно 1 queue job + 1 реален fetch', async () => {
    const pending = new Promise(() => {}); // никога не резолвира, няма значение за тоя тест
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise(res => { resolveFetch = res; }));
    const h = buildHarness(fetchMock);
    const promises = Array.from({ length: 5 }, () => h.apiFetchAS('/fixtures?league=172&season=2026'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    expect(h.getAsQueueLength()).toBe(0); // нито един duplicate не е заел queue slot
    expect(h.getAsActiveFetchCount()).toBe(1);
    resolveFetch(okResponse({ response: [{ fixture: { id: 1 } }] }));
    const results = await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    results.forEach(r => expect(r).toEqual(results[0]));
  });

  it('duplicate path НЕ консумира 2-ри slot - 1 duplicate + 2 unique paths = exactly 2 active, duplicate споделя', async () => {
    const resolvers = {};
    const fetchMock = vi.fn((url) => new Promise(res => { resolvers[url] = res; }));
    const h = buildHarness(fetchMock);
    const pA1 = h.apiFetchAS('/fixtures?league=172');
    const pA2 = h.apiFetchAS('/fixtures?league=172'); // duplicate на A
    const pB = h.apiFetchAS('/fixtures?league=203');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getAsActiveFetchCount()).toBe(2); // A + B, duplicate-ът на A не зае слот
    expect(h.getAsQueueLength()).toBe(0);
    Object.values(resolvers).forEach(r => r(okResponse({ response: [] })));
    await Promise.all([pA1, pA2, pB]);
  });
});

// E-H) slot release под всички outcomes
describe('PHASE 2A - E/F/G/H) slot release при всички изходи', () => {
  it('E) success освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = [1, 2, 3].map(id => h.apiFetchAS('/fixtures?league=' + id));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ response: [] })); // success
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 }); // job 3 стартира
    resolvers[1](okResponse({ response: [] }));
    resolvers[2](okResponse({ response: [] }));
    await Promise.all(promises);
    expect(h.getAsActiveFetchCount()).toBe(0);
  });

  it('F) HTTP error (!r.ok) освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = [1, 2, 3].map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0]({ ok: false, status: 500, json: async () => ({}) }); // HTTP error
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    resolvers[1](okResponse({ response: [] }));
    resolvers[2](okResponse({ response: [] }));
    const results = await Promise.all(promises);
    expect(results[0].message).toBe('HTTP 500');
    expect(h.getAsActiveFetchCount()).toBe(0);
  });

  it('G) provider error (non-rateLimit) освобождава slot - следващ queued job стартира, cooldown НЕ се arm-ва', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = [1, 2, 3].map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ errors: ['Invalid season value.'] })); // provider error, НЕ rateLimit
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 }); // job 3 все пак стартира - cooldown не armed
    resolvers[1](okResponse({ response: [] }));
    resolvers[2](okResponse({ response: [] }));
    const results = await Promise.all(promises);
    expect(results[0]).toMatchObject({ isRateLimit: false });
    expect(h.getAsProviderRateLimitedUntil()).toBe(0);
    expect(h.getAsActiveFetchCount()).toBe(0);
  });

  it('H) network exception (fetch() самия хвърля) освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    let rejectFirst;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((res, rej) => { rejectFirst = rej; }))
      .mockImplementationOnce(() => new Promise(res => resolvers.push(res)))
      .mockImplementationOnce(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = [1, 2, 3].map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    rejectFirst(new Error('network boom')); // мрежово изключение
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ response: [] }));
    resolvers[1](okResponse({ response: [] }));
    const results = await Promise.all(promises);
    expect(results[0].message).toBe('network boom');
    expect(h.getAsActiveFetchCount()).toBe(0);
  });
});

// I) без deadlock/starvation
describe('PHASE 2A - I) без deadlock/starvation след failure', () => {
  it('5 jobs, 2-рия провалва се (network), опашката продължава нормално до край, нулев starvation', async () => {
    const resolvers = [];
    const outcomes = ['ok', 'fail', 'ok', 'ok', 'ok'];
    let call = 0;
    const wrappedFetch = vi.fn(() => {
      const my = call++;
      return new Promise((res, rej) => { resolvers[my] = { res, rej, outcome: outcomes[my] }; });
    });
    const h = buildHarness(wrappedFetch);
    const promises = [1, 2, 3, 4, 5].map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(wrappedFetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    // резолвираме последователно, по реда на dispatch, независимо от success/fail
    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(resolvers[i]).toBeTruthy(), { timeout: 1000, interval: 1 });
      if (resolvers[i].outcome === 'fail') resolvers[i].rej(new Error('network boom'));
      else resolvers[i].res(okResponse({ response: [] }));
    }
    const results = await Promise.all(promises);
    expect(wrappedFetch).toHaveBeenCalledTimes(5); // всичките 5 в крайна сметка dispatch-наха
    expect(results.filter(r => r && r.message === 'network boom').length).toBe(1);
    expect(h.getAsActiveFetchCount()).toBe(0);
    expect(h.getAsQueueLength()).toBe(0);
  });
});

// J) съвместимост със съществуващото поведение
describe('PHASE 2A - J) съществуващ apiFetchAS() behavior остава съвместим', () => {
  it('единична заявка (нулева конкуренция) работи идентично на преди', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse({ response: [{ fixture: { id: 1 } }] })));
    const h = buildHarness(fetchMock);
    const data = await h.apiFetchAS('/fixtures?league=172');
    expect(data.response[0].fixture.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cooldown fast-path guard (при вход в apiFetchAS) остава непроменен - заявка след armed cooldown никога не стига дори до опашката', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse({ errors: { rateLimit: 'too many' } })));
    const h = buildHarness(fetchMock);
    await h.apiFetchAS('/fixtures?league=172').catch(() => {});
    fetchMock.mockClear();
    await expect(h.apiFetchAS('/fixtures?league=203')).rejects.toMatchObject({ isProviderCooldown: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.getAsQueueLength()).toBe(0); // guard спира ПРЕДИ да създаде queue job
  });

  it('cooldown изтичане след TTL позволява нова реална мрежова заявка (queue работи нормално след expiry)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => Promise.resolve(okResponse({ errors: { rateLimit: 'too many' } })));
      const h = buildHarness(fetchMock);
      await h.apiFetchAS('/fixtures?league=172').catch(() => {});
      fetchMock.mockClear();
      vi.advanceTimersByTime(60 * 1000 + 1000);
      fetchMock.mockImplementation(() => Promise.resolve(okResponse({ response: [] })));
      await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
