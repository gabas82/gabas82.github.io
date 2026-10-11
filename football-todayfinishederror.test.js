// FOOTBALL DASHBOARD PR 5a (виж "Разграничаване на API грешки и празни данни -
// ДНЕС + СВЪРШИЛИ") - тества РЕАЛНИТЕ loadToday()/loadFinished()/
// fetchExtraASFixturesByDate() от football.html (не копие), извлечени с
// текстова екстракция (огледално на football-loadupcoming.test.js/
// football-comebackerror.test.js). Проверява точно одобрените изисквания:
// трите предишни тихи catch-а (1× в loadToday(), 2× в loadFinished()) вече
// показват ясни apiErrorMessage() предупреждения, частичен успех между
// fd.org/AS източниците се запазва (Promise.allSettled вместо Promise.all),
// rate limit е без минута/ден догадка, fetchExtraASFixturesByDate() остава
// обратно съвместима (нов `warnings` параметър е опционален), без нови
// заявки, без промяна в prediction/history визуализацията.
import { describe, it, expect, beforeEach } from 'vitest';
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

const SHARED_SRC = [
  extractStatement(html, 'const EXTRA_AS_LEAGUE_IDS='),
  extractStatement(html, 'const AS_LEAGUES='),
  extractStatement(html, 'const AS_STATUS_MAP='),
  extractBraced(html, 'function apiErrorMessage('),
  extractBraced(html, 'async function fetchExtraASFixturesByDate('),
  extractBraced(html, 'function asFixtureToMatch('),
].join('\n');

function buildLoadToday({ apiFetch, apiFetchAS, renderMatch }) {
  const combinedSrc = [SHARED_SRC, extractBraced(html, 'async function loadToday(')].join('\n');
  const fn = new Function(
    'document', 'getToday', 'apiFetch', 'apiFetchAS', 'currentSeasonYear', 'renderMatch',
    combinedSrc + '\nreturn loadToday;'
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'today-content' ? contentEl : { innerHTML: '' } };
  const loadToday = fn(
    fakeDoc, () => '2026-10-11', apiFetch, apiFetchAS, () => 2026,
    renderMatch || ((m) => `<div>MATCH ${m.id}</div>`)
  );
  return { loadToday, getHtml: () => contentEl.innerHTML };
}

function buildLoadFinished({ apiFetch, apiFetchAS }) {
  const combinedSrc = [SHARED_SRC, extractBraced(html, 'async function loadFinished(')].join('\n');
  const fn = new Function(
    'document', 'getDateMinus', 'getToday', 'apiFetch', 'apiFetchAS', 'currentSeasonYear',
    'getHistory', 'findMatchingRecord', 'getFlag', 'computeRegularScore', 'durationBadge', 'formatMatchDateTime',
    combinedSrc + '\nreturn loadFinished;'
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'finished-content' ? contentEl : { innerHTML: '' } };
  const loadFinished = fn(
    fakeDoc, () => '2026-10-10', () => '2026-10-11', apiFetch, apiFetchAS, () => 2026,
    () => [], () => null, () => '🏳️', () => null, () => '', (d) => d
  );
  return { loadFinished, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }
function fdMatch(id, compId = 2021) {
  return {
    id, status: 'FINISHED', competition: { id: compId },
    utcDate: '2026-10-11T18:00:00Z',
    homeTeam: { id: 1, name: 'Отбор А' }, awayTeam: { id: 2, name: 'Отбор Б' },
    score: { halfTime: { home: 0, away: 0 }, fullTime: { home: 1, away: 0 } }
  };
}
function asFixture(leagueId, fixtureId, status = 'FT') {
  return {
    fixture: { id: fixtureId, date: '2026-10-11T18:00:00Z', status: { short: status } },
    league: { id: leagueId, name: 'AS League' },
    teams: { home: { id: 10, name: 'AS Отбор А' }, away: { id: 11, name: 'AS Отбор Б' } },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 0 } }
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('loadToday() - PR 5a: разграничаване на API грешки/празни данни за ДНЕС', () => {
  it('успешно зареждане - fd.org и AS мачовете се показват нормално, без грешки', async () => {
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fdMatch('fd1')] }) : emptyFd();
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [asFixture(172, 501)] }) : emptyAS();
    const { loadToday, getHtml } = buildLoadToday({ apiFetch, apiFetchAS });
    await loadToday();
    const out = getHtml();
    expect(out).toContain('MATCH fd1');
    expect(out).toContain('MATCH as_501');
    expect(out).not.toContain('error-box');
  });

  it('успешен празен ден - НЕ показва фалшива API грешка, показва "Няма мачове днес"', async () => {
    const { loadToday, getHtml } = buildLoadToday({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadToday();
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Няма мачове днес');
  });

  it('API грешка (fd.org) - ясно предупреждение вместо "Няма мачове днес", AS мачовете остават видими (частичен успех)', async () => {
    const apiFetch = () => Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [asFixture(172, 502)] }) : emptyAS();
    const { loadToday, getHtml } = buildLoadToday({ apiFetch, apiFetchAS });
    await loadToday();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('HTTP 500');
    expect(out).toContain('football-data.org');
    expect(out).toContain('MATCH as_502'); // AS страната остава незасегната
  });

  it('rate limit (api-sports.io всичките extra лиги) - ясно "лимит" съобщение, без минута/ден догадка, fd.org мачовете остават видими', async () => {
    const apiFetch = (p) => p.includes('/matches?date=') ? Promise.resolve({ matches: [fdMatch('fd2')] }) : emptyFd();
    const apiFetchAS = () => Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }));
    const { loadToday, getHtml } = buildLoadToday({ apiFetch, apiFetchAS });
    await loadToday();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    expect(out).not.toMatch(/минут|дневен/i);
    expect(out).toContain('MATCH fd2');
  });

  it('частичен успех между AS лигите - Ефбет Лига (172) се проваля, Сюпер Лиг (203) остава видима (fetchExtraASFixturesByDate вътрешен Promise.allSettled)', async () => {
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.reject(Object.assign(new Error('HTTP 503'), { isHttpError: true }));
      if (p.includes('league=203')) return Promise.resolve({ response: [asFixture(203, 503)] });
      return emptyAS();
    };
    const { loadToday, getHtml } = buildLoadToday({ apiFetch: emptyFd, apiFetchAS });
    await loadToday();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('Ефбет Лига');
    expect(out).toContain('MATCH as_503'); // Сюпер Лиг не се губи заради провала на Ефбет Лига
  });

  it('възстановяване след грешка - следващо зареждане не остава "заклещено" на старото предупреждение', async () => {
    let attempt = 0;
    const apiFetch = (p) => {
      if (!p.includes('/matches?date=')) return emptyFd();
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ matches: [fdMatch('fd3')] });
    };
    const { loadToday, getHtml } = buildLoadToday({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadToday();
    expect(getHtml()).toContain('error-box');
    await loadToday();
    expect(attempt).toBe(2);
    expect(getHtml()).toContain('MATCH fd3');
    expect(getHtml()).not.toContain('error-box');
  });

  it('без увеличение на API заявките - точно същия брой заявки както преди (1× fd.org + 4× AS)', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadToday } = buildLoadToday({ apiFetch, apiFetchAS });
    await loadToday();
    expect(fdCalls).toBe(1);
    expect(asCalls).toBe(4);
  });
});

describe('loadFinished() - PR 5a: разграничаване на API грешки/празни данни за СВЪРШИЛИ', () => {
  it('успешно зареждане - вчера+днес fd.org и AS мачовете се показват нормално, без грешки', async () => {
    const apiFetch = (p) => {
      if (p.includes('date=2026-10-10')) return Promise.resolve({ matches: [fdMatch('y1')] });
      if (p.includes('date=2026-10-11')) return Promise.resolve({ matches: [fdMatch('t1')] });
      return emptyFd();
    };
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [asFixture(172, 601)] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(out).toContain('Отбор А');
    expect(out).not.toContain('error-box');
  });

  it('успешен празен резултат - НЕ показва фалшива API грешка, показва "Няма приключили мачове"', async () => {
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch: emptyFd, apiFetchAS: () => emptyAS() });
    await loadFinished();
    const out = getHtml();
    expect(out).not.toContain('error-box');
    expect(out).toContain('Няма приключили мачове');
  });

  it('API грешка само за ЕДИН ден (вчера) - ясно предупреждение, другия ден + AS мачовете остават видими (частичен успех, Promise.allSettled)', async () => {
    const apiFetch = (p) => {
      if (p.includes('date=2026-10-10')) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      if (p.includes('date=2026-10-11')) return Promise.resolve({ matches: [fdMatch('t2')] });
      return emptyFd();
    };
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadFinished();
    const out = getHtml();
    expect(out).toContain('error-box');
    expect(out).toContain('HTTP 500');
    expect(out).toContain('вчерашните мачове');
    expect(out).toContain('Отбор А'); // днешният ден остава видим въпреки провала на вчерашния
  });

  it('преди PR 5a provaлен ден би изтрил ВСИЧКО (regression guard) - сега остава частичен успех', async () => {
    // Директна регресионна проверка на самата бъгфикс: с Promise.all (старото
    // поведение) провал на ЕДИН ден би захвърлил и двата дни + AS резултатите.
    // Тук потвърждаваме, че днешният ден (успешен) НЕ изчезва заради вчера.
    const apiFetch = (p) => {
      if (p.includes('date=2026-10-10')) return Promise.reject(new Error('boom'));
      if (p.includes('date=2026-10-11')) return Promise.resolve({ matches: [fdMatch('today-ok')] });
      return emptyFd();
    };
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadFinished();
    expect(getHtml()).toContain('Отбор А');
  });

  it('rate limit (AS лига) - ясно "лимит" съобщение, без минута/ден догадка, fd.org мачовете остават видими', async () => {
    const apiFetch = (p) => p.includes('date=2026-10-11') ? Promise.resolve({ matches: [fdMatch('t3')] }) : emptyFd();
    const apiFetchAS = () => Promise.reject(Object.assign(new Error('Too many requests'), { isRateLimit: true }));
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    const out = getHtml();
    expect(out).toContain('⏳');
    expect(out).toContain('лимит');
    // Само предупредителните error-box-ове (не цялата страница - "решен след
    // 90-та минута" в ticksHtml-а на завършен мач е НЕСВЪРЗАН текст и
    // легитимно съдържа "минута").
    const warningBoxes = [...out.matchAll(/<div class="error-box"[^>]*>([^<]*)<\/div>/g)].map(m => m[1]);
    expect(warningBoxes.length).toBeGreaterThan(0);
    expect(warningBoxes.join(' ')).not.toMatch(/минут|дневен/i);
    expect(out).toContain('Отбор А');
  });

  it('филтрира AS резултатите по завършен статус (FT/AET/PEN/AWD/WO) - неприключил fixture не се показва', async () => {
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [asFixture(172, 701, 'NS')] }) : emptyAS();
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch: emptyFd, apiFetchAS });
    await loadFinished();
    expect(getHtml()).toContain('Няма приключили мачове');
  });

  it('възстановяване след грешка - следващо зареждане не остава "заклещено" на старото предупреждение', async () => {
    let attempt = 0;
    const apiFetch = (p) => {
      if (!p.includes('date=2026-10-11')) return emptyFd();
      attempt++;
      if (attempt === 1) return Promise.reject(Object.assign(new Error('HTTP 500'), { isHttpError: true }));
      return Promise.resolve({ matches: [fdMatch('recovered')] });
    };
    const { loadFinished, getHtml } = buildLoadFinished({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadFinished();
    expect(getHtml()).toContain('error-box');
    await loadFinished();
    expect(attempt).toBe(2);
    expect(getHtml()).toContain('Отбор А');
    expect(getHtml()).not.toContain('error-box');
  });

  it('без увеличение на API заявките - точно същия брой заявки както преди (2× fd.org + 2×4 AS)', async () => {
    let fdCalls = 0, asCalls = 0;
    const apiFetch = () => { fdCalls++; return emptyFd(); };
    const apiFetchAS = () => { asCalls++; return emptyAS(); };
    const { loadFinished } = buildLoadFinished({ apiFetch, apiFetchAS });
    await loadFinished();
    expect(fdCalls).toBe(2);
    expect(asCalls).toBe(8); // 4 extra лиги × 2 дни (вчера+днес)
  });
});

describe('fetchExtraASFixturesByDate() - PR 5a: обратна съвместимост на общата функция', () => {
  it('без подаден `warnings` параметър - поведението е 100% същото както преди (rejected се пропуска тихо, НЕ хвърля)', async () => {
    const combinedSrc = SHARED_SRC;
    const fn = new Function(
      'apiFetchAS', 'currentSeasonYear',
      combinedSrc + '\nreturn fetchExtraASFixturesByDate;'
    );
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.reject(Object.assign(new Error('rate limit'), { isRateLimit: true }));
      if (p.includes('league=203')) return Promise.resolve({ response: [asFixture(203, 801)] });
      return emptyAS();
    };
    const fetchExtraASFixturesByDate = fn(apiFetchAS, () => 2026);
    const result = await fetchExtraASFixturesByDate('2026-10-11');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1); // само успешната лига (203), без warnings масив няма хвърляне
  });

  it('с подаден `warnings` масив - всеки rejected резултат добавя apiErrorMessage() съобщение с името на лигата', async () => {
    const combinedSrc = SHARED_SRC;
    const fn = new Function(
      'apiFetchAS', 'currentSeasonYear',
      combinedSrc + '\nreturn fetchExtraASFixturesByDate;'
    );
    const apiFetchAS = (p) => p.includes('league=172')
      ? Promise.reject(Object.assign(new Error('rate limit'), { isRateLimit: true }))
      : Promise.resolve({ response: [] });
    const fetchExtraASFixturesByDate = fn(apiFetchAS, () => 2026);
    const warnings = [];
    const result = await fetchExtraASFixturesByDate('2026-10-11', warnings);
    expect(Array.isArray(result)).toBe(true);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Ефбет Лига');
    expect(warnings[0]).toContain('⏳');
  });
});
