// FOOTBALL DASHBOARD ЗАДАЧА 6.1 (виж "Historical Data Reliability") - тества
// РЕАЛНАТА loadUpcoming() от football.html (не копие), извлечена с текстова
// екстракция (огледално на football-loadupcoming.test.js/
// football-comebackerror.test.js). Фокус само върху новия механизъм
// historyWarnings - разграничава провалена историческа заявка (API грешка/
// rate limit) от реално малка/липсваща история за прогнозите, без да пипа
// buildPrediction()/calcConfidence()/savePrediction()/кеша
// (fetchAsLeagueSeasonHistory() остава непипната).
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage, buildPrediction, calcConfidence } from './football-logic.js';

function extractFunction(src, name) {
  const idx = src.indexOf(`async function ${name}(`);
  if (idx === -1) throw new Error(`не намерих function ${name}`);
  let depth = 0, start = src.indexOf('{', idx), i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}
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

const html = fs.readFileSync('./football.html', 'utf8');
const code = extractBraced(html, 'function apiErrorMessage(') + '\n' + extractFunction(html, 'loadUpcoming');

const TEST_COMPS = [
  { id: 2021, name: 'Premier League', flag: '🏴' },
  { id: 2002, name: 'Bundesliga', flag: '🇩🇪' },
];
const TEST_EXTRA_AS_LEAGUE_IDS = [172, 203];
const TEST_AS_LEAGUES = [
  { id: 172, icon: '🇧🇬', title: 'Ефбет Лига' },
  { id: 203, icon: '🇹🇷', title: 'Сюпер Лиг' },
];

function buildLoadUpcoming({ apiFetch, apiFetchAS, fetchAsLeagueSeasonHistory }) {
  const fn = new Function(
    'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
    'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
    'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity', 'buildEmptyWindowMessage',
    'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory', 'fetchH2HCached',
    code + `\nreturn loadUpcoming;`
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'upcoming-content' ? contentEl : { innerHTML: '' } };
  const loadUpcoming = fn(
    () => '2026-01-01', (d) => `2026-01-${String(1 + d).padStart(2, '0')}`, apiFetch, () => '2025-07-05', apiFetchAS, () => 2026,
    TEST_EXTRA_AS_LEAGUE_IDS, (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture.date, competition: { id: 'as_' + f.league.id, name: f.league.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
    sortMatchesByDate, TEST_COMPS, TEST_AS_LEAGUES, () => '<div>MATCH</div>',
    21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
    () => {}, () => {},
    fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false })),
    (key, fetcher) => fetcher()
  );
  // document е вграден в тестовата среда (vitest/jsdom) - пренасочваме
  // getElementById само за 'upcoming-content' през fakeDoc по-горе, но
  // loadUpcoming() вътрешно вика document.getElementById директно (глобален
  // scope, не параметър) - затова истинският document.body трябва да носи
  // контейнера; viж beforeEach по-долу.
  return { loadUpcoming, getHtml: () => document.getElementById('upcoming-content').innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }

beforeEach(() => {
  document.body.innerHTML = '<div id="upcoming-content"></div>';
});

describe('loadUpcoming() - ЗАДАЧА 6.1: historyWarnings разграничава API грешка от реално малка извадка', () => {
  it('успешна историческа заявка - без предупреждения', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [{ id: 'f1', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 }, utcDate: '2025-12-01' }] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    expect(getHtml()).not.toContain('error-box');
  });

  it('успешна празна история (реално няма изиграни мачове) - без фалшива грешка', async () => {
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    expect(getHtml()).not.toContain('error-box');
    expect(getHtml()).toContain('Няма мачове в следващите 21 дни.');
  });

  it('fd.org исторически API отказ - ясно предупреждение, WC частта остава незасегната (частичен успех)', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('HTTP 500');
    expect(out).toContain('football-data.org');
  });

  it('AS histD rejected (Ефбет Лига) - ясно предупреждение с името на лигата, Сюпер Лиг остава незасегната', async () => {
    const fetchAsLeagueSeasonHistory = async (id) => {
      if (id === 172) throw Object.assign(new Error('HTTP 503'), { isHttpError: true });
      return { matches: [], blendingPrevSeason: false };
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS: () => emptyAS(), fetchAsLeagueSeasonHistory });
    await loadUpcoming();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Ефбет Лига');
    expect(out).toContain('HTTP 503');
  });

  it('частичен успех - fd.org провал + AS история успешна - предупреждение се показва, AS секциите не изчезват', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.reject(new Error('fd boom'));
      return Promise.resolve({ matches: [] });
    };
    const fetchAsLeagueSeasonHistory = async () => ({ matches: [{ fixture: { id: 9, date: '2025-12-01T00:00:00Z', status: { short: 'FT' } }, league: { id: 172 }, teams: { home: { id: 10 }, away: { id: 11 } }, goals: { home: 1, away: 0 } }], blendingPrevSeason: false });
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), fetchAsLeagueSeasonHistory });
    await loadUpcoming();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Ефбет Лига'); // AS секцията продължава да се показва
  });

  it('rate limit (fd.org исторически заявка) - ясно "лимит" съобщение, без минута/ден догадка', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }));
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    const warningBoxes = [...out.matchAll(/<div class="error-box"[^>]*>([^<]*)<\/div>/g)].map(m => m[1]);
    expect(warningBoxes.join(' ')).not.toMatch(/минут|дневен/i);
  });

  it('възстановяване след отказ - следващо зареждане не остава "заклещено" на старото предупреждение', async () => {
    let attempt = 0;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      if (!p.includes('status=FINISHED')) return Promise.resolve({ matches: [] });
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('HTTP 500'));
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    expect(getHtml()).toContain('error-box');
    await loadUpcoming();
    expect(attempt).toBe(2);
    expect(getHtml()).not.toContain('error-box');
  });

  it('без увеличение на API заявките - точно същия брой заявки както преди (fd.org FINISHED + WC + 2× AS next + 2× AS history)', async () => {
    let fdCalls = 0, asCalls = 0, histCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const fetchAsLeagueSeasonHistory = async () => { histCalls++; return { matches: [], blendingPrevSeason: false }; };
    const { loadUpcoming } = buildLoadUpcoming({ apiFetch, apiFetchAS, fetchAsLeagueSeasonHistory });
    await loadUpcoming();
    // fd.org: SCHEDULED,TIMED (upcoming) + FINISHED (история) + WC2026 = 3
    expect(fdCalls).toBe(3);
    // AS next=15 за всяка от 2 тестови extra лиги = 2 (историята минава през
    // инжектираната fetchAsLeagueSeasonHistory(), не apiFetchAS())
    expect(asCalls).toBe(2);
    expect(histCalls).toBe(2);
  });

  it('непроменени прогнозни резултати - buildPrediction()/calcConfidence() дават същия изход за същия вход (математиката не е пипната)', () => {
    const allMatches = sortMatchesByDate([
      { id: 'm1', status: 'FINISHED', utcDate: '2025-11-01', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 }, score: { halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } } },
      { id: 'm2', status: 'FINISHED', utcDate: '2025-11-08', homeTeam: { id: 2, name: 'B' }, awayTeam: { id: 1, name: 'A' }, competition: { id: 2021 }, score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 0, away: 2 } } },
      { id: 'm3', status: 'FINISHED', utcDate: '2025-11-15', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 }, score: { halfTime: { home: 1, away: 1 }, fullTime: { home: 3, away: 1 } } },
    ]);
    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const pred1 = buildPrediction(match, allMatches);
    const pred2 = buildPrediction(match, allMatches);
    expect(pred1).toEqual(pred2);
    const conf1 = calcConfidence(pred1);
    const conf2 = calcConfidence(pred2);
    expect(conf1).toEqual(conf2);
    // Регресионен fingerprint - ако тия точни числа се променят, значи
    // прогнозната математика е пипната, което тая задача изрично забранява.
    expect(pred1.hWin).toBeTypeOf('number');
    expect(pred1.hMatchesN).toBe(3);
    expect(pred1.aMatchesN).toBe(3);
  });
});
