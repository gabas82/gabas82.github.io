// FOOTBALL DASHBOARD PR 5b (виж "Разграничаване на API грешки и празни данни -
// ОБРАТИ") - тества РЕАЛНАТА loadComeback()/renderComebackStats() от
// football.html (не копие), извлечени с текстова екстракция (огледално на
// football-standingserror.test.js/football-cardserror.test.js/
// football-scorerserror.test.js). Проверява точно одобрените изисквания:
// трите предишни тихи catch блока вече добавят ясни apiErrorMessage()
// предупреждения в dataWarnings, частичен успех между fd.org/AS източниците
// се запазва, rate limit е без минута/ден догадка, calcComebackStatsForTeam()/
// buildComebackStats() остават непипнати, без нови API заявки.
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

function buildLoadComeback({ apiFetch, apiFetchAS }) {
  const combinedSrc = [
    extractStatement(html, 'const COMPS=['),
    extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
    extractStatement(html, 'const AS_LEAGUES='),
    extractStatement(html, 'const AS_STATUS_MAP='),
    extractStatement(html, 'let wcKnockoutMatchesCache='),
    extractStatement(html, 'let wcAliveTeamsCache='),
    extractStatement(html, 'let comebackStatsCache='),
    extractBraced(html, 'function apiErrorMessage('),
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
    combinedSrc + '\nreturn {loadComeback, calcComebackStatsForTeam, buildComebackStats};'
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'comeback-content' ? contentEl : { innerHTML: '' } };
  const { loadComeback, calcComebackStatsForTeam, buildComebackStats } = fn(
    fakeDoc, apiFetch, apiFetchAS,
    () => '2026-10-11', () => '2026-07-13', () => 2026, (name) => '🏳️'
  );
  return { loadComeback, calcComebackStatsForTeam, buildComebackStats, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }

function makeComebackMatches(teamId, n, compId = 2021) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 1000 + i, status: 'FINISHED', competition: { id: compId },
      utcDate: `2026-0${(i % 9) + 1}-01`,
      homeTeam: { id: teamId, name: 'Отбор X' }, awayTeam: { id: 999, name: 'Съперник' },
      score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 2, away: 1 } }
    });
  }
  return out;
}

function asFixture(leagueId, teamId, teamName, i) {
  return {
    fixture: { id: 2000 + i, date: `2026-0${(i % 9) + 1}-01`, status: { short: 'FT' } },
    league: { id: leagueId, name: 'AS League' },
    teams: { home: { id: teamId, name: teamName }, away: { id: 9999, name: 'Съперник AS' } },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 0, away: 1 } }
  };
}
function makeAsFixtures(leagueId, teamId, teamName, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(asFixture(leagueId, teamId, teamName, i));
  return out;
}

describe('loadComeback() - PR 5b: разграничаване на API грешки/празни данни за ОБРАТИ', () => {
  it('успешно зареждане - fd.org общите мачове и AS лигите се показват нормално, без грешки', async () => {
    const generalMatches = makeComebackMatches(1, 3, 2021);
    const apiFetch = (p) => p.includes('/matches?dateFrom=') ? Promise.resolve({ matches: generalMatches }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: makeAsFixtures(172, 5, 'Ефбет Отбор', 3) }) : emptyAS();
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback(true);
    const out = getHtml();
    expect(out).toContain('Отбор X');
    expect(out).toContain('Ефбет Отбор');
    expect(out).not.toContain('error-box');
  });

  it('успешен празен резултат - НЕ показва фалшива API грешка, показва "Няма достатъчно данни"', async () => {
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadComeback(true);
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Няма достатъчно данни');
  });

  it('API грешка (fd.org основните първенства) - ясно предупреждение вместо тихо "0 обрати", AS данните остават видими (частичен успех)', async () => {
    const apiFetch = (p) => p.includes('/matches?dateFrom=')
      ? Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }))
      : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: makeAsFixtures(172, 5, 'Ефбет Отбор', 3) }) : emptyAS();
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch, apiFetchAS });
    await loadComeback(true);
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('HTTP 500');
    expect(out).toContain('football-data.org');
    expect(out).toContain('Ефбет Отбор'); // AS лигата остава незасегната
  });

  it('rate limit (AS лига, league=172) - ясно "лимит" съобщение, без минута/ден догадка', async () => {
    const apiFetchAS = (p) => p.includes('league=172')
      ? Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }))
      : emptyAS();
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch: emptyFd, apiFetchAS });
    await loadComeback(true);
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    expect(out).toContain('Ефбет Лига');
    expect(out).not.toMatch(/минут|дневен/i);
  });

  it('частичен успех между AS лигите (Promise.allSettled rejected) - Ефбет Лига (172) се проваля, Сюпер Лиг (203) остава видима', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      if (p.includes('league=203')) return Promise.resolve({ response: makeAsFixtures(203, 7, 'SuperLig Отбор', 3) });
      return emptyAS();
    };
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch: emptyFd, apiFetchAS });
    await loadComeback(true);
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Ефбет Лига');
    expect(out).toContain('HTTP 503');
    expect(out).toContain('SuperLig Отбор'); // успешната лига не се губи заради провала на другата
  });

  it('възстановяване след грешка - следващо forceRefresh зареждане не остава "заклещено" на старото предупреждение', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (!p.includes('league=172')) return emptyAS();
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ response: makeAsFixtures(172, 5, 'Възстановен Отбор', 3) });
    };
    const { loadComeback, getHtml } = buildLoadComeback({ apiFetch: emptyFd, apiFetchAS });
    await loadComeback(true);
    expect(getHtml()).toContain('error-box');
    await loadComeback(true);
    expect(attempt).toBe(2);
    expect(getHtml()).toContain('Възстановен Отбор');
    expect(getHtml()).not.toContain('error-box');
  });

  it('без увеличение на API заявките - same брой заявки (2× fd.org + 4× AS) независимо от грешки', async () => {
    let fdCallsOk = 0, asCallsOk = 0;
    const apiFetchOk = () => { fdCallsOk++; return emptyFd(); };
    const apiFetchASOk = () => { asCallsOk++; return emptyAS(); };
    const { loadComeback: loadOk } = buildLoadComeback({ apiFetch: apiFetchOk, apiFetchAS: apiFetchASOk });
    await loadOk(true);
    expect(fdCallsOk).toBe(2); // общите мачове + WC2026 нокаут
    expect(asCallsOk).toBe(4); // EXTRA_AS_LEAGUE_IDS: 172/203/79/848

    // WC2026 заявката (loadWCKnockoutData()) има собствена (непипната от PR 5b)
    // cache-miss-retry логика - при провал НЕ кешира резултата, затова
    // getWCAliveTeamIds() я опитва повторно - това е СЪЩЕСТВУВАЩО поведение,
    // независимо от PR 5b. Тук проверяваме само, че МОИТЕ нови try/catch
    // блокове (около общите мачове и AS лигите) не добавят НИКАКВА допълнителна
    // заявка - затова оставяме WC заявката успешна и проваляме единствено
    // общите мачове + AS лигите.
    let fdCallsErr = 0, asCallsErr = 0;
    const apiFetchErr = (p) => {
      fdCallsErr++;
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.reject(new Error('fd boom'));
    };
    const apiFetchASErr = () => { asCallsErr++; return Promise.reject(Object.assign(new Error('as boom'), { isRateLimit: true })); };
    const { loadComeback: loadErr } = buildLoadComeback({ apiFetch: apiFetchErr, apiFetchAS: apiFetchASErr });
    await loadErr(true);
    expect(fdCallsErr).toBe(2);
    expect(asCallsErr).toBe(4);
  });

  it('регресия - calcComebackStatsForTeam()/buildComebackStats() остават непипнати (точните изчисления са непроменени)', () => {
    const { calcComebackStatsForTeam, buildComebackStats } = buildLoadComeback({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    const matches = makeComebackMatches(1, 3, 2021);
    const stats = calcComebackStatsForTeam(1, matches);
    expect(stats.matches).toBe(3);
    expect(stats.concedeFirstPct).toBe(100); // всеки мач - 0:1 на почивка
    expect(stats.comebackPct).toBe(100); // всеки завършва 2:1 - обрат
    expect(stats.goalsAvg).toBe(2);

    const byComp = buildComebackStats({ 2021: matches }, null);
    expect(byComp['2021'][0].teamId).toBe(1);
    expect(byComp['2021'][0].comebackPct).toBe(100);
  });
});
