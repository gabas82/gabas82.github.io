// PR B: тества РЕАЛНАТА fetchAsLeagueSeasonHistory()/fetchAsSeasonFixtures()
// от football.html (не копия), извлечени с текстова екстракция (огледално на
// техниката в другите *.test.js файлове). Покрива: кеш по лига+сезон с TTL,
// защита срещу едновременни дублирани заявки, запазен prev-season fallback,
// разграничаване на реално празни данни/API грешки/rate limit (без изтриване
// на валиден кеш), сезонни граници (чрез PR A helper-ите), и wiring regression
// за loadUpcoming/loadASLeagueTab + съвместимост с updateHistoryResultsAS (PR #29).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { currentSeasonYear, buildAsSeasonHistoryQuery, getUnresolvedAsLeagueIds, getHistory, saveHistory } from './football-logic.js';

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

// Комбинира новия, НЕ-копиран PR B код в един споделен scope - именно защото
// в реалния файл fetchAsSeasonFixtures/fetchAsLeagueSeasonHistory споделят
// модулно състояние (asSeasonHistoryCache/asSeasonHistoryInflight) чрез
// обикновени затворени променливи.
const combinedSrc = [
  extractStatement(html, 'const AS_SEASON_HISTORY_FRESH_MS=5*60*1000;'),
  extractStatement(html, 'const asSeasonHistoryCache={};'),
  extractStatement(html, 'const asSeasonHistoryInflight={};'),
  extractBraced(html, 'async function fetchAsSeasonFixtures('),
  extractBraced(html, 'async function fetchAsLeagueSeasonHistory('),
].join('\n');

function buildHarness({ apiFetchAS, seasonYear = 2026 } = {}) {
  const fn = new Function(
    'apiFetchAS', 'currentSeasonYear', 'buildAsSeasonHistoryQuery',
    combinedSrc + `
    return {
      fetchAsLeagueSeasonHistory, fetchAsSeasonFixtures,
      getCache: () => asSeasonHistoryCache,
      getInflightKeys: () => Object.keys(asSeasonHistoryInflight),
    };
  `);
  return fn(apiFetchAS, () => seasonYear, buildAsSeasonHistoryQuery);
}

function ftFixture(id) { return { fixture: { id, status: { short: 'FT' } }, goals: { home: 1, away: 0 } }; }
// apiFetchAS() (PR #29) вече връща ПАРСНАТ JSON директно (не fetch Response) -
// мокваме с ТОЧНО същата форма, иначе data.response||[] винаги би бил [].
function okResponse(body) { return Promise.resolve(body); }

describe('fetchAsLeagueSeasonHistory - кеш по лига+сезон с TTL 5 минути', () => {
  it('втора заявка в рамките на TTL връща кеширани данни - нулев нов fetch', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    const r1 = await h.fetchAsLeagueSeasonHistory(172);
    const r2 = await h.fetchAsLeagueSeasonHistory(172);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });
  it('различна лига -> отделен кеш запис, отделна заявка', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    await h.fetchAsLeagueSeasonHistory(172);
    await h.fetchAsLeagueSeasonHistory(203);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('след изтичане на TTL (5 мин) - следваща заявка прави нов реален fetch', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
      const h = buildHarness({ apiFetchAS: fetchMock });
      await h.fetchAsLeagueSeasonHistory(172);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await h.fetchAsLeagueSeasonHistory(172);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchAsLeagueSeasonHistory - защита срещу едновременни дублирани заявки', () => {
  it('два ПАРАЛЕЛНИ извиквания за СЪЩАТА лига -> един реален fetch (inflight dedup)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    const [a, b] = await Promise.all([h.fetchAsLeagueSeasonHistory(172), h.fetchAsLeagueSeasonHistory(172)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
  it('inflight записът се изчиства след приключване - следваща (не-паралелна) заявка извън TTL прави нов fetch', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    await h.fetchAsLeagueSeasonHistory(172);
    expect(h.getInflightKeys()).toEqual([]);
  });
});

describe('fetchAsLeagueSeasonHistory - сезонни граници (PR A)', () => {
  it('заявката за текущия сезон използва buildAsSeasonHistoryQuery (from=<season>-07-01)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock, seasonYear: 2026 });
    await h.fetchAsLeagueSeasonHistory(172);
    const query = fetchMock.mock.calls[0][0];
    expect(query).toContain('season=2026');
    expect(query).toContain('from=2026-07-01');
  });
});

describe('fetchAsLeagueSeasonHistory - запазен fallback към предходния сезон', () => {
  it('<4 реално FINISHED мача -> доп. заявка за предходния сезон (last=25), блендва се', async () => {
    const fetchMock = vi.fn((q) => {
      if (q.includes('season=2026') && q.includes('from=')) return okResponse({ response: [ftFixture(1)] }); // само 1 FT
      if (q.includes('season=2025') && q.includes('last=25')) return okResponse({ response: [ftFixture(90), ftFixture(91)] });
      return okResponse({ response: [] });
    });
    const h = buildHarness({ apiFetchAS: fetchMock, seasonYear: 2026 });
    const r = await h.fetchAsLeagueSeasonHistory(172);
    expect(r.blendingPrevSeason).toBe(true);
    expect(r.matches.length).toBe(3); // 1 текущ + 2 предишен сезон
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('>=4 реално FINISHED мача -> НЕ пита предишния сезон изобщо (нулева допълнителна заявка)', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    const r = await h.fetchAsLeagueSeasonHistory(172);
    expect(r.blendingPrevSeason).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('<4 FINISHED, но предишният сезон връща празно -> blendingPrevSeason остава false (запазено старо условие)', async () => {
    const fetchMock = vi.fn((q) => {
      if (q.includes('season=2026')) return okResponse({ response: [ftFixture(1)] });
      return okResponse({ response: [] });
    });
    const h = buildHarness({ apiFetchAS: fetchMock, seasonYear: 2026 });
    const r = await h.fetchAsLeagueSeasonHistory(172);
    expect(r.blendingPrevSeason).toBe(false);
    expect(r.matches.length).toBe(1);
  });
  it('<4 FINISHED сред мачове с друг статус (SCHEDULED/PST) - броят се само реално FINISHED', async () => {
    const mixed = [
      ftFixture(1),
      { fixture: { id: 2, status: { short: 'PST' } } },
      { fixture: { id: 3, status: { short: 'NS' } } },
    ];
    const fetchMock = vi.fn((q) => {
      if (q.includes('season=2026')) return okResponse({ response: mixed });
      return okResponse({ response: [ftFixture(90)] });
    });
    const h = buildHarness({ apiFetchAS: fetchMock, seasonYear: 2026 });
    const r = await h.fetchAsLeagueSeasonHistory(172);
    expect(r.blendingPrevSeason).toBe(true); // само 1 реално FT < 4
  });
});

describe('fetchAsLeagueSeasonHistory - разграничаване на грешки, без изтриване на валиден кеш', () => {
  it('rate-limit/мрежова грешка БЕЗ предходен кеш -> пропагира грешката (извикващият решава)', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('Too many requests.')));
    const h = buildHarness({ apiFetchAS: fetchMock });
    await expect(h.fetchAsLeagueSeasonHistory(172)).rejects.toThrow('Too many requests.');
  });
  it('грешка СЛЕД успешен кеш (след изтекъл TTL) -> връща СТАРИТЕ валидни данни, не ги трие', async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      const fetchMock = vi.fn(() => {
        call++;
        if (call === 1) return okResponse({ response: [ftFixture(1), ftFixture(2), ftFixture(3), ftFixture(4)] });
        return Promise.reject(new Error('Too many requests.'));
      });
      const h = buildHarness({ apiFetchAS: fetchMock });
      const r1 = await h.fetchAsLeagueSeasonHistory(172);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      const r2 = await h.fetchAsLeagueSeasonHistory(172);
      expect(r2).toEqual(r1); // старите данни оцеляват, не е презаписано с грешка
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('реално празен, но УСПЕШЕН отговор ({response:[]}) НЕ се бърка с грешка - кешира се нормално', async () => {
    const fetchMock = vi.fn(() => okResponse({ response: [] }));
    const h = buildHarness({ apiFetchAS: fetchMock });
    const r = await h.fetchAsLeagueSeasonHistory(172);
    expect(r.matches).toEqual([]);
    expect(r.blendingPrevSeason).toBe(false); // 0 FT <4, но prevSeasonRaw също празно -> остава false
  });
});

describe('Съвместимост с PR #29 - updateHistoryResultsAS() НЕ минава през новия кеш', () => {
  it('getUnresolvedAsLeagueIds() остава чиста функция, независима от fetchAsLeagueSeasonHistory', () => {
    // Регресия на самото съществуване/поведение на PR #29 API-то, което тази
    // задача изрично НЕ трябва да пипа/задmíни.
    const hist = [{ id: 'as_1', compId: 'as_172', result: null }];
    expect(getUnresolvedAsLeagueIds(hist)).toEqual({ leagueIds: [172], legacyFallback: false });
  });
  it('getHistory/saveHistory (localStorage структурата на историята) остават непипнати', () => {
    localStorage.clear();
    const entry = { id: 'as_1', compId: 'as_172', home: 'H', away: 'A', date: '2026-10-01', result: null };
    saveHistory([entry]);
    expect(getHistory()).toEqual([entry]);
  });
});
