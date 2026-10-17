// FOOTBALL DASHBOARD ЗАДАЧА 9.5 (виж "Minimal Provider Pressure Guard",
// одита от production incident follow-up - "foreground loaders продължават
// да пращат заявки към provider-а след вече потвърден rate limit, без
// provider-level защита"). Тества РЕАЛНИТЕ apiFetch()/apiFetchAS() от
// football.html (не копия), извлечени с текстова екстракция, огледално на
// football-fdinflightdedup.test.js/football-apifetch.test.js.
//
// Обхват (одобрен Option A - виж design discussion-а): early-return guard
// ПРЕДИ inflight-dedup/network fetch, активиран САМО на вече доказания,
// СЪЩЕСТВУВАЩ сигнал за всеки provider - `data.errors.rateLimit` за
// api-sports.io (AS), `providerErrorCode===429` за football-data.org (FD).
// Двата guard-а (AS_PROVIDER_COOLDOWN_MS/asProviderRateLimitedUntil,
// FD_PROVIDER_COOLDOWN_MS/fdProviderRateLimitedUntil) са НАПЪЛНО независими
// module-level променливи - нулево споделено състояние между двата
// provider-а. Нулево разширение на detection логиката отвъд вече
// съществуващите, доказани branch-ове.
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
function extractStatement(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error(`не намерих: ${startMarker}`);
  const end = src.indexOf(';', idx);
  return src.slice(idx, end + 1);
}

// apiFetch() и apiFetchAS() споделят ЕДИН И СЪЩ глобален `fetch` символ в
// реалния football.html (само различен WORKER/WORKER_AS url префикс) - тук
// ги екстрактваме ЗАЕДНО, в споделен scope, точно както в production, за да
// можем директно да докажем cross-provider independence (двата guard-а
// пазят отделни module-level променливи).
const combinedSrc = [
  'const fdInflightRequests={};',
  'const FD_PROVIDER_COOLDOWN_MS=60*1000;',
  'let fdProviderRateLimitedUntil=0;',
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
      getFdInflightCount: () => Object.keys(fdInflightRequests).length,
      getAsInflightCount: () => Object.keys(asInflightRequests).length,
      getAsActiveFetchCount: () => asActiveFetchCount,
      getAsQueueLength: () => asFetchQueue.length,
    };
  `);
  return fn('https://worker.test/football', 'https://worker.test/apisports', fetchImpl);
}

// ЗАДАЧА 9.6 (виж "Shared Provider Cooldown Display Fix") - разширява горния
// combinedSrc (РЕАЛНИЯТ, guard-ован apiFetchAS(), НЕПРОМЕНЕН от тая задача) с
// РЕАЛНИТЕ EXTRA_AS_LEAGUE_IDS/AS_LEAGUES/apiErrorMessage/
// fetchExtraASFixturesByDate(), за да докажем ИМЕННО invariant-а, одобрен
// explicit от собственика: "когато cooldown е активен ПРЕДИ старта на
// batch-а, всички 4 извиквания се reject-ват локално и underlying fetch
// остава 0" - а не нещо по-силно (виж обсъждането за защо "mixed
// cooldown + real-error в един burst" не е твърдение, което тестваме тук).
const extraSrc = [
  combinedSrc,
  extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
  extractStatement(html, 'const AS_LEAGUES='),
  extractBraced(html, 'function apiErrorMessage('),
  extractBraced(html, 'async function fetchExtraASFixturesByDate('),
].join('\n');

function buildExtraHarness(fetchImpl) {
  const fn = new Function('WORKER', 'WORKER_AS', 'fetch', 'currentSeasonYear', extraSrc + `
    return { apiFetchAS, fetchExtraASFixturesByDate };
  `);
  return fn('https://worker.test/football', 'https://worker.test/apisports', fetchImpl, () => 2026);
}

function okResponse(body) { return { ok: true, json: async () => body }; }
function pendingFetch() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('apiFetchAS() - ЗАДАЧА 9.5: API-Sports provider-level rate-limit guard', () => {
  it('потвърден data.errors.rateLimit активира guard-а', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toMatchObject({ isRateLimit: true });
  });

  it('следваща заявка с РАЗЛИЧЕН AS path НЕ стига до fetch, докато guard-ът е активен', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toMatchObject({ isRateLimit: true });
    fetchMock.mockClear();
    await expect(h.apiFetchAS('/fixtures?league=203')).rejects.toMatchObject({ isRateLimit: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('short-circuit грешката носи isRateLimit=true', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const h = buildHarness(fetchMock);
    await h.apiFetchAS('/fixtures?league=172').catch(() => {});
    await expect(h.apiFetchAS('/fixtures?league=203')).rejects.toMatchObject({ isRateLimit: true });
  });

  it('short-circuit грешката носи isProviderCooldown=true (диагностичен marker)', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const h = buildHarness(fetchMock);
    await h.apiFetchAS('/fixtures?league=172').catch(() => {});
    await expect(h.apiFetchAS('/fixtures?league=203')).rejects.toMatchObject({ isProviderCooldown: true });
  });

  it('изтичане на cooldown-а позволява нова мрежова заявка', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
      const h = buildHarness(fetchMock);
      await h.apiFetchAS('/fixtures?league=172').catch(() => {});
      fetchMock.mockClear();
      vi.advanceTimersByTime(60 * 1000 + 1000);
      fetchMock.mockImplementation(() => okResponse({ response: [] }));
      await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('обикновена мрежова грешка (fetch() самия хвърля) НЕ активира guard-а', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network boom')));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toThrow('network boom');
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => okResponse({ response: [] }));
    await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1); // стигна реално до мрежата - guard неактивен
  });

  it('обикновена HTTP грешка (!r.ok) НЕ активира guard-а', async () => {
    const fetchMock = vi.fn(() => ({ ok: false, status: 500, json: async () => ({}) }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toThrow('HTTP 500');
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => okResponse({ response: [] }));
    await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('нормален успешен (вкл. легитимно празен) отговор НЕ активира guard-а', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).resolves.toEqual({ response: [] });
    fetchMock.mockClear();
    await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1); // пак стигна мрежата - guard неактивен
  });

  it('exact-path inflight dedup остава непипнат (2 конкурентни извиквания с идентичен path = 1 реален fetch)', async () => {
    const pending = pendingFetch();
    const fetchMock = vi.fn(() => pending.promise);
    const h = buildHarness(fetchMock);
    const p1 = h.apiFetchAS('/fixtures?league=172&season=2026&last=20');
    const p2 = h.apiFetchAS('/fixtures?league=172&season=2026&last=20');
    // PHASE 2A - fetch() вече се dispatch-ва СЛЕД await acquireAsFetchSlot()
    // (минимум 1 microtask tick), не синхронно веднага след извикването -
    // затова изчакваме, вместо да проверяваме синхронно; самата dedup
    // гаранция (1 реален fetch за 2 идентични path-а) остава непроменена.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 1 });
    pending.resolve(okResponse({ response: [{ id: 1 }] }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  // PHASE 2A (виж discussion-а "request-pressure root cause" - централен
  // max-concurrency limiter за apiFetchAS()'s реални fetch() извиквания) -
  // тоя тест преди доказваше ИМЕННО бъг-а, който PHASE 2A фиксира (4-те
  // paths стигаха мрежата едновременно, guard-ът не можеше да спре вече
  // стартирал burst). Сега доказва обратното - FIX-натото поведение.
  it('concurrent initial burst (PHASE 2A FIX): max AS_MAX_CONCURRENT_FETCHES=2 от 4-те РАЗЛИЧНИ paths реално стигат мрежата едновременно; queued job-овете re-check-ват cooldown-а ПРЕДИ dispatch', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    // 4 "едновременни" AS заявки, точно както fetchExtraASFixturesByDate()'s
    // Promise.allSettled(EXTRA_AS_LEAGUE_IDS.map(...)) - стартирани в СЪЩАТА
    // синхронна итерация.
    const ids = [172, 203, 79, 848];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    // Само 2 (MAX_CONCURRENT) реално стигат до fetch() - другите 2 чакат в
    // FIFO опашката, slot-ът им не е зает.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 1 });
    expect(h.getAsActiveFetchCount()).toBe(2);
    expect(h.getAsQueueLength()).toBe(2);
    // Първата от 2-те активни (172) резолвира с реален upstream rate limit -
    // arm-ва cooldown-а. Slot-ът ѝ hand-off-ва директно към следващия чакащ
    // (79, FIFO) - той re-check-ва cooldown-а ПРЕДИ собствения fetch() и го
    // вижда вече armed - критичният PHASE 2A fix за "concurrent initial
    // burst" race-а.
    resolvers[0](okResponse({ errors: { rateLimit: 'too many' } }));
    // Втората все още активна (203) резолвира нормално - slot-ът ѝ
    // hand-off-ва към последния чакащ (848), който ПАК вижда armed cooldown.
    resolvers[1](okResponse({ response: [] }));
    const results = await Promise.all(promises);
    // КРИТИЧНО - fetchMock НИКОГА не достига 3 или 4, независимо че имаше
    // 4 unique paths - queued job-овете локално се отхвърлят, нулеви
    // допълнителни реални upstream fetch-ове.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ isRateLimit: true }); // 172 - реален upstream rate limit
    expect(results[1]).toEqual({ response: [] }); // 203 - реално резолвира нормално
    expect(results[2]).toMatchObject({ isProviderCooldown: true }); // 79 - локален block, без fetch
    expect(results[3]).toMatchObject({ isProviderCooldown: true }); // 848 - локален block, без fetch
    fetchMock.mockClear();
    // 5-то, ПО-КЪСНО извикване - пак блокирано от fast-path guard-а, дори не
    // стига до опашката.
    await expect(h.apiFetchAS('/fixtures?league=999')).rejects.toMatchObject({ isRateLimit: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiFetch() - ЗАДАЧА 9.5: football-data.org provider-level rate-limit guard', () => {
  it('providerErrorCode===429 активира FD guard-а', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit.', errorCode: 429 }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetch('/matches?date=2026-10-14')).rejects.toMatchObject({ isApiError: true, providerErrorCode: 429 });
  });

  it('следваща заявка с РАЗЛИЧЕН FD path НЕ стига до fetch, докато guard-ът е активен', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'limit', errorCode: 429 }));
    const h = buildHarness(fetchMock);
    await h.apiFetch('/matches?date=2026-10-14').catch(() => {});
    fetchMock.mockClear();
    await expect(h.apiFetch('/matches?date=2026-10-15')).rejects.toMatchObject({ isApiError: true, providerErrorCode: 429, isProviderCooldown: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('FD guard НЕ блокира AS заявки (cross-provider independence)', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/football')) return okResponse({ message: 'limit', errorCode: 429 });
      return okResponse({ response: [] });
    });
    const h = buildHarness(fetchMock);
    await h.apiFetch('/matches?date=2026-10-14').catch(() => {});
    fetchMock.mockClear();
    await expect(h.apiFetchAS('/fixtures?league=172')).resolves.toEqual({ response: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1); // AS реално достигна мрежата
  });

  it('AS guard НЕ блокира FD заявки (cross-provider independence, обратна посока)', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/apisports')) return okResponse({ errors: { rateLimit: 'too many' } });
      return okResponse({ matches: [] });
    });
    const h = buildHarness(fetchMock);
    await h.apiFetchAS('/fixtures?league=172').catch(() => {});
    fetchMock.mockClear();
    await expect(h.apiFetch('/matches?date=2026-10-14')).resolves.toEqual({ matches: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1); // FD реално достигна мрежата
  });

  it('provider message БЕЗ errorCode=429 НЕ активира FD guard-а', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'Invalid date parameter.' })); // без errorCode
    const h = buildHarness(fetchMock);
    await expect(h.apiFetch('/matches?date=bad')).rejects.toMatchObject({ isApiError: true });
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => okResponse({ matches: [] }));
    await expect(h.apiFetch('/matches?date=2026-10-14')).resolves.toEqual({ matches: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1); // пак стигна мрежата - guard НЕ се е активирал
  });

  it('обикновена мрежова грешка НЕ активира FD guard-а', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetch('/matches?date=2026-10-14')).rejects.toMatchObject({ isNetworkError: true });
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => okResponse({ matches: [] }));
    await expect(h.apiFetch('/matches?date=2026-10-15')).resolves.toEqual({ matches: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('обикновена HTTP грешка (!r.ok) НЕ активира FD guard-а', async () => {
    const fetchMock = vi.fn(() => ({ ok: false, status: 500, json: async () => ({}) }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetch('/matches?date=2026-10-14')).rejects.toMatchObject({ isHttpError: true });
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => okResponse({ matches: [] }));
    await expect(h.apiFetch('/matches?date=2026-10-15')).resolves.toEqual({ matches: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('изтичане на FD cooldown-а позволява нова мрежова заявка', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => okResponse({ message: 'limit', errorCode: 429 }));
      const h = buildHarness(fetchMock);
      await h.apiFetch('/matches?date=2026-10-14').catch(() => {});
      fetchMock.mockClear();
      vi.advanceTimersByTime(60 * 1000 + 1000);
      fetchMock.mockImplementation(() => okResponse({ matches: [] }));
      await expect(h.apiFetch('/matches?date=2026-10-15')).resolves.toEqual({ matches: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exact-path inflight dedup остава непипнат (2 конкурентни извиквания с идентичен path = 1 реален fetch)', async () => {
    const pending = pendingFetch();
    const fetchMock = vi.fn(() => pending.promise);
    const h = buildHarness(fetchMock);
    const p1 = h.apiFetch('/matches?date=2026-10-14');
    const p2 = h.apiFetch('/matches?date=2026-10-14');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(okResponse({ matches: [1, 2] }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });
});

describe('fetchExtraASFixturesByDate() - ЗАДАЧА 9.6: invariant - cooldown активен ПРЕДИ старта на batch-а', () => {
  it('предварително активен cooldown => всичките 4 извиквания се reject-ват локално, underlying fetch остава 0, warnings.length===1', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }));
    const h = buildExtraHarness(fetchMock);
    // Армираме guard-а с ЕДНО, по-ранно извикване (симулира LIVE's
    // /fixtures?live=all, стартирало и резолвнало ПРЕДИ batch-а).
    await h.apiFetchAS('/fixtures?live=all').catch(() => {});
    fetchMock.mockClear();
    const warnings = [];
    const result = await h.fetchExtraASFixturesByDate('2026-10-16', warnings);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.length).toBe(0);
    expect(warnings.length).toBe(1);
  });
});

// ЗАДАЧА (виж "loadFinished() peak API-Sports concurrency" discussion) -
// тества РЕАЛНИЯ loadFinished() (не копие), заедно с РЕАЛНИТЕ guard-овани
// apiFetch()/apiFetchAS() (combinedSrc по-горе, НЕПРОМЕНЕНИ от тая задача) и
// РЕАЛНАТА fetchExtraASFixturesByDate(). Доказва ИМЕННО одобрения design:
// двата AS date batch-а (вчера/днес) вече са sequential - max 4 concurrent
// AS заявки, не 8 - докато FD (apiFetch, вчера+днес) остава изцяло
// concurrent с цялата AS верига. Умишлено НЕ тества currentTab early-exit
// (изрично извън обхвата - виж discussion-а).
const finishedSrc = [
  extraSrc,
  extractBraced(html, 'async function loadFinished('),
].join('\n');

function buildFinishedHarness(fetchImpl) {
  const fn = new Function(
    'WORKER', 'WORKER_AS', 'fetch', 'currentSeasonYear',
    'document', 'getDateMinus', 'getToday',
    'getHistory', 'findMatchingRecord', 'getFlag', 'computeRegularScore', 'durationBadge', 'formatMatchDateTime',
    finishedSrc + `
    return { apiFetch, apiFetchAS, fetchExtraASFixturesByDate, loadFinished };
  `);
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'finished-content' ? contentEl : { innerHTML: '' } };
  const instance = fn(
    'https://worker.test/football', 'https://worker.test/apisports', fetchImpl, () => 2026,
    fakeDoc, () => '2026-10-10', () => '2026-10-11',
    () => [], () => null, () => '🏳️', () => null, () => '', (d) => d
  );
  return { ...instance, getHtml: () => contentEl.innerHTML };
}

// Fetch mock, който брои текущо-активните (все още нерезолвнати) заявки по
// provider (AS vs FD, по URL префикс) и пази PEAK стойността, достигната
// по всяко време - директно доказателство за реалната concurrency topology,
// не само финалния брой заявки.
function makeConcurrencyTrackingFetch(responseFor) {
  let activeAS = 0, peakAS = 0, totalAS = 0;
  let activeFD = 0, peakFD = 0, totalFD = 0;
  const fetchMock = vi.fn((url) => {
    const isAS = url.includes('/apisports');
    if (isAS) { activeAS++; totalAS++; peakAS = Math.max(peakAS, activeAS); }
    else { activeFD++; totalFD++; peakFD = Math.max(peakFD, activeFD); }
    return Promise.resolve().then(() => responseFor(url)).finally(() => {
      if (isAS) activeAS--; else activeFD--;
    });
  });
  return { fetchMock, getPeakAS: () => peakAS, getTotalAS: () => totalAS, getPeakFD: () => peakFD, getTotalFD: () => totalFD };
}

// PHASE 2A (виж discussion-а "request-pressure root cause") - централният
// max-concurrency limiter в apiFetchAS() (AS_MAX_CONCURRENT_FETCHES=2)
// важи ГЛОБАЛНО за ВСИЧКИ apiFetchAS() caller-и, вкл. loadFinished()'s
// 4-лигов batch (PR #62's sequential-by-date topology остава непроменена
// отгоре - вчера/днес си остават sequential batch-ове - но ВЪТРЕ във всеки
// batch, PR #62's 4-concurrent таван сега допълнително се ограничава до 2
// от PHASE 2A, по-строгия, по-нисък слой). Тестовете по-долу бяха
// актуализирани от "peak==4" на "peak==2" - PHASE 2A е по-строгото
// ограничение, PR #62's sequential-by-date дизайн остава изцяло запазен.
describe('loadFinished() - ЗАДАЧА: sequential-by-date AS batching (peak concurrency 8 -> 4 -> PHASE 2A: 2)', () => {
  it('A) peak concurrent реални AS calls <= 2 (PHASE 2A глобален таван, по-строг от PR #62\'s 4)', async () => {
    const { fetchMock, getPeakAS } = makeConcurrencyTrackingFetch((url) =>
      url.includes('/apisports')
        ? okResponse({ errors: [], response: [] })
        : okResponse({ matches: [] })
    );
    const h = buildFinishedHarness(fetchMock);
    await h.loadFinished();
    expect(getPeakAS()).toBeLessThanOrEqual(2);
    expect(getPeakAS()).toBe(2); // PHASE 2A - глобалният AS_MAX_CONCURRENT_FETCHES=2 таван, не 4
  });

  it('B) без rate-limit: общият брой AS attempts остава същият (8), и двете дати се зареждат', async () => {
    const { fetchMock, getTotalAS } = makeConcurrencyTrackingFetch((url) => {
      if (url.includes('/apisports')) return okResponse({ errors: [], response: [{ fixture: { id: 1, date: '2026-10-10T18:00:00Z', status: { short: 'FT' } }, league: { id: 172 }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }, goals: { home: 1, away: 0 }, score: { halftime: { home: 0, away: 0 } } }] });
      return okResponse({ matches: [] });
    });
    const h = buildFinishedHarness(fetchMock);
    await h.loadFinished();
    expect(getTotalAS()).toBe(8); // 4 лиги x 2 дати - непроменен общ брой
    expect(h.getHtml()).not.toContain('Няма приключили мачове');
  });

  it('C) реален provider rate-limit на "вчера" batch-а arm-ва guard-а -> "днес" batch не прави нови реални AS fetch calls', async () => {
    const { fetchMock, getTotalAS, getPeakAS } = makeConcurrencyTrackingFetch((url) =>
      url.includes('/apisports')
        ? okResponse({ errors: { rateLimit: 'Too many requests.' }, results: 0, response: [] })
        : okResponse({ matches: [] })
    );
    const h = buildFinishedHarness(fetchMock);
    await h.loadFinished();
    // PHASE 2A - "вчера" batch-ът вече стартира само 2 (не 4) РЕАЛНИ fetch
    // едновременно (глобалния AS_MAX_CONCURRENT_FETCHES таван). И двете
    // реално arm-ват cooldown-а (всяка независимо получава real rateLimit) -
    // останалите 2 от "вчера"'s собствен batch, при dequeue от опашката,
    // ВЕЧЕ виждат armed cooldown (PHASE 2A pre-dispatch re-check) и се
    // отхвърлят ЛОКАЛНО, без fetch. "днес" batch-ът стартира СЛЕД "вчера"
    // (sequential, PR #62 непроменено), по което време guard-ът е отдавна
    // armed - всичките му 4 apiFetchAS() извиквания отхвърлени на самия
    // fast-path guard (дори не влизат в опашката), нулев допълнителен fetch.
    expect(getTotalAS()).toBe(2);
    expect(getPeakAS()).toBeLessThanOrEqual(2);
  });

  it('D) FD (вчера+днес) заявките остават concurrent - не чакат завършването на "вчера" AS batch-а', async () => {
    let resolveAS;
    const pendingAS = new Promise((resolve) => { resolveAS = resolve; });
    const fdCalls = [];
    const fetchMock = vi.fn((url) => {
      if (url.includes('/apisports')) return pendingAS;
      fdCalls.push(url);
      return Promise.resolve(okResponse({ matches: [] }));
    });
    const h = buildFinishedHarness(fetchMock);
    const resultPromise = h.loadFinished();
    // Източваме микротаск опашката без да разрешаваме AS-то - FD заявките
    // трябва вече да са дошли, въпреки че целият AS batch (вчера+днес) виси
    // неразрешен.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(fdCalls.length).toBe(2); // и двете FD заявки (вчера+днес) вече извикани
    resolveAS(okResponse({ errors: [], response: [] }));
    await resultPromise;
  });
});
