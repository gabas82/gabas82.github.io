// Тества РЕАЛНАТА buildBetBuilder() от football.html (не копие) - извлечена с
// текстова екстракция (огледално на техниката за worker.js в Signal-scanner),
// понеже football.html е обикновен <script> (не ES модул) и buildBetBuilder()
// не е expor-тната през football-logic.js. calcOverBttsJoint идва от
// football-logic.js (истинският модул), точно както football.html го ползва
// като глобална функция след <script src="football-logic.js">.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { calcOverBttsJoint, calcGoalMarkets } from './football-logic.js';

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

const html = fs.readFileSync('./football.html', 'utf8');
const code = extractFunction(html, 'buildBetBuilder');
const module_ = { exports: {} };
const fn = new Function('module', 'calcOverBttsJoint', code + `
return buildBetBuilder;
`);
const buildBetBuilder = fn(module_, calcOverBttsJoint);

function basePred(overrides = {}) {
  return {
    hWin: 30, draw: 30, aWin: 40, over25: 40, under25: 60, btts: 40, noBtts: 60,
    expH: '1.0', expA: '1.0', gm: calcGoalMarkets(1.0, 1.0),
    ...overrides,
  };
}

describe('buildBetBuilder - БЕЗ СИГНАЛ', () => {
  it('връща явен БЕЗ СИГНАЛ блок (не празен низ), когато няма достатъчно силна комбинация', () => {
    // Нарочно балансирана прогноза - нищо не пресича никакъв праг за избор:
    // 1X2 без фаворит/реми (hWin/aWin<60, draw<30), Г/Г близо до 50/50,
    // over25/under25 далеч от праговете, без голмайстори.
    const pred = basePred({
      hWin: 36, draw: 28, aWin: 36, over25: 22, under25: 78, btts: 50, noBtts: 50,
      expH: '0.8', expA: '0.8', gm: calcGoalMarkets(0.8, 0.8),
    });
    const html = buildBetBuilder(pred, 'Домакин', 'Гост', '🏠', '✈️', [], 1, 2);
    expect(html).toContain('БЕЗ СИГНАЛ');
    expect(html).not.toBe('');
  });
  it('без прогноза (null) продължава да връща празен низ (непроменено поведение)', () => {
    expect(buildBetBuilder(null, 'Домакин', 'Гост', '🏠', '✈️', [], 1, 2)).toBe('');
  });
});

describe('buildBetBuilder - симетрично Под 1.5 fallback (огледално на Над 1.5)', () => {
  it('избира "Под 1.5 гола", когато е избрано Не Г/Г и under25<65 но gm.under15>=75 (симетрично на Над 1.5 fallback-а)', () => {
    const gm = calcGoalMarkets(0.4, 0.4); // ниски λ -> gm.under15 би трябвало да е високо
    expect(gm.under15).toBeGreaterThanOrEqual(75);
    const pred = basePred({
      hWin: 65, draw: 20, aWin: 15, noBtts: 72, btts: 28, under25: 60, over25: 40, gm,
    });
    const html = buildBetBuilder(pred, 'Домакин', 'Гост', '🏠', '✈️', [], 1, 2);
    expect(html).toContain('Под 1.5 гола');
  });
});

describe('buildBetBuilder - съвместна вероятност Над/Под2.5 + Г/Г', () => {
  it('когато са избрани САМО Над 2.5 и Г/Г (без 1X2/TEAM крак), комбинираната вероятност е ТОЧНО calcOverBttsJoint (не наивно умножение)', () => {
    const expH = 1.8, expA = 1.6;
    // Балансиран 1X2 (без фаворит/реми), за да не влезе и TEAM/1X2 крак в top -
    // тествай ЧИСТАТА съвместна двойка без допълнителен наивен множител отгоре.
    const pred = basePred({
      hWin: 36, draw: 28, aWin: 36, over25: 70, under25: 30, btts: 75, noBtts: 25,
      expH: expH.toFixed(1), expA: expA.toFixed(1), gm: calcGoalMarkets(expH, expA),
    });
    const html = buildBetBuilder(pred, 'Домакин', 'Гост', '🏠', '✈️', [], 1, 2);
    expect(html).toContain('Над 2.5 гола');
    expect(html).toContain('И двата отбора вкарват');
    const joint = calcOverBttsJoint(expH, expA, 2.5);
    const expectedComb = Math.round(joint.overBttsYes);
    expect(html).toContain(`${expectedComb}%`);
  });
  it('маркира комбинираната вероятност като "≈ приблизително", когато участва крак без споделен модел (напр. 1X2)', () => {
    const expH = 1.8, expA = 1.6;
    const gm = calcGoalMarkets(expH, expA);
    const pred = basePred({
      hWin: 68, draw: 18, aWin: 14, over25: 70, under25: 30, btts: 68, noBtts: 32,
      expH: expH.toFixed(1), expA: expA.toFixed(1), gm,
    });
    const html = buildBetBuilder(pred, 'Домакин', 'Гост', '🏠', '✈️', [], 1, 2);
    expect(html).toContain('победа');
    expect(html).toContain('≈ приблизително');
  });
  it('без споделен модел между избраните крака (чисто 1X2 + голмайстор), резултатът остава маркиран приблизително', () => {
    const pred = basePred({ hWin: 70, draw: 18, aWin: 12, over25: 40, under25: 60, btts: 40, noBtts: 60 });
    const topScorers = [{ name: 'Играч А', teamId: 1, pct: 45, recentGoals: 3 }];
    const html = buildBetBuilder(pred, 'Домакин', 'Гост', '🏠', '✈️', topScorers, 1, 2);
    expect(html).toContain('≈ приблизително');
  });
});
