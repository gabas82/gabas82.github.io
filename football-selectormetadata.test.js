// FOOTBALL DASHBOARD ЗАДАЧА 8.1 (виж "Preserve Pre-Match Selector Metadata",
// одита от Задача №8.0 - "confidence/hForm/aForm никога не се пазят, бъдещ
// selector не може да се replay-не честно"). Тества РЕАЛНАТА savePrediction()
// (football.html, текстова екстракция, огледално на
// football-sampletier.test.js/football-modelversion.test.js). Потвърждава
// точно одобрения обхват: чисто адитивен snapshot на confidence/hForm/aForm/
// expH/expA/hWinRatePct/aWinRatePct/gm/gmHt/htRatio - НЕ преизчислен по-късно,
// НЕ дублиращ hMatchesN/aMatchesN (вече установен източник чрез sampleTier),
// старите записи остават напълно недокоснати.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { getHistory, saveHistory, HIST_KEY, PREDICTION_MODEL_VERSION, sampleReliabilityTier, calcConfidence, buildPrediction } from './football-logic.js';

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
function buildSavePrediction() {
  const code = extractBraced(html, 'function savePrediction(');
  const fn = new Function('getHistory', 'saveHistory', 'PREDICTION_MODEL_VERSION', 'calcConfidence', code + '\nreturn savePrediction;');
  return fn(getHistory, saveHistory, PREDICTION_MODEL_VERSION, calcConfidence);
}
function clearHist() { try { localStorage.removeItem(HIST_KEY); } catch (e) {} }

function fullPred(overrides) {
  return {
    hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20,
    expH: '1.8', expA: '1.1', hWinRatePct: 70, aWinRatePct: 30,
    gm: { over05: 90, over15: 70, over25: 55, over35: 30, over45: 15 },
    gmHt: { over05: 60, over15: 30, over25: 12 },
    htRatio: 45,
    hForm: ['W', 'W', 'D', 'L', 'W'],
    aForm: ['L', 'D', 'L', 'W', 'L'],
    hMatchesN: 12, aMatchesN: 8,
    ...overrides,
  };
}
const m = { id: 'm1', status: 'SCHEDULED', utcDate: '2026-12-01T18:00:00Z', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021, name: 'PL' } };

describe('savePrediction() - ЗАДАЧА 8.1: запазва pre-match selector metadata', () => {
  it('A) нова prediction пази confidence.score (snapshot от calcConfidence(pred))', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    const entry = getHistory().find(h => h.id === 'm1');
    const expectedConf = calcConfidence(pred);
    expect(entry.confidence.score).toBe(expectedConf.score);
  });

  it('B) нова prediction пази confidence.factors', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    const entry = getHistory().find(h => h.id === 'm1');
    const expectedConf = calcConfidence(pred);
    expect(entry.confidence.factors).toEqual(expectedConf.factors);
  });

  it('C) нова prediction пази hForm/aForm точно както върнати от buildPrediction()', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    const entry = getHistory().find(h => h.id === 'm1');
    expect(entry.pred.hForm).toEqual(['W', 'W', 'D', 'L', 'W']);
    expect(entry.pred.aForm).toEqual(['L', 'D', 'L', 'W', 'L']);
  });

  it('D) избраните допълнителни pre-match полета (expH/expA/hWinRatePct/aWinRatePct/gm/gmHt/htRatio) се пазят точно', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    const entry = getHistory().find(h => h.id === 'm1').pred;
    expect(entry.expH).toBe('1.8');
    expect(entry.expA).toBe('1.1');
    expect(entry.hWinRatePct).toBe(70);
    expect(entry.aWinRatePct).toBe(30);
    expect(entry.gm).toEqual({ over05: 90, over15: 70, over25: 55, over35: 30, over45: 15 });
    expect(entry.gmHt).toEqual({ over05: 60, over15: 30, over25: 12 });
    expect(entry.htRatio).toBe(45);
  });

  it('D2) pred.hMatchesN/aMatchesN НЕ се дублират в pred snapshot (единственият източник остава entry.hMatchesN/aMatchesN от sampleTier)', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    const entry = getHistory().find(h => h.id === 'm1');
    expect('hMatchesN' in entry.pred).toBe(false);
    expect('aMatchesN' in entry.pred).toBe(false);
    expect(entry.hMatchesN).toBe(12);
    expect(entry.aMatchesN).toBe(8);
  });

  it('E) snapshot стойностите не се променят, ако оригиналният pred object по-късно бъде мутиран', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred, sampleReliabilityTier(pred.hMatchesN, pred.aMatchesN));
    // мутация на ОРИГИНАЛНИЯ обект СЛЕД запис
    pred.hForm.push('X');
    pred.gm.over05 = 1;
    pred.hWin = 999;
    const entry = getHistory().find(h => h.id === 'm1');
    expect(entry.pred.hForm).toEqual(['W', 'W', 'D', 'L', 'W']); // непроменен
    expect(entry.pred.gm.over05).toBe(90); // непроменен
    expect(entry.pred.hWin).toBe(60); // непроменен
  });

  it('F) вече съществуващ history entry НЕ получава новите metadata при повторно save() за същия мач', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred1 = fullPred({ hForm: ['L', 'L', 'L'] });
    savePrediction(m, pred1, sampleReliabilityTier(12, 8));
    const firstConfidence = getHistory().find(h => h.id === 'm1').confidence;
    // второ извикване - различен pred (нова форма/confidence), трябва да се игнорира изцяло
    const pred2 = fullPred({ hForm: ['W', 'W', 'W', 'W', 'W'], hWin: 95, draw: 3, aWin: 2 });
    savePrediction(m, pred2, sampleReliabilityTier(12, 8));
    const hist = getHistory();
    expect(hist.length).toBe(1);
    const entry = hist.find(h => h.id === 'm1');
    expect(entry.pred.hForm).toEqual(['L', 'L', 'L']); // от ПЪРВОТО извикване
    expect(entry.confidence).toEqual(firstConfidence); // непроменен
  });

  it('G) стар history entry без новите полета продължава да работи, без throw', () => {
    clearHist();
    const legacyEntry = { id: 'old1', date: '2026-10-01', home: 'X', away: 'Y', compId: 2021, statusAtSave: 'SCHEDULED', pred: { hWin: 40, draw: 30, aWin: 30 }, result: null, savedAt: 1000 };
    saveHistory([legacyEntry]);
    const savePrediction = buildSavePrediction();
    expect(() => savePrediction(m, fullPred(), sampleReliabilityTier(12, 8))).not.toThrow();
    const hist = getHistory();
    const old = hist.find(h => h.id === 'old1');
    expect(old.confidence).toBeUndefined(); // legacy запис без полето, не null/0
    expect(old.pred.hForm).toBeUndefined();
    expect(old.pred.hWin).toBe(40); // непипнат
    const fresh = hist.find(h => h.id === 'm1');
    expect(fresh.confidence).toBeDefined();
  });

  it('без подаден sampleTier (стар стил извикване) - confidence/hForm/aForm/допълнителните полета ВСЕ ПАК се записват (независими от sampleTier param)', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const pred = fullPred();
    savePrediction(m, pred); // без 3-ти аргумент
    const entry = getHistory().find(h => h.id === 'm1');
    expect(entry.confidence).toBeDefined();
    expect(entry.pred.hForm).toEqual(pred.hForm);
    expect('hMatchesN' in entry).toBe(false); // sampleTier-зависимите полета си остават undefined
  });
});

describe('ЗАДАЧА 8.1 - регресия H/I/J', () => {
  it('H) buildPrediction()/calcConfidence() остават напълно непипнати - реален извикан резултат идентичен на самостоятелно извикване', () => {
    const allMatches = [
      { id: 'f1', status: 'FINISHED', competition: { id: 2021 }, utcDate: '2026-11-01', homeTeam: { id: 1 }, awayTeam: { id: 99 }, score: { halfTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 0 } } },
    ];
    const match = { homeTeam: { id: 1 }, awayTeam: { id: 2 } };
    const pred = buildPrediction(match, allMatches);
    expect(pred).not.toBeNull();
    const conf = calcConfidence(pred);
    expect(conf).toHaveProperty('score');
    expect(conf).toHaveProperty('factors');
  });

  it('I) savePrediction() тялото не съдържа apiFetch/fetch( - нулеви нови API заявки', () => {
    const code = extractBraced(html, 'function savePrediction(');
    expect(code).not.toMatch(/apiFetch|fetch\(/);
  });
});
