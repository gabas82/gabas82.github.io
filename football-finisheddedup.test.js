// POINT 1 (repair queue - "Finished duplicate match cards") - тества РЕАЛНАТА
// loadFinished() от football.html (не копие), извлечена с текстова
// екстракция, огледално на football-todayfinishederror.test.js. Проверява
// точно одобрения обхват:
// Fix A - yesterday вече е derivation от Berlin-anchored today (addCalendarDays),
//   не независимо system-local timezone изчисление (getDateMinus).
// Fix B - финален dedup преди render: (1) same-provider id dedup (Set по
//   String(m.id)), (2) cross-provider dedup чрез reuse на СЪЩИТЕ, вече
//   тествани helpers като Predictions candidate-universe pipeline-а
//   (buildCandidateWrapper()/dedupCandidateUniverse()/COMPS_AS_MAP) - НЕ нов
//   matching algorithm. fetchExtraASFixturesByDate()/apiFetch()/apiFetchAS()/
//   asFixtureToMatch() са екстрактвани BYTE-FOR-BYTE, НЕПИПНАТИ.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { addCalendarDays, buildCandidateWrapper, dedupCandidateUniverse } from './football-logic.js';

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

const combinedSrc = [
  extractStatement(html, 'const COMPS_AS_MAP='),
  extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
  extractStatement(html, 'const AS_LEAGUES='),
  extractStatement(html, 'const AS_STATUS_MAP='),
  extractBraced(html, 'function apiErrorMessage('),
  extractBraced(html, 'async function fetchExtraASFixturesByDate('),
  extractBraced(html, 'function asFixtureToMatch('),
  extractBraced(html, 'async function loadFinished('),
].join('\n');

function buildLoadFinished({ apiFetch, apiFetchAS, getTodayImpl }) {
  const fn = new Function(
    'document', 'getToday', 'addCalendarDays', 'buildCandidateWrapper', 'dedupCandidateUniverse',
    'apiFetch', 'apiFetchAS', 'currentSeasonYear',
    'getHistory', 'findMatchingRecord', 'getFlag', 'computeRegularScore', 'durationBadge', 'formatMatchDateTime',
    combinedSrc + '\nreturn loadFinished;'
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'finished-content' ? contentEl : { innerHTML: '' } };
  const loadFinished = fn(
    fakeDoc, getTodayImpl || (() => '2026-10-11'), addCalendarDays, buildCandidateWrapper, dedupCandidateUniverse,
    apiFetch, apiFetchAS, () => 2026,
    () => [], () => null, () => '🏳️', () => null, () => '', (d) => d
  );
  return { loadFinished, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }
function fdMatch(id, { compId = 2021, home = 'Отбор А', away = 'Отбор Б', utcDate = '2026-10-11T18:00:00Z' } = {}) {
  return {
    id, status: 'FINISHED', competition: { id: compId },
    utcDate,
    homeTeam: { id: 1, name: home }, awayTeam: { id: 2, name: away },
    score: { halfTime: { home: 0, away: 0 }, fullTime: { home: 1, away: 0 } }
  };
}
function asFixture(leagueId, fixtureId, { home = 'AS Отбор А', away = 'AS Отбор Б', date = '2026-10-11T18:00:00Z', status = 'FT' } = {}) {
  return {
    fixture: { id: fixtureId, date, status: { short: status } },
    league: { id: leagueId, name: 'AS League' },
    teams: { home: { id: 10, name: home }, away: { id: 11, name: away } },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 0 } }
  };
}
function cardCount(html) { return (html.match(/match-card finished/g) || []).length; }

describe('loadFinished() - POINT 1 Fix A: Berlin-anchored yesterday (addCalendarDays)', () => {
  it('(1) yesterday се извежда от today чрез addCalendarDays(today,-1), не от независимо timezone изчисление', async () => {
    const fdCalls = [];
    const apiFetch = (p) => { fdCalls.push(p); return emptyFd(); };
    const { loadFinished } = buildLoadFinished({ apiFetch, apiFetchAS: () => emptyAS(), getTodayImpl: () => '2026-03-02' });
    await loadFinished();
    const expectedYesterday = addCalendarDays('2026-03-02', -1); // 2026-03-01, независимо изчислено
    expect(fdCalls.some(p => p.includes('date=2026-03-02'))).toBe(true);
    expect(fdCalls.some(p => p.includes('date=' + expectedYesterday))).toBe(true);
  });
});

describe('loadFinished() - POINT 1 Fix B: final dedup преди render', () => {
  it('(2) еднакъв FD match.id в "вчера" и "днес" input-а -> 1 rendered card', async () => {
    const m = fdMatch(777);
    const apiFetch = () => Promise.resolve({ matches: [m] }); // и двете date заявки връщат СЪЩИЯ обект/id
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(1);
    expect((out.match(/Отбор А/g) || []).length).toBe(1);
  });

  it('(3) еднакъв AS fixture.id в extra1/extra2 -> 1 rendered card', async () => {
    const f = asFixture(172, 501);
    const apiFetchAS = () => Promise.resolve({ response: [f] }); // всяка от 2 дати връща СЪЩИЯ fixture
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch: emptyFd, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(1);
    expect((out.match(/AS Отбор А/g) || []).length).toBe(1);
  });

  it('(4) FD + AS representation на ЕДИН реален мач (сдвоени чрез COMPS_AS_MAP, съвпадащи имена/kickoff) -> 1 rendered card, canonical = FD', async () => {
    const fd = fdMatch(42, { compId: 2016, home: 'Левски', away: 'ЦСКА', utcDate: '2026-10-11T18:00:00Z' });
    const as = asFixture(172, 900, { home: 'Левски', away: 'ЦСКА', date: '2026-10-11T18:02:00Z' }); // +2мин, в толеранса
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fd] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(1);
    expect(out).toContain('Левски');
    expect(out).not.toContain('AS Отбор'); // canonical е FD версията, не AS
  });

  it('(5) два реално различни мача -> и двата остават (2 cards)', async () => {
    const fd = fdMatch(1, { home: 'Отбор А', away: 'Отбор Б' });
    const as = asFixture(172, 501, { home: 'Левски', away: 'Ботев Пловдив' });
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fd] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(2);
    expect(out).toContain('Отбор А');
    expect(out).toContain('Левски');
  });

  it('(6) cross-provider uncertainty (сдвоена лига, НО различни имена на отборите) -> НЕ merge-ва, 2 cards', async () => {
    const fd = fdMatch(42, { compId: 2016, home: 'Левски', away: 'ЦСКА' });
    const as = asFixture(172, 900, { home: 'Съвсем Друг Отбор', away: 'Още Един Различен' });
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fd] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(2);
  });

  it('(7) нормален случай без дубликати - бройката реални мачове остава същата (regression)', async () => {
    const fd1 = fdMatch(1, { home: 'Отбор А', away: 'Отбор Б' });
    const fd2 = fdMatch(2, { compId: 2002, home: 'Байерн', away: 'Дортмунд' });
    const as = asFixture(203, 601, { home: 'Галатасарай', away: 'Фенербахче' });
    const apiFetch = (p) => p.includes('date=2026-10-10') ? Promise.resolve({ matches: [fd1] }) : p.includes('date=2026-10-11') ? Promise.resolve({ matches: [fd2] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=203') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    expect(cardCount(getHtml())).toBe(3);
  });

  it('(8) fix-ът НЕ увеличава request count - 2× fd.org + 2×4 AS, точно както преди', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadFinished } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    expect(fdCalls).toBe(2);
    expect(asCalls).toBe(8);
  });

  it('(9) provider fallback остава непроменен - FD fail, AS success -> AS мачовете пак се рендерират с ясно предупреждение', async () => {
    const as = asFixture(172, 501, { home: 'Левски', away: 'Ботев Пловдив' });
    const apiFetch = () => Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(cardCount(out)).toBe(1);
    expect(out).toContain('Левски');
  });

  it('(10) explicit regression - познатия стар COMPS_AS_MAP[2016]=172 mapping НЕ прави false-positive merge при различни реални мачове', async () => {
    // Confirmed (виж PHASE A анализа, football.html:3445-3454): FD comp 2016
    // РЕАЛНО не представлява Efbet Liga - mapping-ът в COMPS_AS_MAP е познато
    // "стар"/неточен за СЪДЪРЖАНИЕТО на голмайсторите, но dedup helper-ът пак
    // го ползва структурно. Тоя тест доказва, че дори при тая позната
    // неточност, различни реални мачове (различни имена, различен kickoff)
    // никога не се collapse-ват само заради споделения compId pairing.
    const fd = fdMatch(42, { compId: 2016, home: 'Отбор от "2016"', away: 'Друг Отбор', utcDate: '2026-10-11T12:00:00Z' });
    const as = asFixture(172, 900, { home: 'Левски', away: 'ЦСКА', date: '2026-10-11T20:00:00Z' }); // далеч извън kickoff толеранса И различни имена
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fd] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [as] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(cardCount(out)).toBe(2);
    expect(out).toContain('Отбор от');
    expect(out).toContain('Левски');
  });
});
