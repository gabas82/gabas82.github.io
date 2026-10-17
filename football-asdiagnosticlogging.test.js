// MINIMAL DIAGNOSTIC INSTRUMENTATION (виж "production incident - LIVE→ДНЕС
// cooldown root-cause анализ след football-dashboard-proxy миграцията",
// одобрен explicit scope) - тества РЕАЛНИЯ apiFetchAS() от football.html (не
// копие), извлечен с текстова екстракция, огледално на
// football-providerguard.test.js. Доказва, че новите 4 console.log събития
// (REAL_FETCH_START/REAL_FETCH_RESPONSE/RATE_LIMIT_ARM/LOCAL_COOLDOWN_BLOCK)
// се задействат точно в правилния момент, с правилни полета, БЕЗ каквато и
// да е промяна в оригиналния return/throw/control-flow на функцията.
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

// Само apiFetchAS() в изолиран scope (не комбиниран с apiFetch()/FD, тук не
// ни трябва - чисто AS диагностика).
const asSrc = [
  'const asInflightRequests={};',
  'const AS_PROVIDER_COOLDOWN_MS=60*1000;',
  'let asProviderRateLimitedUntil=0;',
  extractBraced(html, 'async function apiFetchAS('),
].join('\n');

function buildHarness(fetchImpl) {
  const fn = new Function('WORKER_AS', 'fetch', asSrc + `
    return { apiFetchAS, getAsProviderRateLimitedUntil: () => asProviderRateLimitedUntil };
  `);
  return fn('https://worker.test/apisports', fetchImpl);
}

function okResponse(body, status = 200) { return { ok: true, status, json: async () => body }; }

function tagsOf(consoleSpy) {
  return consoleSpy.mock.calls.filter(c => c[0] === '[AS-DIAG] REAL_FETCH_START'
    || c[0] === '[AS-DIAG] REAL_FETCH_RESPONSE'
    || c[0] === '[AS-DIAG] RATE_LIMIT_ARM'
    || c[0] === '[AS-DIAG] LOCAL_COOLDOWN_BLOCK').map(c => c[0]);
}
function eventsOf(consoleSpy, tag) {
  return consoleSpy.mock.calls.filter(c => c[0] === tag).map(c => c[1]);
}

let consoleSpy;
beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { consoleSpy.mockRestore(); });

describe('apiFetchAS() diagnostic logging - A) successful provider response', () => {
  it('логва REAL_FETCH_START + REAL_FETCH_RESPONSE, НЯМА RATE_LIMIT_ARM/LOCAL_COOLDOWN_BLOCK', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [{ fixture: { id: 1 } }] }, 200));
    const h = buildHarness(fetchMock);
    const data = await h.apiFetchAS('/fixtures?league=172&season=2026');
    expect(data.response.length).toBe(1);

    const tags = tagsOf(consoleSpy);
    expect(tags).toContain('[AS-DIAG] REAL_FETCH_START');
    expect(tags).toContain('[AS-DIAG] REAL_FETCH_RESPONSE');
    expect(tags).not.toContain('[AS-DIAG] RATE_LIMIT_ARM');
    expect(tags).not.toContain('[AS-DIAG] LOCAL_COOLDOWN_BLOCK');

    const start = eventsOf(consoleSpy, '[AS-DIAG] REAL_FETCH_START')[0];
    expect(start.path).toBe('/fixtures?league=172&season=2026');
    expect(typeof start.timestamp).toBe('number');

    const resp = eventsOf(consoleSpy, '[AS-DIAG] REAL_FETCH_RESPONSE')[0];
    expect(resp.path).toBe('/fixtures?league=172&season=2026');
    expect(resp.httpStatus).toBe(200);
    expect(resp.hasProviderErrors).toBe(false);
    expect(resp.providerErrorKeys).toEqual([]);
    expect(resp.responseLength).toBe(1);
  });

  it('легитимно празен успешен отговор (results:0) също НЕ arm-ва нищо', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }, 200));
    const h = buildHarness(fetchMock);
    await h.apiFetchAS('/fixtures?live=all');
    const tags = tagsOf(consoleSpy);
    expect(tags).not.toContain('[AS-DIAG] RATE_LIMIT_ARM');
    const resp = eventsOf(consoleSpy, '[AS-DIAG] REAL_FETCH_RESPONSE')[0];
    expect(resp.hasProviderErrors).toBe(false);
    expect(resp.responseLength).toBe(0);
  });
});

describe('apiFetchAS() diagnostic logging - B) реален provider errors.rateLimit', () => {
  it('логва REAL_FETCH_START + REAL_FETCH_RESPONSE + RATE_LIMIT_ARM, с правилни полета', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'Too many requests. You have exceeded the maximum number of requests allowed.' }, results: 0, response: [] }, 200));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?live=all')).rejects.toMatchObject({ isRateLimit: true });

    const tags = tagsOf(consoleSpy);
    expect(tags).toEqual(['[AS-DIAG] REAL_FETCH_START', '[AS-DIAG] REAL_FETCH_RESPONSE', '[AS-DIAG] RATE_LIMIT_ARM']);

    const resp = eventsOf(consoleSpy, '[AS-DIAG] REAL_FETCH_RESPONSE')[0];
    expect(resp.hasProviderErrors).toBe(true);
    expect(resp.providerErrorKeys).toEqual(['rateLimit']);

    const arm = eventsOf(consoleSpy, '[AS-DIAG] RATE_LIMIT_ARM')[0];
    expect(arm.path).toBe('/fixtures?live=all');
    expect(arm.message).toBe('Too many requests. You have exceeded the maximum number of requests allowed.');
    expect(arm.asProviderRateLimitedUntil).toBe(h.getAsProviderRateLimitedUntil());
    expect(arm.asProviderRateLimitedUntil).toBeGreaterThan(Date.now() - 1000);

    // Нищо credential-related никога не е аргумент на console.log тук - само
    // path/timestamp/status/boolean/keys/message (provider-публичен текст).
    for (const call of consoleSpy.mock.calls) {
      const payload = JSON.stringify(call[1] ?? {});
      expect(payload).not.toMatch(/apisports-?key/i);
      expect(payload).not.toMatch(/worker\.test\/apisports/i);
    }
  });

  it('друг provider error БЕЗ errors.rateLimit (array форма) НЕ логва RATE_LIMIT_ARM', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: ['Invalid season value.'] }, 200));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172&season=9999')).rejects.toMatchObject({ isRateLimit: false });
    const tags = tagsOf(consoleSpy);
    expect(tags).not.toContain('[AS-DIAG] RATE_LIMIT_ARM');
    const resp = eventsOf(consoleSpy, '[AS-DIAG] REAL_FETCH_RESPONSE')[0];
    expect(resp.hasProviderErrors).toBe(true);
    expect(resp.providerErrorKeys).toEqual(['0']); // array индекс като key, очаквано от Object.keys на масив
  });
});

describe('apiFetchAS() diagnostic logging - C) след armed cooldown', () => {
  it('следваща заявка дава LOCAL_COOLDOWN_BLOCK и НЕ извиква fetch()', async () => {
    const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }, 200));
    const h = buildHarness(fetchMock);
    // Реален upstream rate limit, armва cooldown-а (доказано в B) по-горе).
    await h.apiFetchAS('/fixtures?league=172').catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    consoleSpy.mockClear();
    fetchMock.mockClear();

    await expect(h.apiFetchAS('/fixtures?league=203')).rejects.toMatchObject({ isProviderCooldown: true });

    expect(fetchMock).not.toHaveBeenCalled(); // критично - НЕ стигна до мрежата
    const tags = tagsOf(consoleSpy);
    expect(tags).toEqual(['[AS-DIAG] LOCAL_COOLDOWN_BLOCK']);
    expect(tags).not.toContain('[AS-DIAG] REAL_FETCH_START');
    expect(tags).not.toContain('[AS-DIAG] REAL_FETCH_RESPONSE');

    const block = eventsOf(consoleSpy, '[AS-DIAG] LOCAL_COOLDOWN_BLOCK')[0];
    expect(block.path).toBe('/fixtures?league=203');
    expect(block.asProviderRateLimitedUntil).toBe(h.getAsProviderRateLimitedUntil());
    expect(block.remainingMs).toBeGreaterThan(0);
    expect(block.remainingMs).toBeLessThanOrEqual(60 * 1000);
  });
});

describe('apiFetchAS() diagnostic logging - D) оригиналното поведение остава непроменено', () => {
  it('успешен отговор се резолвира с непроменени данни (byte-for-byte)', async () => {
    const payload = { response: [{ fixture: { id: 42 } }], results: 1 };
    const fetchMock = vi.fn(() => okResponse(payload, 200));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).resolves.toEqual(payload);
  });

  it('HTTP non-200 хвърля същата "HTTP <status>" грешка, нулево RATE_LIMIT_ARM', async () => {
    const fetchMock = vi.fn(() => ({ ok: false, status: 500, json: async () => ({}) }));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toThrow('HTTP 500');
    expect(tagsOf(consoleSpy)).not.toContain('[AS-DIAG] RATE_LIMIT_ARM');
  });

  it('мрежова грешка (fetch() самия хвърля) НЕ логва REAL_FETCH_RESPONSE, не arm-ва guard-а', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network boom')));
    const h = buildHarness(fetchMock);
    await expect(h.apiFetchAS('/fixtures?league=172')).rejects.toThrow('network boom');
    const tags = tagsOf(consoleSpy);
    expect(tags).toEqual(['[AS-DIAG] REAL_FETCH_START']); // стигна до fetch, но той самия хвърли преди response
    expect(tags).not.toContain('[AS-DIAG] REAL_FETCH_RESPONSE');
    expect(tags).not.toContain('[AS-DIAG] RATE_LIMIT_ARM');
  });

  it('exact-path inflight dedup остава непроменен - 2 едновременни identical-path заявки = 1 REAL_FETCH_START', async () => {
    let resolveFetch;
    const pending = new Promise(res => { resolveFetch = res; });
    const fetchMock = vi.fn(() => pending);
    const h = buildHarness(fetchMock);
    const p1 = h.apiFetchAS('/fixtures?league=172&season=2026&last=20');
    const p2 = h.apiFetchAS('/fixtures?league=172&season=2026&last=20');
    resolveFetch(okResponse({ response: [] }, 200));
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tagsOf(consoleSpy).filter(t => t === '[AS-DIAG] REAL_FETCH_START').length).toBe(1);
  });

  it('cooldown изтичане след TTL позволява нова реална мрежова заявка (REAL_FETCH_START отново)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => okResponse({ errors: { rateLimit: 'too many' } }, 200));
      const h = buildHarness(fetchMock);
      await h.apiFetchAS('/fixtures?league=172').catch(() => {});
      consoleSpy.mockClear();
      fetchMock.mockClear();
      vi.advanceTimersByTime(60 * 1000 + 1000);
      fetchMock.mockImplementation(() => okResponse({ response: [] }, 200));
      await expect(h.apiFetchAS('/fixtures?league=203')).resolves.toEqual({ response: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(tagsOf(consoleSpy)).toContain('[AS-DIAG] REAL_FETCH_START');
    } finally {
      vi.useRealTimers();
    }
  });
});
