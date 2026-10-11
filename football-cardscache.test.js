// FOOTBALL DASHBOARD PR 3 (виж "TTL кеширане на КАРТОНИ") - тества РЕАЛНАТА
// fetchCardsCached()/loadCards() от football.html (не копие), извлечени с
// текстова екстракция (огледално на football-scorerscache.test.js от PR 2).
// Проверява точно одобрените изисквания: TTL 15 мин, отделни ключови
// пространства по доставчик+тип статистика(жълти/червени)+лига+сезон,
// inflight dedup, грешка/rate-limit/невалиден отговор никога не се кешира,
// запазен Efbet Liga (league=172) mapping-ът, и непипнат ГОЛМАЙСТОРИ кеша
// (scorersCache) от PR 2.
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

// --- 1. Директни тестове на fetchCardsCached()/cardsCache/cardsInflight самостойно ---
describe('fetchCardsCached() - директни тестове на реалния helper от football.html', () => {
  function buildHelper() {
    const src = [
      extractStatement(html, 'const CARDS_CACHE_TTL_MS='),
      extractStatement(html, 'const cardsCache='),
      extractStatement(html, 'const cardsInflight='),
      extractBraced(html, 'async function fetchCardsCached('),
    ].join('\n');
    return new Function(src + '\nreturn {fetchCardsCached,cardsCache,CARDS_CACHE_TTL_MS};')();
  }

  it('TTL = 15 минути (900000ms) - съгласно одобреното изискване, идентично с PR 2', () => {
    const { CARDS_CACHE_TTL_MS } = buildHelper();
    expect(CARDS_CACHE_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('първо извикване за нов ключ вика fetcher-а и кешира резултата', async () => {
    const { fetchCardsCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [{ id: 1 }] }; };
    const r = await fetchCardsCached('k1', fetcher);
    expect(r).toEqual({ response: [{ id: 1 }] });
    expect(calls).toBe(1);
  });

  it('повторно извикване СЪС СЪЩИЯ ключ в рамките на 15 мин НЕ вика fetcher-а пак (cache hit)', async () => {
    const { fetchCardsCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [{ id: 1 }] }; };
    await fetchCardsCached('k1', fetcher);
    const r2 = await fetchCardsCached('k1', fetcher);
    expect(calls).toBe(1);
    expect(r2).toEqual({ response: [{ id: 1 }] });
  });

  it('различен ключ (различна лига/сезон/тип статистика) НЕ споделя кеша - без смесване', async () => {
    const { fetchCardsCached } = buildHelper();
    const calls = [];
    const fetcher = (tag) => async () => { calls.push(tag); return [tag]; };
    const r1 = await fetchCardsCached('as_yellowcards_172_2026', fetcher('efbet-yellow-2026'));
    const r2 = await fetchCardsCached('as_redcards_172_2026', fetcher('efbet-red-2026'));
    const r3 = await fetchCardsCached('as_yellowcards_172_2025', fetcher('efbet-yellow-2025'));
    const r4 = await fetchCardsCached('as_yellowcards_203_2026', fetcher('superlig-yellow-2026'));
    expect(calls).toEqual(['efbet-yellow-2026', 'efbet-red-2026', 'efbet-yellow-2025', 'superlig-yellow-2026']);
    expect(r1).toEqual(['efbet-yellow-2026']);
    expect(r2).toEqual(['efbet-red-2026']);
    expect(r3).toEqual(['efbet-yellow-2025']);
    expect(r4).toEqual(['superlig-yellow-2026']);
  });

  it('легитимно празен резултат (0 картони) СЕ кешира нормално (валиден резултат, не грешка)', async () => {
    const { fetchCardsCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; return { response: [] }; };
    const r1 = await fetchCardsCached('k1', fetcher);
    const r2 = await fetchCardsCached('k1', fetcher);
    expect(r1).toEqual({ response: [] });
    expect(r2).toEqual({ response: [] });
    expect(calls).toBe(1);
  });

  it('грешка (fetcher хвърля - напр. rate limit/невалиден отговор) НЕ се кешира - следващото извикване опитва отново', async () => {
    const { fetchCardsCached } = buildHelper();
    let calls = 0;
    const fetcher = async () => { calls++; if (calls === 1) throw new Error('rate limit'); return { response: [{ ok: true }] }; };
    await expect(fetchCardsCached('k1', fetcher)).rejects.toThrow('rate limit');
    const r2 = await fetchCardsCached('k1', fetcher);
    expect(calls).toBe(2);
    expect(r2).toEqual({ response: [{ ok: true }] });
  });

  it('inflight dedup - две ЕДНОВРЕМЕННИ извиквания със същия ключ споделят ЕДИН fetcher промис', async () => {
    const { fetchCardsCached } = buildHelper();
    let calls = 0;
    let resolveFetcher;
    const fetcher = () => { calls++; return new Promise(res => { resolveFetcher = res; }); };
    const p1 = fetchCardsCached('k1', fetcher);
    const p2 = fetchCardsCached('k1', fetcher);
    resolveFetcher({ response: [{ shared: true }] });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(r1).toEqual({ response: [{ shared: true }] });
    expect(r2).toEqual({ response: [{ shared: true }] });
  });

  it('изтекъл TTL (15 мин, симулиран с фалшив часовник) води до нова заявка', async () => {
    vi.useFakeTimers();
    try {
      const { fetchCardsCached } = buildHelper();
      let calls = 0;
      const fetcher = async () => { calls++; return [calls]; };
      const r1 = await fetchCardsCached('k1', fetcher);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      const r2 = await fetchCardsCached('k1', fetcher);
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
      const { fetchCardsCached } = buildHelper();
      let calls = 0;
      const fetcher = async () => { calls++; return [calls]; };
      await fetchCardsCached('k1', fetcher);
      vi.advanceTimersByTime(15 * 60 * 1000 - 1);
      const r2 = await fetchCardsCached('k1', fetcher);
      expect(calls).toBe(1);
      expect(r2).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- 2. Wiring тестове - loadCards() с РЕАЛНИЯ fetchCardsCached (не мок) ---
describe('loadCards() wiring - TTL кеш през СЪЩИЯ реален fetchCardsCached (не мок)', () => {
  function buildLoadCards({ apiFetchAS }) {
    // PR 5d (виж "Разграничаване на API грешки и празни данни - КАРТОНИ") -
    // loadCards() вече вика apiErrorMessage() (PR #40/5e) при грешка - трябва
    // да се екстрактне заедно с нея, иначе е undefined в sandbox-а.
    const combinedSrc = [
      extractStatement(html, 'const CARDS_CACHE_TTL_MS='),
      extractStatement(html, 'const cardsCache='),
      extractStatement(html, 'const cardsInflight='),
      extractBraced(html, 'function apiErrorMessage('),
      extractBraced(html, 'async function fetchCardsCached('),
      extractBraced(html, 'async function loadCards('),
    ].join('\n');
    const fn = new Function(
      'document', 'beginAsForeground', 'endAsForeground', 'apiFetchAS',
      'currentSeasonYear', 'getFlag', 'COMPS', 'COMPS_AS_MAP',
      combinedSrc + '\nreturn {loadCards,cardsCache};'
    );
    const yellowEl = { innerHTML: '' };
    const redEl = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => id === 'yellow-content' ? yellowEl : id === 'red-content' ? redEl : { innerHTML: '' } };
    // Съкратен COMPS (3 състезания) + реалния COMPS_AS_MAP от football.html,
    // за да броим точно заявките без WC2026(id:1)/всичките 11 реални лиги -
    // CARD_AS_MAP вътре в loadCards() вече добавя tr_superlig:203 отгоре.
    const TEST_COMPS = [
      { id: 2021, name: 'Premier League', flag: '🏴' },
      { id: 2016, name: 'България', flag: '🇧🇬' },
    ];
    const TEST_COMPS_AS_MAP = { 2021: 39, 2016: 172 };
    const { loadCards, cardsCache } = fn(
      fakeDoc, () => {}, () => {}, apiFetchAS,
      () => 2026, (name) => '🏳️', TEST_COMPS, TEST_COMPS_AS_MAP
    );
    return { loadCards, cardsCache, getYellowHtml: () => yellowEl.innerHTML, getRedHtml: () => redEl.innerHTML };
  }

  function emptyAS() { return Promise.resolve({ response: [] }); }

  it('A. първо отваряне - реална заявка за всяка лига×тип картон (3 лиги [PL,BG,Сюпер Лиг] × 2 = 6 заявки)', async () => {
    let asCalls = 0;
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(asCalls).toBe(6); // PL(2) + България/172(2) + Сюпер Лиг/203(2) - CARD_AS_MAP вътре добавя tr_superlig автоматично
  });

  it('B. повторно отваряне в рамките на 15 мин - 0 нови заявки (пълен cache hit)', async () => {
    let asCalls = 0;
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const afterA = asCalls;
    await loadCards(); // "повторно отваряне на таба" в рамките на TTL
    expect(asCalls).toBe(afterA); // точно 0 нови заявки
  });

  it('C. отваряне след изтичане на 15-мин TTL - пълен брой заявки отново (6)', async () => {
    vi.useFakeTimers();
    try {
      let asCalls = 0;
      const apiFetchAS = () => { asCalls++; return emptyAS(); };
      const { loadCards } = buildLoadCards({ apiFetchAS });
      await loadCards();
      const afterA = asCalls;
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);
      await loadCards();
      expect(asCalls).toBe(afterA + 6); // TTL изтекъл - пълен нов набор от 6 заявки
    } finally {
      vi.useRealTimers();
    }
  });

  it('реалните жълти/червени картони за Efbet Liga (league=172) се пазят идентични между две зареждания', async () => {
    const efbetYellowPlayer = { player: { name: 'Жълт Efbet Играч' }, statistics: [{ team: { name: 'Левски София' }, cards: { yellow: 9, red: 0 } }] };
    const efbetRedPlayer = { player: { name: 'Червен Efbet Играч' }, statistics: [{ team: { name: 'ЦСКА София' }, cards: { yellow: 2, red: 1 } }] };
    const apiFetchAS = (p) => {
      if (p.includes('topyellowcards') && p.includes('league=172')) return Promise.resolve({ response: [efbetYellowPlayer] });
      if (p.includes('topredcards') && p.includes('league=172')) return Promise.resolve({ response: [efbetRedPlayer] });
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const y1 = getYellowHtml(), r1 = getRedHtml();
    await loadCards();
    const y2 = getYellowHtml(), r2 = getRedHtml();
    expect(y1).toBe(y2);
    expect(r1).toBe(r2);
    expect(y2).toContain('Жълт Efbet Играч');
    expect(r2).toContain('Червен Efbet Играч');
  });

  it('запазен правилния mapping за България - league=172 (НЕ fd.org competitions/2016)', async () => {
    const seenUrls = [];
    const apiFetchAS = (p) => { seenUrls.push(p); return emptyAS(); };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(seenUrls.some(p => p.includes('league=172'))).toBe(true);
    expect(seenUrls.some(p => p.includes('/competitions/2016'))).toBe(false);
  });

  it('едновременни/презастъпващи извиквания на loadCards() - inflight dedup, без дублирани заявки за една и съща лига+тип', async () => {
    let plYellowCalls = 0;
    const resolvers = [];
    const apiFetchAS = (p) => {
      if (p.includes('topyellowcards') && p.includes('league=39')) {
        plYellowCalls++;
        return new Promise(res => resolvers.push(() => res({ response: [] })));
      }
      return emptyAS();
    };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    const p1 = loadCards();
    const p2 = loadCards();
    await new Promise(r => setTimeout(r, 0)); // flush-ваме чакащите microtask-и преди league=39 заявката
    resolvers.forEach(r => r());
    await Promise.all([p1, p2]);
    expect(plYellowCalls).toBe(1); // само ЕДНА реална заявка за PL жълти картони, въпреки двете паралелни зареждания
  });

  it('API грешка/rate limit за една лига НЕ се кешира - следващото зареждане опитва отново мрежата', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (p.includes('topyellowcards') && p.includes('league=172')) {
        attempt++;
        if (attempt === 1) return Promise.reject(Object.assign(new Error('rate limit'), { isRateLimit: true }));
        return Promise.resolve({ response: [{ player: { name: 'Закъснял Играч' }, statistics: [{ team: { name: 'X' }, cards: { yellow: 3, red: 0 } }] }] });
      }
      return emptyAS();
    };
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards(); // грешка - показва error-box, не кешира
    expect(getYellowHtml()).toContain('⚠️');
    await loadCards(); // "следващо отваряне" - грешката не е кеширана, опитва отново
    expect(attempt).toBe(2);
    expect(getYellowHtml()).toContain('Закъснял Играч');
  });

  it('невалиден API отговор (response не е масив) НЕ се кешира като успешна статистика', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (p.includes('topyellowcards') && p.includes('league=172')) {
        attempt++;
        if (attempt === 1) return Promise.resolve({ response: {} }); // невалиден отговор (не масив) - .map() хвърля ("is not a function")
        return Promise.resolve({ response: [{ player: { name: 'Валиден Играч' }, statistics: [{ team: { name: 'X' }, cards: { yellow: 4, red: 0 } }] }] });
      }
      return emptyAS();
    };
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards(); // (yData.response||[]).map() хвърля вътре в try - хваща се от loadCards() catch(e)
    await loadCards(); // невалидният отговор НЕ е кеширан - следващото зареждане опитва пак и успява
    expect(attempt).toBe(2);
    expect(getYellowHtml()).toContain('Валиден Играч');
  });

  it('жълти и червени картони не се смесват - различни ключове, различни резултати в рамките на СЪЩОТО зареждане', async () => {
    const yellowPlayer = { player: { name: 'Жълт Играч' }, statistics: [{ team: { name: 'X' }, cards: { yellow: 7, red: 0 } }] };
    const redPlayer = { player: { name: 'Червен Играч' }, statistics: [{ team: { name: 'Y' }, cards: { yellow: 1, red: 2 } }] };
    const apiFetchAS = (p) => {
      if (p.includes('topyellowcards')) return Promise.resolve({ response: [yellowPlayer] });
      if (p.includes('topredcards')) return Promise.resolve({ response: [redPlayer] });
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).toContain('Жълт Играч');
    expect(getYellowHtml()).not.toContain('Червен Играч');
    expect(getRedHtml()).toContain('Червен Играч');
    expect(getRedHtml()).not.toContain('Жълт Играч');
  });

  it('различни лиги не се смесват - PL и България(172) държат отделни кеш записи едновременно', async () => {
    const plPlayer = { player: { name: 'PL Player' }, statistics: [{ team: { name: 'Arsenal' }, cards: { yellow: 5, red: 0 } }] };
    const efbetPlayer = { player: { name: 'Efbet Player' }, statistics: [{ team: { name: 'Левски' }, cards: { yellow: 6, red: 0 } }] };
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.resolve({ response: [plPlayer] });
      if (p.includes('league=172') && p.includes('topyellowcards')) return Promise.resolve({ response: [efbetPlayer] });
      return emptyAS();
    };
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const out = getYellowHtml();
    expect(out).toContain('PL Player');
    expect(out).toContain('Efbet Player');
  });

  it('не представя натрупаните картони като официално наказание - само бройка жълти/червени, без текст за "наказание"/"спиране"', async () => {
    const player = { player: { name: 'Играч' }, statistics: [{ team: { name: 'X' }, cards: { yellow: 4, red: 0 } }] };
    const apiFetchAS = (p) => p.includes('topyellowcards') ? Promise.resolve({ response: [player] }) : emptyAS();
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const out = getYellowHtml();
    expect(out).not.toMatch(/наказ|спир/i);
  });
});
