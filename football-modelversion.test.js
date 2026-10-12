// FOOTBALL DASHBOARD ЗАДАЧА 7.1 (виж "Prediction Model Versioning", одита от
// Задача №7, ЕТАП 3 - "историята не позволява разграничаване на прогнози
// преди/след PR #48/#49") - тества PREDICTION_MODEL_VERSION (football-logic.js)
// и РЕАЛНАТА savePrediction() (football.html, текстова екстракция, огледално
// на football-sampletier.test.js). Потвърждава точно одобрения обхват: ново
// поле modelVersion е ЧИСТО адитивно, записва се САМО при първоначално
// създаване, стари записи без него остават недокоснати, НЕ се приписва
// ретроактивно 'unknown'/'v1'/'v2'/'v3', calcCalibration()/buildPrediction()
// остават напълно непипнати.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  getHistory, saveHistory, HIST_KEY, PREDICTION_MODEL_VERSION,
  isPreMatchPrediction, isCrossProviderDuplicate, filterReliableHistory,
  buildCalibrationReport, sampleReliabilityTier,
} from './football-logic.js';

const html = fs.readFileSync('./football.html', 'utf8');
const KICKOFF = '2026-11-01T18:00:00Z';
const KICKOFF_MS = new Date(KICKOFF).getTime();
const TEST_COMPS_AS_MAP = { 2021: 39 };

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
  const fn = new Function('getHistory', 'saveHistory', 'PREDICTION_MODEL_VERSION', code + '\nreturn savePrediction;');
  return fn(getHistory, saveHistory, PREDICTION_MODEL_VERSION);
}
function clearHist() { try { localStorage.removeItem(HIST_KEY); } catch (e) {} }

describe('PREDICTION_MODEL_VERSION - ЗАДАЧА 7.1', () => {
  it('е документалният низ "v3" (текущата формула след PR #48/#49)', () => {
    expect(PREDICTION_MODEL_VERSION).toBe('v3');
  });
});

describe('savePrediction() записва modelVersion в НОВИ записи - ЗАДАЧА 7.1', () => {
  it('нов запис получава modelVersion=v3 (текущата константа)', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'm1', status: 'SCHEDULED', utcDate: KICKOFF, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021, name: 'PL' } };
    const pred = { hWin: 50, draw: 25, aWin: 25, over25: 55, btts: 45, g10: 20 };
    savePrediction(m, pred);
    const entry = getHistory().find(h => h.id === 'm1');
    expect(entry.modelVersion).toBe('v3');
  });

  it('повторно savePrediction() за СЪЩИЯ мач не презаписва нито modelVersion, нито pred, нито savedAt', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'dup1', status: 'SCHEDULED', utcDate: KICKOFF, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    savePrediction(m, { hWin: 50, draw: 25, aWin: 25, over25: 55, btts: 45, g10: 20 });
    const first = getHistory().find(h => h.id === 'dup1');
    const firstSavedAt = first.savedAt, firstModelVersion = first.modelVersion;
    // второ извикване - различни pred стойности, трябва да бъде изцяло игнорирано
    savePrediction(m, { hWin: 99, draw: 1, aWin: 0, over25: 10, btts: 5, g10: 1 });
    const hist = getHistory();
    expect(hist.length).toBe(1);
    const second = hist.find(h => h.id === 'dup1');
    expect(second.modelVersion).toBe(firstModelVersion);
    expect(second.savedAt).toBe(firstSavedAt);
    expect(second.pred.hWin).toBe(50); // не 99 - първият запис е запазен непроменен
  });

  it('стар запис без modelVersion (симулира история отпреди 7.1) остава БЕЗ полето - не се добавя ретроактивно', () => {
    clearHist();
    const legacyEntry = { id: 'old1', date: KICKOFF, home: 'X', away: 'Y', comp: 'PL', compId: 2021, statusAtSave: 'SCHEDULED', pred: { hWin: 40, draw: 30, aWin: 30 }, result: null, savedAt: 1000 };
    saveHistory([legacyEntry]);
    const savePrediction = buildSavePrediction();
    const m = { id: 'new1', status: 'SCHEDULED', utcDate: '2026-11-05T18:00:00Z', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    savePrediction(m, { hWin: 60, draw: 20, aWin: 20, over25: 50, btts: 50, g10: 20 });
    const hist = getHistory();
    const old = hist.find(h => h.id === 'old1');
    expect('modelVersion' in old).toBe(false); // НЕ 'unknown', НЕ 'v1'/'v2'/'v3' - просто липсва
    expect(old.pred.hWin).toBe(40); // непипнат стар запис
    const fresh = hist.find(h => h.id === 'new1');
    expect(fresh.modelVersion).toBe('v3');
  });

  it('LIVE/FINISHED статус не записва нищо - modelVersion не "изтича" покрай pre-match guard-а', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const liveMatch = { id: 'live1', status: 'IN_PLAY', utcDate: KICKOFF, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    savePrediction(liveMatch, { hWin: 50, draw: 25, aWin: 25 });
    expect(getHistory().length).toBe(0);
  });
});

describe('Резултатът може да се добави без загуба на modelVersion - ЗАДАЧА 7.1', () => {
  it('мутация на result (симулира updateHistoryResults()) запазва вече записания modelVersion', () => {
    clearHist();
    const savePrediction = buildSavePrediction();
    const m = { id: 'res1', status: 'SCHEDULED', utcDate: KICKOFF, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: { id: 2021 } };
    savePrediction(m, { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 45, g10: 20 });
    const hist = getHistory();
    const entry = hist.find(h => h.id === 'res1');
    expect(entry.result).toBeNull();
    entry.result = { hg: 2, ag: 1, total: 3, gg: true, winner: '1' }; // точно както updateHistoryResults() мутира
    saveHistory(hist);
    const reloaded = getHistory().find(h => h.id === 'res1');
    expect(reloaded.result.winner).toBe('1');
    expect(reloaded.modelVersion).toBe('v3'); // непипнато от добавянето на резултата
  });
});

describe('JSON serialization запазва modelVersion коректно - ЗАДАЧА 7.1', () => {
  it('round-trip през JSON.stringify/parse запазва точния низ', () => {
    const entry = { id: 'x', modelVersion: 'v3', pred: { hWin: 50 } };
    const roundTripped = JSON.parse(JSON.stringify(entry));
    expect(roundTripped.modelVersion).toBe('v3');
  });
  it('липсващо (undefined) modelVersion се изпуска изцяло при сериализация - не се превръща в null/"unknown"', () => {
    const entry = { id: 'x', pred: { hWin: 50 } }; // без modelVersion
    const json = JSON.stringify(entry);
    expect(json).not.toContain('modelVersion');
    const roundTripped = JSON.parse(json);
    expect('modelVersion' in roundTripped).toBe(false);
  });
});

describe('Pre-match проверките работят независимо от modelVersion - ЗАДАЧА 7.1', () => {
  it('isPreMatchPrediction() дава идентичен резултат със и без modelVersion полето', () => {
    const base = { savedAt: KICKOFF_MS - 60000, date: KICKOFF, statusAtSave: 'SCHEDULED' };
    expect(isPreMatchPrediction(base)).toBe(true);
    expect(isPreMatchPrediction({ ...base, modelVersion: 'v3' })).toBe(true);
    expect(isPreMatchPrediction({ ...base, savedAt: KICKOFF_MS + 60000, modelVersion: 'v3' })).toBe(false);
  });
});

describe('Cross-provider dedup работи независимо от modelVersion - ЗАДАЧА 7.1', () => {
  it('isCrossProviderDuplicate() не се влияе от присъствие/отсъствие на modelVersion', () => {
    const fdEntry = { id: 'fd1', compId: 2021, date: KICKOFF, home: 'Aston Villa', away: 'Brentford', modelVersion: 'v3' };
    const asEntry = { id: 'as_1', compId: 'as_39', date: KICKOFF, home: 'Aston Villa FC', away: 'Brentford FC' }; // без modelVersion (legacy)
    expect(isCrossProviderDuplicate(fdEntry, asEntry, TEST_COMPS_AS_MAP)).toBe(true);
  });
  it('filterReliableHistory() избира правилния canonical запис, modelVersion не влиза в избора', () => {
    function entry(overrides) {
      return {
        id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
        savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED',
        pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 },
        result: { winner: '1', total: 2, gg: false },
        ...overrides,
      };
    }
    const fdEntry = entry({ id: 'fd1', compId: 2021, savedAt: KICKOFF_MS - 120000, modelVersion: 'v3' });
    const asEntry = entry({ id: 'as1', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', savedAt: KICKOFF_MS - 30000 }); // без modelVersion
    const res = filterReliableHistory([asEntry, fdEntry], TEST_COMPS_AS_MAP);
    expect(res.reliable.length).toBe(1);
    expect(res.reliable[0].id).toBe('fd1'); // по-ранният savedAt, точно както без modelVersion полето
  });
});

describe('Calibration използва същите записи и същата логика - ЗАДАЧА 7.1', () => {
  function entry(overrides) {
    return {
      id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
      savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED',
      pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 },
      result: { winner: '1', total: 2, gg: false },
      ...overrides,
    };
  }
  it('buildCalibrationReport() дава ИДЕНТИЧЕН изход за записи със и без modelVersion (чисто декоративно поле)', () => {
    const withVersion = entry({ id: 'a', modelVersion: 'v3' });
    const withoutVersion = entry({ id: 'a' }); // без modelVersion - симулира стар запис
    const resWith = buildCalibrationReport([withVersion], TEST_COMPS_AS_MAP);
    const resWithout = buildCalibrationReport([withoutVersion], TEST_COMPS_AS_MAP);
    expect(resWith.markets).toEqual(resWithout.markets);
    expect(resWith.reliableCount).toBe(resWithout.reliableCount);
  });
  it('смесена история (едни записи v3, други без полето) се калибрира заедно, без грешка', () => {
    const mixed = [
      entry({ id: 'a', modelVersion: 'v3' }),
      entry({ id: 'b' }), // легаси, без modelVersion
    ];
    const res = buildCalibrationReport(mixed, TEST_COMPS_AS_MAP);
    expect(res.reliableCount).toBe(2);
    expect(res.markets.some(m => m.rows.length)).toBe(true);
  });
});
