// FOOTBALL DASHBOARD ЗАДАЧА 7.7 (виж "1X2 Proper Scoring Metrics",
// спецификацията от READ-ONLY одита Задача №7.6, с изрична корекция:
// ε=1e-15 - numerical safety guard срещу ln(0), НЕ омекотяване на лоши
// прогнози). Тества calc1X2ProperScores()/buildProperScoresReport()
// (football-logic.js, pure, директен import) и РЕАЛНАТА properScoresHtml()
// (football.html, текстова екстракция, огледално на
// football-versioncalibration.test.js/football-reliablestats.test.js).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  calc1X2ProperScores, buildProperScoresReport,
  splitHistoryByModelVersion, filterReliableHistory,
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
function buildProperScoresHtmlFn() {
  const warnCode = extractBraced(html, 'const PROPER_SCORES_SAMPLE_WARNINGS=') + ';';
  const sectionCode = extractBraced(html, 'function properScoresReportSectionHtml(');
  const mainCode = extractBraced(html, 'function properScoresHtml(');
  const fn = new Function(
    'splitHistoryByModelVersion', 'buildProperScoresReport', 'COMPS_AS_MAP',
    warnCode + '\n' + sectionCode + '\n' + mainCode + '\nreturn properScoresHtml;'
  );
  return fn(splitHistoryByModelVersion, buildProperScoresReport, TEST_COMPS_AS_MAP);
}

function e(hWin, draw, aWin, winner, overrides) {
  return { pred: { hWin, draw, aWin }, result: { winner }, ...overrides };
}
function reliableEntry(overrides) {
  return {
    id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
    savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED', modelVersion: 'v3',
    pred: { hWin: 60, draw: 20, aWin: 20 },
    result: { winner: '1' },
    ...overrides,
  };
}

describe('calc1X2ProperScores() - ЗАДАЧА 7.7: synthetic A-G от спецификацията', () => {
  it('A) 100/0/0, winner=1 -> Brier=0, LogLoss=0 (perfect)', () => {
    const r = calc1X2ProperScores([e(100, 0, 0, '1')]);
    expect(r.validCount).toBe(1);
    expect(r.brier).toBe(0);
    expect(r.logLoss).toBe(0);
  });

  it('B) uniform 33.333/33.333/33.334 -> Brier≈0.667, LogLoss≈1.099 (baseline)', () => {
    const r = calc1X2ProperScores([e(33.333, 33.333, 33.334, '1')]);
    expect(r.brier).toBeCloseTo(2 / 3, 3);
    expect(r.logLoss).toBeCloseTo(Math.log(3), 3);
  });

  it('C) 80/10/10, winner=1 -> Brier=0.06, LogLoss≈0.223143 (-ln(0.8))', () => {
    const r = calc1X2ProperScores([e(80, 10, 10, '1')]);
    expect(r.brier).toBeCloseTo(0.06, 10);
    expect(r.logLoss).toBeCloseTo(-Math.log(0.8), 10);
  });

  it('D) 80/10/10, winner=2 -> Brier=1.46, LogLoss≈2.302585 (-ln(0.1))', () => {
    const r = calc1X2ProperScores([e(80, 10, 10, '2')]);
    expect(r.brier).toBeCloseTo(1.46, 10);
    expect(r.logLoss).toBeCloseTo(-Math.log(0.1), 10);
  });

  it('E) 100/0/0, winner=2 -> Brier=2 (worst), LogLoss≈34.538776 (-ln(1e-15), УМИШЛЕНО силна санкция)', () => {
    const r = calc1X2ProperScores([e(100, 0, 0, '2')]);
    expect(r.brier).toBe(2);
    expect(r.logLoss).toBeCloseTo(-Math.log(1e-15), 6);
    expect(r.logLoss).toBeCloseTo(34.538776, 5);
  });

  it('F) invalid sum (110) -> excluded, не влиза в validCount', () => {
    const r = calc1X2ProperScores([e(50, 30, 30, '1')]);
    expect(r.validCount).toBe(0);
    expect(r.excludedInvalid).toBe(1);
    expect(r.brier).toBeNull();
    expect(r.logLoss).toBeNull();
  });

  it('G) invalid winner ("draw" вместо "X") -> excluded', () => {
    const r = calc1X2ProperScores([e(50, 30, 20, 'draw')]);
    expect(r.validCount).toBe(0);
    expect(r.excludedInvalid).toBe(1);
  });
});

describe('calc1X2ProperScores() - ЗАДАЧА 7.7: допълнителна validation', () => {
  it('NaN hWin -> excluded', () => {
    expect(calc1X2ProperScores([e(NaN, 10, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('Infinity draw -> excluded', () => {
    expect(calc1X2ProperScores([e(50, Infinity, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('отрицателна вероятност -> excluded', () => {
    expect(calc1X2ProperScores([e(-5, 95, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('вероятност >100 -> excluded', () => {
    expect(calc1X2ProperScores([e(150, 10, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('sum=99 -> accepted + renormalized (НЕ excluded)', () => {
    const r = calc1X2ProperScores([e(79, 10, 10, '1')]);
    expect(r.validCount).toBe(1);
    expect(r.excludedInvalid).toBe(0);
    const p1 = 79 / 99, pX = 10 / 99, p2 = 10 / 99;
    const expectedBrier = (p1 - 1) ** 2 + pX ** 2 + p2 ** 2;
    expect(r.brier).toBeCloseTo(expectedBrier, 10);
    expect(r.logLoss).toBeCloseTo(-Math.log(p1), 10);
  });
  it('sum=101 -> accepted + renormalized (НЕ excluded)', () => {
    const r = calc1X2ProperScores([e(81, 10, 10, '1')]);
    expect(r.validCount).toBe(1);
    expect(r.excludedInvalid).toBe(0);
    const p1 = 81 / 101;
    expect(r.logLoss).toBeCloseTo(-Math.log(p1), 10);
  });
  it('sum=98 -> excluded (извън [99,101])', () => {
    expect(calc1X2ProperScores([e(78, 10, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('sum=102 -> excluded (извън [99,101])', () => {
    expect(calc1X2ProperScores([e(82, 10, 10, '1')]).excludedInvalid).toBe(1);
  });
  it('празен entries масив -> validCount=0, sampleTier="none", без throw', () => {
    const r = calc1X2ProperScores([]);
    expect(r.validCount).toBe(0);
    expect(r.excludedInvalid).toBe(0);
    expect(r.sampleTier).toBe('none');
    expect(r.brier).toBeNull();
    expect(r.logLoss).toBeNull();
  });
  it('липсващ pred/result -> excluded, без throw', () => {
    expect(() => calc1X2ProperScores([{ id: 'x' }])).not.toThrow();
    expect(calc1X2ProperScores([{ id: 'x' }]).excludedInvalid).toBe(1);
  });
  it('не мутира входния масив/отделните записи', () => {
    const entries = [e(80, 10, 10, '1')];
    const snapshot = JSON.parse(JSON.stringify(entries));
    calc1X2ProperScores(entries);
    expect(entries).toEqual(snapshot);
  });
});

describe('calc1X2ProperScores() - ЗАДАЧА 7.7: sampleTier прагове (UI heuristic)', () => {
  const cases = [
    [0, 'none'],
    [1, 'extremely_small'],
    [4, 'extremely_small'],
    [5, 'small'],
    [9, 'small'],
    [10, 'moderate'],
    [29, 'moderate'],
    [30, 'more_reliable'],
    [50, 'more_reliable'],
  ];
  cases.forEach(([n, expectedTier]) => {
    it(`validCount=${n} -> sampleTier="${expectedTier}"`, () => {
      const entries = Array.from({ length: n }, () => e(80, 10, 10, '1'));
      expect(calc1X2ProperScores(entries).sampleTier).toBe(expectedTier);
    });
  });
});

describe('buildProperScoresReport() - ЗАДАЧА 7.7: ползва СЪЩЕСТВУВАЩИЯ filterReliableHistory(), не паралелен pipeline', () => {
  it('late/in-play запис -> excluded от validCount (чрез filterReliableHistory, не calc1X2ProperScores)', () => {
    const late = reliableEntry({ id: 'late', savedAt: KICKOFF_MS + 60000, statusAtSave: 'IN_PLAY' });
    const report = buildProperScoresReport([late], TEST_COMPS_AS_MAP);
    expect(report.validCount).toBe(0);
    expect(report.excludedLate).toBe(1);
  });
  it('cross-provider duplicate -> брои се веднъж', () => {
    const fdEntry = reliableEntry({ id: 'fd1', compId: 2021, savedAt: KICKOFF_MS - 120000 });
    const asEntry = reliableEntry({ id: 'as1', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', savedAt: KICKOFF_MS - 30000 });
    const report = buildProperScoresReport([fdEntry, asEntry], TEST_COMPS_AS_MAP);
    expect(report.validCount).toBe(1);
    expect(report.excludedDuplicate).toBe(1);
  });
  it('decidedAfterRegulation -> excluded', () => {
    const extraTime = reliableEntry({ id: 'et', result: { decidedAfterRegulation: true, fullHg: 2, fullAg: 1 } });
    const report = buildProperScoresReport([extraTime], TEST_COMPS_AS_MAP);
    expect(report.validCount).toBe(0);
    expect(report.totalResolved).toBe(0);
  });
  it('нормален надежден v3 запис -> коректно оценен', () => {
    const report = buildProperScoresReport([reliableEntry({ id: 'ok' })], TEST_COMPS_AS_MAP);
    expect(report.validCount).toBe(1);
    expect(report.brier).toBeCloseTo((0.6 - 1) ** 2 + 0.2 ** 2 + 0.2 ** 2, 10);
  });
  it('reliable filtering се запазва - идентично поведение на filterReliableHistory()', () => {
    const hist = [reliableEntry({ id: 'a' })];
    const f = filterReliableHistory(hist, TEST_COMPS_AS_MAP);
    const report = buildProperScoresReport(hist, TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(f.reliable.length);
  });
});

describe('properScoresHtml() - ЗАДАЧА 7.7: version split, огледално на calibrationHtml()/historyStatsHtml()', () => {
  it('v3 отделно от v4 - никога смесени в едно число', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [reliableEntry({ id: 'a', modelVersion: 'v3' }), reliableEntry({ id: 'b', modelVersion: 'v4' })];
    const out = properScoresHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Модел v4');
    const v3Idx = out.indexOf('Модел v3');
    const v4Idx = out.indexOf('Модел v4');
    expect(out.slice(v3Idx, v4Idx)).toContain('N=1');
  });

  it('v3 + v4 + legacy едновременно - три отделни секции', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [
      reliableEntry({ id: 'a', modelVersion: 'v3' }),
      reliableEntry({ id: 'b', modelVersion: 'v4' }),
      reliableEntry({ id: 'c', modelVersion: undefined }),
    ];
    const out = properScoresHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Модел v4');
    expect(out).toContain('По-стари версии / неизвестна версия');
  });

  it('бъдеща версия v5 - получава собствена секция без хардкод', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [reliableEntry({ id: 'a', modelVersion: 'v5' })];
    const out = properScoresHtml(hist);
    expect(out).toContain('Модел v5');
  });

  it('0 валидни записи - показва изрично "Няма достатъчно данни"', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [reliableEntry({ id: 'a', modelVersion: 'v3', result: null })];
    const out = properScoresHtml(hist);
    expect(out).toContain('Няма достатъчно данни');
  });

  it('малка извадка - показва ⚠️ предупреждение, не го скрива', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [reliableEntry({ id: 'a', modelVersion: 'v3' })]; // N=1 -> extremely_small
    const out = properScoresHtml(hist);
    expect(out).toContain('Крайно малка извадка');
  });

  it('UI изрично обозначава Brier Score convention-а (sum, 0-2) и Log Loss (natural log)', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    const hist = [reliableEntry({ id: 'a', modelVersion: 'v3' })];
    const out = properScoresHtml(hist);
    expect(out).toContain('sum');
    expect(out).toContain('0–2');
    expect(out).toContain('natural log');
  });

  it('празна история - не рендира нищо', () => {
    const properScoresHtml = buildProperScoresHtmlFn();
    expect(properScoresHtml([])).toBe('');
  });
});
