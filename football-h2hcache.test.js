// D3 (виж discussion-а "API натоварване - H2H кеш в ПРОГНОЗИ") - тества
// РЕАЛНАТА fetchH2HCached()/loadUpcoming() от football.html (не копие),
// извлечени с текстова екстракция (огледално на останалите *.test.js файлове).
// Проверява точно одобрения план: TTL 5 мин, отделни ключови пространства за
// AS/fd.org (с/без competitionId), inflight dedup, и че грешка/невалиден
// отговор НИКОГА не се кешира - само успешен (вкл. легитимно празен) резултат.
// PHASE 2D (PR #68, "H2H deferred") - loadUpcoming() вече НЕ тегли H2H
// автоматично при initial render (fetchH2H()/h2hByMatchId премахнати от
// wiring-а, fetchH2HCached()/h2hHtml() остават непипнати helper-и за бъдещ
// on-demand PR). Секции 1 и 3 по-долу (fetchH2HCached()/h2hHtml() standalone)
// тестват helper-ите директно и остават валидни непроменени; секция 2
// (loadUpcoming() wiring) е преработена да доказва 0 H2H заявки.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage } from './football-logic.js';

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

// --- 1. Директни тестове на fetchH2HCached()/h2hCache/h2hInflight самостойно ---
describe('fetchH2HCached() - директни тестове на реалния helper от football.html', () => {
  // Изпълняваме РЕАЛНИТЕ декларации (H2H_FRESH_MS/h2hCache/h2hInflight/fetchH2HCached)
  // в изолиран scope за всеки тест - чист кеш на всяко изпълнение.
  function buildHelper() {
    const src = [
      extractStatement(html, 'const H2H_FRESH_MS='),
      extractStatement(html, 'const h2hCache='),
      extractStatement(html, 'const h2hInflight='),
      extractBraced(html, 'async function fetchH2HCached('),
    ].join('\n');
    return new Function(src + '\nreturn {fetchH2HCached,h2hCache,H2H_FRESH_MS};')();
  }

  it('TTL = 5 минути (300000ms) - съгласно одобреното решение', () => {
    const { H2H_FRESH_MS } = buildHelper();
    expect(H2H_FRESH_MS).toBe(5 * 60 * 1000);
  });

  it('първо извикване за нов ключ вика fetcher-а и кешира резултата', async () => {
    const { fetchH2HCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return [{ id: 1 }]; };
    const r = await fetchH2HCached('k1', fetcher);
    expect(r).toEqual([{ id: 1 }]);
    expect(calls).toBe(1);
  });

  it('повторно извикване СЪС СЪЩИЯ ключ в рамките на TTL НЕ вика fetcher-а пак (cache hit)', async () => {
    const { fetchH2HCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return [{ id: 1 }]; };
    await fetchH2HCached('k1', fetcher);
    const r2 = await fetchH2HCached('k1', fetcher);
    expect(calls).toBe(1);
    expect(r2).toEqual([{ id: 1 }]);
  });

  it('различен ключ НЕ споделя кеша (различни отборски чифтове/competitionId)', async () => {
    const { fetchH2HCached } = buildHelper();
    const calls = [];
    const fetcher = (tag) => async () => { calls.push(tag); return [tag]; };
    await fetchH2HCached('k1', fetcher('a'));
    await fetchH2HCached('k2', fetcher('b'));
    expect(calls).toEqual(['a', 'b']);
  });

  it('легитимно празен масив СЕ кешира нормално (валиден резултат, не грешка)', async () => {
    const { fetchH2HCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return []; };
    const r1 = await fetchH2HCached('k1', fetcher);
    const r2 = await fetchH2HCached('k1', fetcher);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    expect(calls).toBe(1); // празният резултат е кеширан - вторият път няма нова заявка
  });

  it('грешка (fetcher хвърля) НЕ се кешира - следващото извикване опитва отново', async () => {
    const { fetchH2HCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; if (calls === 1) throw new Error('boom'); return [{ ok: true }]; };
    await expect(fetchH2HCached('k1', fetcher)).rejects.toThrow('boom');
    const r2 = await fetchH2HCached('k1', fetcher);
    expect(calls).toBe(2); // втория опит Е нова заявка - грешката не е оставила кеш запис
    expect(r2).toEqual([{ ok: true }]);
  });

  it('inflight dedup - две ЕДНОВРЕМЕННИ извиквания със същия ключ споделят ЕДИН fetcher промис', async () => {
    const { fetchH2HCached } = buildHelper();
    let calls = 0;
    let resolveFetcher;
    const fetcher = () => { calls++; return new Promise(res => { resolveFetcher = res; }); };
    const p1 = fetchH2HCached('k1', fetcher);
    const p2 = fetchH2HCached('k1', fetcher); // стартирана ПРЕДИ p1 да приключи
    resolveFetcher([{ shared: true }]);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1); // само ЕДИН реален fetcher извикан, въпреки 2 паралелни извиквания
    expect(r1).toEqual([{ shared: true }]);
    expect(r2).toEqual([{ shared: true }]);
  });

  it('изтекъл TTL (симулиран с фалшив часовник) води до нова заявка', async () => {
    vi.useFakeTimers();
    try {
      const { fetchH2HCached } = buildHelper();
      let calls = 0;
      const fetcher = async () => { calls++; return [calls]; };
      const r1 = await fetchH2HCached('k1', fetcher);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1); // 5 мин + 1мс -> изтекъл кеш
      const r2 = await fetchH2HCached('k1', fetcher);
      expect(calls).toBe(2);
      expect(r1).toEqual([1]);
      expect(r2).toEqual([2]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- 2. Wiring тестове - PHASE 2D (PR #68): H2H е deferred, loadUpcoming() вече НЕ тегли H2H автоматично ---
describe('loadUpcoming() - H2H deferred (PR #68) - initial render прави 0 H2H заявки', () => {
  const combinedSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const AS_LEAGUES=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
    extractStatement(html, 'const H2H_FRESH_MS='),
    extractStatement(html, 'const h2hCache='),
    extractStatement(html, 'const h2hInflight='),
    extractBraced(html, 'async function fetchH2HCached('),
    extractBraced(html, 'async function fetchFdHistoryAndWc('),
    // PHASE 2C-A - loadUpcoming() вика scheduleCompScorersEnrichment() след рендъра;
    // тоя harness не тества scorer enrichment, затова no-op stub е достатъчен.
    'function scheduleCompScorersEnrichment(){}',
    extractBraced(html, 'async function loadUpcoming('),
  ].join('\n');

  function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch, beginAsForeground, endAsForeground, fetchAsLeagueSeasonHistory }) {
    const fn = new Function(
      'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
      'asFixtureToMatch', 'sortMatchesByDate', 'renderMatch',
      'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity',
      'buildEmptyWindowMessage', 'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory',
      combinedSrc + `\nreturn loadUpcoming;`
    );
    return fn(
      () => '2026-10-10', (d) => `2026-10-${String(10 + d).padStart(2, '0')}`, apiFetch, () => '2026-04-01', apiFetchAS, () => 2026,
      (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture?.date, competition: { id: 'as_' + f.league?.id, name: f.league?.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
      sortMatchesByDate, renderMatch || (() => '<div>MATCH</div>'),
      21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
      beginAsForeground || (() => {}), endAsForeground || (() => {}),
      fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false }))
    );
  }

  function emptyFd() { return Promise.resolve({ matches: [] }); }
  function emptyAS() { return Promise.resolve({ response: [] }); }

  beforeEach(() => { document.body.innerHTML = '<div id="upcoming-content"></div>'; });

  it('(A) FD-covered видим мач - apiFetch НИКОГА не вика H2H пътя (/matches?competitions=...teams=...)', async () => {
    const plMatch = { id: 1, utcDate: '2026-10-15', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    const h2hCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [plMatch] });
      if (p.includes('teams=')) { h2hCalls.push(p); return Promise.resolve({ matches: [] }); }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    expect(h2hCalls.length).toBe(0);
  });

  it('(A) AS-covered видим мач - apiFetchAS НИКОГА не вика /fixtures/headtohead', async () => {
    const ueclFixture = { fixture: { id: 777, date: '2026-10-15T20:00:00Z' }, league: { id: 848, name: 'UEFA Conference League' }, teams: { home: { id: 11, name: 'X' }, away: { id: 22, name: 'Y' } } };
    const h2hCalls = [];
    const apiFetchAS = (p) => {
      if (p.includes('league=848') && p.includes('next=15')) return Promise.resolve({ response: [ueclFixture] });
      if (p.includes('/fixtures/headtohead')) { h2hCalls.push(p); return Promise.resolve({ response: [] }); }
      return emptyAS();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS, renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    expect(h2hCalls.length).toBe(0);
  });

  it('(A) повторно зареждане на ПРОГНОЗИ (reload) - пак 0 H2H заявки (нулев network, нулев кеш wiring нужен)', async () => {
    const plMatch = { id: 1, utcDate: '2026-10-15', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    let h2hNetworkCalls = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [plMatch] });
      if (p.includes('teams=')) { h2hNetworkCalls++; return Promise.resolve({ matches: [] }); }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    await loadUpcoming(); // второ, "повторно" зареждане - симулира презареждане на таба
    expect(h2hNetworkCalls).toBe(0);
  });

  it('(B) мрежова грешка на fd.org, ако H2H БЕШЕ извикан, никога не стига до там - 0 опита, не 2', async () => {
    const plMatch = { id: 1, utcDate: '2026-10-15', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    let h2hAttempts = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [plMatch] });
      if (p.includes('teams=')) { h2hAttempts++; return Promise.reject(new Error('h2h boom')); }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    await loadUpcoming();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).not.toContain('error-box');
    expect(h2hAttempts).toBe(0);
  });

  it('(B) два видими мача с различни чифтове отбори -> пак 0 H2H заявки общо (не 2)', async () => {
    const m1 = { id: 1, utcDate: '2026-10-11', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    const m2 = { id: 2, utcDate: '2026-10-12', status: 'SCHEDULED', homeTeam: { id: 30, name: 'C' }, awayTeam: { id: 40, name: 'D' }, competition: { id: 2021 } };
    const h2hCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [m1, m2] });
      if (p.includes('teams=')) { h2hCalls.push(p); return Promise.resolve({ matches: [] }); }
      return emptyFd();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    expect(h2hCalls.length).toBe(0);
  });
});

// --- 3. Корекция: грешка визуално разграничена от легитимно празно H2H ---
describe('h2hHtml() - реалната функция от football.html, 3 разграничени състояния', () => {
  function buildH2hHtml() {
    const src = extractBraced(html, 'function h2hHtml(');
    return new Function(src + '\nreturn h2hHtml;')();
  }

  it('успешен H2H с мачове -> нормален HEAD-TO-HEAD блок', () => {
    const h2hHtml = buildH2hHtml();
    const matches = [{ utcDate: '2026-01-01', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, score: { fullTime: { home: 2, away: 1 } } }];
    const out = h2hHtml(matches, 'A', 'B');
    expect(out).toContain('HEAD-TO-HEAD');
    expect(out).not.toContain('⚠️ H2H данните временно не са налични.');
  });

  it('валиден празен масив (без .h2hError) -> запазено старо поведение, без H2H блок', () => {
    const h2hHtml = buildH2hHtml();
    const out = h2hHtml([], 'A', 'B');
    expect(out).toBe('');
  });

  it('масив маркиран с .h2hError -> кратко, ненатрапчиво съобщение, НЕ "error-box"', () => {
    const h2hHtml = buildH2hHtml();
    const errArr = []; errArr.h2hError = true;
    const out = h2hHtml(errArr, 'A', 'B');
    expect(out).toContain('⚠️ H2H данните временно не са налични.');
    expect(out).not.toContain('error-box');
    expect(out).not.toContain('HEAD-TO-HEAD');
  });
});

describe('loadUpcoming() - H2H deferred (PR #68) - renderMatch() получава h2hMatches=null, prediction картите се render-ват нормално', () => {
  const combinedSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const AS_LEAGUES=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
    extractStatement(html, 'const H2H_FRESH_MS='),
    extractStatement(html, 'const h2hCache='),
    extractStatement(html, 'const h2hInflight='),
    extractBraced(html, 'async function fetchH2HCached('),
    extractBraced(html, 'async function fetchFdHistoryAndWc('),
    // PHASE 2C-A - loadUpcoming() вика scheduleCompScorersEnrichment() след рендъра;
    // тоя harness не тества scorer enrichment, затова no-op stub е достатъчен.
    'function scheduleCompScorersEnrichment(){}',
    extractBraced(html, 'async function loadUpcoming('),
  ].join('\n');

  function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch, fetchAsLeagueSeasonHistory }) {
    const fn = new Function(
      'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
      'asFixtureToMatch', 'sortMatchesByDate', 'renderMatch',
      'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity',
      'buildEmptyWindowMessage', 'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory',
      combinedSrc + `\nreturn loadUpcoming;`
    );
    return fn(
      () => '2026-10-10', (d) => `2026-10-${String(10 + d).padStart(2, '0')}`, apiFetch, () => '2026-04-01', apiFetchAS, () => 2026,
      (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture?.date, competition: { id: 'as_' + f.league?.id, name: f.league?.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
      sortMatchesByDate, renderMatch || (() => '<div>MATCH</div>'),
      21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
      () => {}, () => {},
      fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false }))
    );
  }

  function emptyFd() { return Promise.resolve({ matches: [] }); }
  function emptyAS() { return Promise.resolve({ response: [] }); }

  beforeEach(() => { document.body.innerHTML = '<div id="upcoming-content"></div>'; });

  it('(C) видим мач с prediction данни - renderMatch() получава h2hMatches=null СТРИКТНО (не празен масив, не .h2hError маркиран масив)', async () => {
    const plMatch = { id: 1, utcDate: '2026-10-15', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    const apiFetch = (p) => p.includes('status=SCHEDULED,TIMED') ? Promise.resolve({ matches: [plMatch] }) : emptyFd();
    let captured = 'UNSET';
    const renderMatch = (m, showPred, allMatches, h2hMatches) => { if (m.id === 1) captured = h2hMatches; return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch });
    await loadUpcoming();
    expect(captured).toBeNull();
  });

  it('(D) h2hHtml(null,...) (реалната функция) не генерира нито HEAD-TO-HEAD блок, нито H2H error съобщение', () => {
    const h2hHtmlFn = new Function(extractBraced(html, 'function h2hHtml(') + '\nreturn h2hHtml;')();
    const out = h2hHtmlFn(null, 'A', 'B');
    expect(out).toBe('');
    expect(out).not.toContain('HEAD-TO-HEAD');
    expect(out).not.toContain('⚠️ H2H данните временно не са налични.');
  });

  it('(C) два видими мача с различни чифтове отбори - prediction картите се render-ват нормално за ДВата (renderMatch извикан за всеки), h2hMatches=null и за двата', async () => {
    const mA = { id: 1, utcDate: '2026-10-11', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    const mB = { id: 2, utcDate: '2026-10-12', status: 'SCHEDULED', homeTeam: { id: 30, name: 'C' }, awayTeam: { id: 40, name: 'D' }, competition: { id: 2021 } };
    const apiFetch = (p) => p.includes('status=SCHEDULED,TIMED') ? Promise.resolve({ matches: [mA, mB] }) : emptyFd();
    const captured = {};
    const renderMatch = (m, showPred, allMatches, h2hMatches) => { captured[m.id] = h2hMatches; return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch });
    await loadUpcoming();
    expect(Object.keys(captured).sort()).toEqual(['1', '2']); // и двете карти са render-нати
    expect(captured[1]).toBeNull();
    expect(captured[2]).toBeNull();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).not.toContain('error-box');
  });

  it('(B/D) мрежов reject на H2H-shaped path никога не се случва - fetch симулиращ H2H грешка никога не се извиква (0 опита, не 1/2)', async () => {
    const plMatch = { id: 1, utcDate: '2026-10-15', status: 'SCHEDULED', homeTeam: { id: 10, name: 'A' }, awayTeam: { id: 20, name: 'B' }, competition: { id: 2021 } };
    let attempt = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [plMatch] });
      if (p.includes('teams=')) { attempt++; return Promise.reject(new Error('h2h boom')); }
      return emptyFd();
    };
    const captured = [];
    const renderMatch = (m, showPred, allMatches, h2hMatches) => { captured.push(h2hMatches); return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch });
    await loadUpcoming();
    await loadUpcoming();
    expect(attempt).toBe(0);
    expect(captured.every(c => c === null)).toBe(true);
  });
});
