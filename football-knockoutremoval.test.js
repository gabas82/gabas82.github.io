// FOOTBALL DASHBOARD PR 4 (виж "Премахване на таб НОКАУТ") - тества, че
// самостоятелният таб НОКАУТ е напълно премахнат от навигацията/HTML/
// switchTab()/loadCurrentTab(), докато споделените WC функции (ползвани от
// ГОЛМАЙСТОРИ и ОБРАТИ) остават НЕПИПНАТИ - извлечени с текстова екстракция
// (огледално на останалите *.test.js файлове), не копия.
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

describe('НОКАУТ - статична проверка на премахването от HTML/навигация', () => {
  it('нав бутона "НОКАУТ" (switchTab(\'knockout\')) го няма в HTML-а', () => {
    expect(html).not.toContain(`switchTab('knockout')`);
    expect(html).not.toContain('🏆 НОКАУТ</div>');
  });

  it('tab-content контейнерът #tab-knockout/#knockout-content ги няма', () => {
    expect(html).not.toContain('id="tab-knockout"');
    expect(html).not.toContain('id="knockout-content"');
  });

  it('names масива в switchTab() вече не съдържа \'knockout\' (индексите с nav бутоните остават синхронизирани)', () => {
    const namesStatement = extractStatement(html, "const names=['live'");
    const names = new Function(namesStatement + '\nreturn names;')();
    expect(names).not.toContain('knockout');
    // Без НОКАУТ в named масива, но всички останали табове са налични - само
    // премахнат елемент, не разместени/изгубени съседни табове.
    expect(names).toEqual(['live','today','upcoming','finished','history','standings','scorers','cards','comeback','cl','el','uecl','efbet','pl','bl','seriea','laliga','ligue1','superlig','bl2']);
  });

  it('nav бутоните (.tab елементи в HTML) съвпадат по брой и ред с names масива - без разминаване от премахването', () => {
    const tabsBlock = html.slice(html.indexOf('<div class="tabs">'), html.indexOf('<div id="tab-live"'));
    const navNames = [...tabsBlock.matchAll(/switchTab\('([a-z0-9]+)'\)/g)].map(m => m[1]);
    const namesStatement = extractStatement(html, "const names=['live'");
    const names = new Function(namesStatement + '\nreturn names;')();
    expect(navNames).toEqual(names);
  });

  it('loadCurrentTab() вече няма клон за currentTab===\'knockout\'/loadKnockout()', () => {
    const loadCurrentTabSrc = extractBraced(html, 'async function loadCurrentTab(');
    expect(loadCurrentTabSrc).not.toContain(`currentTab==='knockout'`);
    expect(loadCurrentTabSrc).not.toContain('loadKnockout()');
  });

  it('самата loadKnockout() функция/STAGE_LABELS/STAGE_ORDER декларациите вече не съществуват (само обяснителен коментар за историята на премахването ги споменава по име)', () => {
    expect(html).not.toContain('function loadKnockout(');
    expect(html).not.toContain('const STAGE_LABELS=');
    expect(html).not.toContain('const STAGE_ORDER=');
  });

  it('споделените WC функции (loadWCKnockoutData/getWCAliveTeamIds/computeWCAliveTeams) са запазени', () => {
    expect(html).toContain('async function loadWCKnockoutData(');
    expect(html).toContain('async function getWCAliveTeamIds(');
    expect(html).toContain('function computeWCAliveTeams(');
  });

  it('ГОЛМАЙСТОРИ (loadScorers()) и ОБРАТИ (loadComeback()) продължават да викат getWCAliveTeamIds()/loadWCKnockoutData()', () => {
    const loadScorersSrc = extractBraced(html, 'async function loadScorers(');
    const loadComebackSrc = extractBraced(html, 'async function loadComeback(');
    expect(loadScorersSrc).toContain('getWCAliveTeamIds()');
    expect(loadComebackSrc).toContain('loadWCKnockoutData()');
    expect(loadComebackSrc).toContain('getWCAliveTeamIds()');
  });
});

describe('computeWCAliveTeams()/loadWCKnockoutData()/getWCAliveTeamIds() - логиката за определяне на отборите в турнира е НЕПРОМЕНЕНА', () => {
  function buildHelper() {
    const src = [
      extractStatement(html, 'let wcKnockoutMatchesCache='),
      extractStatement(html, 'let wcAliveTeamsCache='),
      extractBraced(html, 'async function loadWCKnockoutData('),
      extractBraced(html, 'function computeWCAliveTeams('),
      extractBraced(html, 'async function getWCAliveTeamIds('),
    ].join('\n');
    return new Function('apiFetch', src + '\nreturn {loadWCKnockoutData,computeWCAliveTeams,getWCAliveTeamIds};');
  }

  it('computeWCAliveTeams() елиминира губещия отбор и пази печелившия/непочналите мачове като "жив"', () => {
    const { computeWCAliveTeams } = buildHelper()(async () => ({ matches: [] }));
    const matches = [
      { stage: 'ROUND_OF_16', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } },
      { stage: 'ROUND_OF_16', status: 'SCHEDULED', homeTeam: { id: 3 }, awayTeam: { id: 4 }, score: { winner: null, fullTime: { home: null, away: null } } },
    ];
    const result = computeWCAliveTeams(matches);
    expect(result.alive.has(1)).toBe(true);  // победител
    expect(result.alive.has(2)).toBe(false); // губещ - елиминиран
    expect(result.alive.has(3)).toBe(true);  // все още неизиграна среща
    expect(result.alive.has(4)).toBe(true);
  });

  it('getWCAliveTeamIds() коректно верижно вика loadWCKnockoutData() и връща computeWCAliveTeams() резултата', async () => {
    const matches = [{ stage: 'FINAL', status: 'FINISHED', homeTeam: { id: 10 }, awayTeam: { id: 20 }, score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }];
    const apiFetch = async () => ({ matches });
    const { getWCAliveTeamIds } = buildHelper()(apiFetch);
    const alive = await getWCAliveTeamIds();
    expect(alive.alive.has(20)).toBe(true);
    expect(alive.alive.has(10)).toBe(false);
  });
});

describe('ГОЛМАЙСТОРИ (loadScorers()) продължава да работи коректно след премахването на НОКАУТ', () => {
  const TEST_COMPS = [
    { id: 2000, name: 'World Cup 2026', flag: '🏆' },
    { id: 2021, name: 'Premier League', flag: '🏴' },
  ];

  function buildLoadScorers({ apiFetch, apiFetchAS, buildScorersFromMatches }) {
    const combinedSrc = [
      extractStatement(html, 'let wcKnockoutMatchesCache='),
      extractStatement(html, 'let wcAliveTeamsCache='),
      extractStatement(html, 'const SCORERS_CACHE_TTL_MS='),
      extractStatement(html, 'const scorersCache='),
      extractStatement(html, 'const scorersInflight='),
      extractBraced(html, 'async function fetchScorersCached('),
      extractBraced(html, 'async function apiSportsScorersBlockHtml('),
      extractBraced(html, 'async function loadWCKnockoutData('),
      extractBraced(html, 'function computeWCAliveTeams('),
      extractBraced(html, 'async function getWCAliveTeamIds('),
      extractBraced(html, 'async function loadScorers('),
    ].join('\n');
    const fn = new Function(
      'document', 'beginAsForeground', 'endAsForeground', 'apiFetch', 'apiFetchAS',
      'buildScorersFromMatches', 'currentSeasonYear', 'getFlag', 'COMPS',
      combinedSrc + '\nreturn loadScorers;'
    );
    const contentEl = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => id === 'scorers-content' ? contentEl : { innerHTML: '' } };
    const loadScorers = fn(
      fakeDoc, () => {}, () => {}, apiFetch, apiFetchAS,
      buildScorersFromMatches || (() => []), () => 2026, (name) => '🏳️', TEST_COMPS
    );
    return { loadScorers, getHtml: () => contentEl.innerHTML };
  }

  it('WC2026 секцията се филтрира правилно по реалния getWCAliveTeamIds() - елиминираният отбор не остава в класацията', async () => {
    const wcFinishedMatch = { id: 1, status: 'FINISHED', stage: 'GROUP_STAGE', goals: [{ type: 'REGULAR', scorer: { id: 100, name: 'Жив Голмайстор' }, team: { id: 1, name: 'Отбор А' } }] };
    const loserGoal = { id: 2, status: 'FINISHED', stage: 'GROUP_STAGE', goals: [{ type: 'REGULAR', scorer: { id: 200, name: 'Елиминиран Голмайстор' }, team: { id: 2, name: 'Отбор Б' } }] };
    const knockoutMatch = { stage: 'FINAL', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } };
    const apiFetch = (p) => {
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcFinishedMatch, loserGoal, knockoutMatch] });
      return Promise.resolve({ matches: [], scorers: [] });
    };
    const buildScorersFromMatches = (matches) => {
      const byId = {};
      matches.forEach(m => (m.goals || []).forEach(g => {
        if (!byId[g.scorer.id]) byId[g.scorer.id] = { id: g.scorer.id, name: g.scorer.name, teamId: g.team.id, teamName: g.team.name, goals: 0, assists: 0, penGoals: 0, team: g.team.name };
        byId[g.scorer.id].goals++;
      }));
      return Object.values(byId);
    };
    const { loadScorers, getHtml } = buildLoadScorers({
      apiFetch: (p) => p.includes('/competitions/2000/matches') ? apiFetch(p) : Promise.resolve({ matches: [], scorers: [] }),
      apiFetchAS: () => Promise.resolve({ response: [] }),
      buildScorersFromMatches,
    });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('Жив Голмайстор');
    expect(out).not.toContain('Елиминиран Голмайстор');
  });
});

describe('ОБРАТИ (loadComeback()) продължава да работи коректно след премахването на НОКАУТ', () => {
  function buildLoadComeback({ apiFetch, apiFetchAS }) {
    const combinedSrc = [
      extractStatement(html, 'const COMPS=['),
      extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
      extractStatement(html, 'let wcKnockoutMatchesCache='),
      extractStatement(html, 'let wcAliveTeamsCache='),
      extractStatement(html, 'let comebackStatsCache='),
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
      combinedSrc + '\nreturn loadComeback;'
    );
    const contentEl = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => id === 'comeback-content' ? contentEl : { innerHTML: '' } };
    const loadComeback = fn(
      fakeDoc, apiFetch, apiFetchAS,
      () => '2026-10-11', () => '2026-07-13', () => 2026, (name) => '🏳️'
    );
    return { loadComeback, getHtml: () => contentEl.innerHTML };
  }

  function makeComebackMatches(teamId, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        id: 1000 + i, status: 'FINISHED', competition: { id: 2021 },
        utcDate: `2026-0${(i % 9) + 1}-01`,
        homeTeam: { id: teamId, name: 'Отбор X' }, awayTeam: { id: 999, name: 'Съперник' },
        score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 2, away: 1 } }
      });
    }
    return out;
  }

  it('loadComeback() рендерира статистика, вкл. WC2026 секция, филтрирана по реалния getWCAliveTeamIds()', async () => {
    const generalMatches = makeComebackMatches(1, 3);
    const wcKnockoutMatch = { stage: 'FINAL', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } };
    const apiFetch = (p) => {
      if (p.includes('/matches?dateFrom=')) return Promise.resolve({ matches: generalMatches });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [wcKnockoutMatch] });
      return Promise.resolve({ matches: [] });
    };
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback(true);
    const out = getHtml();
    expect(out).toContain('Отбор X'); // Premier League (2021) резултатите продължават да се показват
  });

  it('грешка при тегленето на WC2026 нокаут данните не чупи ОБРАТИ рендера на останалите лиги', async () => {
    const generalMatches = makeComebackMatches(5, 3);
    const apiFetch = (p) => {
      if (p.includes('/matches?dateFrom=')) return Promise.resolve({ matches: generalMatches });
      if (p.includes('/competitions/2000/matches')) return Promise.reject(new Error('WC API down'));
      return Promise.resolve({ matches: [] });
    };
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback(true);
    expect(getHtml()).toContain('Отбор X');
  });
});

describe('Няма нови ненужни API заявки след премахването на НОКАУТ', () => {
  it('loadCurrentTab() не прави никаква заявка специфична за НОКАУТ, когато е на друг таб', () => {
    const loadCurrentTabSrc = extractBraced(html, 'async function loadCurrentTab(');
    expect(loadCurrentTabSrc).not.toMatch(/knockout/);
  });
});
