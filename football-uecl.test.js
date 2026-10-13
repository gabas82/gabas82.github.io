// PR C2: Лига на конференциите (api-sports.io league ID 848) в универсалния
// раздел ПРОГНОЗИ. Тества РЕАЛНИТЕ EXTRA_AS_LEAGUE_IDS/AS_LEAGUES/loadUpcoming()
// от football.html (не копия/тестово-дефинирани малки масиви, както другите
// loadUpcoming тестове използват за изолация на МЕХАНИЗМА) - целта тук е
// точно обратното: да докажем, че РЕАЛНАТА конфигурация вече включва 848,
// през СЪЩИЯ, вече съществуващ EXTRA_AS_LEAGUE_IDS механизъm, не нов паралелен.
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

describe('1. Конфигурация - AS_LEAGUES / EXTRA_AS_LEAGUE_IDS / COMPS / COMPS_AS_MAP (реалните константи)', () => {
  // Изпълняваме реалните const декларации в изолиран scope, за да проверим
  // стойностите им директно - без да ги копираме/предполагаме.
  const configSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const COMPS_AS_MAP={'),
    extractStatement(html, 'const AS_LEAGUES=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
  ].join('\n');
  const config = new Function(configSrc + '\nreturn {COMPS,COMPS_AS_MAP,AS_LEAGUES,EXTRA_AS_LEAGUE_IDS};')();

  it('EXTRA_AS_LEAGUE_IDS включва 848 (Лига на конференциите)', () => {
    expect(config.EXTRA_AS_LEAGUE_IDS).toContain(848);
  });
  it('AS_LEAGUES вече имаше запис за 848 (не е нов) - с коректни icon/title', () => {
    const uecl = config.AS_LEAGUES.find(l => l.id === 848);
    expect(uecl).toBeDefined();
    expect(uecl.icon).toBe('🔵');
    expect(uecl.title).toBe('Лига на конференциите');
  });
  it('848 НЕ е добавена и в COMPS/COMPS_AS_MAP - остава изцяло AS-базирана (без дублиране на механизма за fd.org лиги)', () => {
    expect(config.COMPS.some(c => c.id === 848)).toBe(false);
    expect(Object.values(config.COMPS_AS_MAP)).not.toContain(848);
  });
  it('EXTRA_AS_LEAGUE_IDS пази съществуващите 3 лиги непроменени (Ефбет/Сюпер Лиг/БЛ2), само добавя 848', () => {
    expect(config.EXTRA_AS_LEAGUE_IDS).toEqual(expect.arrayContaining([172, 203, 79, 848]));
    expect(config.EXTRA_AS_LEAGUE_IDS).toHaveLength(4);
  });
});

describe('loadUpcoming() wiring - Лига на конференциите през СЪЩИЯ EXTRA_AS_LEAGUE_IDS механизъм', () => {
  const combinedSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const AS_LEAGUES=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
    extractBraced(html, 'async function fetchFdHistoryAndWc('),
    extractBraced(html, 'async function loadUpcoming('),
  ].join('\n');

  function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch, fetchAsLeagueSeasonHistory, beginAsForeground, endAsForeground, fetchH2HCached }) {
    const fn = new Function(
      'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
      'asFixtureToMatch', 'sortMatchesByDate', 'renderMatch',
      'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity',
      'buildEmptyWindowMessage', 'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory', 'fetchH2HCached',
      combinedSrc + `\nreturn loadUpcoming;`
    );
    return fn(
      () => '2026-10-10', (d) => `2026-10-${String(10 + d).padStart(2, '0')}`, apiFetch, () => '2026-04-01', apiFetchAS, () => 2026,
      (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture?.date, competition: { id: 'as_' + f.league?.id, name: f.league?.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
      sortMatchesByDate, renderMatch || (() => '<div>MATCH</div>'),
      21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
      beginAsForeground || (() => {}), endAsForeground || (() => {}),
      fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false })),
      fetchH2HCached || ((key, fetcher) => fetcher())
    );
  }

  function emptyFd() { return Promise.resolve({ matches: [] }); }
  function emptyAS() { return Promise.resolve({ response: [] }); }

  beforeEach(() => { document.body.innerHTML = '<div id="upcoming-content"></div>'; });

  it('2+3. ЛК вече получава comp-header с коректен 🔵 Лига на конференциите, мач рендерира през СЪЩАТА renderMatch()/buildPrediction логика', async () => {
    const ueclFixture = { fixture: { id: 555, date: '2026-10-15T20:00:00Z' }, league: { id: 848, name: 'UEFA Conference League' }, teams: { home: { id: 1, name: 'Team A' }, away: { id: 2, name: 'Team B' } } };
    const apiFetchAS = (p) => {
      if (p.includes('league=848') && p.includes('next=15')) return Promise.resolve({ response: [ueclFixture] });
      return emptyAS();
    };
    let renderedMatch = null;
    const renderMatch = (m) => { if (m.competition?.id === 'as_848') renderedMatch = m; return '<div>UECL-MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS, renderMatch });
    await loadUpcoming();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).toContain('🔵');
    expect(htmlOut).toContain('Лига на конференциите');
    expect(htmlOut).toContain('UECL-MATCH');
    expect(renderedMatch).not.toBeNull();
  });

  it('6. Честно празно състояние - реално нулев, валиден next= отговор за ЛК показва "Няма мачове", не грешка', async () => {
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadUpcoming();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).toContain('Лига на конференциите');
    expect(htmlOut).toContain('Няма мачове в следващите 21 дни');
  });

  it('7. API грешка за ЛК (next= отхвърля) -> error-box за точно тази секция, НЕ "Няма мачове"', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=848') && p.includes('next=15')) return Promise.reject(new Error('rate limit'));
      return emptyAS();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS });
    await loadUpcoming();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).toContain('Лига на конференциите');
    expect(htmlOut).toContain('Няма връзка с API-то за това състезание');
    // секцията на ЛК не бива да показва и "Няма мачове" текста
    const ueclSectionIdx = htmlOut.indexOf('Лига на конференциите');
    const nextHeaderIdx = htmlOut.indexOf('comp-header', ueclSectionIdx + 1);
    const ueclSectionHtml = htmlOut.slice(ueclSectionIdx, nextHeaderIdx === -1 ? undefined : nextHeaderIdx);
    expect(ueclSectionHtml).not.toContain('Няма мачове в следващите 21 дни');
  });

  it('7б. Регресия: СЪЩАТА поправка важи и за вече съществуваща EXTRA_AS_LEAGUE_IDS лига (Ефбет) - не само за новодобавената 848', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=172') && p.includes('next=15')) return Promise.reject(new Error('rate limit'));
      return emptyAS();
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS });
    await loadUpcoming();
    const htmlOut = document.getElementById('upcoming-content').innerHTML;
    expect(htmlOut).toContain('Ефбет Лига');
    expect(htmlOut).toContain('Няма връзка с API-то за това състезание');
  });

  it('8. Брой заявки - 4 EXTRA_AS_LEAGUE_IDS лиги -> точно 4 next= извиквания (без дублиране/нов паралелен механизъм)', async () => {
    const calls = [];
    const apiFetchAS = (p) => { if (p.includes('next=15')) calls.push(p); return emptyAS(); };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: emptyFd, apiFetchAS });
    await loadUpcoming();
    expect(calls).toHaveLength(4);
    expect(calls.some(p => p.includes('league=848'))).toBe(true);
  });
});
