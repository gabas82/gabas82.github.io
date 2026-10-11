// FOOTBALL DASHBOARD PR 1 (виж "одит на ГОЛМАЙСТОРИ - грешни играчи за
// България") - тества РЕАЛНАТА loadScorers() от football.html (не копие),
// извлечена с текстова екстракция (огледално на останалите *.test.js
// файлове). Потвърждава точно одобрения фикс: fd.org competition id 2016
// НЕ се ползва за България/Efbet Liga вече - заменено с apiSportsScorersBlockHtml(172,...),
// същия модел, вече работещ за Сюпер Лиг/ЛЕ/ЛК.
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

const TEST_COMPS = [
  { id: 2000, name: 'World Cup 2026', flag: '🏆' },
  { id: 2021, name: 'Premier League', flag: '🏴' },
  { id: 2018, name: 'Europa League', flag: '🟠' },
  { id: 2016, name: 'България', flag: '🇧🇬' },
];

function buildLoadScorers({ apiFetch, apiFetchAS, getWCAliveTeamIds, buildScorersFromMatches }) {
  // PR 2 (виж "TTL кеширане на ГОЛМАЙСТОРИ") - loadScorers()/apiSportsScorersBlockHtml()
  // вече минават през fetchScorersCached() - трябва да се екстрактне заедно с тях,
  // иначе е undefined в sandbox-а. Всеки buildLoadScorers() извиква нов new Function(...),
  // затова scorersCache/scorersInflight са чисти (без данни от предходни тестове) на всяко извикване.
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
    combinedSrc + '\nreturn loadScorers;'
  );
  const contentEl = { innerHTML: '' };
  const fakeDoc = { getElementById: (id) => id === 'scorers-content' ? contentEl : { innerHTML: '' } };
  const loadScorers = fn(
    fakeDoc, () => {}, () => {}, apiFetch, apiFetchAS,
    getWCAliveTeamIds || (async () => null),
    buildScorersFromMatches || (() => []),
    () => 2026, (name) => '🏳️', TEST_COMPS
  );
  return { loadScorers, getHtml: () => contentEl.innerHTML };
}

function emptyFd() { return Promise.resolve({ matches: [], scorers: [] }); }
function emptyAS() { return Promise.resolve({ response: [] }); }

describe('loadScorers() - PR 1: България вече НЕ тегли от football-data.org (реалната функция)', () => {
  it('1-2. НИКОГА не вика /competitions/2016/scorers (fd.org) - потвърждава премахнатия неправилен цикъл', async () => {
    const fdCalls = [];
    const apiFetch = (p) => { fdCalls.push(p); return emptyFd(); };
    const apiFetchAS = () => emptyAS();
    const { loadScorers } = buildLoadScorers({ apiFetch, apiFetchAS });
    await loadScorers();
    expect(fdCalls.some(p => p.includes('/competitions/2016/'))).toBe(false);
  });

  it('3. Ползва правилния AS league ID (172) за Ефбет Лига, не друг', async () => {
    const asCalls = [];
    const apiFetchAS = (p) => { asCalls.push(p); return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    expect(asCalls.some(p => p.includes('league=172'))).toBe(true);
  });

  it('4а. Правилен сезон - league=172&season=<currentSeasonYear()>', async () => {
    const asCalls = [];
    const apiFetchAS = (p) => { asCalls.push(p); return emptyAS(); };
    const { loadScorers } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    expect(asCalls.some(p => p.includes('league=172') && p.includes('season=2026'))).toBe(true);
  });

  it('4б. Реалните Efbet Liga играчи (от AS отговора за league=172) се показват коректно - не чужди отбори/играчи', async () => {
    const efbetPlayer = {
      player: { name: 'Реален Efbet Играч' },
      statistics: [{ team: { name: 'Левски София' }, goals: { total: 7, assists: 2 } }],
    };
    const apiFetchAS = (p) => p.includes('league=172') ? Promise.resolve({ response: [efbetPlayer] }) : emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const htmlOut = getHtml();
    expect(htmlOut).toContain('Ефбет Лига');
    expect(htmlOut).toContain('Реален Efbet Играч');
    expect(htmlOut).toContain('Левски София');
  });

  it('5а. API грешка за league=172 - ясно съобщение за грешка (PR 5c), НЕ се показват играчи от друга лига като заместители', async () => {
    // PR 5c (виж "Разграничаване на API грешки и празни данни - ГОЛМАЙСТОРИ") -
    // преди секцията изчезваше напълно при грешка (тихо поглъщане,
    // неразличимо от легитимно празен резултат); сега apiSportsScorersBlockHtml()
    // връща явен error-box с apiErrorMessage(), споменаващ "Ефбет Лига" - затова
    // тестът вече ПОТВЪРЖДАВА наличието на ясно съобщение, не отсъствието му.
    // Инвариантата от оригиналния одит остава: никога не се показва играч от
    // друга лига под хедъра "Ефбет Лига" като мълчаливо заместване.
    const otherLeaguePlayer = {
      player: { name: 'Играч От Друга Лига' },
      statistics: [{ team: { name: 'Чужд Отбор' }, goals: { total: 99, assists: 0 } }],
    };
    const apiFetchAS = (p) => {
      if (p.includes('league=172')) return Promise.reject(Object.assign(new Error('rate limit'), { isApiError: true }));
      if (p.includes('league=203')) return Promise.resolve({ response: [otherLeaguePlayer] }); // Сюпер Лиг - различна лига
      return emptyAS();
    };
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const htmlOut = getHtml();
    expect(htmlOut).toContain('error-box');
    expect(htmlOut).toContain('Ефбет Лига'); // явно съобщение за точно тая лига, не мълчание
    // "Играч От Друга Лига" легитимно се появява, но ЕДИНСТВЕНО под своя СОБСТВЕН
    // "Сюпер Лиг" comp-header - намираме НАЙ-БЛИЗКИЯ ПРЕДХОЖДАЩ comp-header и
    // потвърждаваме, че е точно "Сюпер Лиг", не "Ефбет Лига".
    const otherPlayerIdx = htmlOut.indexOf('Играч От Друга Лига');
    expect(otherPlayerIdx).toBeGreaterThan(-1);
    const headerMatches = [...htmlOut.slice(0, otherPlayerIdx).matchAll(/<div class="comp-header">([^<]*)<\/div>/g)];
    const nearestHeader = headerMatches[headerMatches.length - 1][1];
    expect(nearestHeader).toContain('Сюпер Лиг');
  });

  it('5б. Валиден празен отговор (league=172 връща 0 играчи) - секцията липсва, без грешка', async () => {
    const apiFetchAS = () => emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await expect(loadScorers()).resolves.toBeUndefined();
    expect(getHtml()).not.toContain('Ефбет Лига');
  });

  it('5в. fd.org грешка/проблем НЕ води до fallback показване на България секция през fd.org endpoint-а', async () => {
    // Дори fd.org да хвърли грешка за друга лига, цикълът по COMPS никога не
    // достига до 2016 (continue), затова няма начин грешка там да "отключи"
    // стар fd.org fallback за България.
    const apiFetch = (p) => p.includes('/competitions/2021/') ? Promise.reject(new Error('fd boom')) : emptyFd();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadScorers();
    expect(getHtml()).not.toContain('България');
  });

  it('регресия - Сюпер Лиг/Лига Европа/Лига на конференциите продължават да работят непроменени (съществуващия модел)', async () => {
    const superligPlayer = { player: { name: 'SuperLig Player' }, statistics: [{ team: { name: 'Galatasaray' }, goals: { total: 10, assists: 1 } }] };
    const apiFetchAS = (p) => p.includes('league=203') ? Promise.resolve({ response: [superligPlayer] }) : emptyAS();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch: emptyFd, apiFetchAS });
    await loadScorers();
    const htmlOut = getHtml();
    expect(htmlOut).toContain('Сюпер Лиг');
    expect(htmlOut).toContain('SuperLig Player');
  });

  it('регресия - останалите fd.org лиги (напр. Premier League) продължават да се теглят нормално през fd.org цикъла', async () => {
    const plScorer = { player: { name: 'PL Scorer' }, team: { shortName: 'Arsenal' } };
    const apiFetch = (p) => p.includes('/competitions/2021/scorers') ? Promise.resolve({ scorers: [plScorer] }) : emptyFd();
    const { loadScorers, getHtml } = buildLoadScorers({ apiFetch, apiFetchAS: () => emptyAS() });
    await loadScorers();
    const htmlOut = getHtml();
    expect(htmlOut).toContain('Premier League');
    expect(htmlOut).toContain('PL Scorer');
  });
});
