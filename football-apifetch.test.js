// PR C1: тества РЕАЛНАТА apiFetch() от football.html (не копие), извлечена с
// текстова екстракция (огледално на техниката в другите *.test.js файлове).
// Worker-ът (worker.js) винаги връща HTTP 200 към клиента, независимо от
// реалния upstream статус - затова единственият надежден сигнал за грешка от
// football-data.org е съдържанието на тялото: {"message":"..."} (документиран
// формат за ВСИЧКИ техни грешки - rate limit/auth/сървърна/невалиден
// параметър). Преди тази промяна, такъв отговор се третираше тихо като
// "0 мача" навсякъде, където кодът прави data.matches||[] - неразличимо от
// реално празен, валиден отговор.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { getHistory, saveHistory, findMatchingRecord, computeRegularScore } from './football-logic.js';

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

const apiFetchCode = extractBraced(html, 'async function apiFetch(');

function buildApiFetch(fetchImpl) {
  const fn = new Function('WORKER', 'fetch', apiFetchCode + `\nreturn apiFetch;`);
  return fn('https://worker.test/football', fetchImpl);
}

function okResponse(body) { return { ok: true, json: async () => body }; }

describe('apiFetch - валиден отговор с мачове', () => {
  it('връща данните непроменени', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [{ id: 1 }, { id: 2 }] }));
    const apiFetch = buildApiFetch(fetchMock);
    const data = await apiFetch('/matches?date=2026-10-10');
    expect(data.matches).toHaveLength(2);
  });
});

describe('apiFetch - валиден празен отговор', () => {
  it('{matches:[]} се третира като успех, НЕ като грешка', async () => {
    const fetchMock = vi.fn(() => okResponse({ count: 0, matches: [] }));
    const apiFetch = buildApiFetch(fetchMock);
    const data = await apiFetch('/matches?date=2026-10-10');
    expect(data.matches).toEqual([]);
  });
});

describe('apiFetch - API грешки от football-data.org (документиран {"message":...} формат)', () => {
  it('rate limit -> хвърля с isApiError, НЕ връща като успешен празен отговор', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit. Wait 42 seconds.' }));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isApiError: true });
  });
  it('authentication error -> хвърля с isApiError', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'No X-Auth-Token was provided.' }));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isApiError: true });
  });
  it('сървърна грешка -> хвърля с isApiError', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'Internal server error. Please try again later.' }));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isApiError: true });
  });
  it('съобщението за потребителя е разбираемо и на български, суровият текст е запазен в providerMessage', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'Internal server error.' }));
    const apiFetch = buildApiFetch(fetchMock);
    try {
      await apiFetch('/matches?date=2026-10-10');
      expect.fail('очаквах throw');
    } catch (e) {
      expect(e.message).toContain('football-data.org');
      expect(e.providerMessage).toBe('Internal server error.');
    }
  });
  it('документиран errorCode (напр. 429) се пази в providerErrorCode, без да участва в самото засичане', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit.', errorCode: 429 }));
    const apiFetch = buildApiFetch(fetchMock);
    try {
      await apiFetch('/matches?date=2026-10-10');
      expect.fail('очаквах throw');
    } catch (e) {
      expect(e.isApiError).toBe(true);
      expect(e.providerErrorCode).toBe(429);
    }
  });
  it('липсващ errorCode не чупи нищо - providerErrorCode остава undefined', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'Internal server error.' }));
    const apiFetch = buildApiFetch(fetchMock);
    try {
      await apiFetch('/matches?date=2026-10-10');
      expect.fail('очаквах throw');
    } catch (e) {
      expect(e.providerErrorCode).toBeUndefined();
    }
  });
});

describe('apiFetch - мрежова грешка (fetch() самия хвърля)', () => {
  it('хвърля с isNetworkError, разбираемо съобщение', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isNetworkError: true });
  });
});

describe('apiFetch - невалиден/неочакван JSON отговор', () => {
  it('r.json() хвърля SyntaxError -> apiFetch хвърля с isInvalidResponse', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isInvalidResponse: true });
  });
});

describe('apiFetch - HTTP грешка от самия Worker (рядко, но технически възможно)', () => {
  it('!r.ok -> хвърля с isHttpError', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 403, json: async () => ({}) }));
    const apiFetch = buildApiFetch(fetchMock);
    await expect(apiFetch('/matches?date=2026-10-10')).rejects.toMatchObject({ isHttpError: true });
  });
});

// Регресия: 16-те съществуващи извиквания на apiFetch() в football.html вече
// минават през try/catch (локален за секцията) или Promise.allSettled -
// проверено ръчно преди имплементация. Тук тестваме конкретно updateHistoryResults(),
// защото изискването изрично поиска проверка на влиянието върху резолюцията
// на историята.
describe('updateHistoryResults() - влияние на новата apiFetch грешка-проверка', () => {
  const combinedHtml = fs.readFileSync('./football.html', 'utf8');
  function extractAsync(src, name) {
    const idx = src.indexOf(`async function ${name}(`);
    let depth = 0, start = src.indexOf('{', idx), i = start;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return src.slice(idx, i);
  }
  const combinedSrc = [
    extractAsync(combinedHtml, 'apiFetch'),
    extractBraced(combinedHtml, 'async function updateHistoryResultsAS('),
    extractBraced(combinedHtml, 'async function updateHistoryResults('),
  ].join('\n');

  function buildUpdateHistoryResults({ fetchImpl, apiFetchASImpl }) {
    const fn = new Function(
      'WORKER', 'fetch', 'apiFetchAS', 'currentSeasonYear', 'getUnresolvedAsLeagueIds',
      'AS_LEAGUES', 'asForegroundActiveCount', 'getHistory', 'saveHistory',
      'getDateMinus', 'getToday', 'findMatchingRecord', 'computeRegularScore',
      combinedSrc + `\nreturn updateHistoryResults;`
    );
    return fn(
      'https://worker.test/football', fetchImpl,
      apiFetchASImpl || (async () => ({ response: [] })),
      () => 2026, () => ({ leagueIds: [], legacyFallback: false }),
      [], 0, getHistory, saveHistory,
      () => '2026-08-01', () => '2026-10-10', findMatchingRecord, computeRegularScore
    );
  }

  beforeEach(() => { localStorage.clear(); });

  it('при API грешка от fd.org - нерешен запис остава НЕпроменен, НЕ се пише фиктивен резултат', async () => {
    const entry = { id: '12345', home: 'Team A', away: 'Team B', date: '2026-10-01T00:00:00Z', compId: 2021, result: null };
    saveHistory([entry]);
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit.' }));
    const updateHistoryResults = buildUpdateHistoryResults({ fetchImpl: fetchMock });
    await updateHistoryResults();
    const hist = getHistory();
    expect(hist[0].result).toBeNull();
    expect(hist).toEqual([entry]);
  });
  it('при мрежова грешка - същото: без фиктивен резултат, без загуба на записа', async () => {
    const entry = { id: '12345', home: 'Team A', away: 'Team B', date: '2026-10-01T00:00:00Z', compId: 2021, result: null };
    saveHistory([entry]);
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const updateHistoryResults = buildUpdateHistoryResults({ fetchImpl: fetchMock });
    await updateHistoryResults();
    const hist = getHistory();
    expect(hist[0].result).toBeNull();
  });
  it('успешен (непразен) отговор продължава да резолвира коректно - без регресия', async () => {
    const entry = { id: '12345', home: 'Team A', away: 'Team B', date: '2026-10-01T00:00:00Z', compId: 2021, result: null };
    saveHistory([entry]);
    const fdMatch = {
      id: '12345', utcDate: '2026-10-01T00:00:00Z',
      homeTeam: { name: 'Team A', shortName: 'Team A' },
      awayTeam: { name: 'Team B', shortName: 'Team B' },
      score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 } },
    };
    const fetchMock = vi.fn((url) => {
      if (url.includes('competitions/2000')) return okResponse({ matches: [] });
      return okResponse({ matches: [fdMatch] });
    });
    const updateHistoryResults = buildUpdateHistoryResults({ fetchImpl: fetchMock });
    await updateHistoryResults();
    const hist = getHistory();
    expect(hist[0].result).toEqual({ hg: 2, ag: 1, total: 3, gg: true, winner: '1' });
  });
});

// Пряка регресия на изискване 3: API грешка от fd.org вече НЕ се показва
// като "Няма мачове в следващите 21 дни" - комбинира РЕАЛНИТЕ apiFetch() и
// loadUpcoming() (не копия), за да докаже ефекта end-to-end, не само на
// ниво apiFetch().
describe('loadUpcoming() - API грешка от fd.org вече НЕ се показва като "Няма мачове"', () => {
  const combinedHtml = fs.readFileSync('./football.html', 'utf8');
  const combinedSrc = [
    extractBraced(combinedHtml, 'async function apiFetch('),
    extractBraced(combinedHtml, 'async function fetchFdHistoryAndWc('),
    extractBraced(combinedHtml, 'async function loadUpcoming('),
  ].join('\n');

  function buildLoadUpcomingWithRealApiFetch({ fetchImpl, apiFetchASImpl, beginAsForeground, endAsForeground }) {
    const fn = new Function(
      'WORKER', 'fetch', 'getToday', 'getDatePlus', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
      'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
      'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity',
      'buildEmptyWindowMessage', 'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory',
      combinedSrc + `\nreturn loadUpcoming;`
    );
    return fn(
      'https://worker.test/football', fetchImpl,
      () => '2026-10-10', (d) => `2026-10-${String(10 + d).padStart(2, '0')}`, () => '2026-04-01',
      apiFetchASImpl || (async () => ({ response: [] })), () => 2026,
      [172, 203, 79],
      (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture?.date, competition: { id: 'as_' + f.league?.id, name: f.league?.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
      (arr) => arr.slice().sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
      [{ id: 2021, name: 'Premier League', flag: '🏴' }, { id: 2002, name: 'Bundesliga', flag: '🇩🇪' }],
      [{ id: 172, icon: '🇧🇬', title: 'Ефбет Лига' }],
      () => '<div>MATCH</div>',
      21, 10,
      (arr, n) => arr.slice(0, n), () => false,
      (w) => `Няма мачове в следващите ${w} дни.`,
      beginAsForeground || (() => {}), endAsForeground || (() => {}),
      async () => ({ matches: [], blendingPrevSeason: false })
    );
  }

  beforeEach(() => { document.body.innerHTML = '<div id="upcoming-content"></div>'; });

  it('API грешка от основната fd.org заявка -> error-box, НЕ "Няма мачове" за нито едно състезание', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'You reached your request limit.' }));
    const loadUpcoming = buildLoadUpcomingWithRealApiFetch({ fetchImpl: fetchMock });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('error-box');
    expect(html).not.toContain('Няма мачове в следващите 21 дни');
  });
  it('регресия: реално празен (валиден) отговор продължава да показва честното "Няма мачове" съобщение', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const loadUpcoming = buildLoadUpcomingWithRealApiFetch({ fetchImpl: fetchMock });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('Няма мачове в следващите 21 дни');
    expect(html).not.toContain('error-box');
  });
});

// Изрично поискана проверка: loadWCKnockoutData() (друг пряк consumer на
// apiFetch(), ползван от НОКАУТ/COMEBACK/ГОЛМАЙСТОРИ) вече пази стария кеш
// при API грешка, вместо тихо да го презапише с [] - преди тази промяна,
// {"message":"..."} отговор се третираше като "0 мача" и ТРИЕШЕ валиден,
// по-рано успешно изтеглен кеш.
describe('loadWCKnockoutData() - запазва кеша при API грешка, не го трие', () => {
  const combinedHtml = fs.readFileSync('./football.html', 'utf8');
  const combinedSrc = [
    'let wcKnockoutMatchesCache=null;',
    extractBraced(combinedHtml, 'async function apiFetch('),
    extractBraced(combinedHtml, 'async function loadWCKnockoutData('),
  ].join('\n');

  function buildLoadWCKnockoutData(fetchImpl) {
    const fn = new Function('WORKER', 'fetch', combinedSrc + `\nreturn { loadWCKnockoutData, getCache: () => wcKnockoutMatchesCache };`);
    return fn('https://worker.test/football', fetchImpl);
  }

  it('успешно изтеглените мачове се кешират нормално (regression)', async () => {
    const matches = [{ id: 1, stage: 'FINAL' }];
    const fetchMock = vi.fn(() => okResponse({ matches }));
    const h = buildLoadWCKnockoutData(fetchMock);
    const result = await h.loadWCKnockoutData();
    expect(result).toEqual(matches);
    expect(h.getCache()).toEqual(matches);
  });
  it('API грешка СЛЕД вече успешен кеш -> връща и пази СТАРИЯ кеш, не го трие с []', async () => {
    let call = 0;
    const matches = [{ id: 1, stage: 'FINAL' }];
    const fetchMock = vi.fn(() => {
      call++;
      if (call === 1) return okResponse({ matches });
      return okResponse({ message: 'You reached your request limit.' });
    });
    const h = buildLoadWCKnockoutData(fetchMock);
    await h.loadWCKnockoutData();
    const result2 = await h.loadWCKnockoutData(true); // force=true, заобикаля кеша, праща нова заявка
    expect(result2).toEqual(matches); // старите данни, не []
    expect(h.getCache()).toEqual(matches);
  });
  it('API грешка БЕЗ предходен кеш -> връща [] (честно, не хвърля нагоре)', async () => {
    const fetchMock = vi.fn(() => okResponse({ message: 'Internal server error.' }));
    const h = buildLoadWCKnockoutData(fetchMock);
    const result = await h.loadWCKnockoutData();
    expect(result).toEqual([]);
  });
});
