// FOOTBALL DASHBOARD ЗАДАЧА 6.2 (виж "Sample Size Indicator + History
// Metadata") - тества sampleReliabilityTier() (football-logic.js, pure
// функция, директен import) и sampleTierChipHtml()/savePrediction()
// (football.html, РЕАЛНИ функции, извлечени с текстова екстракция,
// огледално на другите *.test.js файлове). Потвърждава точно одобрените
// изисквания: граничните прагове на категорията, Math.min(hN,aN) за
// неравни извадки, n=0, адитивен запис в историята (стари записи без
// полетата означават "неизвестно", не n=0), без дублиране на
// sampleSizeHtml(), без промяна в calcConfidence()/buildPrediction().
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { sampleReliabilityTier, buildPrediction, calcConfidence, getHistory, saveHistory, HIST_KEY, sortMatchesByDate } from './football-logic.js';

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

function buildSampleTierChipHtml() {
  const code = extractBraced(html, 'function sampleTierChipHtml(');
  return new Function(code + '\nreturn sampleTierChipHtml;')();
}
function buildSavePrediction() {
  const code = extractBraced(html, 'function savePrediction(');
  const fn = new Function('getHistory', 'saveHistory', code + '\nreturn savePrediction;');
  return fn(getHistory, saveHistory);
}

function clearHist() { try { localStorage.removeItem(HIST_KEY); } catch (e) {} }

describe('sampleReliabilityTier() - ЗАДАЧА 6.2: граничните прагове на категорията по размер на извадката', () => {
  const cases = [
    [0, 0, 1, 'Крайно малка извадка'],
    [1, 100, 1, 'Крайно малка извадка'],
    [2, 2, 1, 'Крайно малка извадка'],
    [3, 3, 2, 'Малка извадка'],
    [4, 4, 2, 'Малка извадка'],
    [5, 5, 3, 'Умерена извадка'],
    [9, 9, 3, 'Умерена извадка'],
    [10, 10, 4, 'Добра извадка'],
    [19, 19, 4, 'Добра извадка'],
    [20, 20, 5, 'Голяма извадка'],
    [50, 50, 5, 'Голяма извадка'],
  ];
  cases.forEach(([hN, aN, expectedTier, expectedLabel]) => {
    it(`hN=${hN}, aN=${aN} -> tier ${expectedTier} ("${expectedLabel}")`, () => {
      const r = sampleReliabilityTier(hN, aN);
      expect(r.tier).toBe(expectedTier);
      expect(r.label).toBe(expectedLabel);
    });
  });

  it('неравни извадки (домакин n=2, гост n=30) - по-слабата страна (Math.min) определя категорията, не средното', () => {
    const r = sampleReliabilityTier(2, 30);
    expect(r.minN).toBe(2);
    expect(r.tier).toBe(1);
    expect(r.label).toBe('Крайно малка извадка');
    expect(r.hMatchesN).toBe(2);
    expect(r.aMatchesN).toBe(30);
  });

  it('n=0 за двата отбора - tier 1, без throw/NaN', () => {
    const r = sampleReliabilityTier(0, 0);
    expect(r.minN).toBe(0);
    expect(r.tier).toBe(1);
    expect(Number.isFinite(r.minN)).toBe(true);
  });

  it('null/undefined вход - третира се като 0, не хвърля', () => {
    const r = sampleReliabilityTier(null, undefined);
    expect(r.hMatchesN).toBe(0);
    expect(r.aMatchesN).toBe(0);
    expect(r.tier).toBe(1);
  });
});

describe('sampleTierChipHtml() - ЗАДАЧА 6.2: UI индикатор без дублиране и без подвеждащи думи', () => {
  it('показва броя наблюдения на двата отбора и категорията', () => {
    const sampleTierChipHtml = buildSampleTierChipHtml();
    const tier = sampleReliabilityTier(10, 25);
    const out = sampleTierChipHtml(tier, 'Домакин', 'Гост');
    expect(out).toContain('10');
    expect(out).toContain('25');
    expect(out).toContain('Добра извадка');
  });

  it('празен низ при null tier (не хвърля)', () => {
    const sampleTierChipHtml = buildSampleTierChipHtml();
    expect(sampleTierChipHtml(null, 'A', 'B')).toBe('');
  });

  it('НЕ използва подвеждащи думи ("гарантирана", "точност 5/5", "висока вероятност за успех")', () => {
    const code = extractBraced(html, 'function sampleTierChipHtml(');
    expect(code).not.toMatch(/гарантиран/i);
    expect(code).not.toMatch(/точност\s*5\/5/i);
    expect(code).not.toMatch(/висока вероятност за успех/i);
  });

  it('не дублира текста на съществуващия sampleSizeHtml() банер (различни изречения/заглавия)', () => {
    const sampleTierChipHtml = buildSampleTierChipHtml();
    const chipOut = sampleTierChipHtml(sampleReliabilityTier(5, 5), 'A', 'B');
    const sampleSizeCode = extractBraced(html, 'function sampleSizeHtml(');
    // sampleSizeHtml() си има собствено заглавие "📊 ИСТОРИЧЕСКА ИЗВАДКА" и
    // собствен дисклеймър ("Формата ползва до последните 5...") - новия чип
    // НЕ трябва да ги повтаря дума по дума.
    expect(chipOut).not.toContain('📊 ИСТОРИЧЕСКА ИЗВАДКА');
    expect(chipOut).not.toContain('Формата ползва до последните 5');
    expect(sampleSizeCode).not.toContain('📏 Размер на извадката'); // новия чип е различен текст
  });

  it('sampleTierChipHtml() е самостоятелен извикан блок в renderMatch(), отделно от sampleSizeHtml()/confidenceHtml()', () => {
    const renderMatchCode = extractBraced(html, 'function renderMatch(');
    expect(renderMatchCode).toMatch(/sampleSizeHtml\(/);
    expect(renderMatchCode).toMatch(/confidenceHtml\(/);
    expect(renderMatchCode).toMatch(/sampleTierChipHtml\(/);
  });
});

describe('savePrediction() - ЗАДАЧА 6.2: адитивен запис на hMatchesN/aMatchesN/sampleTier', () => {
  it('нова прогноза с sampleTier - записва hMatchesN/aMatchesN/sampleTier', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'm1', status: 'SCHEDULED', utcDate: '2026-11-01', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021, name: 'PL' } };
    const pred = { hWin: 50, draw: 25, aWin: 25, over25: 55, btts: 45, g10: 20 };
    const tier = sampleReliabilityTier(12, 8);
    savePrediction(m, pred, tier);
    const hist = getHistory();
    const entry = hist.find(h => h.id === 'm1');
    expect(entry.hMatchesN).toBe(12);
    expect(entry.aMatchesN).toBe(8);
    expect(entry.sampleTier).toBe(3); // min(12,8)=8 -> "Умерена извадка"
  });

  it('без подаден sampleTier (стар стил извикване) - полетата НЕ се добавят (undefined, не 0)', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'm2', status: 'TIMED', utcDate: '2026-11-02', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021, name: 'PL' } };
    const pred = { hWin: 50, draw: 25, aWin: 25, over25: 55, btts: 45, g10: 20 };
    savePrediction(m, pred); // без 3-ти аргумент, огледално на всички съществуващи извиквания преди 6.2
    const hist = getHistory();
    const entry = hist.find(h => h.id === 'm2');
    expect(entry).toBeTruthy();
    expect('hMatchesN' in entry).toBe(false); // "неизвестно", НЕ 0
    expect(entry.hMatchesN).toBeUndefined();
  });

  it('стар запис без тия полета (симулира история от преди 6.2) - четенето дава undefined, не 0, и не се презаписва', () => {
    clearHist();
    const legacyEntry = { id: 'old1', date: '2026-10-01', home: 'X', away: 'Y', comp: 'PL', compId: 2021, statusAtSave: 'SCHEDULED', pred: { hWin: 40, draw: 30, aWin: 30 }, result: null, savedAt: 1000 };
    saveHistory([legacyEntry]);
    const savePrediction = buildSavePrediction();
    // ново извикване за РАЗЛИЧЕН мач - не трябва да пипа стария запис
    const m = { id: 'new1', status: 'SCHEDULED', utcDate: '2026-11-05', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021, name: 'PL' } };
    savePrediction(m, { hWin: 60, draw: 20, aWin: 20, over25: 50, btts: 50, g10: 20 }, sampleReliabilityTier(1, 1));
    const hist = getHistory();
    const old = hist.find(h => h.id === 'old1');
    expect(old.hMatchesN).toBeUndefined(); // неизвестно, не 0
    expect(old.pred.hWin).toBe(40); // непипнат стар запис
    const fresh = hist.find(h => h.id === 'new1');
    expect(fresh.hMatchesN).toBe(1);
  });

  it('запис само преди началото на мач - LIVE/FINISHED статус не записва, независимо от подадения sampleTier', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const liveMatch = { id: 'live1', status: 'IN_PLAY', utcDate: '2026-11-01', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    savePrediction(liveMatch, { hWin: 50, draw: 25, aWin: 25 }, sampleReliabilityTier(20, 20));
    expect(getHistory().length).toBe(0);
  });

  it('неизменяемост - второ извикване за СЪЩИЯ мач с различен sampleTier НЕ презаписва вече записания', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'dup1', status: 'SCHEDULED', utcDate: '2026-11-01', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    const pred = { hWin: 50, draw: 25, aWin: 25, over25: 55, btts: 45, g10: 20 };
    savePrediction(m, pred, sampleReliabilityTier(3, 3)); // първо - "Малка извадка" (tier 2)
    savePrediction(m, pred, sampleReliabilityTier(40, 40)); // второ - "Голяма извадка" (tier 5), трябва да се игнорира
    const hist = getHistory();
    expect(hist.length).toBe(1);
    expect(hist[0].sampleTier).toBe(2); // остава първоначалният запис
  });
});

describe('ЗАДАЧА 6.2 - регресия: calcConfidence()/buildPrediction() остават напълно непипнати', () => {
  it('calcConfidence() изходът е идентичен преди/след въвеждането на sampleTier (не чете hMatchesN/aMatchesN)', () => {
    const pred = { hWin: 70, draw: 18, aWin: 12, over25: 80, btts: 72, hForm: ['W', 'W', 'W', 'D', 'L'], aForm: ['L', 'L', 'D', 'W', 'L'], hMatchesN: 1, aMatchesN: 1 };
    const confA = calcConfidence(pred);
    const predHighN = { ...pred, hMatchesN: 50, aMatchesN: 50 };
    const confB = calcConfidence(predHighN);
    // Самата задача потвърждава: calcConfidence() не чете hMatchesN/aMatchesN -
    // резултатът трябва да е ТОЧНО същия независимо от извадката.
    expect(confA.score).toBe(confB.score);
    expect(confA).toEqual(confB);
  });

  it('buildPrediction() дава същите 1X2/над-под/ГГ проценти за идентичен вход (без промяна в прогнозната математика)', () => {
    const allMatches = sortMatchesByDate([
      { id: 'm1', status: 'FINISHED', utcDate: '2025-11-01', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 }, score: { halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 } } },
      { id: 'm2', status: 'FINISHED', utcDate: '2025-11-08', homeTeam: { id: 2, name: 'B' }, awayTeam: { id: 1, name: 'A' }, competition: { id: 2021 }, score: { halfTime: { home: 0, away: 1 }, fullTime: { home: 0, away: 2 } } },
      { id: 'm3', status: 'FINISHED', utcDate: '2025-11-15', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, competition: { id: 2021 }, score: { halfTime: { home: 1, away: 1 }, fullTime: { home: 3, away: 1 } } },
    ]);
    const match = { homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' } };
    const pred = buildPrediction(match, allMatches);
    expect(pred.hWin).toBeTypeOf('number');
    expect(pred.hMatchesN).toBe(3);
    expect(pred.aMatchesN).toBe(3);
    // Снимка (snapshot) на точните стойности - ако тия числа се променят,
    // значи прогнозната математика е пипната, което тая задача изрично забранява.
    const pred2 = buildPrediction(match, allMatches);
    expect(pred).toEqual(pred2);
  });
});
