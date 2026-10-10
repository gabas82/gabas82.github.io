// Тества РЕАЛНАТА loadUpcoming() от football.html (не копие), извлечена с
// текстова екстракция (огледално на техниката за loadASLeagueTab/buildBetBuilder
// в другите *.test.js файлове).
//
// F2a (хронологично сортиране на allMatches) + F3a (всички конфигурирани
// състезания остават видими, таван след сортиране, H2H само за видимите
// мачове, честни съобщения при празен прозорец) - всичко тествано срещу
// РЕАЛНИЯ код, не копие.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage } from './football-logic.js';

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

const html = fs.readFileSync('./football.html', 'utf8');
const code = extractFunction(html, 'loadUpcoming');

// Малък, тестов конфигуриран списък (не истинските 11+11 от football.html) -
// достатъчен да тества МЕХАНИЗМА (видимост/таван/сортиране/H2H), без да
// повтаря истинския дълъг списък.
const TEST_COMPS = [
  { id: 2021, name: 'Premier League', flag: '🏴' },
  { id: 2002, name: 'Bundesliga', flag: '🇩🇪' },
];
const TEST_EXTRA_AS_LEAGUE_IDS = [999];
const TEST_AS_LEAGUES = [{ id: 999, icon: '🧪', title: 'Тест Екстра Лига' }];

function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch, windowDays = 21, maxPerComp = 10, beginAsForeground, endAsForeground, fetchAsLeagueSeasonHistory }) {
  const fn = new Function(
    'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
    'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
    'UPCOMING_WINDOW_DAYS', 'UPCOMING_MAX_PER_COMP', 'limitSortedUpcoming', 'hasRecentFinishedActivity', 'buildEmptyWindowMessage',
    'beginAsForeground', 'endAsForeground', 'fetchAsLeagueSeasonHistory',
    code + `\nreturn loadUpcoming;`
  );
  return fn(
    () => '2026-01-01', (d) => `2026-01-${String(1 + d).padStart(2, '0')}`, apiFetch, () => '2025-07-05', apiFetchAS, () => 2026,
    TEST_EXTRA_AS_LEAGUE_IDS, (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED', utcDate: f.fixture.date, competition: { id: 'as_' + f.league.id, name: f.league.name }, homeTeam: f.teams?.home, awayTeam: f.teams?.away }),
    sortMatchesByDate, TEST_COMPS, TEST_AS_LEAGUES, renderMatch || (() => '<div>MATCH</div>'),
    windowDays, maxPerComp, limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage,
    beginAsForeground || (() => {}), endAsForeground || (() => {}),
    fetchAsLeagueSeasonHistory || (async () => ({ matches: [], blendingPrevSeason: false }))
  );
}

function emptyAS() { return Promise.resolve({ response: [] }); }

beforeEach(() => {
  document.body.innerHTML = '<div id="upcoming-content"></div>';
});

describe('loadUpcoming - F2a хронологично сортиране на allMatches', () => {
  it('allMatches, подаден на renderMatch(), е хронологично сортиран дори когато football-data.org върне мачовете в разбъркан ред', async () => {
    const shuffledFinished = [
      { id: 'f3', utcDate: '2026-01-15', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'f1', utcDate: '2026-01-01', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'f2', utcDate: '2026-01-08', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
    ];
    const upcomingFixture = { id: 'u1', utcDate: '2026-01-03', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };

    let capturedAllMatches = null;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: shuffledFinished });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const apiFetchAS = () => emptyAS();
    const renderMatch = (m, showPred, allMatches) => {
      if (showPred) capturedAllMatches = allMatches;
      return '<div>MATCH</div>';
    };

    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch });
    await loadUpcoming();

    expect(capturedAllMatches).not.toBeNull();
    const dates = capturedAllMatches.map(m => m.utcDate);
    expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });
});

describe('loadUpcoming - F3a: всички конфигурирани състезания остават видими', () => {
  it('състезание без мач в прозореца пак получава comp-header + честно съобщение, не изчезва', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] }); // нищо никъде
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    // И двете тестови COMPS състезания + тестовата extra лига трябва да имат свой comp-header.
    expect(html).toContain('Premier League');
    expect(html).toContain('Bundesliga');
    expect(html).toContain('Тест Екстра Лига');
    expect(html).toContain('Няма мачове в следващите 21 дни.');
  });

  it('добавя "Възможна пауза" само когато allMatches показва скорошна завършена активност за това състезание', async () => {
    const recentFinished = { id: 'rf1', utcDate: '2025-12-28', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [recentFinished] }); // "сега" в теста е 2026-01-01
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('Няма мачове в следващите 21 дни. Възможна пауза.');
  });

  it('БЕЗ "Възможна пауза", когато няма скорошна активност (честен базов текст, без твърдение извън прозореца)', async () => {
    const oldFinished = { id: 'of1', utcDate: '2025-01-01', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: [oldFinished] });
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('Няма мачове в следващите 21 дни.');
    expect(html).not.toContain('Възможна пауза');
  });

  it('провалена историческа заявка -> НЕ добавя "Възможна пауза" (не използва липсата на данни като доказателство за обратното), но мачовата секция остава видима', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [] });
      if (p.includes('status=FINISHED')) return Promise.reject(new Error('history fetch boom'));
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('Premier League');
    expect(html).toContain('Няма мачове в следващите 21 дни.');
    expect(html).not.toContain('Възможна пауза');
    expect(html).not.toContain('error-box'); // мълчаливо провалена вътрешна заявка не трябва да спира целия таб (F3b ще добави по-прецизна диагностика)
  });

  it('частичен провал на ЕДНА extra api-sports лига не маркира другите състезания', async () => {
    const plMatch = { id: 'pl1', utcDate: '2026-01-05', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [plMatch] });
      return Promise.resolve({ matches: [] });
    };
    const apiFetchAS = () => Promise.reject(new Error('extra league boom')); // провал за единствената тестова extra лига
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('Premier League'); // PL има мач, рендира се нормално
    expect(html).toContain('Тест Екстра Лига'); // секцията пак присъства
    expect(html).toContain('Няма мачове в следващите 21 дни.'); // но с честно съобщение, не крашва
  });

  it('провалена ОСНОВНА заявка показва грешка, не "няма мачове" (наследено, потвърдено без регресия)', async () => {
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.reject(new Error('primary fetch boom'));
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>' });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('error-box');
    expect(html).not.toContain('Няма мачове в следващите 21 дни.');
  });
});

describe('loadUpcoming - F3a: сортиране ПРЕДИ таван, H2H само за видимите мачове', () => {
  it('тавана пази действително НАЙ-БЛИЗКИТЕ мачове (сортира първо, после отрязва)', async () => {
    // 2 реда, с по 3 мача; maxPerComp=2 -> трябва да останат двата НАЙ-РАННИ, независимо от реда на връщане.
    const matches = [
      { id: 'm3', utcDate: '2026-01-20', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'm1', utcDate: '2026-01-05', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'm2', utcDate: '2026-01-10', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
    ];
    const seenIds = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches });
      return Promise.resolve({ matches: [] });
    };
    const renderMatch = (m) => { seenIds.push(m.id); return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch, maxPerComp: 2 });
    await loadUpcoming();
    expect(seenIds.sort()).toEqual(['m1', 'm2']); // m3 (20-ти) е изрязан, не m1/m2 (най-ранните)
  });

  it('H2H се заявява САМО за видимите (capped) мачове, не за всички изтеглени', async () => {
    const matches = [
      { id: 'm3', utcDate: '2026-01-20', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'm1', utcDate: '2026-01-05', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
      { id: 'm2', utcDate: '2026-01-10', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } },
    ];
    const h2hCalls = [];
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches });
      if (p.includes('teams=1')) { h2hCalls.push(p); return Promise.resolve({ matches: [] }); }
      return Promise.resolve({ matches: [] });
    };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch: () => '<div>MATCH</div>', maxPerComp: 2 });
    await loadUpcoming();
    expect(h2hCalls.length).toBe(2); // само за m1/m2, не и за изрязания m3 (3 мача влизат -> 2 H2H заявки, не 3)
  });
});

describe('loadUpcoming - без промяна в извикваните endpoint-и/брой заявки (регресия)', () => {
  it('основни извиквания непроменени - само преструктуриране на вече получените резултати', async () => {
    const calls = [];
    const apiFetch = (p) => { calls.push(p); return Promise.resolve({ matches: [] }); };
    const apiFetchAS = (p) => { calls.push(p); return Promise.resolve({ response: [] }); };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch: () => '' });
    await loadUpcoming();
    expect(calls.filter(p => p.includes('status=SCHEDULED,TIMED')).length).toBe(1);
    expect(calls.filter(p => p.includes('status=FINISHED')).length).toBe(1);
    expect(calls.filter(p => p.includes('/competitions/2000/matches'))).toHaveLength(1);
  });
});

describe('loadUpcoming - PR B wiring: fetchAsLeagueSeasonHistory() захранва allMatches', () => {
  it('матчовете от fetchAsLeagueSeasonHistory() за extra-AS лигата достигат до allMatches (renderMatch)', async () => {
    const seasonMatch = { fixture: { id: 777, date: '2026-01-05T00:00:00Z' }, league: { id: 999 }, teams: {} };
    const fetchAsLeagueSeasonHistory = async (id) => {
      if (id === 999) return { matches: [seasonMatch], blendingPrevSeason: false };
      return { matches: [], blendingPrevSeason: false };
    };
    let capturedAllMatches = null;
    const upcomingMatch = { id: 1, utcDate: '2026-01-10', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingMatch] });
      return Promise.resolve({ matches: [] });
    };
    const renderMatch = (m, showPred, allMatches) => { if (showPred) capturedAllMatches = allMatches; return '<div>MATCH</div>'; };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS: () => emptyAS(), renderMatch, fetchAsLeagueSeasonHistory });
    await loadUpcoming();
    expect(capturedAllMatches).not.toBeNull();
    expect(capturedAllMatches.some(m => m.id === 'as_777')).toBe(true);
  });
  it('провал на fetchAsLeagueSeasonHistory() за ЕДНА лига не маха upcoming мачовете на тази лига (изолирани Promise.allSettled)', async () => {
    const nextFixture = { fixture: { id: 1, date: '2026-01-05T00:00:00Z' }, league: { id: 999 }, teams: {} };
    const apiFetchAS = (p) => (p.includes('next=15') ? Promise.resolve({ response: [nextFixture] }) : emptyAS());
    const fetchAsLeagueSeasonHistory = async () => { throw new Error('rate limit'); };
    const loadUpcoming = buildLoadUpcoming({ apiFetch: () => Promise.resolve({ matches: [] }), apiFetchAS, renderMatch: () => '<div>MATCH</div>', fetchAsLeagueSeasonHistory });
    await loadUpcoming();
    const html = document.getElementById('upcoming-content').innerHTML;
    expect(html).toContain('MATCH'); // upcoming мачът пак се рендерира, въпреки провалената история
  });
});
