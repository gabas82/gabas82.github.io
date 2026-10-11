// FOOTBALL DASHBOARD PR 2 (виж "TTL кеширане на ГОЛМАЙСТОРИ") - тества
// РЕАЛНАТА fetchScorersCached()/loadScorers()/apiSportsScorersBlockHtml() от
// football.html (не копие), извлечени с текстова екстракция (огледално на
// football-h2hcache.test.js/football-wcscorers.test.js). Проверява точно
// одобрените изисквания: TTL 15 мин, стабилен ключ (без _t=Date.now()),
// inflight dedup, грешка/невалиден отговор никога не се кешира, отделни
// ключови пространства по доставчик+лига/състезание+сезон, запазен Efbet
// Liga фиксът (PR 1), и непипнат wcScorersCache/loadWCScorers() (D5).
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// --- 1. Директни тестове на fetchScorersCached()/scorersCache/scorersInflight самостойно ---
describe('fetchScorersCached() - директни тестове на реалния helper от football.html', () => {
  function buildHelper() {
    const src = [
      extractStatement(html, 'const SCORERS_CACHE_TTL_MS='),
      extractStatement(html, 'const scorersCache='),
      extractStatement(html, 'const scorersInflight='),
      extractBraced(html, 'async function fetchScorersCached('),
    ].join('\n');
    return new Function(src + '\nreturn {fetchScorersCached,scorersCache,SCORERS_CACHE_TTL_MS};')();
  }

  it('TTL = 15 минути (900000ms) - съгласно одобреното изискване', () => {
    const { SCORERS_CACHE_TTL_MS } = buildHelper();
    expect(SCORERS_CACHE_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('първо извикване за нов ключ вика fetcher-а и кешира резултата', async () => {
    const { fetchScorersCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [{ id: 1 }] }; };
    const r = await fetchScorersCached('k1', fetcher);
    expect(r).toEqual({ response: [{ id: 1 }] });
    expect(calls).toBe(1);
  });

  it('повторно извикване СЪС СЪЩИЯ ключ в рамките на TTL (15 мин) НЕ вика fetcher-а пак (cache hit)', async () => {
    const { fetchScorersCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [{ id: 1 }] }; };
    await fetchScorersCached('k1', fetcher);
    const r2 = await fetchScorersCached('k1', fetcher);
    expect(calls).toBe(1);
    expect(r2).toEqual({ response: [{ id: 1 }] });
  });

  it('различен ключ (различна лига/сезон/доставчик) НЕ споделя кеша - без смесване на данни', async () => {
    const { fetchScorersCached } = buildHelper();
    const calls = [];
    const fetcher = (tag) => async () => { calls.push(tag); return [tag]; };
    const r1 = await fetchScorersCached('as_topscorers_172_2026', fetcher('efbet-2026'));
    const r2 = await fetchScorersCached('as_topscorers_172_2025', fetcher('efbet-2025'));
    const r3 = await fetchScorersCached('as_topscorers_203_2026', fetcher('superlig-2026'));
    expect(calls).toEqual(['efbet-2026', 'efbet-2025', 'superlig-2026']);
    expect(r1).toEqual(['efbet-2026']);
    expect(r2).toEqual(['efbet-2025']);
    expect(r3).toEqual(['superlig-2026']);
  });

  it('легитимно празен резултат (0 голмайстори) СЕ кешира нормално (валиден резултат, не грешка)', async () => {
    const { fetchScorersCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [] }; };
    const r1 = await fetchScorersCached('k1', fetcher);
    const r2 = await fetchScorersCached('k1', fetcher);
    expect(r1).toEqual({ response: [] });
    expect(r2).toEqual({ response: [] });
    expect(calls).toBe(1); // празният резултат е кеширан - вторият път няма нова заявка
  });

  it('грешка (fetcher хвърля - напр. rate limit/невалиден отговор) НЕ се кешира - следващото извикване опитва отново', async () => {
    const { fetchScorersCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; if (calls === 1) throw new Error('rate limit'); return { response: [{ ok: true }] }; };
    await expect(fetchScorersCached('k1', fetcher)).rejects.toThrow('rate limit');
    const r2 = await fetchScorersCached('k1', fetcher);
    expect(calls).toBe(2); // втория опит Е нова заявка - грешката не е оставила кеш запис
    expect(r2).toEqual({ response: [{ ok: true }] });
  });

  it('inflight dedup - две ЕДНОВРЕМЕННИ извиквания със същия ключ споделят ЕДИН fetcher промис', async () => {
    const { fetchScorersCached } = buildHelper();
    let calls = 0;
    let resolveFetcher;
    const fetcher = () => { calls++; return new Promise(res => { resolveFetcher = res; }); };
    const p1 = fetchScorersCached('k1', fetcher);
    const p2 = fetchScorersCached('k1', fetcher); // стартирана ПРЕДИ p1 да приключи
    resolveFetcher({ response: [{ shared: true }] });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1); // само ЕДИН реален fetcher извикан, въпреки 2 паралелни извиквания
    expect(r1).toEqual({ response: [{ shared: true }] });
    expect(r2).toEqual({ response: [{ shared: true }] });
  });

  it('изтекъл TTL (15 мин, симулиран с фалшив часовник) води до нова заявка', async () => {
    vi.useFakeTimers();
    try {
      const { fetchScorersCached } = buildHelper();
      let calls = 0;
      const fetcher = async () => { calls++; return [calls]; };
      const r1 = await fetchScorersCached('k1', fetcher);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1); // 15 мин + 1мс -> изтекъл кеш
      const r2 = await fetchScorersCached('k1', fetcher);
      expect(calls).toBe(2);
      expect(r1).toEqual([1]);
      expect(r2).toEqual([2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('точно на границата на TTL (15 мин - 1мс) - кешът е ОЩЕ свеж, без нова заявка', async () => {
    vi.useFakeTimers();
    try {
      const { fetchScorersCached } = buildHelper();
      let calls = 0;
      const fetcher = async () => { calls++; return [calls]; };
      await fetchScorersCached('k1', fetcher);
      vi.advanceTimersByTime(15 * 60 * 1000 - 1);
      const r2 = await fetchScorersCached('k1', fetcher);
      expect(calls).toBe(1);
      expect(r2).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- 2. Wiring тестове - loadScorers()/apiSportsScorersBlockHtml() с РЕАЛНИЯ fetchScorersCached (не мок) ---
describe('loadScorers() wiring - TTL кеш през СЪЩИЯ реален fetchScorersCached (не мок)', () => {
  const TEST_COMPS = [
    { id: 2000, name: 'World Cup 2026', flag: '🏆' },
    { id: 2021, name: 'Premier League', flag: '🏴' },
    { id: 2018, name: 'Europa League', flag: '🟠' },
    { id: 2016, name: 'България', flag: '🇧🇬' },
  ];

  function buildLoadScorers({ apiFetch, apiFetchAS, getWCAliveTeamIds, buildScorersFromMatches }) {
    const combinedSrc = [
      extractStatement(html, 'const SCORERS_CACHE_TTL_MS='),
      extractStatement(html, 'const scorersCache='),
      extractStatement(html, 'const scorersInflight='),
      extractBraced(html, 'function apiErrorMessage('),
      extractBraced(html, 'async function fetchScorersCached('),
      extractBraced(html, 'async function apiSportsScorersBlockHtml('),
      extractBraced(html, 'async function loadScorers('),
    ].join('\n');
    const fn = new Function(
      'document', 'beginAsForeground', 'endAsForeground', 'apiFetch', 'apiFetchAS',
      'getWCAliveTeamIds', 'buildScorersFromMatches', 'currentSeasonYear', 'getFlag', 'COMPS',
      combinedSrc + '\nreturn {loadScorers,scorersCache};'
    );
    const contentEl = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => id === 'scorers-content' ? contentEl : { innerHTML: '' } };
    const { loadScorers, scorersCache } = fn(
      fakeDoc, () => {}, () => {}, apiFetch, apiFetchAS,
      getWCAliveTeamIds || (async () => null),
      buildScorersFromMatches || (() => []),
      () => 2026, (name) => '🏳️', TEST_COMPS
    );
    return { loadScorers, scorersCache, getHtml: () => contentEl.innerHTML };
  }

  function emptyFd() { return Promise.resolve({ matches: [], scorers: [] }); }
  function emptyAS() { return Promise.resolve({ response: [] }); }

  it('първо зареждане - прави реална заявка за всеки endpoint (fd.org WC/COMPS + 4x AS)', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    expect(fdCalls).toBeGreaterThan(0);
    expect(asCalls).toBeGreaterThan(0);
  });

  it('повторно отваряне на таба (второ loadScorers()) в рамките на 15 мин - НУЛА нови мрежови заявки', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    const fdAfterFirst = fdCalls, asAfterFirst = asCalls;
    await loadScorers(); // симулира превключване обратно към таб ГОЛМАЙСТОРИ
    expect(fdCalls).toBe(fdAfterFirst); // без нови fd.org заявки
    expect(asCalls).toBe(asAfterFirst); // без нови AS заявки
  });

  it('реалните Efbet Liga играчи (AS league=172) се пазят идентични между двете зареждания - кешът не ги променя/губи', async () => {
    const efbetPlayer = { player: { name: 'Реален Efbet Играч' }, statistics: [{ team: { name: 'Левски София' }, goals: { total: 7, assists: 2 } }] };
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [efbetPlayer] }) : emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const first = getHtml();
    await loadScorers();
    const second = getHtml();
    expect(first).toBe(second);
    expect(second).toContain('Реален Efbet Играч');
    expect(second).toContain('Ефбет Лига');
  });

  it('PR 1 фиксът е запазен - /competitions/2016/scorers НИКОГА не се вика, даже след кеширащата промяна', async () => {
    const fdCalls = [];
    const apiFetch = (p) => { fdCalls.push(p); return emptyFd(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadScorers();
    await loadScorers();
    expect(fdCalls.some(p => p.includes('/competitions/2016/'))).toBe(false);
  });

  it('обновяване след изтичане на 15-мин TTL - следващото отваряне на таба ПРАВИ нова заявка', async () => {
    vi.useFakeTimers();
    try {
      let asCalls = 0;
      const apiFetchAS = (p) => { if (p.includes('league=172')) asCalls++; return emptyAS(); };
      const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
      await loadScorers();
      const after1 = asCalls;
      await loadScorers();
      expect(asCalls).toBe(after1); // в рамките на TTL - без нова заявка
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);
      await loadScorers();
      expect(asCalls).toBeGreaterThan(after1); // TTL изтекъл - нова заявка
    } finally {
      vi.useRealTimers();
    }
  });

  it('едновременни/презастъпващи извиквания на loadScorers() - inflight dedup, без дублирани заявки за една и съща лига/сезон', async () => {
    let efbetCalls = 0;
    const resolvers = [];
    const efbetPlayer = { player: { name: 'Efbet Player' }, statistics: [{ team: { name: 'Левски' }, goals: { total: 5, assists: 1 } }] };
    const apiFetchAS = (p) => {
      // Само ТЕКУЩИЯ сезон (2026) умишлено виси, за да проверим dedup-а на тая
      // конкретна заявка - връщаме реален играч (не празен масив), за да НЕ се
      // тригерира fallback към предишния сезон (season=2025), който иначе би
      // добавил трети, непредвиден pending промис след еднократния resolve по-долу.
      if (p.includes('league=172') && p.includes('season=2026')) {
        efbetCalls++;
        return new Promise(res => resolvers.push(() => res({ response: [efbetPlayer] })));
      }
      return emptyAS();
    };
    const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    const p1 = loadScorers();
    const p2 = loadScorers(); // "бързо превключване" - стартирано преди първото да приключи
    // Двете извиквания минават през WC2026 блока + fd.org COMPS цикъла (няколко
    // await стъпки, резолвирани веднага от mock-натия apiFetch), преди да стигнат
    // до AS league=172 заявката - изчакваме един macrotask tick, за да се
    // изчерпят ВСИЧКИ висящи microtask-и от тях, преди да подадем резолвер.
    await new Promise(r => setTimeout(r, 0));
    resolvers.forEach(r => r());
    await Promise.all([p1, p2]);
    expect(efbetCalls).toBe(1); // само ЕДНА реална заявка за league=172, въпреки двете паралелни зареждания
  });

  it('API грешка за league=172 НЕ се кешира - следващото зареждане опитва отново мрежата (не остава "заклещено" на грешка)', async () => {
    let attempt = 0;
    const efbetPlayer = { player: { name: 'Закъснял Efbet Играч' }, statistics: [{ team: { name: 'ЦСКА София' }, goals: { total: 3, assists: 0 } }] };
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) {
        attempt++;
        if (attempt === 1) return Promise.reject(Object.assign(new Error('rate limit'), { isApiError: true }));
        return Promise.resolve({ response: [efbetPlayer] });
      }
      return emptyAS();
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    // PR 5c (виж "Разграничаване на API грешки и празни данни - ГОЛМАЙСТОРИ") -
    // първи опит - грешка - вече показва явен error-box (apiErrorMessage()),
    // не мълчаливо изчезване на секцията.
    expect(getHtml()).toContain('error-box');
    expect(getHtml()).toContain('Ефбет Лига');
    await loadScorers(); // "следващо отваряне на таба" - грешката не е кеширана, затова опитва пак
    expect(attempt).toBe(2);
    expect(getHtml()).toContain('Закъснял Efbet Играч'); // възстановено успешно
    expect(getHtml()).not.toContain('error-box'); // старата грешка не се пази след успешното възстановяване
  });

  it('различни лиги/сезони не се смесват - Ефбет (172) и Сюпер Лиг (203) държат отделни кеш записи едновременно', async () => {
    const efbetPlayer = { player: { name: 'Efbet Player' }, statistics: [{ team: { name: 'Левски' }, goals: { total: 5, assists: 1 } }] };
    const superligPlayer = { player: { name: 'SuperLig Player' }, statistics: [{ team: { name: 'Galatasaray' }, goals: { total: 10, assists: 2 } }] };
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.resolve({ response: [efbetPlayer] });
      if (p.includes('league=203')) return Promise.resolve({ response: [superligPlayer] });
      return emptyAS();
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('Efbet Player');
    expect(out).toContain('SuperLig Player');
    const efbetIdx = out.indexOf('Efbet Player');
    const superligHeaderIdx = out.indexOf('Сюпер Лиг');
    expect(out.slice(0, efbetIdx)).not.toContain('SuperLig Player'); // няма разместване между секциите
    expect(superligHeaderIdx).toBeGreaterThan(efbetIdx);
  });

  it('_t=Date.now() бъстинг параметърът не обезсмисля кеш ключа - идентични повторни заявки с различен _t ПАК удрят кеша', async () => {
    const seenUrls = [];
    const apiFetch = (p) => { if (p.includes('/competitions/2021/scorers')) seenUrls.push(p); return emptyFd(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadScorers();
    await new Promise(r => setTimeout(r, 2));
    await loadScorers(); // _t= ще е различен Date.now(), но кеш ключът (fd_scorers_2021) е стабилен
    expect(seenUrls.length).toBe(1); // само 1 реална fetch заявка, въпреки различните _t= стойности
  });
});
