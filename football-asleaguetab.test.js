// F1 ДИАГНОСТИКА - тества РЕАЛНАТА loadASLeagueTab() от football.html (не копие),
// извлечена с текстова екстракция (огледално на техниката за buildBetBuilder в
// football-betbuilder.test.js). Проверява точно трите разграничени състояния,
// одобрени в F1: (1) действително празен сезон, (2) провалена заявка (fetch
// грешка), (3) грешка при обработка/рендериране - преди всичките три се
// показваха като едно и също "Сезонът още не е започнал" съобщение.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { classifyAsLeagueTabEmptyState } from './football-logic.js';

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
const code = extractFunction(html, 'loadASLeagueTab');

function buildLoadASLeagueTab({ apiFetchAS, apiSportsScorersBlockHtml, asFixtureToMatch, extractASLiveStats, renderMatch, beginAsForeground, endAsForeground }) {
  const fn = new Function(
    'currentSeasonYear', 'apiFetchAS', 'apiSportsScorersBlockHtml', 'classifyAsLeagueTabEmptyState',
    'asFixtureToMatch', 'extractASLiveStats', 'renderMatch', 'beginAsForeground', 'endAsForeground',
    code + `\nreturn loadASLeagueTab;`
  );
  return fn(
    () => 2026, apiFetchAS, apiSportsScorersBlockHtml, classifyAsLeagueTabEmptyState,
    asFixtureToMatch || (f => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED' })),
    extractASLiveStats || (() => ({})),
    renderMatch || (() => '<div>MATCH</div>'),
    beginAsForeground || (() => {}), endAsForeground || (() => {})
  );
}

function emptyAS() { return Promise.resolve({ response: [] }); }

beforeEach(() => {
  document.body.innerHTML = '<div id="cl-content"></div>';
});

describe('loadASLeagueTab - F1 диагностика', () => {
  it('действително празен сезон (next/last/live fulfilled, всички празни) -> "Сезонът още не е започнал", БЕЗ error-box', async () => {
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: () => emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('Сезонът още не е започнал');
    expect(html).not.toContain('error-box');
    expect(html).not.toContain('Няма връзка с API-то');
  });

  it('провалена заявка (next rejected) с иначе празен allRaw -> "Няма връзка с API-то", НЕ "сезонът не е започнал"', async () => {
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: (p) => p.includes('next=20') ? Promise.reject(new Error('network boom')) : emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('error-box');
    expect(html).toContain('Няма връзка с API-то');
    expect(html).not.toContain('Сезонът още не е започнал');
  });

  it('провалена "last" заявка (не "next") с иначе празен allRaw -> също "Няма връзка с API-то" (всяка от трите носи риск)', async () => {
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: (p) => p.includes('last=20') ? Promise.reject(new Error('network boom')) : emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('Няма връзка с API-то');
    expect(html).not.toContain('Сезонът още не е започнал');
  });

  it('провалена "last=25" (минал сезон, за blending) НЕ блокира - не захранва allRaw -> ако next/last/live са празни fulfilled, пак е "сезонът не е започнал"', async () => {
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: (p) => p.includes('last=25') ? Promise.reject(new Error('prev season boom')) : emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('Сезонът още не е започнал');
    expect(html).not.toContain('error-box');
  });

  it('грешка при обработка/рендериране (renderMatch хвърля) с НЕпразен allRaw -> "Грешка при обработка", НЕ "сезонът не е започнал"', async () => {
    const fixture = { fixture: { id: 1, date: '2026-01-01T00:00:00Z' }, league: { id: 2, round: 'Кръг 1' } };
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: (p) => p.includes('next=20') ? Promise.resolve({ response: [fixture] }) : emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
      renderMatch: () => { throw new Error('render boom'); },
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('error-box');
    expect(html).toContain('Грешка при обработка на мачовете');
    expect(html).not.toContain('Сезонът още не е започнал');
    expect(html).not.toContain('Няма връзка с API-то');
  });

  it('нормален успешен път остава непроменен (regression) - реални мачове се рендерират, без error състояния', async () => {
    const fixture = { fixture: { id: 1, date: '2026-01-01T00:00:00Z' }, league: { id: 2, round: 'Кръг 1' } };
    const loadASLeagueTab = buildLoadASLeagueTab({
      apiFetchAS: (p) => p.includes('next=20') ? Promise.resolve({ response: [fixture] }) : emptyAS(),
      apiSportsScorersBlockHtml: () => Promise.resolve(''),
      renderMatch: () => '<div>MATCH-OK</div>',
    });
    await loadASLeagueTab('cl', 2, '⭐', 'Шампионска лига');
    const html = document.getElementById('cl-content').innerHTML;
    expect(html).toContain('MATCH-OK');
    expect(html).toContain('Кръг 1');
    expect(html).not.toContain('error-box');
    expect(html).not.toContain('Сезонът още не е започнал');
  });
});
