// D5 (виж discussion-а "WC scorers request cooldown") - тества РЕАЛНАТА
// loadWCScorers() от football.html (не копие), извлечена с текстова
// екстракция (огледално на останалите *.test.js файлове). Проверява точно
// одобреното решение: 60-сек cooldown докато е празен/грешка, 5-мин TTL след
// успешен резултат С данни, inflight dedup, и че грешка/валиден празен
// резултат НИКОГА не презаписват вече съществуващи валидни данни.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { calcTopScorers } from './football-logic.js';

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
function extractStatement(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error(`не намерих: ${startMarker}`);
  const end = src.indexOf(';', idx);
  return src.slice(idx, end + 1);
}
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

function buildHelper(apiFetch) {
  const src = [
    extractStatement(html, 'let wcScorersCache='),
    extractStatement(html, 'const WC_SCORERS_COOLDOWN_MS='),
    extractStatement(html, 'const WC_SCORERS_TTL_MS='),
    extractStatement(html, 'let wcScorersLastAttemptAt='),
    extractStatement(html, 'let wcScorersLastSuccessAt='),
    extractStatement(html, 'let wcScorersInflight='),
    extractBraced(html, 'async function loadWCScorers('),
  ].join('\n');
  const fn = new Function('apiFetch', src + `
    return {
      loadWCScorers,
      getCache: () => wcScorersCache,
      getLastAttemptAt: () => wcScorersLastAttemptAt,
      getLastSuccessAt: () => wcScorersLastSuccessAt,
      getCooldownMs: () => WC_SCORERS_COOLDOWN_MS,
      getTtlMs: () => WC_SCORERS_TTL_MS,
    };
  `);
  return fn(apiFetch);
}

const finishedWithGoal = {
  status: 'FINISHED', utcDate: '2026-06-01',
  homeTeam: { id: 1, name: 'Mexico' }, awayTeam: { id: 2, name: 'Brazil' },
  goals: [{ type: 'REGULAR', scorer: { id: 'p1', name: 'Player One' }, team: { id: 1, name: 'Mexico' } }],
};
function wcMatchesResponse(matches) { return Promise.resolve({ matches }); }
function emptyScorersFallback() { return Promise.resolve({ scorers: [] }); }

describe('loadWCScorers() - D5 cooldown/TTL/inflight (реалната функция от football.html)', () => {
  it('1. първо зареждане - без предходен опит, прави реалната заявка нормално', async () => {
    const calls = [];
    const apiFetch = (p) => { calls.push(p); return p.includes('/matches') ? wcMatchesResponse([finishedWithGoal]) : emptyScorersFallback(); };
    const h = buildHelper(apiFetch);
    await h.loadWCScorers();
    expect(calls.some(p => p.includes('/competitions/2000/matches'))).toBe(true);
    expect(h.getCache()).toEqual([{ id: 'p1', name: 'Player One', teamId: 1, teamName: 'Mexico', goals: 1 }]);
  });

  it('2. валиден празен резултат (и двата endpoint-а дават 0) - wcScorersCache остава [], без грешка навън', async () => {
    const apiFetch = (p) => p.includes('/matches') ? wcMatchesResponse([]) : emptyScorersFallback();
    const h = buildHelper(apiFetch);
    await expect(h.loadWCScorers()).resolves.toBeUndefined();
    expect(h.getCache()).toEqual([]);
  });

  it('3. API грешка (apiFetch хвърля) - поглъща се тихо, wcScorersCache остава [], без throw навън', async () => {
    const apiFetch = () => Promise.reject(Object.assign(new Error('rate limit'), { isApiError: true }));
    const h = buildHelper(apiFetch);
    await expect(h.loadWCScorers()).resolves.toBeUndefined();
    expect(h.getCache()).toEqual([]);
  });

  it('4. 60-сек cooldown - повторно извикване веднага след (пак празно/грешка) НЕ прави нова мрежова заявка', async () => {
    let calls = 0;
    const apiFetch = (p) => { if (p.includes('/matches')) calls++; return p.includes('/matches') ? wcMatchesResponse([]) : emptyScorersFallback(); };
    const h = buildHelper(apiFetch);
    await h.loadWCScorers();
    const firstCalls = calls;
    await h.loadWCScorers(); // веднага след - в рамките на 60-сек cooldown
    expect(calls).toBe(firstCalls); // без нова заявка
  });

  it('4б. след изтекъл 60-сек cooldown (симулиран часовник) - нов опит се допуска', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const apiFetch = (p) => { if (p.includes('/matches')) calls++; return p.includes('/matches') ? wcMatchesResponse([]) : emptyScorersFallback(); };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers();
      expect(calls).toBe(1);
      vi.advanceTimersByTime(h.getCooldownMs() + 1);
      await h.loadWCScorers();
      expect(calls).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it('4в. граничен случай - ТОЧНО 60 секунди след опита (не 59.999, не 60.001) - нов опит се допуска', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const apiFetch = (p) => { if (p.includes('/matches')) calls++; return p.includes('/matches') ? wcMatchesResponse([]) : emptyScorersFallback(); };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers();
      expect(calls).toBe(1);
      vi.advanceTimersByTime(h.getCooldownMs() - 1);
      await h.loadWCScorers(); // 59999мс - все още в cooldown
      expect(calls).toBe(1);
      vi.advanceTimersByTime(1); // точно 60000мс общо от последния опит
      await h.loadWCScorers();
      expect(calls).toBe(2); // на границата (now-lastAttemptAt===60000, не <60000) - разрешен нов опит
    } finally { vi.useRealTimers(); }
  });

  it('7б. граничен случай - ТОЧНО 5 минути след успеха - TTL се счита за изтекъл, нов опит се допуска', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const apiFetch = (p) => { if (p.includes('/matches')) { calls++; return wcMatchesResponse([finishedWithGoal]); } return emptyScorersFallback(); };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers();
      expect(calls).toBe(1);
      vi.advanceTimersByTime(h.getTtlMs() - 1);
      await h.loadWCScorers(); // 299999мс - TTL все още пресен
      expect(calls).toBe(1);
      vi.advanceTimersByTime(1); // точно 300000мс общо от успеха
      await h.loadWCScorers();
      expect(calls).toBe(2); // на границата (now-lastSuccessAt===300000, не <300000) - TTL счетен за изтекъл, нов опит разрешен
    } finally { vi.useRealTimers(); }
  });

  it('5. timestamp на опита се пише ПРЕДИ мрежовата заявка - дори бавна/висяща заявка веднага блокира паралелен втори опит', async () => {
    let resolveMatches;
    const apiFetch = (p) => p.includes('/matches') ? new Promise(res => { resolveMatches = res; }) : emptyScorersFallback();
    const h = buildHelper(apiFetch);
    const before = Date.now();
    const p1 = h.loadWCScorers(); // стартира, все още виси (не е resolved)
    expect(h.getLastAttemptAt()).toBeGreaterThanOrEqual(before);
    resolveMatches({ matches: [finishedWithGoal] });
    await p1;
    expect(h.getCache().length).toBe(1);
  });

  it('6. успешен отговор С данни - запазва данните И timestamp на успеха', async () => {
    const apiFetch = (p) => p.includes('/matches') ? wcMatchesResponse([finishedWithGoal]) : emptyScorersFallback();
    const h = buildHelper(apiFetch);
    const before = Date.now();
    await h.loadWCScorers();
    expect(h.getCache().length).toBe(1);
    expect(h.getLastSuccessAt()).toBeGreaterThanOrEqual(before);
  });

  it('7. след изтичане на 5-мин TTL - разрешава ново зареждане, ДОРЪ wcScorersCache вече да съдържа данни', async () => {
    vi.useFakeTimers();
    try {
      let matchesCalls = 0;
      const secondGoal = { ...finishedWithGoal, goals: [{ type: 'REGULAR', scorer: { id: 'p2', name: 'Player Two' }, team: { id: 1, name: 'Mexico' } }] };
      const apiFetch = (p) => {
        if (p.includes('/matches')) { matchesCalls++; return wcMatchesResponse(matchesCalls === 1 ? [finishedWithGoal] : [secondGoal]); }
        return emptyScorersFallback();
      };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers();
      expect(h.getCache()[0].name).toBe('Player One');
      await h.loadWCScorers(); // веднага пак - TTL все още пресен, НЕ бива да презаписва
      expect(matchesCalls).toBe(1);
      vi.advanceTimersByTime(h.getTtlMs() + 1);
      await h.loadWCScorers(); // TTL изтекъл - нов опит се допуска
      expect(matchesCalls).toBe(2);
      expect(h.getCache()[0].name).toBe('Player Two');
    } finally { vi.useRealTimers(); }
  });

  it('8. запазване на валидните данни при неуспешно обновяване (грешка СЛЕД вече успешен резултат, след изтекъл TTL)', async () => {
    vi.useFakeTimers();
    try {
      let matchesCalls = 0;
      const apiFetch = (p) => {
        if (p.includes('/matches')) {
          matchesCalls++;
          if (matchesCalls === 1) return wcMatchesResponse([finishedWithGoal]);
          return Promise.reject(Object.assign(new Error('boom'), { isNetworkError: true }));
        }
        return emptyScorersFallback();
      };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers();
      expect(h.getCache().length).toBe(1);
      vi.advanceTimersByTime(h.getTtlMs() + 1);
      await h.loadWCScorers(); // TTL изтекъл, нов опит - но този път грешка
      expect(matchesCalls).toBe(2);
      expect(h.getCache()).toEqual([{ id: 'p1', name: 'Player One', teamId: 1, teamName: 'Mexico', goals: 1 }]); // непипнати стари данни, НЕ презаписани с []
    } finally { vi.useRealTimers(); }
  });

  it('8б. РЕГРЕСИЯ за открития дефект: успех → изтичане на TTL → празен отговор → бързи повторни извиквания = само 1 реален refresh опит в рамките на 60-сек cooldown', async () => {
    vi.useFakeTimers();
    try {
      let matchesCalls = 0;
      const apiFetch = (p) => {
        if (p.includes('/matches')) {
          matchesCalls++;
          return matchesCalls === 1 ? wcMatchesResponse([finishedWithGoal]) : wcMatchesResponse([]); // 1-ви опит успешен, всички следващи - валидно празни
        }
        return emptyScorersFallback();
      };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers(); // успех
      expect(h.getCache().length).toBe(1);
      vi.advanceTimersByTime(h.getTtlMs() + 1); // TTL изтича
      await h.loadWCScorers(); // 1-ви refresh опит след TTL - връща [] (валидно празно)
      expect(matchesCalls).toBe(2);
      expect(h.getCache().length).toBe(1); // старите данни се пазят, НЕ са заменени с []
      // ТОЧНО дефектът, открит при проверка преди merge: без поправката, всяко
      // от следващите извиквания (в рамките на секунди) би направило НОВА
      // реална заявка, защото 60-сек cooldown-ът преди проверяваше само
      // "!hasData" - веднъж wcScorersCache съдържа данни, cooldown-ът никога
      // не се консултираше повторно.
      for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(1000); await h.loadWCScorers(); } // 10 "бързи превключвания", по 1 сек разлика - далеч под 60-сек cooldown
      expect(matchesCalls).toBe(2); // БЕЗ поправката: би било 12 (2 + 10). С поправката: cooldown блокира всичките 10.
      expect(h.getCache().length).toBe(1); // старите данни продължават да се пазят
    } finally { vi.useRealTimers(); }
  });

  it('8в. аналогичен тест за API грешка (вместо валиден празен резултат) след изтекъл TTL - същата cooldown защита + успешно възстановяване след пълния cooldown', async () => {
    vi.useFakeTimers();
    try {
      let matchesCalls = 0;
      const secondGoal = { ...finishedWithGoal, goals: [{ type: 'REGULAR', scorer: { id: 'p2', name: 'Player Two' }, team: { id: 1, name: 'Mexico' } }] };
      const apiFetch = (p) => {
        if (p.includes('/matches')) {
          matchesCalls++;
          if (matchesCalls === 1) return wcMatchesResponse([finishedWithGoal]); // 1-ви опит - успех
          if (matchesCalls === 2) return Promise.reject(Object.assign(new Error('rate limit'), { isApiError: true })); // 1-ви refresh опит след TTL - грешка
          return wcMatchesResponse([secondGoal]); // опит СЛЕД пълния cooldown (3-ти реален опит) - успех, нови данни
        }
        return emptyScorersFallback();
      };
      const h = buildHelper(apiFetch);
      await h.loadWCScorers(); // успех
      expect(h.getCache().length).toBe(1);
      vi.advanceTimersByTime(h.getTtlMs() + 1); // TTL изтича
      await h.loadWCScorers(); // 1-ви refresh опит след TTL - грешка
      expect(matchesCalls).toBe(2);
      expect(h.getCache()[0].name).toBe('Player One'); // старите данни се пазят, НЕ са заменени
      for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(1000); await h.loadWCScorers(); } // 10 бързи повторения, 1 сек разлика
      expect(matchesCalls).toBe(2); // cooldown-ът блокира всичките 10 последващи опита, независимо че причината е грешка, не празен резултат
      expect(h.getCache()[0].name).toBe('Player One');
      // Успешно възстановяване СЛЕД пълния 60-сек cooldown от последния опит (т.6 от одобрението):
      vi.advanceTimersByTime(h.getCooldownMs() - 10 * 1000 + 1);
      await h.loadWCScorers();
      expect(matchesCalls).toBe(3);
      expect(h.getCache()[0].name).toBe('Player Two'); // нови данни след успешно възстановяване
    } finally { vi.useRealTimers(); }
  });

  it('9. невалиден отговор (хвърлено при r.json()/невалиден JSON, симулирано като isInvalidResponse) - третиран еднакво с API грешка, без крах', async () => {
    const apiFetch = () => Promise.reject(Object.assign(new Error('Неочакван отговор'), { isInvalidResponse: true }));
    const h = buildHelper(apiFetch);
    await expect(h.loadWCScorers()).resolves.toBeUndefined();
    expect(h.getCache()).toEqual([]);
  });

  it('10. паралелни извиквания - две едновременни извиквания правят точно ЕДНА реална заявка (inflight dedup)', async () => {
    let matchesCalls = 0;
    let resolveFetch;
    const apiFetch = (p) => {
      if (p.includes('/matches')) { matchesCalls++; return new Promise(res => { resolveFetch = res; }); }
      return emptyScorersFallback();
    };
    const h = buildHelper(apiFetch);
    const p1 = h.loadWCScorers();
    const p2 = h.loadWCScorers(); // стартирано ПРЕДИ p1 да приключи
    resolveFetch({ matches: [finishedWithGoal] });
    await Promise.all([p1, p2]);
    expect(matchesCalls).toBe(1); // само ЕДНА реална заявка, въпреки 2 паралелни извиквания
    expect(h.getCache().length).toBe(1);
  });

  it('10 бързи превключвания между разделите (симулация) - точно 1 реален опит вместо 10 (измерен спестен трафик, т.14)', async () => {
    let matchesCalls = 0, fallbackCalls = 0;
    const apiFetch = (p) => {
      if (p.includes('/matches')) { matchesCalls++; return wcMatchesResponse([]); } // остава празно - "лошият" случай, който преди предизвикваше retry на всяко превключване
      fallbackCalls++; return emptyScorersFallback();
    };
    const h = buildHelper(apiFetch);
    for (let i = 0; i < 10; i++) await h.loadWCScorers(); // 10 "превключвания" в бърза серия, в рамките на 60-сек cooldown
    expect(matchesCalls).toBe(1); // БЕЗ D5: би било 10
    expect(fallbackCalls).toBe(1); // БЕЗ D5: би било 10
    // Спестени заявки: (10-1)*2 = 18 от общо 20 - 90% редукция, виж discussion-а "очакван ефект".
  });
});

describe('D5 regression - Bet Builder вижда ЕДНАКВИ данни независимо от throttling слоя (т.13 последен пункт)', () => {
  const buildBetBuilderCode = extractFunction(html, 'buildBetBuilder');
  const betBuilderModule = { exports: {} };
  const buildBetBuilderFn = new Function('module', betBuilderModule.constructor === Object ? 'calcOverBttsJoint' : 'calcOverBttsJoint', buildBetBuilderCode + `\nreturn buildBetBuilder;`);
  // calcOverBttsJoint не е нужен за самия тест (без Над/Под+Г/Г комбинация в тестовата прогноза) - подаваме no-op заместител.
  const buildBetBuilder = buildBetBuilderFn(betBuilderModule, () => ({ overBttsYes: 0 }));

  const match = { homeTeam: { id: 1, name: 'Mexico' }, awayTeam: { id: 2, name: 'Brazil' } };
  const allMatches = [finishedWithGoal];
  const pred = { hWin: 65, draw: 20, aWin: 15, over25: 40, under25: 60, btts: 40, noBtts: 60, expH: '1.2', expA: '0.8', gm: { over15: 60, under15: 40 } };

  it('wcScorersCache получен през loadWCScorers() дава ИДЕНТИЧЕН Bet Builder изход на ръчно конструирани еквивалентни данни', async () => {
    const apiFetch = (p) => p.includes('/matches') ? wcMatchesResponse([finishedWithGoal]) : emptyScorersFallback();
    const h = buildHelper(apiFetch);
    await h.loadWCScorers();
    const scorersFromThrottled = calcTopScorers(match, allMatches, h.getCache());

    const manualWcScorers = [{ id: 'p1', name: 'Player One', teamId: 1, teamName: 'Mexico', goals: 1 }];
    const scorersManual = calcTopScorers(match, allMatches, manualWcScorers);

    expect(scorersFromThrottled).toEqual(scorersManual);

    const htmlThrottled = buildBetBuilder(pred, 'Mexico', 'Brazil', '🇲🇽', '🇧🇷', scorersFromThrottled, 1, 2);
    const htmlManual = buildBetBuilder(pred, 'Mexico', 'Brazil', '🇲🇽', '🇧🇷', scorersManual, 1, 2);
    expect(htmlThrottled).toBe(htmlManual); // D5 не променя какво "вижда" Bet Builder-ът при еднакви входни данни
  });
});
