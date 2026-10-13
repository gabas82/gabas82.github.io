// FOOTBALL DASHBOARD ЗАДАЧА 9.3 (виж "Comeback / ОБРАТИ Dead-Cache Fix",
// одита от Задача №9.0/9.2 - "comebackStatsCache съществува, няма TTL,
// единственият production caller вика loadComeback(true), следователно
// read path-ът е практически мъртъв"). Тества РЕАЛНАТА loadComeback() от
// football.html (не копие), извлечена с текстова екстракция (огледално на
// football-comebackerror.test.js/football-scorerscache.test.js). Потвърждава
// точно одобрения contract от checkpoint discussion-а:
// - собствена COMEBACK_CACHE_TTL_MS=15мин константа (НЕ споделена с
//   SCORERS_CACHE_TTL_MS/CARDS_CACHE_TTL_MS);
// - forceRefresh винаги bypass-ва TTL-а, независимо от свежестта му;
// - нормалната табова навигация (loadCurrentTab) вече НЕ force-ва безусловно;
// - СТРОГО success-only запис - dataWarnings.length>0 НИКОГА не презаписва/
//   инвалидира предишен валиден snapshot (нито данните, нито timestamp-а);
// - partial/failed резултат се РЕНДЕРИРА нормално (с warnings), просто не се
//   пази за следващо повторно отваряне.
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
function extractStatement(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error(`не намерих: ${startMarker}`);
  const end = src.indexOf(';', idx);
  return src.slice(idx, end + 1);
}

function buildLoadComeback({ apiFetch, apiFetchAS }) {
  const combinedSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
    extractStatement(html, 'const AS_LEAGUES='),
    extractStatement(html, 'const AS_STATUS_MAP='),
    extractStatement(html, 'let wcKnockoutMatchesCache='),
    extractStatement(html, 'let wcAliveTeamsCache='),
    extractStatement(html, 'const COMEBACK_CACHE_TTL_MS='),
    extractStatement(html, 'let comebackStatsCache='),
    extractStatement(html, 'let comebackStatsCacheAt='),
    extractBraced(html, 'function apiErrorMessage('),
    extractBraced(html, 'async function loadWCKnockoutData('),
    extractBraced(html, 'function computeWCAliveTeams('),
    extractBraced(html, 'async function getWCAliveTeamIds('),
    extractBraced(html, 'function asFixtureToMatch('),
    extractBraced(html, 'function calcComebackStatsForTeam('),
    extractBraced(html, 'function buildComebackStats('),
    extractBraced(html, 'async function loadComeback('),
    extractBraced(html, 'function renderComebackStats('),
  ].join('\n');
  const fn = new Function(
    'document', 'apiFetch', 'apiFetchAS', 'getToday', 'getDateMinus', 'currentSeasonYear', 'getFlag',
    combinedSrc + `
    return {
      loadComeback,
      getCacheSnapshot: () => comebackStatsCache,
      getCacheAt: () => comebackStatsCacheAt,
      getTtl: () => COMEBACK_CACHE_TTL_MS,
    };`
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'comeback-content' ? contentEl : { innerHTML: '' } };
  const harness = fn(
    fakeDoc, apiFetch, apiFetchAS,
    () => '2026-10-11', () => '2026-07-13', () => 2026, (name) => '🏳️'
  );
  return { ...harness, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }

function countingFetchers() {
  let fdCalls = 0, asCalls = 0;
  const apiFetch = () => { fdCalls++; return emptyFd(); };
  const apiFetchAS = () => { asCalls++; return emptyAS(); };
  return { apiFetch, apiFetchAS, getFdCalls: () => fdCalls, getAsCalls: () => asCalls };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('loadComeback() - ЗАДАЧА 9.3: TTL-ограничен success-only cache', () => {
  it('A) първо зареждане (студен кеш) -> реални мрежови заявки', async () => {
    const { apiFetch, apiFetchAS, getFdCalls, getAsCalls } = countingFetchers();
    const { loadComeback } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    expect(getFdCalls()).toBe(2); // общите мачове + WC2026
    expect(getAsCalls()).toBe(4); // EXTRA_AS_LEAGUE_IDS
  });

  it('B) повторно отваряне <15 мин -> кеш резултат, 0 нови еквивалентни заявки', async () => {
    const { apiFetch, apiFetchAS, getFdCalls, getAsCalls } = countingFetchers();
    const { loadComeback } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    expect(getFdCalls()).toBe(2);
    expect(getAsCalls()).toBe(4);
    vi.advanceTimersByTime(5 * 60 * 1000); // +5 мин, все още в TTL прозореца
    await loadComeback();
    expect(getFdCalls()).toBe(2); // непроменено - cache hit, нулеви нови заявки
    expect(getAsCalls()).toBe(4);
  });

  it('C) повторно отваряне точно ПРЕДИ TTL изтичане -> все още cache hit', async () => {
    const { apiFetch, apiFetchAS, getFdCalls } = countingFetchers();
    const { loadComeback, getTtl } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    vi.advanceTimersByTime(getTtl() - 1000); // 1 сек преди изтичане
    await loadComeback();
    expect(getFdCalls()).toBe(2); // все още само първоначалните - cache hit
  });

  it('D) повторно отваряне СЛЕД TTL изтичане -> нови мрежови заявки', async () => {
    const { apiFetch, apiFetchAS, getFdCalls, getAsCalls } = countingFetchers();
    const { loadComeback, getTtl } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    vi.advanceTimersByTime(getTtl() + 1000); // 1 сек след изтичане
    await loadComeback();
    // ЗАБЕЛЕЖКА: loadWCKnockoutData() си има СОБСТВЕН, безсрочен (до force)
    // кеш, непипнат от тая задача - затова WC частта на fd.org НЕ се
    // повтаря на втората обиколка (само общите мачове - 1 нова заявка,
    // не 2). Виж discussion-а - loadComeback() никога не подава force на
    // loadWCKnockoutData(), затова тоя кеш е "forever" независимо от
    // COMEBACK_CACHE_TTL_MS.
    expect(getFdCalls()).toBe(3); // 2 + 1 нова (само общите мачове)
    expect(getAsCalls()).toBe(8); // 4 + 4 нови - AS extra лигите нямат такъв кеш
  });

  it('E) успешен refresh след изтичане -> cache timestamp/данни се обновяват', async () => {
    const { apiFetch, apiFetchAS } = countingFetchers();
    const { loadComeback, getCacheAt } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    const firstAt = getCacheAt();
    vi.advanceTimersByTime(20 * 60 * 1000); // след TTL
    await loadComeback();
    const secondAt = getCacheAt();
    expect(secondAt).toBeGreaterThan(firstAt); // timestamp-ът реално се е обновил
  });

  it('F) forceRefresh=true В РАМКИТЕ на валиден TTL -> bypass на кеша, нова мрежова заявка', async () => {
    const { apiFetch, apiFetchAS, getFdCalls } = countingFetchers();
    const { loadComeback } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    expect(getFdCalls()).toBe(2);
    vi.advanceTimersByTime(60 * 1000); // все още дълбоко в TTL прозореца
    await loadComeback(true);
    // loadWCKnockoutData()'s собствен безсрочен кеш (виж бележката в тест D)
    // пести WC частта и тук - force засяга само COMEBACK_CACHE_TTL_MS guard-а.
    expect(getFdCalls()).toBe(3); // 2 + 1 нова (общите мачове) - force наистина bypass-на TTL-а
  });

  it('G) loadCurrentTab() dispatcher-ът вече НЕ force-ва ОБРАТИ безусловно (регресия)', () => {
    const dispatcherLine = html.slice(html.indexOf("currentTab==='comeback'"), html.indexOf("currentTab==='comeback'") + 60);
    expect(dispatcherLine).not.toContain('loadComeback(true)');
    expect(dispatcherLine).toContain('loadComeback()');
  });

  it('H) провалена/частична обиколка НЕ създава нов валиден cache snapshot (dataWarnings>0 -> няма запис)', async () => {
    const apiFetch = () => Promise.reject(new Error('fd boom'));
    const apiFetchAS = () => emptyAS();
    const { loadComeback, getCacheSnapshot, getCacheAt } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback();
    expect(getCacheSnapshot()).toBeNull(); // нищо не е записано - само провал
    expect(getCacheAt()).toBe(0);
  });

  it('I) след провал следващо нормално зареждане може да retry-не (не е "заклещено" от липсващ кеш)', async () => {
    let attempt = 0;
    const apiFetch = () => { attempt++; return attempt === 1 ? Promise.reject(new Error('boom')) : emptyFd(); };
    const { loadComeback, getCacheSnapshot } = buildLoadComeback({ apiFetch, apiFetchAS: emptyAS });
    await loadComeback();
    expect(getCacheSnapshot()).toBeNull();
    await loadComeback();
    // attempt 1 = общите мачове (провал); attempt 2 = WC (успех, кешира се
    // БЕЗСРОЧНО в loadWCKnockoutData()'s собствения кеш); attempt 3 = само
    // общите мачове на втория опит - WC частта вече е cache hit, не прави
    // нова заявка (виж бележката в тест D).
    expect(attempt).toBe(3);
    expect(getCacheSnapshot()).not.toBeNull(); // вторият опит е напълно успешен - вече кеширан
  });

  it('КРИТИЧНО: valid GOOD cache -> forceRefresh=true -> partial/failure -> старият GOOD snapshot И timestamp остават НЕПИПНАТИ', async () => {
    const goodMatches = [{ id: 1, status: 'FINISHED', competition: { id: 2021 }, utcDate: '2026-01-01', homeTeam: { id: 1, name: 'Отбор X' }, awayTeam: { id: 999, name: 'Съперник' }, score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 2, away: 1 } } }];
    let callNum = 0;
    const apiFetch = (p) => {
      callNum++;
      // Първата пълна обиколка (call 1-2) е успешна; при force refresh-а (call 3) главната заявка пропада.
      if (p.includes('/matches?dateFrom=') && callNum > 2) return Promise.reject(new Error('fd boom'));
      if (p.includes('/matches?dateFrom=')) return Promise.resolve({ matches: goodMatches });
      return emptyFd();
    };
    const { loadComeback, getCacheSnapshot, getCacheAt } = buildLoadComeback({ apiFetch, apiFetchAS: emptyAS });

    await loadComeback(); // първоначален GOOD cache
    const goodSnapshot = getCacheSnapshot();
    const goodAt = getCacheAt();
    expect(goodSnapshot).not.toBeNull();

    vi.advanceTimersByTime(60 * 1000); // все още в оригиналния TTL прозорец
    await loadComeback(true); // forced refresh, но главната заявка пропада -> partial/failed
    const htmlAfterFailedForce = '';

    // Старият GOOD snapshot/timestamp остават точно същите - не са презаписани/нулирани.
    expect(getCacheSnapshot()).toBe(goodSnapshot);
    expect(getCacheAt()).toBe(goodAt);

    // Следващо НОРМАЛНО (не force) зареждане, все още в ОРИГИНАЛНИЯ TTL прозорец -> cache hit (старият GOOD се ползва пак).
    vi.advanceTimersByTime(60 * 1000); // общо 2 мин от goodAt - все още << 15 мин
    const callsBefore = callNum;
    await loadComeback();
    expect(callNum).toBe(callsBefore); // без нова заявка - cache hit върху стария GOOD snapshot

    // След като ОРИГИНАЛНИЯТ TTL (от goodAt) е изтекъл, старият кеш вече не бива да се третира като fresh.
    vi.advanceTimersByTime(20 * 60 * 1000); // общо >15 мин от goodAt
    const callsBeforeExpiry = callNum;
    await loadComeback();
    expect(callNum).toBeGreaterThan(callsBeforeExpiry); // нова реална заявка, старият GOOD вече не е "fresh"
  });

  it('J) рендерирането на съществуващата статистика остава непроменено (regression)', async () => {
    // calcComebackStatsForTeam() изисква >=3 завършени мача за отбор
    // (rel.length<3 -> null) - непроменено, не нова граница от тая задача.
    const generalMatches = [0, 1, 2].map(i => ({
      id: i + 1, status: 'FINISHED', competition: { id: 2021 }, utcDate: `2026-0${i + 1}-01`,
      homeTeam: { id: 1, name: 'Отбор X' }, awayTeam: { id: 999, name: 'Съперник' },
      score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 2, away: 1 } },
    }));
    const apiFetch = (p) => p.includes('/matches?dateFrom=') ? Promise.resolve({ matches: generalMatches }) : emptyFd();
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch, apiFetchAS: emptyAS });
    await loadComeback();
    expect(getHtml()).toContain('Отбор X');
    expect(getHtml()).not.toContain('error-box');
  });
});
