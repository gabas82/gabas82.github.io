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
  extractBraced(html, 'async function apiFetchAS('),
].join('\n');

function buildHarness(fetchImpl) {
  const fn = new Function('WORKER', 'WORKER_AS', 'fetch', combinedSrc + `
    return {
      apiFetch, apiFetchAS,
      getFdInflightCount: () => Object.keys(fdInflightRequests).length,
      getAsInflightCount: () => Object.keys(asInflightRequests).length,
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(okResponse({ response: [{ id: 1 }] }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it('concurrent initial burst: 4 РАЗЛИЧНИ paths стартирали ПРЕДИ 1-вия rate-limit отговор - всичките 4 стигат мрежата; СЛЕДВАЩА заявка е блокирана', async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise(res => resolvers.push(res)));
    const h = buildHarness(fetchMock);
    // 4 "едновременни" AS заявки, точно както fetchExtraASFixturesByDate()'s
    // Promise.allSettled(EXTRA_AS_LEAGUE_IDS.map(...)) - стартирани в СЪЩАТА
    // синхронна итерация, ПРЕДИ която и да е от тях да е резолвнала.
    const ids = [172, 203, 79, 848];
    const promises = ids.map(id => h.apiFetchAS('/fixtures?league=' + id).catch(e => e));
    expect(fetchMock).toHaveBeenCalledTimes(4); // guard-ът НЕ може да спре вече стартирал burst - доказано
    // Първата резолвира rate-limited - guard-ът се активира ЗА ПРЪВ ПЪТ едва сега.
    resolvers[0](okResponse({ errors: { rateLimit: 'too many' } }));
    // Останалите 3 резолвират нормално (бяха вече изпратени, преди guard-а) - НЕ се пипат.
    resolvers[1](okResponse({ response: [] }));
    resolvers[2](okResponse({ response: [] }));
    resolvers[3](okResponse({ response: [] }));
    await Promise.all(promises);
    fetchMock.mockClear();
    // 5-то, ПО-КЪСНО извикване (след resolve на всичките 4) - вече блокирано.
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

describe('loadFinished() - ЗАДАЧА: sequential-by-date AS batching (peak concurrency 8 -> 4)', () => {
  it('A) peak concurrent реални AS calls <= 4 (не 8)', async () => {
    const { fetchMock, getPeakAS } = makeConcurrencyTrackingFetch((url) =>
      url.includes('/apisports')
        ? okResponse({ errors: [], response: [] })
        : okResponse({ matches: [] })
    );
    const h = buildFinishedHarness(fetchMock);
    await h.loadFinished();
    expect(getPeakAS()).toBeLessThanOrEqual(4);
    expect(getPeakAS()).toBe(4); // доказва, че вътре в 1 дата 4-те лиги остават concurrent (изискване 4)
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
    // Само "вчера" batch-ът достига реално upstream (4 заявки) - "днес"
    // batch-ът стартира СЛЕД него (sequential), по което време guard-ът
    // (asProviderRateLimitedUntil) вече е armed от реалните rateLimit
    // отговори на "вчера" - "днес"'s 4 apiFetchAS() извиквания се отхвърлят
    // ЛОКАЛНО (guard short-circuit), нулев допълнителен реален fetch.
    expect(getTotalAS()).toBe(4);
    expect(getPeakAS()).toBeLessThanOrEqual(4);
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
