// FOOTBALL DASHBOARD ЗАДАЧА 7.3 (виж "Version-Aware Calibration", одита от
// Задача №7.2 - "калибрацията не трябва да смесва прогнози от различни
// версии на модела"). Тества splitHistoryByModelVersion() (football-logic.js,
// pure, директен import) и РЕАЛНИТЕ calibrationReportSectionHtml()/
// calibrationHtml() (football.html, текстова екстракция, огледално на
// другите *.test.js файлове). Потвърждава точно одобрения обхват:
// filterReliableHistory()/isPreMatchPrediction()/isCrossProviderDuplicate()/
// calcCalibration()/buildCalibrationReport() остават НЕПИПНАТИ - само новия
// helper разделя историята ПРЕДИ да им я подаде, веднъж на версия/legacy.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { splitHistoryByModelVersion, buildCalibrationReport, filterReliableHistory } from './football-logic.js';

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
function buildCalibrationHtmlFn() {
  const sectionCode = extractBraced(html, 'function calibrationReportSectionHtml(');
  const mainCode = extractBraced(html, 'function calibrationHtml(');
  const fn = new Function(
    'splitHistoryByModelVersion', 'buildCalibrationReport', 'COMPS_AS_MAP', 'CALIBRATION_LOW_SAMPLE_N',
    sectionCode + '\n' + mainCode + '\nreturn calibrationHtml;'
  );
  return fn(splitHistoryByModelVersion, buildCalibrationReport, TEST_COMPS_AS_MAP, 10);
}

function entry(overrides) {
  return {
    id: 'x', date: KICKOFF, home: 'Aston Villa', away: 'Brentford', compId: 2021,
    savedAt: KICKOFF_MS - 60000, statusAtSave: 'SCHEDULED',
    pred: { hWin: 60, draw: 20, aWin: 20, over25: 55, btts: 50, g10: 20 },
    result: { winner: '1', total: 2, gg: false },
    ...overrides,
  };
}

describe('splitHistoryByModelVersion() - ЗАДАЧА 7.3', () => {
  it('само v3 - всичко в groups.v3, legacy празен', () => {
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: 'v3' })];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual(['v3']);
    expect(res.groups.v3.map(h => h.id)).toEqual(['a', 'b']);
    expect(res.legacy).toEqual([]);
  });

  it('само legacy (без modelVersion изобщо) - versions празен, всичко в legacy', () => {
    const hist = [entry({ id: 'a' }), entry({ id: 'b' })];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual([]);
    expect(res.legacy.map(h => h.id)).toEqual(['a', 'b']);
  });

  it('смесени v3 и legacy - коректно разделени, без пресичане', () => {
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b' }), entry({ id: 'c', modelVersion: 'v3' })];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual(['v3']);
    expect(res.groups.v3.map(h => h.id)).toEqual(['a', 'c']);
    expect(res.legacy.map(h => h.id)).toEqual(['b']);
  });

  it('v3 и бъдеща v4 - отделни групи, вярен числов ред (v3 преди v4)', () => {
    const hist = [entry({ id: 'a', modelVersion: 'v4' }), entry({ id: 'b', modelVersion: 'v3' })];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual(['v3', 'v4']);
    expect(res.groups.v3.map(h => h.id)).toEqual(['b']);
    expect(res.groups.v4.map(h => h.id)).toEqual(['a']);
  });

  it('v3, v4 и legacy едновременно - всяка група точно обособена, v4 НЕ протича в v3 или legacy', () => {
    const hist = [
      entry({ id: 'a', modelVersion: 'v3' }),
      entry({ id: 'b', modelVersion: 'v4' }),
      entry({ id: 'c' }),
      entry({ id: 'd', modelVersion: 'v4' }),
    ];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual(['v3', 'v4']);
    expect(res.groups.v3.map(h => h.id)).toEqual(['a']);
    expect(res.groups.v4.map(h => h.id)).toEqual(['b', 'd']);
    expect(res.legacy.map(h => h.id)).toEqual(['c']);
    // v4 записите не се появяват никъде извън groups.v4
    expect(res.groups.v3.some(h => h.id === 'b' || h.id === 'd')).toBe(false);
    expect(res.legacy.some(h => h.id === 'b' || h.id === 'd')).toBe(false);
  });

  it('v10 се сортира ЧИСЛОВО след v2/v3/v4 (не лексикографски преди v2)', () => {
    const hist = [entry({ id: 'a', modelVersion: 'v10' }), entry({ id: 'b', modelVersion: 'v2' }), entry({ id: 'c', modelVersion: 'v3' })];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual(['v2', 'v3', 'v10']);
  });

  it('празна история - []/null/undefined дават версии=[], legacy=[]', () => {
    expect(splitHistoryByModelVersion([])).toEqual({ versions: [], groups: {}, legacy: [] });
    expect(splitHistoryByModelVersion(null)).toEqual({ versions: [], groups: {}, legacy: [] });
    expect(splitHistoryByModelVersion(undefined)).toEqual({ versions: [], groups: {}, legacy: [] });
  });

  it('липсваща modelVersion (полето изобщо го няма) - в legacy', () => {
    const hist = [entry({ id: 'a' })];
    delete hist[0].modelVersion;
    const res = splitHistoryByModelVersion(hist);
    expect(res.legacy.map(h => h.id)).toEqual(['a']);
    expect(res.versions).toEqual([]);
  });

  it('null/невалидна версия (null, undefined, число, празен низ, обект) - всички в legacy, никога собствена група', () => {
    const hist = [
      entry({ id: 'a', modelVersion: null }),
      entry({ id: 'b', modelVersion: undefined }),
      entry({ id: 'c', modelVersion: 123 }),
      entry({ id: 'd', modelVersion: '' }),
      entry({ id: 'e', modelVersion: {} }),
    ];
    const res = splitHistoryByModelVersion(hist);
    expect(res.versions).toEqual([]); // нито 'null'/'123'/'' не стават group keys
    expect(res.legacy.map(h => h.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('непроменен входен масив - splitHistoryByModelVersion() не мутира history', () => {
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b' })];
    const snapshot = JSON.parse(JSON.stringify(hist));
    splitHistoryByModelVersion(hist);
    expect(hist).toEqual(snapshot);
    expect(hist.length).toBe(2); // не е splice-нат/presortиран на място
  });

  it('непроменени отделни записи - никое поле на изходните обекти не се пипа', () => {
    const a = entry({ id: 'a', modelVersion: 'v3' });
    const snapshotA = JSON.parse(JSON.stringify(a));
    splitHistoryByModelVersion([a]);
    expect(a).toEqual(snapshotA);
  });
});

describe('calibrationHtml() - ЗАДАЧА 7.3: отделни отчети по версия, никога смесена калибрация', () => {
  it('само v3 - ЕДНА секция "Модел v3", без legacy заглавие', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: 'v3', winner: '1' })];
    const out = calibrationHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).not.toContain('По-стари версии');
  });

  it('само legacy - ЕДНА секция "По-стари версии / неизвестна версия", без "Модел v3"', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [entry({ id: 'a' }), entry({ id: 'b' })];
    const out = calibrationHtml(hist);
    expect(out).toContain('По-стари версии / неизвестна версия');
    expect(out).not.toContain('Модел v3');
  });

  it('смесени v3 и legacy - ДВЕ отделни секции, transparency броите НЕ се смесват', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [
      entry({ id: 'a', modelVersion: 'v3' }),
      entry({ id: 'b', modelVersion: 'v3' }),
      entry({ id: 'c' }), // legacy
    ];
    const out = calibrationHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('По-стари версии / неизвестна версия');
    // v3 секцията трябва да отрази 2 общо записи, legacy секцията - 1
    const v3Idx = out.indexOf('Модел v3');
    const legacyIdx = out.indexOf('По-стари версии');
    const v3Chunk = out.slice(v3Idx, legacyIdx);
    const legacyChunk = out.slice(legacyIdx);
    expect(v3Chunk).toContain('общо записи: 2');
    expect(legacyChunk).toContain('общо записи: 1');
  });

  it('v3 и бъдеща v4 - ДВЕ отделни "Модел" секции, никога обща', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: 'v4' })];
    const out = calibrationHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Модел v4');
    const v3Idx = out.indexOf('Модел v3');
    const v4Idx = out.indexOf('Модел v4');
    const v3Chunk = out.slice(v3Idx, v4Idx);
    expect(v3Chunk).toContain('общо записи: 1'); // само v3-записа, не 2
  });

  it('v3, v4 и legacy едновременно - ТРИ отделни секции с коректни отделни бройки', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [
      entry({ id: 'a', modelVersion: 'v3' }),
      entry({ id: 'b', modelVersion: 'v4' }),
      entry({ id: 'c', modelVersion: 'v4' }),
      entry({ id: 'd' }),
    ];
    const out = calibrationHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Модел v4');
    expect(out).toContain('По-стари версии / неизвестна версия');
    const v4Idx = out.indexOf('Модел v4');
    const legacyIdx = out.indexOf('По-стари версии');
    expect(out.slice(v4Idx, legacyIdx)).toContain('общо записи: 2'); // 'b' и 'c'
  });

  it('празна история - calibrationHtml([]) не рендира нищо', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    expect(calibrationHtml([])).toBe('');
  });

  it('версия с 0 надеждни (всички pending, result:null) - показва изрично "няма достатъчно данни", не скрива секцията', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const hist = [entry({ id: 'a', modelVersion: 'v3', result: null })];
    const out = calibrationHtml(hist);
    expect(out).toContain('Модел v3');
    expect(out).toContain('Няма достатъчно данни');
  });

  it('pre-match filtering работи вътре във всяка версионна секция - закъснял запис се изключва от reliableCount', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const late = entry({ id: 'late', modelVersion: 'v3', savedAt: KICKOFF_MS + 60000, statusAtSave: 'IN_PLAY' });
    const hist = [entry({ id: 'ok', modelVersion: 'v3' }), late];
    const out = calibrationHtml(hist);
    const v3Idx = out.indexOf('Модел v3');
    expect(out.slice(v3Idx)).toContain('изкл. закъснели: 1');
    expect(out.slice(v3Idx)).toContain('валидни pre-match: 1');
  });

  it('cross-provider dedup работи вътре във версионна секция - дубликат се изключва, брои се в excludedDuplicate', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const fdEntry = entry({ id: 'fd1', modelVersion: 'v3', compId: 2021, savedAt: KICKOFF_MS - 120000 });
    const asEntry = entry({ id: 'as1', modelVersion: 'v3', compId: 'as_39', home: 'Aston Villa FC', away: 'Brentford FC', savedAt: KICKOFF_MS - 30000 });
    const out = calibrationHtml([fdEntry, asEntry]);
    const v3Idx = out.indexOf('Модел v3');
    expect(out.slice(v3Idx)).toContain('изкл. дублирани: 1');
    expect(out.slice(v3Idx)).toContain('валидни pre-match: 1');
  });

  it('decidedAfterRegulation записи се изключват от конкретната версионна калибрация', () => {
    const calibrationHtml = buildCalibrationHtmlFn();
    const extraTime = entry({ id: 'et', modelVersion: 'v3', result: { decidedAfterRegulation: true, fullHg: 2, fullAg: 1 } });
    const hist = [entry({ id: 'ok', modelVersion: 'v3' }), extraTime];
    const out = calibrationHtml(hist);
    const v3Idx = out.indexOf('Модел v3');
    expect(out.slice(v3Idx)).toContain('резолвнати: 1'); // само 'ok', не 'et'
    expect(out.slice(v3Idx)).toContain('валидни pre-match: 1');
  });
});

describe('ЗАДАЧА 7.3 - регресия: filterReliableHistory()/buildCalibrationReport() остават напълно непипнати', () => {
  it('filterReliableHistory() дава идентичен резултат със и без modelVersion в записите', () => {
    const withVersion = [entry({ id: 'a', modelVersion: 'v3' })];
    const withoutVersion = [entry({ id: 'a' })];
    const resWith = filterReliableHistory(withVersion, TEST_COMPS_AS_MAP);
    const resWithout = filterReliableHistory(withoutVersion, TEST_COMPS_AS_MAP);
    expect(resWith.reliable.length).toBe(resWithout.reliable.length);
    expect(resWith.totalHistory).toBe(resWithout.totalHistory);
  });
  it('buildCalibrationReport() за единична версия дава същите markets като директно подаване на нейния подмасив', () => {
    const v3Only = [entry({ id: 'a', modelVersion: 'v3' }), entry({ id: 'b', modelVersion: 'v3' })];
    const split = splitHistoryByModelVersion(v3Only);
    const viaSplit = buildCalibrationReport(split.groups.v3, TEST_COMPS_AS_MAP);
    const direct = buildCalibrationReport(v3Only, TEST_COMPS_AS_MAP);
    expect(viaSplit).toEqual(direct); // тук идентични, понеже всичко е v3 - доказва нулева регресия в самата функция
  });
});
