// P0 #2 (repair queue) - production diagnostic потвърди FD upstream 400
// ("Argument 'status' is expected to be in enum {...}" - HALFTIME липсва от
// enum-а) за loadLive()'s FD заявка '/matches?status=IN_PLAY,PAUSED,HALFTIME'.
// HALFTIME е вътрешен Dashboard/AS_STATUS_MAP статус ('HT' normalization),
// никога валидна football-data.org заявка-стойност. Минималният fix премахва
// САМО невалидния токен от query string-а - AS_STATUS_MAP, isLive/isHT
// логиката в renderMatch(), merge/dedup и Promise.allSettled fallback flow
// остават byte-for-byte непипнати. Тества РЕАЛНАТА apiFetch()+loadLive() (не
// копия), огледално на техниката в football-fdinflightdedup.test.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function okResponse(body) { return { ok: true, json: async () => body }; }

const liveCombinedSrc = [
  'const fdInflightRequests={};',
  'const FD_PROVIDER_COOLDOWN_MS=60*1000;',
  'let fdProviderRateLimitedUntil=0;',
  'const FD_MAX_CONCURRENT_FETCHES=2;',
  'let fdActiveFetchCount=0;',
  'const fdFetchQueue=[];',
  extractBraced(html, 'function acquireFdFetchSlot('),
  extractBraced(html, 'function releaseFdFetchSlot('),
  extractBraced(html, 'async function apiFetch('),
  extractBraced(html, 'async function loadLive('),
].join('\n');

function buildLoadLive({ fetchImpl, apiFetchASImpl, renderMatch, asFixtureToMatch }) {
  const fn = new Function(
    'WORKER', 'fetch', 'apiFetchAS', 'asFixtureToMatch', 'renderMatch', 'extractASLiveStats', 'document',
    liveCombinedSrc + `\nreturn loadLive;`
  );
  return fn(
    'https://worker.test/football', fetchImpl,
    apiFetchASImpl || (async () => ({ response: [] })),
    asFixtureToMatch || ((f) => ({ id: 'as_' + f.fixture.id, status: 'IN_PLAY', homeTeam: f.teams?.home, awayTeam: f.teams?.away })),
    renderMatch || (() => '<div>MATCH</div>'),
    () => ({}),
    document
  );
}

// Реалният AS_STATUS_MAP, извлечен от production source-а (не копие) - факт
// (3) трябва да докаже, че 'HT'->'HALFTIME' normalization-ът остава
// непроменен в самия source, не в тест-копие.
const asStatusMapSrc = extractBraced(html, 'const AS_STATUS_MAP=') + ';\nreturn AS_STATUS_MAP;';
const AS_STATUS_MAP = new Function(asStatusMapSrc)();

beforeEach(() => { document.body.innerHTML = '<div id="live-content"></div>'; });

describe('loadLive() - P0 #2: FD HALFTIME contract fix', () => {
  it('(1) loadLive() изпраща FD заявка с точно status=IN_PLAY,PAUSED', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const loadLive = buildLoadLive({ fetchImpl: fetchMock });
    await loadLive();
    const fdCall = fetchMock.mock.calls.find(c => c[0].includes('/matches?status='));
    expect(fdCall).toBeDefined();
    expect(fdCall[0]).toContain('status=IN_PLAY,PAUSED');
  });

  it('(2) FD LIVE заявката НИКОГА не съдържа HALFTIME', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const loadLive = buildLoadLive({ fetchImpl: fetchMock });
    await loadLive();
    fetchMock.mock.calls.forEach(c => { expect(c[0]).not.toContain('HALFTIME'); });
  });

  it('(3) AS_STATUS_MAP["HT"] остава "HALFTIME" (AS normalization непроменена)', () => {
    expect(AS_STATUS_MAP['HT']).toBe('HALFTIME');
  });

  it('(4) loadLive() продължава да прави точно 1 FD + 1 AS заявка', async () => {
    const fetchMock = vi.fn(() => okResponse({ matches: [] }));
    const apiFetchASImpl = vi.fn(async () => ({ response: [] }));
    const loadLive = buildLoadLive({ fetchImpl: fetchMock, apiFetchASImpl });
    await loadLive();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchASImpl).toHaveBeenCalledTimes(1);
  });

  it('(5a) fallback при FD failure, AS success - AS данните се рендерират, без crash', async () => {
    const fetchMock = vi.fn(() => ({ ok: false, status: 400, json: async () => ({ message: "Argument 'status' is expected to be in enum {...}" }) }));
    const asFixture = { fixture: { id: 99 }, teams: { home: { name: 'Home FC' }, away: { name: 'Away FC' } } };
    const apiFetchASImpl = vi.fn(async () => ({ response: [asFixture] }));
    const rendered = [];
    const renderMatch = vi.fn((m) => { rendered.push(m.id); return `<div>${m.id}</div>`; });
    const loadLive = buildLoadLive({ fetchImpl: fetchMock, apiFetchASImpl, renderMatch });
    await loadLive();
    expect(rendered).toEqual(['as_99']);
    expect(document.getElementById('live-content').innerHTML).toContain('as_99');
  });

  it('(5b) fallback при AS failure, FD success - FD данните се рендерират, без crash', async () => {
    const fdMatch = { id: 1, homeTeam: { name: 'Home FC' }, awayTeam: { name: 'Away FC' }, status: 'IN_PLAY' };
    const fetchMock = vi.fn(() => okResponse({ matches: [fdMatch] }));
    const apiFetchASImpl = vi.fn(async () => { throw new Error('AS temporarily unavailable'); });
    const rendered = [];
    const renderMatch = vi.fn((m) => { rendered.push(m.id); return `<div>${m.id}</div>`; });
    const loadLive = buildLoadLive({ fetchImpl: fetchMock, apiFetchASImpl, renderMatch });
    await loadLive();
    expect(rendered).toEqual([1]);
    expect(document.getElementById('live-content').innerHTML).toContain('>1<');
  });

  it('(5c) fallback когато и двата provider-а fail-ват - "Няма live мачове", без throw', async () => {
    const fetchMock = vi.fn(() => ({ ok: false, status: 400, json: async () => ({ message: 'bad request' }) }));
    const apiFetchASImpl = vi.fn(async () => { throw new Error('AS temporarily unavailable'); });
    const loadLive = buildLoadLive({ fetchImpl: fetchMock, apiFetchASImpl });
    await expect(loadLive()).resolves.toBeUndefined();
    expect(document.getElementById('live-content').innerHTML).toContain('Няма live мачове');
  });
});
