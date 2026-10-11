// FOOTBALL DASHBOARD PR 5e (виж "Разграничаване на API грешки и празни данни -
// КЛАСАЦИЯ") - тества РЕАЛНАТА apiErrorMessage()/loadStandings() от
// football.html (не копие), извлечени с текстова екстракция (огледално на
// останалите *.test.js файлове). Проверява точно одобрените изисквания:
// ясно съобщение при API грешка, разграничаване на "лимит достигнат" (без
// минута/ден догадка), запазена функционалност при успех/частичен успех/
// невалиден отговор, и нулеви нови API заявки.
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

// --- 1. Директни тестове на apiErrorMessage() самостойно ---
describe('apiErrorMessage() - директни тестове на реалния helper от football.html', () => {
  function buildHelper() {
    const src = extractBraced(html, 'function apiErrorMessage(');
    return new Function(src + '\nreturn apiErrorMessage;')();
  }

  it('rate limit (apiFetchAS, isRateLimit=true) - ясно "лимит достигнат", без минута/ден догадка', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('Too many requests'), { isRateLimit: true });
    const msg = apiErrorMessage(e, 'Ефбет Лига');
    expect(msg).toContain('⏳');
    expect(msg).toContain('лимит');
    expect(msg).toContain('Ефбет Лига');
    expect(msg).not.toMatch(/минут|дневен|ден[аи]?\b/i); // никаква претенция за минута/ден
  });

  it('rate limit (apiFetch, providerErrorCode===429) - СЪЩОТО ясно "лимит достигнат" съобщение', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('Временно няма връзка с football-data.org. Опитай отново.'), { isApiError: true, providerErrorCode: 429 });
    const msg = apiErrorMessage(e, 'Premier League');
    expect(msg).toContain('⏳');
    expect(msg).toContain('лимит');
  });

  it('API грешка с друг providerErrorCode (не 429) - НЕ се показва като rate limit', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('Временно няма връзка с football-data.org. Опитай отново.'), { isApiError: true, providerErrorCode: 403 });
    const msg = apiErrorMessage(e, 'Premier League');
    expect(msg).not.toContain('⏳');
    expect(msg).toContain('⚠️');
  });

  it('мрежова грешка (isNetworkError) - ясно съобщение за връзка, различно от rate limit', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('Няма връзка с football-data.org. Провери интернет връзката и опитай отново.'), { isNetworkError: true });
    const msg = apiErrorMessage(e, 'Bundesliga');
    expect(msg).toContain('📡');
    expect(msg).not.toContain('⏳');
  });

  it('HTTP грешка (isHttpError) - показва generic ⚠️ с оригиналното съобщение (HTTP код)', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('HTTP 500'), { isHttpError: true });
    const msg = apiErrorMessage(e, 'Serie A');
    expect(msg).toContain('⚠️');
    expect(msg).toContain('HTTP 500');
  });

  it('невалиден отговор (isInvalidResponse) - показва generic ⚠️ с оригиналното съобщение', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('Неочакван отговор от football-data.org.'), { isInvalidResponse: true });
    const msg = apiErrorMessage(e, 'La Liga');
    expect(msg).toContain('⚠️');
    expect(msg).toContain('Неочакван отговор');
  });

  it('без label - съобщението остава смислено (без "undefined"/празен суфикс)', () => {
    const apiErrorMessage = buildHelper();
    const e = Object.assign(new Error('boom'), { isRateLimit: true });
    const msg = apiErrorMessage(e);
    expect(msg).not.toContain('undefined');
    expect(msg).toContain('⏳');
  });
});

// --- 2. Wiring тестове - loadStandings() с РЕАЛНИЯ apiErrorMessage (не мок) ---
describe('loadStandings() wiring - API грешки/лимит/частичен успех през реалния apiErrorMessage', () => {
  const TEST_COMPS = [
    { id: 2021, name: 'Premier League', flag: '🏴' },
    { id: 2016, name: 'България', flag: '🇧🇬' },
    { id: 2019, name: 'Serie A', flag: '🇮🇹' },
  ];
  const TEST_COMPS_AS_MAP = { 2016: 172 };
  const TEST_STANDINGS_IDS = [2021, 2016, 2019];

  function buildLoadStandings({ apiFetch, apiFetchAS }) {
    const combinedSrc = [
      extractBraced(html, 'function apiErrorMessage('),
      extractBraced(html, 'async function loadStandings('),
    ].join('\n');
    const fn = new Function(
      'document', 'apiFetch', 'apiFetchAS', 'currentSeasonYear', 'getFlag', 'COMPS', 'COMPS_AS_MAP', 'STANDINGS_IDS',
      combinedSrc + '\nreturn loadStandings;'
    );
    const contentEl = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => id === 'standings-content' ? contentEl : { innerHTML: '' } };
    const loadStandings = fn(
      fakeDoc, apiFetch, apiFetchAS, () => 2026, (name) => '🏳️', TEST_COMPS, TEST_COMPS_AS_MAP, TEST_STANDINGS_IDS
    );
    return { loadStandings, getHtml: () => contentEl.innerHTML };
  }

  function standingsRow(team, pos) {
    return { position: pos, team: { name: team, shortName: team }, playedGames: 10, won: 5, lost: 2, goalsFor: 15, goalsAgainst: 8, points: 17 };
  }

  it('успешен отговор с данни - показва класацията нормално (запазена функционалност)', async () => {
    const apiFetch = (p) => p.includes('/competitions/2021/standings')
      ? Promise.resolve({ standings: [{ table: [standingsRow('Arsenal', 1)] }] })
      : Promise.resolve({ standings: [] });
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    expect(getHtml()).toContain('Arsenal');
    expect(getHtml()).toContain('Premier League');
  });

  it('успешен отговор с ПРАЗЕН списък (0 реда) - лигата отсъства тихо, НЕ показва грешка', async () => {
    const apiFetch = () => Promise.resolve({ standings: [] });
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Няма данни'); // нито една лига няма данни тук
  });

  it('API грешка (fd.org) за една лига - ясен error-box, НЕ изглежда като "няма данни"', async () => {
    const apiFetch = (p) => p.includes('/competitions/2021/standings')
      ? Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }))
      : Promise.resolve({ standings: [] });
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Premier League');
    expect(out).toContain('HTTP 500');
  });

  it('минутен/дневен rate limit (fd.org, errorCode 429) - ясно "лимит достигнат" съобщение за засегнатата лига', async () => {
    const apiFetch = (p) => p.includes('/competitions/2021/standings')
      ? Promise.reject(Object.assign(new Error('Временно няма връзка с football-data.org. Опитай отново.'), { isApiError: true, providerErrorCode: 429 }))
      : Promise.resolve({ standings: [] });
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('Premier League');
  });

  it('rate limit (api-sports.io, България/172) - ясно "лимит достигнат" съобщение', async () => {
    const apiFetch = () => Promise.resolve({ standings: [] });
    const apiFetchAS = (p) => p.includes('league=172')
      ? Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }))
      : Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('България');
  });

  it('частичен успех при няколко лиги - успешната лига се показва НОРМАЛНО, провалената получава error-box, без да изгубим данните на успешната', async () => {
    const apiFetch = (p) => {
      if (p.includes('/competitions/2021/standings')) return Promise.resolve({ standings: [{ table: [standingsRow('Arsenal', 1)] }] });
      if (p.includes('/competitions/2019/standings')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      return Promise.resolve({ standings: [] });
    };
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).toContain('Arsenal'); // успешната лига остава показана
    expect(out).toContain('Premier League');
    expect(out).toContain('error-box'); // провалената лига получава ясна грешка
    expect(out).toContain('Serie A');
    expect(out).toContain('HTTP 503');
  });

  it('невалиден отговор (HTTP ok, но JSON парсване хвърля) - показва ясна грешка, не "няма данни"', async () => {
    const apiFetch = (p) => p.includes('/competitions/2021/standings')
      ? Promise.reject(Object.assign(new Error('Неочакван отговор от football-data.org.'), { isInvalidResponse: true }))
      : Promise.resolve({ standings: [] });
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Неочакван отговор');
  });

  it('възстановяване след временна грешка - второ зареждане след успешен отговор показва данните нормално, без следа от старата грешка', async () => {
    let attempt = 0;
    const apiFetch = (p) => {
      if (!p.includes('/competitions/2021/standings')) return Promise.resolve({ standings: [] });
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ standings: [{ table: [standingsRow('Arsenal', 1)] }] });
    };
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const { loadStandings, getHtml } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    expect(getHtml()).toContain('error-box');
    await loadStandings(); // ново "отваряне на таба"
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Arsenal');
  });

  it('няма допълнителни API заявки - точно 1 заявка на лига (3 лиги = 1 fd.org + 1 fd.org + 1 AS за България)', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return Promise.resolve({ standings: [] }); };
    const apiFetchAS = () => { asCalls++; return Promise.resolve({ response: [] }); };
    const { loadStandings } = buildLoadStandings({ apiFetch, apiFetchAS });
    await loadStandings();
    expect(fdCalls).toBe(2); // Premier League + Serie A (fd.org)
    expect(asCalls).toBe(1); // България (api-sports.io)
  });
});
