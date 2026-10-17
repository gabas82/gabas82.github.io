// PHASE 2B (виж discussion-а "request-pressure root cause" - централен
// max-concurrency limiter за apiFetch()'s реални fetch() извиквания към
// football-data.org, огледален и напълно независим от PHASE 2A's AS
// опашка, PR #65). Тества РЕАЛНИЯ apiFetch() от football.html (не копие),
// извлечен с текстова екстракция, огледално на
// football-phase2a-asqueue.test.js.
//
// Цел: само Football-Data. apiFetchAS()/API-Sports, pollCompScorers,
// UI/warnings, H2H semantics, Worker, Signal-scanner, PR #61 - недокоснати
// тук.
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

// Комбиниран scope - И двата provider-а, за да докажем directly т.J
// (AS опашката от PR #65 остава напълно непроменена/независима).
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
].join('\n');

function buildHarness(fetchImpl) {
  const fn = new Function('WORKER', 'WORKER_AS', 'fetch', combinedSrc + `
    return {
      apiFetch, apiFetchAS,
      getFdActiveFetchCount: () => fdActiveFetchCount,
      getFdQueueLength: () => fdFetchQueue.length,
      getFdInflightCount: () => Object.keys(fdInflightRequests).length,
      getFdProviderRateLimitedUntil: () => fdProviderRateLimitedUntil,
      getAsActiveFetchCount: () => asActiveFetchCount,
      getAsQueueLength: () => asFetchQueue.length,
    };
  `);
  return fn('https://worker.test/football', 'https://worker.test/apisports', fetchImpl);
}

function okResponse(body, status = 200) { return { ok: true, status, json: async () => body }; }

let consoleSpy;
beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { consoleSpy.mockRestore(); vi.useRealTimers(); });

// A) peak concurrency
describe('PHASE 2B - A) max FD concurrency', () => {
  it('4 unique FD paths едновременно - active real fetch count никога не надвишава 2', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    const promises = dates.map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getFdActiveFetchCount()).toBe(2);
    expect(h.getFdQueueLength()).toBe(2);
    resolvers[0](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    expect(h.getFdActiveFetchCount()).toBe(2); // hand-off директно, пак точно 2
    resolvers[1](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 1000, interval: 1 });
    expect(h.getFdActiveFetchCount()).toBe(2);
    expect(h.getFdQueueLength()).toBe(0);
    resolvers[2](okResponse({ matches: [] }));
    resolvers[3](okResponse({ matches: [] }));
    await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(h.getFdActiveFetchCount()).toBe(0);
  });

  it('всички 10 заявки успешни -> всички resolve-ват с правилните данни', async () => {
    const fetchMock = vi.fn((url) => {
      const m = /date=(\d+)/.exec(url);
      return Promise.resolve(okResponse({ matches: [{ id: Number(m[1]) }] }));
    });
    const h = buildHarness(fetchMock);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = await Promise.all(ids.map(id => h.apiFetch('/matches?date=' + id)));
    expect(fetchMock).toHaveBeenCalledTimes(10);
    results.forEach((r, i) => expect(r.matches[0].id).toBe(ids[i]));
    expect(h.getFdActiveFetchCount()).toBe(0);
    expect(h.getFdQueueLength()).toBe(0);
  });
});

// B) FIFO order
describe('PHASE 2B - B) FIFO опашка', () => {
  it('4 jobs - #3/#4 стартират в правилния ред след освобождаване на slot', async () => {
    const dispatchOrder = [];
    const resolvers = {};
    const fetchMock = vi.fn((url) => {
      const m = /date=(\w+)/.exec(url);
      const id = m[1];
      dispatchOrder.push(id);
      return new Promise(res => { resolvers[id] = res; });
    });
    const h = buildHarness(fetchMock);
    const ids = ['A', 'B', 'C', 'D'];
    const promises = ids.map(id => h.apiFetch('/matches?date=' + id));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B']);
    resolvers['A'](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B', 'C']);
    resolvers['B'](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 1000, interval: 1 });
    expect(dispatchOrder).toEqual(['A', 'B', 'C', 'D']);
    resolvers['C'](okResponse({ matches: [] }));
    resolvers['D'](okResponse({ matches: [] }));
    await Promise.all(promises);
  });
});

// C) critical race test
describe('PHASE 2B - C) critical race - queued FD jobs re-check cooldown преди dispatch', () => {
  it('4 unique FD jobs, първите 2 dispatch, единият връща errorCode===429 -> чакащите НЕ извикват fetch(), получават existing local cooldown error', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    const promises = dates.map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ message: 'You reached your request limit.', errorCode: 429 }));
    resolvers[1](okResponse({ matches: [] }));
    const results = await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(2); // никога 3 или 4
    expect(results[0]).toMatchObject({ isApiError: true, providerErrorCode: 429 }); // реален
    expect(results[1]).toEqual({ matches: [] });
    expect(results[2]).toMatchObject({ isProviderCooldown: true, providerErrorCode: 429 }); // queued block
    expect(results[3]).toMatchObject({ isProviderCooldown: true, providerErrorCode: 429 }); // queued block
    expect(h.getFdProviderRateLimitedUntil()).toBeGreaterThan(Date.now() - 1000);
  });
});

// D) exact-path inflight dedup
describe('PHASE 2B - D) exact-path FD inflight dedup остава непипнат', () => {
  it('5 callers към ЕДИН path -> точно 1 queue job + 1 реален fetch', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise(res => { resolveFetch = res; }));
    const h = buildHarness(fetchMock);
    const promises = Array.from({ length: 5 }, () => h.apiFetch('/matches?date=2026-10-14'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    expect(h.getFdQueueLength()).toBe(0);
    expect(h.getFdActiveFetchCount()).toBe(1);
    resolveFetch(okResponse({ matches: [{ id: 1 }] }));
    const results = await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    results.forEach(r => expect(r).toEqual(results[0]));
  });

  it('duplicate path НЕ консумира 2-ри slot - 1 duplicate + 2 unique paths = exactly 2 active', async () => {
    const resolvers = {};
    const fetchMock = vi.fn((url) => new Promise(res => { resolvers[url] = res; }));
    const h = buildHarness(fetchMock);
    const pA1 = h.apiFetch('/matches?date=2026-10-14');
    const pA2 = h.apiFetch('/matches?date=2026-10-14'); // duplicate
    const pB = h.apiFetch('/matches?date=2026-10-15');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getFdActiveFetchCount()).toBe(2);
    expect(h.getFdQueueLength()).toBe(0);
    Object.values(resolvers).forEach(r => r(okResponse({ matches: [] })));
    await Promise.all([pA1, pA2, pB]);
  });
});

// E-H) slot release под всички outcomes
describe('PHASE 2B - E/F/G/H) FD slot release при всички изходи', () => {
  it('E) success освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = ['2026-01-01', '2026-01-02', '2026-01-03'].map(d => h.apiFetch('/matches?date=' + d));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    resolvers[1](okResponse({ matches: [] }));
    resolvers[2](okResponse({ matches: [] }));
    await Promise.all(promises);
    expect(h.getFdActiveFetchCount()).toBe(0);
  });

  it('F) HTTP error (!r.ok) освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = ['2026-01-01', '2026-01-02', '2026-01-03'].map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0]({ ok: false, status: 500, json: async () => ({}) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    resolvers[1](okResponse({ matches: [] }));
    resolvers[2](okResponse({ matches: [] }));
    const results = await Promise.all(promises);
    expect(results[0].message).toBe('HTTP 500');
    expect(h.getFdActiveFetchCount()).toBe(0);
  });

  it('G) provider грешка (message БЕЗ errorCode===429) освобождава slot, cooldown НЕ се arm-ва', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = ['2026-01-01', '2026-01-02', '2026-01-03'].map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ message: 'Invalid date parameter.' })); // provider error, без 429
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 }); // job 3 все пак стартира
    resolvers[1](okResponse({ matches: [] }));
    resolvers[2](okResponse({ matches: [] }));
    const results = await Promise.all(promises);
    expect(results[0]).toMatchObject({ isApiError: true });
    expect(results[0].providerErrorCode).toBeUndefined();
    expect(h.getFdProviderRateLimitedUntil()).toBe(0);
    expect(h.getFdActiveFetchCount()).toBe(0);
  });

  it('H) network exception (fetch() самия хвърля) освобождава slot - следващ queued job стартира', async () => {
    const resolvers = [];
    let rejectFirst;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((res, rej) => { rejectFirst = rej; }))
      .mockImplementationOnce(() => new Promise(res => resolvers.push(res)))
      .mockImplementationOnce(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const promises = ['2026-01-01', '2026-01-02', '2026-01-03'].map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    rejectFirst(new Error('network boom'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 1 });
    resolvers[0](okResponse({ matches: [] }));
    resolvers[1](okResponse({ matches: [] }));
    const results = await Promise.all(promises);
    expect(results[0]).toMatchObject({ isNetworkError: true });
    expect(h.getFdActiveFetchCount()).toBe(0);
  });
});

// I) без deadlock/starvation
describe('PHASE 2B - I) без deadlock/starvation след failure', () => {
  it('5 jobs, 2-рия провалва се (network), опашката продължава нормално до край', async () => {
    const resolvers = [];
    const outcomes = ['ok', 'fail', 'ok', 'ok', 'ok'];
    let call = 0;
    const wrappedFetch = vi.fn(() => {
      const my = call++;
      return new Promise((res, rej) => { resolvers[my] = { res, rej, outcome: outcomes[my] }; });
    });
    const h = buildHarness(wrappedFetch);
    const promises = [1, 2, 3, 4, 5].map(id => h.apiFetch('/matches?date=' + id).catch(e => e));
    await vi.waitFor(() => expect(wrappedFetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(resolvers[i]).toBeTruthy(), { timeout: 1000, interval: 1 });
      if (resolvers[i].outcome === 'fail') resolvers[i].rej(new Error('network boom'));
      else resolvers[i].res(okResponse({ matches: [] }));
    }
    const results = await Promise.all(promises);
    expect(wrappedFetch).toHaveBeenCalledTimes(5);
    expect(results.filter(r => r && r.isNetworkError).length).toBe(1);
    expect(h.getFdActiveFetchCount()).toBe(0);
    expect(h.getFdQueueLength()).toBe(0);
  });
});

// J) AS опашката от PR #65 остава напълно непроменена
describe('PHASE 2B - J) API-Sports опашка (PR #65) регресия - напълно непроменена/независима', () => {
  it('AS max-concurrency=2 поведението остава идентично - 4 unique AS paths, max 2 active', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    const ids = [172, 203, 79, 848];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getAsActiveFetchCount()).toBe(2);
    expect(h.getAsQueueLength()).toBe(2);
    // Explicit indexed resolution (НЕ forEach) - hand-off-ът dispatch-ва нови
    // jobs СЛЕД resolve-а, forEach върху snapshot на масива би пропуснал
    // новодобавените resolver-и.
    resolvers[0](okResponse({ response: [] }));
    resolvers[1](okResponse({ response: [] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 1000, interval: 1 });
    resolvers[2](okResponse({ response: [] }));
    resolvers[3](okResponse({ response: [] }));
    await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('AS и FD опашките са напълно независими - saturated FD queue НЕ блокира AS, и обратно', async () => {
    const fdResolvers = [];
    const asResolvers = [];
    const fetchMock = vi.fn((url) => {
      if (url.includes('/football')) return new Promise(res => fdResolvers.push(res));
      return new Promise(res => asResolvers.push(res));
    });
    const h = buildHarness(fetchMock);
    // Насищаме FD опашката (2 active + 2 queued).
    const fdPromises = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].map(d => h.apiFetch('/matches?date=' + d).catch(e => e));
    await vi.waitFor(() => expect(h.getFdActiveFetchCount()).toBe(2), { timeout: 1000, interval: 1 });
    expect(h.getFdQueueLength()).toBe(2);
    // AS заявките трябва да минат напълно необезпокоявани, собствен таван=2.
    const asPromises = [172, 203].map(id => h.apiFetchAS('/fixtures?league=' + id));
    await vi.waitFor(() => expect(h.getAsActiveFetchCount()).toBe(2), { timeout: 1000, interval: 1 });
    // AS тук е точно 2 заявки (равно на лимита) - без опашка след тях, безопасно forEach.
    asResolvers.forEach(r => r(okResponse({ response: [] })));
    await Promise.all(asPromises);
    expect(h.getAsActiveFetchCount()).toBe(0); // AS приключи напълно, независимо от все още saturated FD
    expect(h.getFdActiveFetchCount()).toBe(2); // FD остава заседнал в собствената си опашка, недокоснат
    // FD има 2 queued зад активните 2 - explicit indexed resolution.
    fdResolvers[0](okResponse({ matches: [] }));
    fdResolvers[1](okResponse({ matches: [] }));
    await vi.waitFor(() => expect(fdResolvers.length).toBe(4), { timeout: 1000, interval: 1 });
    fdResolvers[2](okResponse({ matches: [] }));
    fdResolvers[3](okResponse({ matches: [] }));
    await Promise.all(fdPromises);
  });
});
