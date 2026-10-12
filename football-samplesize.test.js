// F3 (виж discussion-а "прозрачност на историческата извадка") - тества:
// 1) buildPrediction() (football-logic.js, реална функция) - новите
//    hMatchesN/aMatchesN полета, точния брой FINISHED мачове.
// 2) sampleSizeHtml() (football.html, РЕАЛНА функция, извлечена с текстова
//    екстракция - огледално на останалите *.test.js файлове) - праговете.
// 3) Регресия - hWin/draw/aWin/над-под/Г-Г И buildBetBuilder() изходът са
//    напълно непроменени от добавянето на новите полета.
// 4) Покритие за AS-оформени (asFixtureToMatch() shape) И fd.org-оформени
//    match обекти - buildPrediction() е доставчик-агностична, затова и
//    двата типа вход минават през СЪЩАТА функция.
// 5) Нулеви нови API заявки - структурна проверка на суровия код.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { buildPrediction, calcOverBttsJoint, calcGoalMarkets, poissonProb } from './football-logic.js';

const html = fs.readFileSync('./football.html', 'utf8');

function extractFunction(src, name) {
  const idx = src.indexOf(`function ${name}(`);
  if (idx === -1) throw new Error(`не намерих function ${name}`);
  let depth = 0, start = src.indexOf('{', idx), i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}

const sampleSizeHtmlCode = extractFunction(html, 'sampleSizeHtml');
const sampleSizeHtml = new Function(sampleSizeHtmlCode + '\nreturn sampleSizeHtml;')();

function finished(hid, aid, hg, ag, d) {
  return { status: 'FINISHED', utcDate: d, homeTeam: { id: hid, name: 'X' }, awayTeam: { id: aid, name: 'Y' }, score: { fullTime: { home: hg, away: ag }, halfTime: { home: Math.min(hg, 1), away: Math.min(ag, 1) } } };
}
// Генерира точно n завършени мача на отбор teamId (редуващо домакин/гост, за
// да покрие т.4/5 от плана - "вкл. домакински и гостуващи МЕСТЕ").
function nMatchesFor(teamId, n, oppStartId) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const opp = oppStartId + i;
    if (i % 2 === 0) out.push(finished(teamId, opp, 2, 0, `2026-0${(i % 9) + 1}-01`));
    else out.push(finished(opp, teamId, 0, 2, `2026-0${(i % 9) + 1}-01`));
  }
  return out;
}

describe('buildPrediction() - F3: hMatchesN/aMatchesN (реалната функция, football-logic.js)', () => {
  it('точен брой FINISHED мачове за домакин и гост (вкл. домакински + гостуващи смесени)', () => {
    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const allMatches = [...nMatchesFor(1, 3, 900), ...nMatchesFor(2, 7, 800)];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(3);
    expect(pred.aMatchesN).toBe(7);
  });

  it('0 мача на единия отбор (съвсем нов отбор) -> hMatchesN=0, aMatchesN>0, без крах', () => {
    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const allMatches = nMatchesFor(2, 5, 800);
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(0);
    expect(pred.aMatchesN).toBe(5);
  });

  it('НЕзавършени (SCHEDULED/IN_PLAY) мачове НЕ се броят в hMatchesN/aMatchesN', () => {
    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const allMatches = [
      ...nMatchesFor(1, 2, 900),
      { status: 'SCHEDULED', utcDate: '2026-09-01', homeTeam: { id: 1 }, awayTeam: { id: 950 } },
      { status: 'IN_PLAY', utcDate: '2026-09-02', homeTeam: { id: 1 }, awayTeam: { id: 951 } },
    ];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hMatchesN).toBe(2); // само 2-та FINISHED, не 4
  });

  it('AS-оформен вход (asFixtureToMatch() shape, id-та без значение за buildPrediction) дава СЪЩОТО коректно броене като fd.org вход', () => {
    // buildPrediction() не разчита на формата на id-то (as_123 срещу число) -
    // работи директно с homeTeam.id/awayTeam.id/status/score - затова AS-
    // normalized мачове (вече преобразувани от asFixtureToMatch()) минават
    // през СЪЩАТА функция, без разлика.
    const asMatch = { homeTeam: { id: 'as_10', name: 'AS Team A' }, awayTeam: { id: 'as_20', name: 'AS Team B' } };
    const asHistory = [...nMatchesFor('as_10', 4, 'as_900'), ...nMatchesFor('as_20', 1, 'as_800')];
    const pred = buildPrediction(asMatch, asHistory);
    expect(pred.hMatchesN).toBe(4);
    expect(pred.aMatchesN).toBe(1);
  });
});

describe('sampleSizeHtml() - F3: прагове според Math.min(N,M) (реалната функция от football.html)', () => {
  it('0 мача -> "Крайно малка извадка"', () => {
    const out = sampleSizeHtml({ hMatchesN: 0, aMatchesN: 0 }, 'Дом', 'Гост');
    expect(out).toContain('Крайно малка извадка');
  });
  it('min=2 -> "Крайно малка извадка" (границата 0-2 включва 2)', () => {
    const out = sampleSizeHtml({ hMatchesN: 2, aMatchesN: 50 }, 'Дом', 'Гост');
    expect(out).toContain('Крайно малка извадка');
  });
  it('min=3 -> "Малка извадка" (границата 3-4 започва точно от 3)', () => {
    const out = sampleSizeHtml({ hMatchesN: 3, aMatchesN: 3 }, 'Дом', 'Гост');
    expect(out).toContain('Малка извадка');
    expect(out).not.toContain('Крайно малка извадка');
  });
  it('min=4 -> "Малка извадка"', () => {
    const out = sampleSizeHtml({ hMatchesN: 4, aMatchesN: 10 }, 'Дом', 'Гост');
    expect(out).toContain('Малка извадка');
    expect(out).not.toContain('Крайно малка извадка');
  });
  it('min=5 -> "Умерена извадка" (границата 5-9 започва точно от 5)', () => {
    const out = sampleSizeHtml({ hMatchesN: 5, aMatchesN: 5 }, 'Дом', 'Гост');
    expect(out).toContain('Умерена извадка');
    expect(out).not.toContain('Малка извадка');
  });
  it('min=9 -> "Умерена извадка"', () => {
    const out = sampleSizeHtml({ hMatchesN: 9, aMatchesN: 20 }, 'Дом', 'Гост');
    expect(out).toContain('Умерена извадка');
  });
  it('min=10 -> БЕЗ предупредителен таг (Крайно малка/Малка/Умерена), само бройките', () => {
    const out = sampleSizeHtml({ hMatchesN: 10, aMatchesN: 10 }, 'Дом', 'Гост');
    expect(out).not.toContain('Крайно малка извадка');
    expect(out).not.toContain('Малка извадка');
    expect(out).not.toContain('Умерена извадка');
    expect(out).toContain('10');
  });
  it('показва и двата отбора поотделно, не само минимума (min(15,3)=3 -> "Малка извадка")', () => {
    const out = sampleSizeHtml({ hMatchesN: 15, aMatchesN: 3 }, 'Силен', 'Слаб');
    expect(out).toContain('Силен');
    expect(out).toContain('15');
    expect(out).toContain('Слаб');
    expect(out).toContain('3');
    expect(out).toContain('Малка извадка');
    expect(out).not.toContain('Крайно малка извадка');
  });
  it('null/undefined pred -> празен низ, без крах', () => {
    expect(sampleSizeHtml(null, 'A', 'B')).toBe('');
  });
  it('съдържа изричния дисклеймър - не гаранция за точност', () => {
    const out = sampleSizeHtml({ hMatchesN: 1, aMatchesN: 1 }, 'A', 'B');
    expect(out).toContain('не непременно грешна прогноза');
  });
  it('изрично уточнява домакински+гостуващи мачове', () => {
    const out = sampleSizeHtml({ hMatchesN: 1, aMatchesN: 1 }, 'A', 'B');
    expect(out).toContain('домакински и гостуващи');
  });
});

describe('F3 регресия - вероятностите и Bet Builder са ИДЕНТИЧНИ с/без новите полета', () => {
  it('hWin/draw/aWin/over25/btts - anchor от одита, обновен след ЗАДАЧА 6.4A (Goal Average Shrinkage)', () => {
    // Същия сценарий "2/2 убедителни победи" от доклада за одита на вероятностите.
    // Оригиналният anchor (93/5/2, over25=88, btts=25) беше преди ЗАДАЧА 6.4A -
    // сега avgGAll()/avgCAll() изглаждат суровата средна към baseline при малка
    // извадка (hMatchesN=aMatchesN=2 тук), затова числата ИЗРИЧНО се променят -
    // точно целта на 6.4A (намалено влияние на единични екстремни резултати).
    // Тестът пак потвърждава: 1X2 сборът е 100%, новите полета (hMatchesN/
    // aMatchesN от F3/Задача 6.2) присъстват и не заменят нищо съществуващо.
    const match = { homeTeam: { id: 1, name: 'Strong FC' }, awayTeam: { id: 2, name: 'Weak FC' } };
    const allMatches = [
      { status: 'FINISHED', utcDate: '2026-08-01', homeTeam: { id: 1, name: 'Strong FC' }, awayTeam: { id: 99, name: 'X' }, score: { fullTime: { home: 5, away: 0 }, halfTime: { home: 2, away: 0 } } },
      { status: 'FINISHED', utcDate: '2026-08-08', homeTeam: { id: 98, name: 'Y' }, awayTeam: { id: 1, name: 'Strong FC' }, score: { fullTime: { home: 0, away: 4 }, halfTime: { home: 0, away: 2 } } },
      { status: 'FINISHED', utcDate: '2026-08-01', homeTeam: { id: 2, name: 'Weak FC' }, awayTeam: { id: 97, name: 'Z' }, score: { fullTime: { home: 0, away: 5 }, halfTime: { home: 0, away: 2 } } },
      { status: 'FINISHED', utcDate: '2026-08-08', homeTeam: { id: 96, name: 'W' }, awayTeam: { id: 2, name: 'Weak FC' }, score: { fullTime: { home: 4, away: 0 }, halfTime: { home: 2, away: 0 } } },
    ];
    const pred = buildPrediction(match, allMatches);
    expect(pred.hWin).toBe(87);
    expect(pred.draw).toBe(5);
    expect(pred.aWin).toBe(8);
    expect(pred.over25).toBe(63);
    expect(pred.btts).toBe(47);
    expect(pred.hWin + pred.draw + pred.aWin).toBe(100);
    // И новите полета присъстват, НЕ заменят/изместват нищо съществуващо.
    expect(pred.hMatchesN).toBe(2);
    expect(pred.aMatchesN).toBe(2);
  });

  it('buildBetBuilder() дава ИДЕНТИЧЕН изход за pred с И без hMatchesN/aMatchesN (Bet Builder ги игнорира)', () => {
    const buildBetBuilderCode = extractFunction(html, 'buildBetBuilder');
    const module_ = { exports: {} };
    const buildBetBuilder = new Function('module', 'calcOverBttsJoint', buildBetBuilderCode + '\nreturn buildBetBuilder;')(module_, calcOverBttsJoint);

    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const allMatches = [...nMatchesFor(1, 3, 900), ...nMatchesFor(2, 3, 800)];
    const predWithN = buildPrediction(match, allMatches);
    expect(predWithN.hMatchesN).toBeDefined();

    const predWithoutN = { ...predWithN };
    delete predWithoutN.hMatchesN;
    delete predWithoutN.aMatchesN;

    const htmlWith = buildBetBuilder(predWithN, 'A', 'B', '🏠', '✈️', [], 1, 2);
    const htmlWithout = buildBetBuilder(predWithoutN, 'A', 'B', '🏠', '✈️', [], 1, 2);
    expect(htmlWith).toBe(htmlWithout);
  });
});

describe('F3 - без нови API заявки (структурна проверка на суровия код)', () => {
  it('sampleSizeHtml() не съдържа apiFetch/apiFetchAS/fetch(', () => {
    expect(sampleSizeHtmlCode).not.toMatch(/apiFetch|fetch\(/);
  });
  it('buildPrediction() (football-logic.js) не съдържа apiFetch/apiFetchAS/fetch( - чисто изчисление върху вече подадения allMatches', () => {
    const logicSrc = fs.readFileSync('./football-logic.js', 'utf8');
    const buildPredictionSrc = logicSrc.slice(logicSrc.indexOf('function buildPrediction('), logicSrc.indexOf('function calcConfidence('));
    expect(buildPredictionSrc).not.toMatch(/apiFetch|fetch\(/);
  });
});
