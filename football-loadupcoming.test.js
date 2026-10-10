// F2a ХРОНОЛОГИЧНО СОРТИРАНЕ - тества РЕАЛНАТА loadUpcoming() от football.html
// (не копие), извлечена с текстова екстракция (огледално на техниката за
// loadASLeagueTab/buildBetBuilder в другите *.test.js файлове). Проверява, че
// allMatches, подаден на renderMatch(), е ВЕЧЕ хронологично сортиран, дори
// когато входните fetch-и върнат мачовете в разбъркан ред - без нови API
// заявки (само преструктуриране на вече получените мокнати резултати).
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { sortMatchesByDate } from './football-logic.js';

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

function buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch }) {
  const fn = new Function(
    'getToday', 'getDatePlus', 'apiFetch', 'getDateMinus', 'apiFetchAS', 'currentSeasonYear',
    'EXTRA_AS_LEAGUE_IDS', 'asFixtureToMatch', 'sortMatchesByDate', 'COMPS', 'AS_LEAGUES', 'renderMatch',
    code + `\nreturn loadUpcoming;`
  );
  return fn(
    () => '2026-01-01', () => '2026-01-04', apiFetch, () => '2025-07-05', apiFetchAS, () => 2026,
    [], (f) => ({ id: 'as_' + f.fixture.id, status: 'SCHEDULED' }), sortMatchesByDate,
    [], [], renderMatch || (() => '<div>MATCH</div>')
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="upcoming-content"></div>';
});

describe('loadUpcoming - F2a хронологично сортиране на allMatches', () => {
  it('allMatches, подаден на renderMatch(), е хронологично сортиран дори когато football-data.org върне мачовете в разбъркан ред', async () => {
    const shuffledFinished = [
      { id: 'f3', utcDate: '2026-01-15', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 } },
      { id: 'f1', utcDate: '2026-01-01', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 } },
      { id: 'f2', utcDate: '2026-01-08', status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 } },
    ];
    const upcomingFixture = { id: 'u1', utcDate: '2026-01-03', status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, competition: { id: 2021 } };

    let capturedAllMatches = null;
    const apiFetch = (p) => {
      if (p.includes('status=SCHEDULED,TIMED')) return Promise.resolve({ matches: [upcomingFixture] });
      if (p.includes('status=FINISHED')) return Promise.resolve({ matches: shuffledFinished });
      if (p.includes('/competitions/2000/matches')) return Promise.resolve({ matches: [] });
      return Promise.resolve({ matches: [] });
    };
    const apiFetchAS = () => Promise.resolve({ response: [] });
    const renderMatch = (m, showPred, allMatches) => {
      if (showPred) capturedAllMatches = allMatches;
      return '<div>MATCH</div>';
    };

    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch });
    await loadUpcoming();

    expect(capturedAllMatches).not.toBeNull();
    const dates = capturedAllMatches.map(m => m.utcDate);
    const sortedDates = sortMatchesByDate(capturedAllMatches).map(m => m.utcDate);
    expect(dates).toEqual(sortedDates); // вече сортиран - сортирането отново е no-op
    expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });

  it('без промяна в извикваните endpoint-и/брой заявки - само преструктуриране на вече получените резултати', async () => {
    const calls = [];
    const apiFetch = (p) => { calls.push(p); return Promise.resolve({ matches: [] }); };
    const apiFetchAS = (p) => { calls.push(p); return Promise.resolve({ response: [] }); };
    const loadUpcoming = buildLoadUpcoming({ apiFetch, apiFetchAS, renderMatch: () => '' });
    await loadUpcoming();
    // Основната SCHEDULED заявка + опит за FINISHED/Световно (в try блок) = 3 apiFetch извиквания,
    // EXTRA_AS_LEAGUE_IDS е [] в този тест (без AS extra лиги) - без api-sports заявки.
    expect(calls.filter(p => p.includes('status=SCHEDULED,TIMED')).length).toBe(1);
    expect(calls.filter(p => p.includes('status=FINISHED')).length).toBe(1);
    expect(calls.filter(p => p.includes('/competitions/2000/matches'))).toHaveLength(1);
  });
});
