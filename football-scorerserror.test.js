// FOOTBALL DASHBOARD PR 5c (виж "Разграничаване на API грешки и празни данни -
// ГОЛМАЙСТОРИ") - тества РЕАЛНАТА loadScorers()/apiSportsScorersBlockHtml() от
// football.html (не копие), извлечени с текстова екстракция (огледално на
// football-standingserror.test.js/football-cardserror.test.js). Проверява
// точно одобрените изисквания: двата тихи catch блока вече показват ясни
// предупреждения през apiErrorMessage() (PR #40/5e), частичен успех между
// лиги се запазва, rate limit без минута/ден догадка, Efbet Liga (league=172)
// mapping-ът е непипнат, 15-минутния TTL кеш + inflight dedup от PR #37 (5c:
// PR #37 номерацията по-долу е от ОДОБРЕНАТА задача - реално механизмът е
// добавен в PR 2/#37) са запазени.
import { describe, it, expect, vi } from 'vitest';
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

const TEST_COMPS = [
  { id: 2000, name: 'World Cup 2026', flag: '🏆' },
  { id: 2021, name: 'Premier League', flag: '🏴' },
  { id: 2019, name: 'Serie A', flag: '🇮🇹' },
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
  const { loadScorers } = fn(
    fakeDoc, () => {}, () => {}, apiFetch, apiFetchAS,
    getWCAliveTeamIds || (async () => null),
    buildScorersFromMatches || (() => []),
    () => 2026, (name) => '🏳️', TEST_COMPS
  );
  return { loadScorers, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [], scorers: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }
function fdScorer(name, team) { return { player: { name }, team: { shortName: team, name: team } }; }
function asScorer(name, team, goals, assists) {
  return { player: { name }, statistics: [{ team: { name: team }, goals: { total: goals, assists } }] };
}

describe('loadScorers() - PR 5c: разграничаване на API грешки/празни данни за ГОЛМАЙСТОРИ', () => {
  it('успешно зареждане - fd.org и AS лигите се показват нормално, без грешки', async () => {
    const apiFetch = (p) => p.includes('/competitions/2021/scorers') ? Promise.resolve({ scorers: [fdScorer('PL Scorer', 'Arsenal')] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [asScorer('Efbet Player', 'Левски', 5, 1)] }) : emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('PL Scorer');
    expect(out).toContain('Efbet Player');
    expect(out).not.toContain('error-box');
  });

  it('успешен празен резултат - НЕ показва фалшива API грешка, показва "Няма данни"', async () => {
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadScorers();
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Няма данни');
  });

  it('API грешка (fd.org, Premier League) - ясно предупреждение вместо тихо изчезване, другите лиги остават видими', async () => {
    const apiFetch = (p) => {
      if (p.includes('/competitions/2021/scorers')) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      if (p.includes('/competitions/2019/scorers')) return Promise.resolve({ scorers: [fdScorer('Serie A Scorer', 'Juventus')] });
      return emptyFd();
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Premier League');
    expect(out).toContain('HTTP 500');
    expect(out).toContain('Serie A Scorer'); // друга лига остава незасегната (частичен успех)
  });

  it('rate limit (api-sports.io, league=172) - ясно "лимит достигнат" съобщение, без минута/ден догадка', async () => {
    const apiFetchAS = (p) => p.includes('league=172')
      ? Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }))
      : emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    expect(out).toContain('Ефбет Лига');
    expect(out).not.toMatch(/минут|дневен/i);
  });

  it('частичен успех между лиги (AS) - Ефбет Лига (172) се проваля, Сюпер Лиг (203) остава видима, без смесване', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      if (p.includes('league=203')) return Promise.resolve({ response: [asScorer('SuperLig Player', 'Galatasaray', 8, 2)] });
      return emptyAS();
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Ефбет Лига');
    expect(out).toContain('SuperLig Player'); // успешната лига остава, независимо от провала на другата
  });

  it('Efbet Liga - запазен правилния AS league mapping (172), НЕ fd.org competitions/2016', async () => {
    const seenUrls = [];
    const apiFetch = (p) => { seenUrls.push(p); return emptyFd(); };
    const apiFetchAS = (p) => { seenUrls.push(p); return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    expect(seenUrls.some(p => p.includes('league=172'))).toBe(true);
    expect(seenUrls.some(p => p.includes('/competitions/2016'))).toBe(false);
  });

  it('възстановяване след временна грешка - следващо отваряне не остава "заклещено" на грешката', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (!p.includes('league=172')) return emptyAS();
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ response: [asScorer('Възстановен Играч', 'X', 4, 0)] });
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    expect(getHtml()).toContain('error-box');
    await loadScorers();
    expect(attempt).toBe(2);
    expect(getHtml()).toContain('Възстановен Играч');
    expect(getHtml()).not.toContain('error-box');
  });

  it('запазен 15-мин TTL кеш - повторно зареждане в рамките на TTL прави 0 нови заявки за league=172', async () => {
    let calls = 0;
    const apiFetchAS = (p) => { if (p.includes('league=172')) calls++; return Promise.resolve({ response: [asScorer('Играч', 'X', 2, 0)] }); };
    const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const afterFirst = calls;
    await loadScorers();
    expect(calls).toBe(afterFirst);
  });

  it('запазен inflight dedup - едновременни зареждания не дублират заявката за league=172', async () => {
    let calls = 0;
    const resolvers = [];
    const apiFetchAS = (p) => {
      // Връщаме РЕАЛЕН играч (не празен масив), за да не се задейства fallback-ът
      // към предишния сезон (season=2025) - иначе той би добавил ВТОРИ,
      // непредвиден pending промис след еднократния resolve по-долу (виж
      // идентичния урок от football-scorerscache.test.js).
      if (p.includes('league=172') && p.includes('season=2026')) {
        calls++;
        return new Promise((res) => resolvers.push(() => res({ response: [asScorer('Играч', 'X', 1, 0)] })));
      }
      return emptyAS();
    };
    const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    const p1 = loadScorers();
    const p2 = loadScorers();
    await new Promise((r) => setTimeout(r, 0));
    resolvers.forEach((r) => r());
    await Promise.all([p1, p2]);
    expect(calls).toBe(1);
  });

  it('грешка НЕ се кешира като успешен празен резултат - fetchScorersCached() не записва при throw', async () => {
    let attempt = 0;
    const apiFetchAS = (p) => {
      if (!p.includes('league=172')) return emptyAS();
      attempt++;
      return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    await loadScorers();
    expect(attempt).toBe(2); // ВСЯКО зареждане опитва отново - грешката не е "заключила" успешен празен резултат в кеша
    expect(getHtml()).toContain('error-box');
  });

  it('без увеличение на API заявките - точно същия брой заявки както преди (fd.org лигите + AS лигите × fallback сезон при празен резултат)', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    // fd.org: WC2026 matches + WC2026 scorers fallback + Premier League + Serie A = 4
    expect(fdCalls).toBe(4);
    // AS: 4 лиги (Ефбет/Сюпер Лиг/Лига Европа/ЛК) × 2 (текущ сезон + fallback
    // към предишния, защото emptyAS() винаги връща 0 играчи) = 8 - ТОЧНО
    // СЪЩОТО поведение, както преди PR 5c (apiSportsScorersBlockHtml()'s
    // fallback логика е непипната, само catch блокът й се промени).
    expect(asCalls).toBe(8);
  });
});
