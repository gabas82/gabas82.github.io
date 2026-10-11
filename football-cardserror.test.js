// FOOTBALL DASHBOARD PR 5d (виж "Разграничаване на API грешки и празни данни -
// КАРТОНИ") - тества РЕАЛНАТА loadCards() от football.html (не копие),
// извлечена с текстова екстракция (огледално на останалите *.test.js
// файлове). Проверява точно одобрените изисквания: жълтите/червените
// картони се обработват НЕЗАВИСИМО (Promise.allSettled, не Promise.all) -
// успешна страна остава видима дори другата да се провали, apiErrorMessage()
// (PR #40/5e) дава ясно съобщение само за провалената страна, rate limit
// разпознат без минута/ден догадка, TTL кеша и inflight dedup от PR #38
// остават непипнати.
//
// ВАЖНО: loadCards() ВИНАГИ добавя tr_superlig (league=203) към CARD_COMPS/
// CARD_AS_MAP отгоре на подадения COMPS/COMPS_AS_MAP (виж football.html) -
// затова всеки mock по-долу филтрира изрично по 'league=39' (Premier League),
// а league=203 пада на emptyAS() по подразбиране - иначе двете лиги биха си
// пречили в броячите/резолверите.
import { describe, it, expect } from 'vitest';
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

const TEST_COMPS = [{ id: 2021, name: 'Premier League', flag: '🏴' }];
const TEST_COMPS_AS_MAP = { 2021: 39 };

function buildLoadCards({ apiFetchAS }) {
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
  const { loadCards, cardsCache } = fn(
    fakeDoc, () => {}, () => {}, apiFetchAS,
    () => 2026, (name) => '🏳️', TEST_COMPS, TEST_COMPS_AS_MAP
  );
  return { loadCards, cardsCache, getYellowHtml: () => yellowEl.innerHTML, getRedHtml: () => redEl.innerHTML };
}

function emptyAS() { return Promise.resolve({ response: [] }); }
function cardPlayer(name, yellow, red) {
  return { player: { name }, statistics: [{ team: { name: 'X' }, cards: { yellow, red } }] };
}

describe('loadCards() - PR 5d: независима обработка на жълти/червени картони (league=39, Premier League)', () => {
  it('двата вида статистика са успешни - показват се нормално, без грешки', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.resolve({ response: [cardPlayer('Жълт Играч', 5, 0)] });
      if (p.includes('league=39') && p.includes('topredcards')) return Promise.resolve({ response: [cardPlayer('Червен Играч', 1, 2)] });
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).toContain('Жълт Играч');
    expect(getYellowHtml()).not.toContain('error-box');
    expect(getRedHtml()).toContain('Червен Играч');
    expect(getRedHtml()).not.toContain('error-box');
  });

  it('само жълтите са успешни - жълтите се показват нормално, червените получават ясна грешка, жълтите НЕ изгубени', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.resolve({ response: [cardPlayer('Жълт Играч', 5, 0)] });
      if (p.includes('league=39') && p.includes('topredcards')) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).toContain('Жълт Играч');
    expect(getYellowHtml()).not.toContain('error-box');
    expect(getRedHtml()).toContain('error-box');
    expect(getRedHtml()).toContain('HTTP 500');
    expect(getRedHtml()).not.toContain('Жълт Играч'); // жълтите данни не "изтичат" в червения панел
  });

  it('само червените са успешни - обратният сценарий: червените се показват, жълтите получават ясна грешка', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      if (p.includes('league=39') && p.includes('topredcards')) return Promise.resolve({ response: [cardPlayer('Червен Играч', 1, 2)] });
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getRedHtml()).toContain('Червен Играч');
    expect(getRedHtml()).not.toContain('error-box');
    expect(getYellowHtml()).toContain('error-box');
    expect(getYellowHtml()).toContain('HTTP 503');
    expect(getYellowHtml()).not.toContain('Червен Играч');
  });

  it('и двете заявки са неуспешни - и двата панела получават собствена ясна грешка', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      if (p.includes('league=39') && p.includes('topredcards')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      return emptyAS();
    };
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).toContain('error-box');
    expect(getYellowHtml()).toContain('HTTP 500');
    expect(getRedHtml()).toContain('error-box');
    expect(getRedHtml()).toContain('HTTP 503');
  });

  it('rate limit (isRateLimit от apiFetchAS) - ясно "лимит достигнат" съобщение, без минута/ден догадка', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) return Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }));
      return emptyAS();
    };
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const out = getYellowHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    expect(out).not.toMatch(/минут|дневен/i);
  });

  it('успешен празен отговор (0 играчи) - НЕ показва фалшива API грешка, показва "няма данни"', async () => {
    const apiFetchAS = () => emptyAS();
    const { loadCards, getYellowHtml, getRedHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).not.toContain('error-box');
    expect(getRedHtml()).not.toContain('error-box');
    expect(getYellowHtml()).toContain('все още няма картонна статистика');
  });

  it('повторно отваряне в рамките на 15-мин TTL - 0 нови заявки за league=39 (кешът от PR #38 е запазен)', async () => {
    let calls = 0;
    const apiFetchAS = (p) => {
      if (p.includes('league=39')) { calls++; return Promise.resolve({ response: [cardPlayer('Играч', 3, 0)] }); }
      return emptyAS();
    };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    await loadCards();
    const afterFirst = calls;
    await loadCards();
    expect(calls).toBe(afterFirst); // точно 0 нови заявки
  });

  it('възстановяване след временна грешка - следващо отваряне не кешира старата грешка, опитва пак', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (!(p.includes('league=39') && p.includes('topyellowcards'))) return emptyAS();
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ response: [cardPlayer('Възстановен Играч', 4, 0)] });
    };
    const { loadCards, getYellowHtml } = buildLoadCards({ apiFetchAS });
    await loadCards();
    expect(getYellowHtml()).toContain('error-box');
    await loadCards(); // грешката не е кеширана (fetchCardsCached() не записва при throw) - опитва пак
    expect(attempt).toBe(2);
    expect(getYellowHtml()).toContain('Възстановен Играч');
    expect(getYellowHtml()).not.toContain('error-box');
  });

  it('inflight dedup (PR #38) остава запазен - едновременни извиквания на loadCards() не дублират заявката за league=39', async () => {
    let yellowCalls = 0;
    const resolvers = [];
    const apiFetchAS = (p) => {
      if (p.includes('league=39') && p.includes('topyellowcards')) {
        yellowCalls++;
        return new Promise((res) => resolvers.push(() => res({ response: [] })));
      }
      return emptyAS();
    };
    const { loadCards } = buildLoadCards({ apiFetchAS });
    const p1 = loadCards();
    const p2 = loadCards();
    await new Promise((r) => setTimeout(r, 0));
    resolvers.forEach((r) => r());
    await Promise.all([p1, p2]);
    expect(yellowCalls).toBe(1);
  });
});
