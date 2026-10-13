// FOOTBALL DASHBOARD ЗАДАЧА 9.1 (виж "FD Inflight Dedup + History
// Single-Flight", одита от Задача №9.0 - "apiFetch() няма дори exact-path
// inflight dedup, за разлика от apiFetchAS()"). Тества РЕАЛНАТА apiFetch()
// от football.html (не копие), извлечена с текстова екстракция (огледално
// на football-apifetch.test.js). Потвърждава точно одобрения обхват:
// fdInflightRequests е concurrent-only collapse (НЕ TTL/data cache) -
// конкурентни извиквания с ТОЧНО еднакъв path споделят ЕДИН реален fetch и
// получават ЕДИН и същ резултат (success ИЛИ failure); следващо,
// НЕ-паралелно извикване винаги прави НОВА мрежова заявка, независимо от
// изхода на предишната.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ЗАДАЧА 9.1 - apiFetch() вече ползва module-level fdInflightRequests
// регистър (огледален на asInflightRequests/apiFetchAS) - екстракцията го
// включва явно, иначе е ReferenceError в екстрактнатия scope. Изложен е и
// getInflightCount(), за да проверим пряко cleanup-а (не само косвено през
// брой заявки).
const apiFetchCode = 'const fdInflightRequests={};\n' + extractBraced(html, 'async function apiFetch(');

function buildApiFetch(fetchImpl) {
  const fn = new Function('WORKER', 'fetch', apiFetchCode + `
    return { apiFetch, getInflightCount: () => Object.keys(fdInflightRequests).length };
  `);
  return fn('https://worker.test/football', fetchImpl);
}

function okResponse(body) { return { ok: true, json: async () => body }; }
function pendingFetch() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('apiFetch() - ЗАДАЧА 9.1: exact-path inflight dedup', () => {
  it('A) 2 конкурентни извиквания с ИДЕНТИЧЕН path -> точно 1 реална мрежова заявка', async () => {
    const pending = pendingFetch();
    const fetchMock = vi.fn(() => pending.promise);
    const { apiFetch } = buildApiFetch(fetchMock);
    const p1 = apiFetch('/matches?x=1');
    const p2 = apiFetch('/matches?x=1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(okResponse({ matches: [1, 2, 3] }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ matches: [1, 2, 3] });
    expect(r2).toEqual({ matches: [1, 2, 3] });
  });

  it('B) 3 конкурентни извиквания с ИДЕНТИЧЕН path -> точно 1 реална мрежова заявка', async () => {
    const pending = pendingFetch();
    const fetchMock = vi.fn(() => pending.promise);
    const { apiFetch } = buildApiFetch(fetchMock);
    const p1 = apiFetch('/competitions/2000/matches');
    const p2 = apiFetch('/competitions/2000/matches');
    const p3 = apiFetch('/competitions/2000/matches');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(okResponse({ matches: [] }));
    await Promise.all([p1, p2, p3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('C) РАЗЛИЧНИ FD paths -> напълно независими мрежови заявки (без сливане)', async () => {
    const fetchMock = vi.fn((url) => okResponse({ matches: [] }));
    const { apiFetch } = buildApiFetch(fetchMock);
    await Promise.all([
      apiFetch('/matches?dateFrom=2026-01-01&dateTo=2026-01-05'),
      apiFetch('/matches?dateFrom=2026-01-01&dateTo=2026-01-06'), // 1 ден разлика - различен path
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('D) СЛЕД success cleanup - следващо (не-паралелно) извикване прави НОВА мрежова заявка (НЕ TTL cache)', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const { apiFetch, getInflightCount } = buildApiFetch(fetchMock);
    const p = '/matches?dateFrom=2026-01-01&dateTo=2026-01-05';
    await apiFetch(p);
    expect(getInflightCount()).toBe(0); // регистърът е изчистен след success
    await apiFetch(p);
    expect(fetchMock).toHaveBeenCalledTimes(2); // ВТОРА реална заявка, не кеш hit
  });

  it('E) СЛЕД failure cleanup - следващо извикване може нормално да retry-не (не остава "заклещено")', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network boom')))
      .mockImplementationOnce(() => okResponse({ matches: [42] }));
    const { apiFetch, getInflightCount } = buildApiFetch(fetchMock);
    const p = '/matches?dateFrom=2026-01-01&dateTo=2026-01-05';
    await expect(apiFetch(p)).rejects.toThrow();
    expect(getInflightCount()).toBe(0); // регистърът е изчистен и след failure
    const data = await apiFetch(p);
    expect(data).toEqual({ matches: [42] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('F) всички конкурентни callers получават ТОЧНО същия success резултат (споделен промис, не просто deep-equal копия)', async () => {
    const pending = pendingFetch();
    const fetchMock = vi.fn(() => pending.promise);
    const { apiFetch } = buildApiFetch(fetchMock);
    const p1 = apiFetch('/matches?x=1');
    const p2 = apiFetch('/matches?x=1');
    const sharedBody = { matches: [{ id: 'm1' }] };
    pending.resolve(okResponse(sharedBody));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2); // референтна идентичност - НЕ само deep-equal
  });

  it('G) всички конкурентни callers виждат КОРЕКТНАТА грешка (съща причина, съответните error флагове)', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { apiFetch } = buildApiFetch(fetchMock);
    const p1 = apiFetch('/matches?x=1');
    const p2 = apiFetch('/matches?x=1');
    const [res1, res2] = await Promise.allSettled([p1, p2]);
    expect(res1.status).toBe('rejected');
    expect(res2.status).toBe('rejected');
    expect(res1.reason.isNetworkError).toBe(true);
    expect(res2.reason.isNetworkError).toBe(true);
    expect(res1.reason).toBe(res2.reason); // СЪЩИЯТ error обект, не копия
  });

  it('документиран {"message":...} API формат продължава да хвърля isApiError коректно и под dedup', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit.' }));
    const { apiFetch } = buildApiFetch(fetchMock);
    const [res1, res2] = await Promise.allSettled([apiFetch('/matches?x=1'), apiFetch('/matches?x=1')]);
    expect(res1.reason.isApiError).toBe(true);
    expect(res2.reason.isApiError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ЗАДАЧА 9.1 т.J - AS поведението (apiFetchAS: собствения, по-рано
// съществуващ exact-path dedup/cooldown-липса) остава НЕПИПНАТО - тая PR
// добавя АНАЛОГИЧЕН механизъм само за apiFetch() (FD), не променя
// apiFetchAS() самата. Регресия, не нов тест на нова логика.
describe('apiFetchAS() - ЗАДАЧА 9.1 т.J: непроменено поведение (regression)', () => {
  const asInflightCode = extractBraced(html, 'async function apiFetchAS(');
  function buildApiFetchAS(fetchImpl) {
    const fn = new Function('WORKER_AS', 'fetch', 'const asInflightRequests={};\n' + asInflightCode + `\nreturn apiFetchAS;`);
    return fn('https://worker.test/apisports', fetchImpl);
  }
  it('2 конкурентни извиквания с идентичен path -> точно 1 реален fetch (непроменено)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [{ id: 1 }] }));
    const apiFetchAS = buildApiFetchAS(fetchMock);
    const [a, b] = await Promise.all([apiFetchAS('/fixtures?league=172'), apiFetchAS('/fixtures?league=172')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
  it('rateLimit errors тяло при HTTP 200 продължава да отхвърля коректно (непроменено)', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const apiFetchAS = buildApiFetchAS(fetchMock);
    await expect(apiFetchAS('/fixtures?league=172')).rejects.toMatchObject({ isRateLimit: true });
  });
});

// ЗАДАЧА 9.1 т.K - LIVE поведението остава непроменено: loadLive() НЕ получава
// никакъв нов кеш слой - две ПОСЛЕДОВАТЕЛНИ (не паралелни) извиквания правят
// 2 напълно отделни реални заявки, точно както преди fdInflightRequests.
// Тества РЕАЛНИТЕ apiFetch()+loadLive() заедно (не копия).
describe('loadLive() - ЗАДАЧА 9.1 т.K: без нов кеш слой (regression)', () => {
  const liveCombinedSrc = [
    'const fdInflightRequests={};',
    extractBraced(html, 'async function apiFetch('),
    extractBraced(html, 'async function loadLive('),
  ].join('\n');

  function buildLoadLive({ fetchImpl, apiFetchASImpl, renderMatch }) {
    const fn = new Function(
      'WORKER', 'fetch', 'apiFetchAS', 'asFixtureToMatch', 'renderMatch', 'extractASLiveStats', 'document',
      liveCombinedSrc + `\nreturn loadLive;`
    );
    return fn(
      'https://worker.test/football', fetchImpl,
      apiFetchASImpl || (async () => ({ response: [] })),
      (f) => ({ id: 'as_' + f.fixture.id, status: 'IN_PLAY', homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
      renderMatch || (() => '<div>MATCH</div>'),
      () => ({}),
      document
    );
  }

  beforeEach(() => { document.body.innerHTML = '<div id="live-content"></div>'; });

  it('2 ПОСЛЕДОВАТЕЛНИ (await между тях) извиквания на loadLive() -> 2 отделни реални FD заявки, не 1 кеширана', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const loadLive = buildLoadLive({ fetchImpl: fetchMock });
    await loadLive();
    await loadLive();
    expect(fetchMock).toHaveBeenCalledTimes(2); // НЕ 1 - доказва отсъствие на TTL/cache семантика
  });

  it('2 КОНКУРЕНТНИ извиквания на loadLive() (без await между тях) -> dedup-ват се до 1 реална FD заявка (самото concurrent-collapse работи и end-to-end)', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const loadLive = buildLoadLive({ fetchImpl: fetchMock });
    await Promise.all([loadLive(), loadLive()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
