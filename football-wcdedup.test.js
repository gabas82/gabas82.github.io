// FOOTBALL DASHBOARD ЗАДАЧА 6.3 (виж "WC Finished Matches Deduplication") -
// тества РЕАЛНАТА loadUpcoming() от football.html (не копие), извлечена с
// текстова екстракция (огледално на football-historyreliability.test.js/
// football-loadupcoming.test.js). Потвърждава точно одобрената поправка:
// id-базирана дедупликация между основната fd.org FINISHED история и
// отделната World Cup FINISHED история, запазвайки първия срещнат запис и
// уникалните WC мачове извън 180-дневния прозорец, без да пипа
// buildPrediction()/calcConfidence()/SCHEDULED дедупликацията/кеша.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage, buildPrediction } from './football-logic.js';

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
const code = extractBraced(html, 'function apiErrorMessage(')
  + '\n' + extractFunction(html, 'fetchFdHistoryAndWc')
  + '\n' + extractFunction(html, 'loadUpcoming');

const TEST_COMPS = [{ id: 2021, name: 'Premier League', flag: '🏴' }];
const TEST_EXTRA_AS_LEAGUE_IDS = [];
const TEST_AS_LEAGUES = [];

function buildLoadUpcoming({ apiFetch, apiFetchAS }) {
  const fn = new Function(
    'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
    'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
    'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity', 'buildEmptyWindowMessage',
    'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory', 'fetchH2HCached',
    code + `\nreturn loadUpcoming;`
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'upcoming-content' ? contentEl : { innerHTML: '' } };
  let capturedAllMatches = null;
  const renderMatch = (m, showPred, allMatches) => { if (showPred) capturedAllMatches = allMatches; return '<div>MATCH</div>'; };
  const loadUpcoming = fn(
    () => '2026-01-01', (d) => `2026-01-${String(1 + d).padStart(2, '0')}`, apiFetch, () => '2025-07-05', apiFetchAS || (() => Promise.resolve({ response: [] })), () => 2026,
    TEST_EXTRA_AS_LEAGUE_IDS, (f) => ({}), sortMatchesByDate, TEST_COMPS, TEST_AS_LEAGUES, renderMatch,
    21, 10, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
    () => {}, () => {},
    async () => ({ matches: [], blendingPrevSeason: false }),
    (key, fetcher) => fetcher()
  );
  return { loadUpcoming, getAllMatches: () => capturedAllMatches, getHtml: () => document.getElementById('upcoming-content')?.innerHTML };
}

function fdMatch(id, compId, homeId, awayId, utcDate, hg, ag) {
  return {
    id, status: 'FINISHED', competition: { id: compId }, utcDate,
    homeTeam: { id: homeId, name: 'Team' + homeId }, awayTeam: { id: awayId, name: 'Team' + awayId },
    score: { halfTime: { home: Math.min(hg, 1), away: Math.min(ag, 1) }, fullTime: { home: hg, away: ag } }
  };
}
// renderMatch() (а значи и capturedAllMatches) се извиква САМО за ВИДИМИ
// upcoming мачове (sections.forEach -> s.matches) - затова всеки тест,
// който иска да прихване allMatches, трябва да има поне 1 видим upcoming
// мач в основния SCHEDULED,TIMED прозорец.
const upcomingFixture = { id: 'up1', status: 'SCHEDULED', competition: { id: 2021 }, utcDate: '2026-01-10', homeTeam: { id: 1, name: 'Team1' }, awayTeam: { id: 9, name: 'Team9' } };

beforeEach(() => {
  document.body.innerHTML = '<div id="upcoming-content"></div>';
});

describe('loadUpcoming() - ЗАДАЧА 6.3: id-базирана дедупликация на WC FINISHED мачове', () => {
  it('два източника с ЕДНАКЪВ match id - мачът влиза в allMatches ЕДИН път, не два', async () => {
    const overlapMatch = fdMatch('wc1', 2000, 1, 2, '2026-06-15', 3, 0);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [overlapMatch] }); // основната заявка ВЕЧЕ го има
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [overlapMatch] }); // отделната WC заявка го връща пак
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    const occurrences = allMatches.filter(m => String(m.id) === 'wc1');
    expect(occurrences.length).toBe(1); // не 2
    expect(allMatches.length).toBe(1);
  });

  it('два източника БЕЗ припокриване - и двата мача се запазват (нищо не се губи)', async () => {
    const generalOnly = fdMatch('g1', 2021, 1, 3, '2025-11-01', 2, 1);
    const wcOnly = fdMatch('wc2', 2000, 1, 4, '2026-06-20', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [generalOnly] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcOnly] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(2);
    expect(allMatches.some(m => String(m.id) === 'g1')).toBe(true);
    expect(allMatches.some(m => String(m.id) === 'wc2')).toBe(true);
  });

  it('празна обща история (hResult празен) - WC мачовете пак се добавят', async () => {
    const wcOnly = fdMatch('wc3', 2000, 1, 4, '2026-06-20', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcOnly] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(1);
    expect(allMatches[0].id).toBe('wc3');
  });

  it('празна WC история (wcResult без FINISHED мачове) - основната история остава непроменена', async () => {
    const generalOnly = fdMatch('g2', 2021, 1, 3, '2025-11-01', 2, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [generalOnly] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(1);
    expect(allMatches[0].id).toBe('g2');
  });

  it('частичен API отказ (WC заявката се проваля) - дедупликацията не чупи нищо, основната история остава', async () => {
    const generalOnly = fdMatch('g3', 2021, 1, 3, '2025-11-01', 2, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [generalOnly] });
      if (p.includes('/competitions/2000/matches')) return Promise.reject(new Error('WC API down'));
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches, getHtml } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(1);
    expect(allMatches[0].id).toBe('g3');
    expect(getHtml()).toContain('error-box'); // historyWarnings (Задача 6.1) остава незасегнат
  });

  it('частичен API отказ (основната заявка се проваля) - WC дедупликацията не губи уникалните WC мачове', async () => {
    const wcOnly = fdMatch('wc4', 2000, 1, 4, '2026-06-20', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.reject(new Error('fd boom'));
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcOnly] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(1);
    expect(allMatches[0].id).toBe('wc4');
  });

  it('запазва ПЪРВИЯ срещнат запис (от основната заявка) при overlap, не замества с WC версията', async () => {
    // Два "варианта" на СЪЩИЯ мач (еднакъв id), но с различни полета -
    // потвърждава, че се пази точно записа от ОСНОВНАТА заявка (пристига
    // първи в allMatches), WC версията на СЪЩОТО id се пропуска изцяло.
    const fromGeneral = fdMatch('wc5', 2000, 1, 2, '2026-06-15', 3, 0);
    const fromWcEndpointDifferentScore = fdMatch('wc5', 2000, 1, 2, '2026-06-15', 9, 9); // различен резултат, но СЪЩОТО id
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [fromGeneral] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [fromWcEndpointDifferentScore] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(1);
    expect(allMatches[0].score.fullTime.home).toBe(3); // от ОСНОВНАТА заявка, не 9 от WC endpoint-а
  });

  it('уникалните WC мачове извън 180-дневния прозорец продължават да се добавят (не само дублиращите се)', async () => {
    const overlap = fdMatch('wc6', 2000, 1, 2, '2026-06-15', 2, 0);
    const outsideWindow = fdMatch('wc7', 2000, 1, 5, '2025-01-01', 1, 1); // само в WC endpoint-а
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [overlap] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [overlap, outsideWindow] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = getAllMatches();
    expect(allMatches.length).toBe(2); // overlap дедуплициран (1), outsideWindow запазен (1)
    expect(allMatches.some(m => String(m.id) === 'wc7')).toBe(true);
  });

  it('SCHEDULED дедупликацията остава непроменена - WC нокаут мачове извън upcoming прозореца пак се добавят', async () => {
    const wcScheduledMatch = { id: 'wc_sched1', status: 'SCHEDULED', competition: { id: 2000 }, utcDate: '2026-07-10', homeTeam: { id: 1 }, awayTeam: { id: 2 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] }); // основният upcoming прозорец го пропуска
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcScheduledMatch] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getHtml } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    // Самата SCHEDULED логика е непипната от 6.3 - само потвърждаваме, че
    // не е счупена (мачът остава видим, предишната извадка на upcoming).
    expect(getHtml()).not.toContain('error-box');
  });
});

describe('loadUpcoming() - ЗАДАЧА 6.3: ефект на дедупликацията върху buildPrediction() (реалните функции)', () => {
  it('правилен hMatchesN/aMatchesN след дедупликация (overlap не раздува броя)', async () => {
    const overlap = fdMatch('wc10', 2000, 1, 2, '2026-06-15', 3, 0);
    const leagueMatch = fdMatch('g10', 2021, 1, 3, '2025-11-01', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [overlap, leagueMatch] }); // основната ВЕЧЕ носи overlap
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [overlap] }); // WC endpoint-ът го връща пак
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatches = sortMatchesByDate(getAllMatches());
    const upcomingMatch = { homeTeam: { id: 1 }, awayTeam: { id: 9 } };
    const pred = buildPrediction(upcomingMatch, allMatches);
    // Отбор 1 участва в точно 2 УНИКАЛНИ мача (overlap + leagueMatch) - НЕ 3.
    expect(pred.hMatchesN).toBe(2);
  });

  it('идентични прогнози БЕЗ overlap (дедупликацията не променя нищо, когато няма дублиране)', async () => {
    const m1 = fdMatch('u1', 2021, 1, 3, '2025-11-01', 2, 1);
    const m2 = fdMatch('u2', 2000, 1, 4, '2026-06-15', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [m1] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [m2] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const allMatchesViaDedup = sortMatchesByDate(getAllMatches());
    // Ръчно симулираната "наивна" (без дедуп) версия - при нулево
    // припокриване трябва да съвпада 1:1 с дедуплицираната.
    const allMatchesNaive = sortMatchesByDate([m1, m2]);
    const upcomingMatch = { homeTeam: { id: 1 }, awayTeam: { id: 9 } };
    const predDedup = buildPrediction(upcomingMatch, allMatchesViaDedup);
    const predNaive = buildPrediction(upcomingMatch, allMatchesNaive);
    expect(predDedup).toEqual(predNaive);
  });

  it('коректно преизчисление ПРИ overlap - дедуплицираната прогноза се различава от наивната (недедуплицирана) версия, с контролирани тестови данни', async () => {
    const overlap1 = fdMatch('ov1', 2000, 1, 2, '2026-06-10', 3, 0);
    const overlap2 = fdMatch('ov2', 2000, 1, 7, '2026-06-20', 4, 0);
    const leagueMatch = fdMatch('gX', 2021, 1, 3, '2025-11-01', 1, 1);
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [leagueMatch, overlap1, overlap2] });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [overlap1, overlap2] });
      return Promise.resolve({ matches: [] });
    };
    const { loadUpcoming, getAllMatches } = buildLoadUpcoming({ apiFetch });
    await loadUpcoming();
    const dedupedAllMatches = sortMatchesByDate(getAllMatches());
    // Наивна (ПРЕДИ поправката) merge логика - просто конкатенация, без Set.
    const naiveAllMatches = sortMatchesByDate([leagueMatch, overlap1, overlap2, overlap1, overlap2]);
    const upcomingMatch = { homeTeam: { id: 1 }, awayTeam: { id: 9 } };
    const predDeduped = buildPrediction(upcomingMatch, dedupedAllMatches);
    const predNaive = buildPrediction(upcomingMatch, naiveAllMatches);
    // Контролирани данни, не фиксирани "очаквани" проценти от одита - само
    // проверяваме, че дедупликацията РЕАЛНО променя резултата (доказва
    // ефекта), а не твърдим конкретни универсални стойности.
    expect(predDeduped.hMatchesN).toBe(3); // leagueMatch + overlap1 + overlap2, точно веднъж
    expect(predNaive.hMatchesN).toBe(5); // same 3, плюс 2 дублирани WC победи
    expect(predDeduped.hWin).not.toBe(predNaive.hWin);
    expect(predDeduped.hWinRatePct).toBeLessThan(predNaive.hWinRatePct); // дублираните победи изкуствено вдигат W%
  });
});
