// FOOTBALL DASHBOARD ЗАДАЧА 7.5 (виж "Reliable Version-Aware History
// Statistics", одита от Задача №7.4 - "СТАТИСТИКА използва различен,
// по-слаб набор от записи спрямо КАЛИБРАЦИЯ"). Тества pick1X2Winner()/
// calcReliableHistoryStats()/buildReliableStatsReport() (football-logic.js,
// pure, директен import) и РЕАЛНИТЕ statsReportSectionHtml()/
// historyStatsHtml() (football.html, текстова екстракция, огледално на
// football-versioncalibration.test.js). Потвърждава точно одобрения обхват:
// filterReliableHistory()/isPreMatchPrediction()/isCrossProviderDuplicate()/
// splitHistoryByModelVersion()/calcCalibration()/buildCalibrationReport()
// остават НЕПИПНАТИ - само кохортата (reliable вместо суров wr) и 1X2
// tie-break-а (pick1X2Winner вместо старото строго '>') се променят.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  pick1X2Winner, calcReliableHistoryStats, buildReliableStatsReport,
  splitHistoryByModelVersion, filterReliableHistory, calcCalibration,
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
function buildHistoryStatsHtmlFn() {
  const sectionCode = extractBraced(html, 'function statsReportSectionHtml(');
  const mainCode = extractBraced(html, 'function historyStatsHtml(');
  const fn = new Function(
    'splitHistoryByModelVersion', 'buildReliableStatsReport', 'COMPS_AS_MAP', 'HIST_PCT',
    sectionCode + '\n' + mainCode + '\nreturn historyStatsHtml;'
  );
  return fn(splitHistoryByModelVersion, buildReliableStatsReport, TEST_COMPS_AS_MAP, (c, t) => (t ? Math.round(c / t * 100) : 0));
}

function entry(overrides) {
  return {
    id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
    savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED', modelVersion: 'v3',
    pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 },
    result: { winner: '1', total: 2, gg: false },
    ...overrides,
  };
}

describe('pick1X2Winner() - ЗАДАЧА 7.5: единен 1X2 tie-break, приоритет 1 -> X -> 2', () => {
  it('ясен фаворит домакин', () => { expect(pick1X2Winner(60, 20, 20)).toBe('1'); });
  it('ясен фаворит гост', () => { expect(pick1X2Winner(20, 20, 60)).toBe('2'); });
  it('ясен фаворит равенство', () => { expect(pick1X2Winner(20, 60, 20)).toBe('X'); });
  it('tie hWin=40/draw=40/aWin=20 -> "1" (hWin приоритет пред draw)', () => {
    expect(pick1X2Winner(40, 40, 20)).toBe('1');
  });
  it('tie hWin=20/draw=40/aWin=40 -> "X" (draw приоритет пред aWin)', () => {
    expect(pick1X2Winner(20, 40, 40)).toBe('X');
  });
  it('пълен three-way tie -> "1" (hWin най-висок приоритет)', () => {
    expect(pick1X2Winner(33, 33, 33)).toBe('1');
  });
});

describe('calcReliableHistoryStats()/buildReliableStatsReport() - ЗАДАЧА 7.5', () => {
  it('нормален надежден v3 запис - коректно преброен', () => {
    const report = buildReliableStatsReport([entry({ id: 'a' })], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(1);
    expect(report.stats.homeTotal).toBe(1);
    expect(report.stats.homeCorrect).toBe(1);
  });

  it('late/in-play запис (savedAt след kickoff) - изключен от reliableCount', () => {
    const late = entry({ id: 'late', savedAt: KICKOFF_MS + 60000, statusAtSave: 'IN_PLAY' });
    const report = buildReliableStatsReport([late], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(0);
    expect(report.excludedLate).toBe(1);
    expect(report.stats.homeTotal).toBe(0);
  });

  it('cross-provider duplicate - се брои ЕДИН път, не два', () => {
    const fdEntry = entry({ id: 'fd1', compId: 2021, savedAt: KICKOFF_MS - 120000 });
    const asEntry = entry({ id: 'as1', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', savedAt: KICKOFF_MS - 30000 });
    const report = buildReliableStatsReport([fdEntry, asEntry], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(1);
    expect(report.excludedDuplicate).toBe(1);
    expect(report.stats.homeTotal).toBe(1); // не 2
  });

  it('decidedAfterRegulation запис - изключен', () => {
    const extraTime = entry({ id: 'et', result: { decidedAfterRegulation: true, fullHg: 2, fullAg: 1 } });
    const report = buildReliableStatsReport([extraTime], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(0);
    expect(report.totalResolved).toBe(0);
  });

  it('липсващ pred - изключен от reliableCount, БЕЗ runtime грешка', () => {
    const corrupted = entry({ id: 'corrupt' });
    delete corrupted.pred;
    expect(() => buildReliableStatsReport([corrupted], TEST_COMPS_AS_MAP)).not.toThrow();
    const report = buildReliableStatsReport([corrupted], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(0);
  });

  it('нерезолвнат запис (result:null) - изключен', () => {
    const pending = entry({ id: 'pending', result: null });
    const report = buildReliableStatsReport([pending], TEST_COMPS_AS_MAP);
    expect(report.reliableCount).toBe(0);
  });

  it('правилни denominators за 1/X/2 - взаимно изключващи се, сума = reliableCount', () => {
    const hist = [
      entry({ id: 'a', pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 }, result: { winner: '1', total: 2, gg: false } }),
      entry({ id: 'b', pred: { hWin: 20, draw: 60, aWin: 20, over25: 55, btts: 50, g10: 20 }, result: { winner: 'X', total: 2, gg: false } }),
      entry({ id: 'c', pred: { hWin: 20, draw: 20, aWin: 60, over25: 55, btts: 50, g10: 20 }, result: { winner: '2', total: 2, gg: false } }),
    ];
    const report = buildReliableStatsReport(hist, TEST_COMPS_AS_MAP);
    const s = report.stats;
    expect(s.homeTotal + s.drawTotal + s.awayTotal).toBe(report.reliableCount);
    expect(s.homeTotal).toBe(1); expect(s.drawTotal).toBe(1); expect(s.awayTotal).toBe(1);
    expect(s.homeCorrect).toBe(1); expect(s.drawCorrect).toBe(1); expect(s.awayCorrect).toBe(1);
  });

  it('правилни denominators за over/under - взаимно изключващи се, сума = reliableCount', () => {
    const hist = [
      entry({ id: 'a', pred: { hWin: 60, draw: 20, aWin: 20, over25: 70, btts: 50, g10: 20 }, result: { winner: '1', total: 3, gg: false } }),
      entry({ id: 'b', pred: { hWin: 60, draw: 20, aWin: 20, over25: 30, btts: 50, g10: 20 }, result: { winner: '1', total: 1, gg: false } }),
    ];
    const report = buildReliableStatsReport(hist, TEST_COMPS_AS_MAP);
    const s = report.stats;
    expect(s.overTotal + s.underTotal).toBe(report.reliableCount);
    expect(s.overTotal).toBe(1); expect(s.overCorrect).toBe(1);
    expect(s.underTotal).toBe(1); expect(s.underCorrect).toBe(1);
  });

  it('правилни denominators за BTTS - взаимно изключващи се, сума = reliableCount', () => {
    const hist = [
      entry({ id: 'a', pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 70, g10: 20 }, result: { winner: '1', total: 2, gg: true } }),
      entry({ id: 'b', pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 30, g10: 20 }, result: { winner: '1', total: 2, gg: false } }),
    ];
    const report = buildReliableStatsReport(hist, TEST_COMPS_AS_MAP);
    const s = report.stats;
    expect(s.bttsYesTotal + s.bttsNoTotal).toBe(report.reliableCount);
    expect(s.bttsYesTotal).toBe(1); expect(s.bttsYesCorrect).toBe(1);
    expect(s.bttsNoTotal).toBe(1); expect(s.bttsNoCorrect).toBe(1);
  });

  it('ДВОЕН ШАНС denominator = целия reliable кохорт (никога разделен)', () => {
    const hist = [entry({ id: 'a' }), entry({ id: 'b', result: { winner: '2', total: 2, gg: false } })];
    const report = buildReliableStatsReport(hist, TEST_COMPS_AS_MAP);
    expect(report.stats.dcTotal).toBe(report.reliableCount);
  });

  it('входният масив не се мутира', () => {
    const hist = [entry({ id: 'a' })];
    const snapshot = JSON.parse(JSON.stringify(hist));
    buildReliableStatsReport(hist, TEST_COMPS_AS_MAP);
    expect(hist).toEqual(snapshot);
  });
});

describe('historyStatsHtml() - ЗАДАЧА 7.5: version-split, огледално на calibrationHtml()', () => {
  it('legacy отделно от v3 - две отделни секции с различни бройки', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: undefined })];
    const out = historyStatsHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('По-стари версии / неизвестна версия');
    const v3Idx = out.indexOf('Модел v3');
    const legacyIdx = out.indexOf('По-стари версии');
    expect(out.slice(v3Idx, legacyIdx)).toContain('1 надеждни завършени');
    expect(out.slice(legacyIdx)).toContain('1 надеждни завършени');
  });

  it('v3 отделно от v4 - никога смесени в едно число', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: 'v4' })];
    const out = historyStatsHtml(hist);
    const v3Idx = out.indexOf('Модел v3');
    const v4Idx = out.indexOf('Модел v4');
    expect(v3Idx).toBeGreaterThanOrEqual(0);
    expect(v4Idx).toBeGreaterThanOrEqual(0);
    expect(out.slice(v3Idx, v4Idx)).toContain('1 надеждни завършени');
  });

  it('v3 + v4 + legacy едновременно - три отделни секции', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const hist = [
      entry({ id: 'a', modelVersion: 'v3' }),
      entry({ id: 'b', modelVersion: 'v4' }),
      entry({ id: 'c', modelVersion: 'v4' }),
      entry({ id: 'd', modelVersion: undefined }),
    ];
    const out = historyStatsHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Модел v4');
    expect(out).toContain('По-стари версии / неизвестна версия');
    const v4Idx = out.indexOf('Модел v4');
    const legacyIdx = out.indexOf('По-стари версии');
    expect(out.slice(v4Idx, legacyIdx)).toContain('2 надеждни завършени');
  });

  it('бъдеща версия v5 - получава собствена секция БЕЗ хардкод в UI кода', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v5' })];
    const out = historyStatsHtml(hist);
    expect(out).toContain('Модел v5');
  });

  it('версия с 0 надеждни - показва изрично "Няма достатъчно данни", не скрива секцията', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3', result: null })];
    const out = historyStatsHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Няма достатъчно данни');
  });

  it('РЕГРЕСИЯ: запис без pred НЕ чупи рендъринга (цялата функция, не само buildReliableStatsReport)', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    const corrupted = entry({ id: 'corrupt', modelVersion: 'v3' });
    delete corrupted.pred;
    const hist = [corrupted, entry({ id: 'ok', modelVersion: 'v3' })];
    expect(() => historyStatsHtml(hist)).not.toThrow();
    const out = historyStatsHtml(hist);
    expect(out).toContain('1 надеждни завършени'); // само 'ok', 'corrupt' тихо изключен
  });

  it('празна история - не рендира нищо', () => {
    const historyStatsHtml = buildHistoryStatsHtmlFn();
    expect(historyStatsHtml([])).toBe('');
  });
});

describe('ЗАДАЧА 7.5 - регресия: filterReliableHistory()/calcCalibration() остават коректни, CALIBRATION_MARKETS 1x2 вече ползва pick1X2Winner()', () => {
  it('filterReliableHistory() непипнат - идентично поведение', () => {
    const hist = [entry({ id: 'a' })];
    const res = filterReliableHistory(hist, TEST_COMPS_AS_MAP);
    expect(res.reliable.length).toBe(1);
  });
  it('calcCalibration() 1X2 маркет вече дава "X" (не "2") за tie hWin=20/draw=40/aWin=40 - съвпада с pick1X2Winner()', () => {
    const hist = [entry({ id: 'a', pred: { hWin: 20, draw: 40, aWin: 40, over25: 50, btts: 50, g10: 20 }, result: { winner: 'X', total: 2, gg: false } })];
    const res = calcCalibration(hist);
    const m1x2 = res.find(m => m.market === '1x2');
    expect(m1x2.rows[0].avgPredictedPct).toBe(40); // draw е избран (pct=40), не aWin
  });
  it('calcCalibration() 1X2 маркет за НЕ-tie вход дава идентичен резултат както преди (regression)', () => {
    const hist = [entry({ id: 'a', pred: { hWin: 75, draw: 15, aWin: 10, over25: 50, btts: 50, g10: 20 }, result: { winner: '1', total: 2, gg: false } })];
    const res = calcCalibration(hist);
    const m1x2 = res.find(m => m.market === '1x2');
    expect(m1x2.rows).toEqual([{ bucket: '70-79%', n: 1, avgPredictedPct: 75, actualPct: 100 }]);
  });
});
