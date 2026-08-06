"use strict";

const STORAGE_KEY = "vl_data_v1";
const PROGRESS_KEY = "vl_progress_v1";
const LANG_KEY = "vl_lang_v1";

let state = {
  data: null,
  progress: null,
  quiz: null, // active quiz session
};

let currentView = "study";

/* ---------- Език на съдържанието (БГ/DE) ----------
   Управлява само СЪДЪРЖАНИЕТО на въпросите (текст, отговори, обяснения) —
   интерфейсът на приложението си остава на български. При липсващ превод
   за избрания език пада обратно към немския (основния) текст. */

function getLang() {
  return localStorage.getItem(LANG_KEY) === "bg" ? "bg" : "de";
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang === "bg" ? "bg" : "de");
}

function t(q, field) {
  if (getLang() === "bg") {
    const bgVal = q[field + "Bg"];
    if (bgVal) return bgVal;
  }
  return q[field] || "";
}

function tOptions(q) {
  const base = q.options || [];
  if (getLang() === "bg" && Array.isArray(q.optionsBg)) {
    return base.map((opt, i) => q.optionsBg[i] || opt);
  }
  return base;
}

// Прилага превода на статичните части на интерфейса — заглавие, навигация, футър —
// които не се пре-рендират от switchView() (те са фиксирана HTML структура, не се
// презаписват при всяко превключване на изглед).
function applyStaticUiTranslations() {
  document.getElementById("app-subtitle").textContent = UI("appSubtitle");
  document.getElementById("lang-toggle").title = UI("langToggleTitle");
  document.getElementById("nav-study").textContent = UI("navStudy");
  document.getElementById("nav-admin").textContent = UI("navAdmin");
  document.getElementById("nav-stats").textContent = UI("navStats");
  document.getElementById("nav-own").textContent = UI("navOwn");
  document.getElementById("nav-guide").textContent = UI("navGuide");
  document.getElementById("app-footer").textContent = UI("footerNote");
}

function initLangToggle() {
  const box = document.getElementById("lang-toggle");
  const caption = document.getElementById("lang-caption");
  function refreshActive() {
    box.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.lang === getLang()));
    // Веднага видима потвърдка, че превключването сработи — дори на екран без активен въпрос за превод.
    caption.textContent = UI("langCaption");
    applyStaticUiTranslations();
  }
  box.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      refreshActive();
      refreshCurrentView();
    });
  });
  refreshActive();
}

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Повредени данни в localStorage, зареждам примерните.", e);
    }
  }
  return structuredClone(SEED_DATA);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadProgress() {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Повредена статистика.", e);
    }
  }
  return {};
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
}

function getTopic(id) {
  return state.data.topics.find((t) => t.id === id);
}

function partLabel(part) {
  return part === 2 ? UI("part2Label") : UI("part1Label");
}

function topicsByPart(part) {
  return state.data.topics.filter((t) => (t.part || 1) === part);
}

function getQuestion(id) {
  return state.data.questions.find((q) => q.id === id);
}

function topLevelQuestions(topicId) {
  return state.data.questions
    .filter((q) => q.topicId === topicId && !q.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function followUpsOf(questionId) {
  return state.data.questions
    .filter((q) => q.parentId === questionId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* "Твои" въпроси — лични, странични питания, които тя сама задава (на Клод/другаде)
   и после сама записва получения отговор. Не са обвързани с тема от Част 1/2,
   ясно отбелязани като различни от съдържанието на учебниците. */
function ownQuestions() {
  return state.data.questions.filter((q) => q.own && !q.parentId);
}

function answeredOwnQuestions() {
  return ownQuestions().filter((q) => q.answered);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Лични снимки за справка (само този браузър, никога не се публикуват) ----------
   Съхраняват се в IndexedDB на устройството, ключувани по ID на въпроса.
   Умишлено НЕ участват в exportData() / importData() / git — служат само като
   временна памет, докато въпросът се преписва със свои думи в текстовите полета. */

const PHOTO_DB_NAME = "vl_photos_v1";
const PHOTO_STORE = "photos";

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhoto(questionId, dataUrl) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(dataUrl, questionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(questionId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).get(questionId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(questionId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(questionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllPhotos() {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- OCR (разпознаване на текст от снимка) ----------
   Обработката е изцяло локална, в браузъра (Tesseract.js, WASM) — самата снимка
   никога не се изпраща към сървър. Основната библиотека е вградена в repo-то
   (vendor/tesseract/); ядрото (WASM) и езиковите данни се теглят от Tesseract.js
   при първо използване (само тогава, и само това, не и снимката). */

let tesseractLoadPromise = null;

function loadTesseractLib() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/tesseract/tesseract.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("tesseract-load-failed"));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

async function runOcr(dataUrl, lang, onProgress) {
  await loadTesseractLib();
  const worker = await Tesseract.createWorker(lang, undefined, {
    workerPath: "vendor/tesseract/worker.min.js",
    logger: (m) => onProgress && onProgress(m),
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/* ---------- Tabs ---------- */

function initTabs() {
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "study") renderStudySetup();
  if (view === "admin") renderAdmin();
  if (view === "stats") renderStats();
  if (view === "own") renderOwnQuestionsTab();
  if (view === "guide") renderGuide();
}

// Използва се само от превключвателя БГ/DE — презарежда текущия изглед със
// съдържание на новия език, без да губи активен тест в процес на решаване.
function refreshCurrentView() {
  if (currentView === "study") {
    if (state.quiz) renderQuizQuestion();
    else renderStudySetup();
  } else if (currentView === "admin") {
    renderAdmin();
    if (activeManagedTopicId) renderQuestionManager(activeManagedTopicId);
  } else if (currentView === "stats") {
    renderStats();
  } else if (currentView === "own") {
    renderOwnQuestionsTab();
  } else if (currentView === "guide") {
    renderGuide();
  }
}

/* ---------- Study: setup ---------- */

function renderStudySetup() {
  const container = document.getElementById("study-container");
  const totalQuestions = state.data.questions.filter((q) => !q.parentId).length;

  function optionsForPart(part) {
    return topicsByPart(part)
      .map((t) => {
        const count = topLevelQuestions(t.id).length;
        return `<option value="${t.id}">${escapeHtml(t.name)} (${count})</option>`;
      })
      .join("");
  }

  const EXAM_SIZE = 30;

  container.innerHTML = `
    <div class="card">
      <h2>${UI("setupTitle")}</h2>
      <div class="field">
        <label>${UI("topicLabel")}</label>
        <select id="study-topic">
          <option value="__all__">${UI("allTopicsOption", totalQuestions)}</option>
          <optgroup label="${partLabel(1)}">${optionsForPart(1)}</optgroup>
          <optgroup label="${partLabel(2)}">${optionsForPart(2)}</optgroup>
        </select>
      </div>
      <div class="row" style="margin-bottom:.8rem;">
        <label style="display:flex;align-items:center;gap:.4rem;margin:0;">
          <input type="checkbox" id="study-shuffle" checked /> ${UI("shuffleLabel")}
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;margin:0;">
          <input type="checkbox" id="study-wrong-only" /> ${UI("wrongOnlyLabel")}
        </label>
      </div>
      <button class="btn" id="start-quiz-btn">${UI("startBtn")}</button>
    </div>
    <div class="card">
      <h2>${UI("examTitle")}</h2>
      <p class="muted">${UI("examDesc", EXAM_SIZE, totalQuestions)}</p>
      <button class="btn secondary" id="start-exam-btn">${UI("examStartBtn", EXAM_SIZE)}</button>
    </div>
    <div id="quiz-area"></div>
  `;

  document.getElementById("start-quiz-btn").addEventListener("click", startQuiz);
  document.getElementById("start-exam-btn").addEventListener("click", startMockExam);
}

function startQuiz() {
  const topicId = document.getElementById("study-topic").value;
  const shuffleOn = document.getElementById("study-shuffle").checked;
  const wrongOnly = document.getElementById("study-wrong-only").checked;

  let pool =
    topicId === "__all__"
      ? state.data.topics.flatMap((t) => topLevelQuestions(t.id)).concat(answeredOwnQuestions())
      : topLevelQuestions(topicId);

  if (wrongOnly) {
    pool = pool.filter((q) => state.progress[q.id] && state.progress[q.id].lastResult === "wrong");
  }

  if (shuffleOn) pool = shuffle(pool);

  if (pool.length === 0) {
    document.getElementById("quiz-area").innerHTML =
      `<div class="card muted">${UI("noQuestionsForFilter")}</div>`;
    return;
  }

  state.quiz = {
    queue: pool.map((q) => q.id),
    index: 0,
    correctCount: 0,
    totalAnswered: 0,
    followUpQueue: [],
    isExam: false,
  };
  renderQuizQuestion();
}

// По-нисък приоритет = излиза по-рано в пробния изпит: 0 = никога пробван (в "Учи"),
// 1 = последно грешен, 2 = последно верен. Целта е слабите/непознатите места да
// изникват по-често, за да се учат и запомнят по-лесно.
function examPriority(questionId) {
  const p = state.progress[questionId];
  if (!p || !p.lastResult) return 0;
  if (p.lastResult === "wrong") return 1;
  return 2;
}

function startMockExam() {
  const EXAM_SIZE = 30;
  const allTop = state.data.topics.flatMap((t) => topLevelQuestions(t.id)).concat(answeredOwnQuestions());

  if (allTop.length === 0) {
    document.getElementById("quiz-area").innerHTML =
      `<div class="card muted">${UI("noQuestionsAtAll")}</div>`;
    return;
  }

  // Първо по приоритет (непробвани/грешни преди верните), после ротация по отдавна
  // невключвани в пробен изпит — така базата постепенно се обхожда цялата.
  const sorted = allTop.slice().sort((a, b) => {
    const prio = examPriority(a.id) - examPriority(b.id);
    if (prio !== 0) return prio;
    const at = (state.progress[a.id] && state.progress[a.id].lastExamAt) || 0;
    const bt = (state.progress[b.id] && state.progress[b.id].lastExamAt) || 0;
    return at - bt;
  });
  const selected = sorted.slice(0, Math.min(EXAM_SIZE, sorted.length));

  const now = Date.now();
  selected.forEach((q) => {
    if (!state.progress[q.id]) state.progress[q.id] = { attempts: 0, correctCount: 0, lastResult: null };
    state.progress[q.id].lastExamAt = now;
  });
  saveProgress();

  state.quiz = {
    queue: shuffle(selected).map((q) => q.id),
    index: 0,
    correctCount: 0,
    totalAnswered: 0,
    followUpQueue: [],
    isExam: true,
    examSize: selected.length,
  };
  renderQuizQuestion();
}

function currentQuizQuestionId() {
  const quiz = state.quiz;
  if (quiz.followUpQueue.length > 0) return quiz.followUpQueue[0];
  return quiz.queue[quiz.index];
}

function renderQuizQuestion() {
  const quiz = state.quiz;
  const area = document.getElementById("quiz-area");

  if (quiz.followUpQueue.length === 0 && quiz.index >= quiz.queue.length) {
    renderQuizSummary();
    return;
  }

  const qid = currentQuizQuestionId();
  const q = getQuestion(qid);
  const isFollowUp = quiz.followUpQueue.length > 0;
  const topic = getTopic(q.topicId);
  const progressPct = Math.round((quiz.index / quiz.queue.length) * 100);

  let optionsHtml = "";
  if (q.type === "test") {
    optionsHtml = tOptions(q)
      .map(
        (opt, i) =>
          `<button class="option-btn" data-index="${i}">${String.fromCharCode(65 + i)}) ${escapeHtml(opt)}</button>`
      )
      .join("");
  } else {
    optionsHtml = `
      <textarea id="open-answer" placeholder="${UI("openAnswerPlaceholder")}"></textarea>
      <button class="btn secondary" id="reveal-btn" style="margin-top:.5rem;">${UI("revealBtn")}</button>
    `;
  }

  area.innerHTML = `
    <div class="card">
      <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <span class="pill">${escapeHtml(topic ? topic.name : q.own ? UI("ownQuestionPillFallback") : "")}</span>
      ${isFollowUp ? `<span class="follow-up-tag">${UI("followUpTag")}</span>` : ""}
      <h2 style="margin-top:.6rem;">${escapeHtml(t(q, "question"))}</h2>
      <div id="options-wrap">${optionsHtml}</div>
      <div id="answer-feedback"></div>
      <div id="quiz-nav" style="margin-top:1rem;"></div>
    </div>
  `;

  if (q.type === "test") {
    area.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", () => answerTest(q, Number(btn.dataset.index)));
    });
  } else {
    document.getElementById("reveal-btn").addEventListener("click", () => answerOpen(q));
  }
}

function recordProgress(questionId, result) {
  if (!state.progress[questionId]) {
    state.progress[questionId] = { attempts: 0, correctCount: 0, lastResult: null };
  }
  const p = state.progress[questionId];
  p.attempts += 1;
  if (result === "correct") p.correctCount += 1;
  p.lastResult = result;
  saveProgress();
}

function answerTest(q, chosenIndex) {
  const isCorrect = chosenIndex === q.correctIndex;
  document.querySelectorAll(".option-btn").forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctIndex) btn.classList.add("correct");
    if (i === chosenIndex && !isCorrect) btn.classList.add("wrong");
  });
  finishAnswer(q, isCorrect);
}

function answerOpen(q) {
  document.getElementById("reveal-btn").disabled = true;
  finishAnswer(q, null);
}

function finishAnswer(q, isCorrect) {
  const quiz = state.quiz;
  const feedback = document.getElementById("answer-feedback");
  const isFollowUp = quiz.followUpQueue.length > 0;

  let bannerHtml = "";
  let boxClass = "explanation-box";
  if (isCorrect === true) {
    bannerHtml = `<div class="result-banner correct">${UI("correctBanner")}</div>`;
    boxClass += " correct";
    recordProgress(q.id, "correct");
    quiz.correctCount++;
  } else if (isCorrect === false) {
    bannerHtml = `<div class="result-banner wrong">${UI("wrongBanner")}</div>`;
    boxClass += " wrong";
    recordProgress(q.id, "wrong");
  } else {
    recordProgress(q.id, "reviewed");
  }
  if (!isFollowUp) quiz.totalAnswered++;

  let modelAnswerHtml = "";
  if (q.type === "open") {
    modelAnswerHtml = `<p><strong>${UI("modelAnswerLabel")}</strong><br>${escapeHtml(t(q, "modelAnswer") || UI("noModelAnswerText"))}</p>`;
  }
  const ownNote = q.own ? `<p class="muted">${UI("ownNoteText")}</p>` : "";
  const explanationText = t(q, "explanation");

  feedback.innerHTML = `
    ${bannerHtml}
    <div class="${boxClass}">
      ${modelAnswerHtml}
      ${explanationText ? `<p><strong>${UI("explanationLabel")}</strong><br>${escapeHtml(explanationText)}</p>` : ""}
      ${ownNote}
    </div>
  `;

  const followUps = followUpsOf(q.id);
  const nav = document.getElementById("quiz-nav");
  const label = followUps.length > 0 ? UI("continueFollowUpBtn") : UI("nextQuestionBtn");
  nav.innerHTML = `<button class="btn" id="next-btn">${label}</button>`;
  document.getElementById("next-btn").addEventListener("click", () => {
    if (isFollowUp) quiz.followUpQueue.shift();
    else quiz.index++;
    if (followUps.length > 0) {
      quiz.followUpQueue.push(...followUps.map((f) => f.id));
    }
    renderQuizQuestion();
  });
}

function renderQuizSummary() {
  const quiz = state.quiz;
  const area = document.getElementById("quiz-area");
  const pct = quiz.totalAnswered ? Math.round((quiz.correctCount / quiz.totalAnswered) * 100) : 0;
  const title = quiz.isExam ? UI("examSummaryTitle", quiz.examSize) : UI("summaryTitle");
  const examNote = quiz.isExam ? `<p class="muted">${UI("examNote")}</p>` : "";
  area.innerHTML = `
    <div class="card">
      <h2>${title}</h2>
      <p>${UI("correctAnswersLabel")} <strong>${quiz.correctCount} / ${quiz.totalAnswered}</strong> (${pct}%)</p>
      ${examNote}
      <div class="row">
        <button class="btn" id="restart-btn">${UI("newTestBtn")}</button>
      </div>
    </div>
  `;
  document.getElementById("restart-btn").addEventListener("click", renderStudySetup);
}

/* ---------- Admin ---------- */

function renderAdmin() {
  const container = document.getElementById("admin-container");
  function topicRow(t) {
    const count = state.data.questions.filter((q) => q.topicId === t.id).length;
    return `
      <div class="question-list-item">
        <div class="row between">
          <div>
            <strong>${escapeHtml(t.name)}</strong>
            <div class="muted">${escapeHtml(t.description || "")} · ${UI("questionCountSuffix", count)}</div>
          </div>
          <div class="row">
            <button class="btn small secondary" data-manage-topic="${t.id}">${UI("manageQuestionsBtn")}</button>
            <button class="btn small danger" data-delete-topic="${t.id}">${UI("deleteTopicBtn")}</button>
          </div>
        </div>
      </div>
    `;
  }

  function partSection(part) {
    const topics = topicsByPart(part);
    const rows = topics.map(topicRow).join("");
    return `
      <h3 style="margin-bottom:.5rem;">${partLabel(part)}</h3>
      ${rows || `<p class="muted">${UI("noTopicsInPart")}</p>`}
    `;
  }

  container.innerHTML = `
    <div class="card">
      <h2>${UI("topicsHeading")}</h2>
      ${partSection(1)}
      ${partSection(2)}
      <div class="row" style="margin-top:1rem;">
        <input type="text" id="new-topic-name" placeholder="${UI("newTopicPlaceholder")}" style="flex:1;min-width:220px;" />
        <select id="new-topic-part" style="max-width:220px;">
          <option value="1">${partLabel(1)}</option>
          <option value="2">${partLabel(2)}</option>
        </select>
        <button class="btn" id="add-topic-btn">${UI("addTopicBtn")}</button>
      </div>
    </div>
    <div id="question-manager"></div>
    <div class="card">
      <h2>${UI("backupHeading")}</h2>
      <p class="muted">${UI("backupDesc")}</p>
      <div class="row">
        <button class="btn secondary" id="export-btn">${UI("exportBtn")}</button>
        <label class="btn secondary" style="margin:0;">
          ${UI("importBtn")}
          <input type="file" id="import-input" accept="application/json" class="hidden" />
        </label>
        <button class="btn danger" id="reset-seed-btn">${UI("resetSeedBtn")}</button>
      </div>
    </div>
  `;

  document.getElementById("add-topic-btn").addEventListener("click", addTopic);
  document.getElementById("export-btn").addEventListener("click", exportData);
  document.getElementById("import-input").addEventListener("change", importData);
  document.getElementById("reset-seed-btn").addEventListener("click", resetToSeed);

  container.querySelectorAll("[data-manage-topic]").forEach((btn) =>
    btn.addEventListener("click", () => renderQuestionManager(btn.dataset.manageTopic))
  );
  container.querySelectorAll("[data-delete-topic]").forEach((btn) =>
    btn.addEventListener("click", () => deleteTopic(btn.dataset.deleteTopic))
  );
}

function addTopic() {
  const input = document.getElementById("new-topic-name");
  const name = input.value.trim();
  if (!name) return;
  const part = Number(document.getElementById("new-topic-part").value) === 2 ? 2 : 1;
  state.data.topics.push({ id: uid("t"), name, description: "", part });
  saveData();
  renderAdmin();
}

function deleteTopic(topicId) {
  const topic = getTopic(topicId);
  if (!confirm(UI("deleteTopicConfirm", topic.name))) return;
  const removedIds = state.data.questions.filter((q) => q.topicId === topicId).map((q) => q.id);
  state.data.questions = state.data.questions.filter((q) => q.topicId !== topicId);
  state.data.topics = state.data.topics.filter((t) => t.id !== topicId);
  saveData();
  removedIds.forEach((id) => deletePhoto(id));
  renderAdmin();
}

let activeManagedTopicId = null;

function renderQuestionManager(topicId) {
  activeManagedTopicId = topicId;
  const topic = getTopic(topicId);
  const container = document.getElementById("question-manager");

  function renderQuestionTree(qList, depth) {
    return qList
      .map((q) => {
        const children = followUpsOf(q.id);
        return `
          <div class="question-list-item ${depth > 0 ? "nested" : ""}">
            <div class="row between">
              <div>
                <span class="pill">${q.type === "test" ? UI("testPill") : UI("openPill")}</span>
                ${escapeHtml(t(q, "question")).slice(0, 100)}${t(q, "question").length > 100 ? "…" : ""}
              </div>
              <div class="row">
                <button class="btn small secondary" data-edit-q="${q.id}">${UI("editBtn")}</button>
                <button class="btn small danger" data-delete-q="${q.id}">${UI("deleteBtn")}</button>
              </div>
            </div>
          </div>
          ${renderQuestionTree(children, depth + 1)}
        `;
      })
      .join("");
  }

  const tree = renderQuestionTree(topLevelQuestions(topicId), 0);

  container.innerHTML = `
    <div class="card">
      <div class="row between">
        <h2>${UI("questionsHeading", escapeHtml(topic.name))}</h2>
        <button class="btn" id="add-question-btn">${UI("addQuestionBtn")}</button>
      </div>
      ${tree || `<p class="muted">${UI("noQuestionsInTopic")}</p>`}
      <div id="question-form-wrap"></div>
    </div>
  `;

  document.getElementById("add-question-btn").addEventListener("click", () => renderQuestionForm(null));
  container.querySelectorAll("[data-edit-q]").forEach((btn) =>
    btn.addEventListener("click", () => renderQuestionForm(btn.dataset.editQ))
  );
  container.querySelectorAll("[data-delete-q]").forEach((btn) =>
    btn.addEventListener("click", () => deleteQuestion(btn.dataset.deleteQ))
  );
}

function deleteQuestion(qId) {
  const hasChildren = followUpsOf(qId).length > 0;
  const msg = hasChildren ? UI("deleteQuestionWithChildrenConfirm") : UI("deleteQuestionConfirm");
  if (!confirm(msg)) return;
  const toDelete = new Set([qId]);
  let changed = true;
  while (changed) {
    changed = false;
    state.data.questions.forEach((q) => {
      if (q.parentId && toDelete.has(q.parentId) && !toDelete.has(q.id)) {
        toDelete.add(q.id);
        changed = true;
      }
    });
  }
  state.data.questions = state.data.questions.filter((q) => !toDelete.has(q.id));
  saveData();
  toDelete.forEach((id) => deletePhoto(id));
  renderQuestionManager(activeManagedTopicId);
}

function renderQuestionForm(editId) {
  const editing = editId ? getQuestion(editId) : null;
  const wrap = document.getElementById("question-form-wrap");

  const otherQuestions = state.data.questions.filter(
    (q) => q.topicId === activeManagedTopicId && q.id !== editId
  );
  const parentOptions = otherQuestions
    .map(
      (q) =>
        `<option value="${q.id}" ${editing && editing.parentId === q.id ? "selected" : ""}>${escapeHtml(
          t(q, "question").slice(0, 60)
        )}</option>`
    )
    .join("");

  const type = editing ? editing.type : "test";
  const options = editing && editing.options && editing.options.length ? editing.options : ["", ""];
  const optionsBgInit =
    editing && editing.optionsBg && editing.optionsBg.length === options.length ? editing.optionsBg : options.map(() => "");
  const formId = editing ? editing.id : uid("q");

  wrap.innerHTML = `
    <div class="card" style="background:var(--accent-bg);margin-top:1rem;">
      <h2>${editing ? UI("editQuestionTitle") : UI("newQuestionTitle")}</h2>

      <div class="field">
        <label>${UI("photoLabel")}</label>
        <p class="muted" style="margin-top:0;">
          ${UI("photoDesc")}
        </p>
        <input type="file" id="q-photo-input" accept="image/*" capture="environment" />
        <div id="q-photo-preview" style="margin-top:.5rem;"></div>
      </div>

      <div class="field">
        <label>${UI("parentLabel")}</label>
        <select id="q-parent">
          <option value="">${UI("parentNoneOption")}</option>
          ${parentOptions}
        </select>
      </div>
      <div class="field">
        <label>${UI("typeLabel")}</label>
        <select id="q-type">
          <option value="test" ${type === "test" ? "selected" : ""}>${UI("typeTestOption")}</option>
          <option value="open" ${type === "open" ? "selected" : ""}>${UI("typeOpenOption")}</option>
        </select>
      </div>
      <div class="field">
        <label>${UI("questionDeLabel")}</label>
        <textarea id="q-text">${editing ? escapeHtml(editing.question) : ""}</textarea>
      </div>
      <div class="field">
        <label>${UI("questionBgLabel")}</label>
        <textarea id="q-text-bg">${editing ? escapeHtml(editing.questionBg || "") : ""}</textarea>
      </div>

      <div id="test-fields" class="field">
        <label>${UI("optionsLabel")}</label>
        <div id="options-list"></div>
        <button type="button" class="btn small secondary" id="add-option-btn">${UI("addOptionBtn")}</button>
      </div>

      <div id="open-fields" class="field hidden">
        <label>${UI("modelAnswerDeLabel")}</label>
        <textarea id="q-model-answer">${editing ? escapeHtml(editing.modelAnswer || "") : ""}</textarea>
        <label style="margin-top:.6rem;">${UI("modelAnswerBgLabel")}</label>
        <textarea id="q-model-answer-bg">${editing ? escapeHtml(editing.modelAnswerBg || "") : ""}</textarea>
      </div>

      <div class="field">
        <label>${UI("explanationDeLabel")}</label>
        <textarea id="q-explanation">${editing ? escapeHtml(editing.explanation || "") : ""}</textarea>
      </div>
      <div class="field">
        <label>${UI("explanationBgLabel")}</label>
        <textarea id="q-explanation-bg">${editing ? escapeHtml(editing.explanationBg || "") : ""}</textarea>
      </div>

      <div class="row">
        <button class="btn" id="save-question-btn">${UI("saveBtn")}</button>
        <button class="btn secondary" id="cancel-question-btn">${UI("cancelBtn")}</button>
      </div>
    </div>
  `;

  const optionsListEl = document.getElementById("options-list");
  let currentOptions = options.slice();
  let currentOptionsBg = optionsBgInit.slice();
  let correctIndex = editing && editing.correctIndex != null ? editing.correctIndex : 0;

  function renderOptions() {
    optionsListEl.innerHTML = currentOptions
      .map(
        (opt, i) => `
        <div class="option-input-row">
          <input type="radio" name="correct-opt" value="${i}" ${i === correctIndex ? "checked" : ""} title="${UI("correctOptionTitle")}" />
          <input type="text" data-opt-index="${i}" value="${escapeHtml(opt)}" placeholder="${UI("optionPlaceholderDe", String.fromCharCode(65 + i))}" />
          <input type="text" data-opt-bg-index="${i}" value="${escapeHtml(currentOptionsBg[i] || "")}" placeholder="${UI("optionPlaceholderBg", String.fromCharCode(65 + i))}" />
          ${currentOptions.length > 2 ? `<button type="button" class="btn small danger" data-remove-opt="${i}">✕</button>` : ""}
        </div>
      `
      )
      .join("");

    optionsListEl.querySelectorAll("input[data-opt-index]").forEach((inp) => {
      inp.addEventListener("input", () => {
        currentOptions[Number(inp.dataset.optIndex)] = inp.value;
      });
    });
    optionsListEl.querySelectorAll("input[data-opt-bg-index]").forEach((inp) => {
      inp.addEventListener("input", () => {
        currentOptionsBg[Number(inp.dataset.optBgIndex)] = inp.value;
      });
    });
    optionsListEl.querySelectorAll("input[name=correct-opt]").forEach((r) => {
      r.addEventListener("change", () => {
        correctIndex = Number(r.value);
      });
    });
    optionsListEl.querySelectorAll("[data-remove-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.removeOpt);
        currentOptions.splice(idx, 1);
        currentOptionsBg.splice(idx, 1);
        if (correctIndex >= currentOptions.length) correctIndex = 0;
        renderOptions();
      });
    });
  }
  renderOptions();

  document.getElementById("add-option-btn").addEventListener("click", () => {
    currentOptions.push("");
    currentOptionsBg.push("");
    renderOptions();
  });

  function toggleTypeFields() {
    const qType = document.getElementById("q-type").value;
    document.getElementById("test-fields").classList.toggle("hidden", qType !== "test");
    document.getElementById("open-fields").classList.toggle("hidden", qType !== "open");
  }
  document.getElementById("q-type").addEventListener("change", toggleTypeFields);
  toggleTypeFields();

  function renderPhotoPreview(dataUrl) {
    const box = document.getElementById("q-photo-preview");
    if (!dataUrl) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `
      <img src="${dataUrl}" alt="${UI("photoAlt")}" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--border);display:block;" />
      <button type="button" class="btn small danger" id="remove-photo-btn" style="margin-top:.4rem;">${UI("removePhotoBtn")}</button>
      <div class="field" style="margin-top:.7rem;">
        <label>${UI("ocrLabel")}</label>
        <p class="muted" style="margin-top:0;">${UI("ocrHint")}</p>
        <div class="row">
          <select id="ocr-lang" style="max-width:160px;">
            <option value="deu">${UI("ocrLangDe")}</option>
            <option value="bul">${UI("ocrLangBg")}</option>
          </select>
          <button type="button" class="btn small secondary" id="run-ocr-btn">${UI("runOcrBtn")}</button>
        </div>
        <p class="muted" id="ocr-status" style="margin-top:.4rem;"></p>
        <textarea id="ocr-result" class="hidden" style="margin-top:.4rem;"></textarea>
      </div>
    `;
    document.getElementById("remove-photo-btn").addEventListener("click", async () => {
      await deletePhoto(formId);
      renderPhotoPreview(null);
    });
    document.getElementById("run-ocr-btn").addEventListener("click", async () => {
      const btn = document.getElementById("run-ocr-btn");
      const status = document.getElementById("ocr-status");
      const resultBox = document.getElementById("ocr-result");
      const lang = document.getElementById("ocr-lang").value;
      btn.disabled = true;
      resultBox.classList.add("hidden");
      status.textContent = UI("ocrLoading");
      try {
        const text = await runOcr(dataUrl, lang, (m) => {
          if (m.status === "recognizing text") {
            status.textContent = UI("ocrProgress", Math.round((m.progress || 0) * 100));
          } else if (m.status) {
            status.textContent = UI("ocrLoading");
          }
        });
        status.textContent = UI("ocrDone");
        resultBox.value = text.trim();
        resultBox.classList.remove("hidden");
      } catch (e) {
        status.textContent = UI("ocrError");
        console.warn(e);
      } finally {
        btn.disabled = false;
      }
    });
  }
  getPhoto(formId).then(renderPhotoPreview);

  document.getElementById("q-photo-input").addEventListener("change", (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await savePhoto(formId, reader.result);
      renderPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("cancel-question-btn").addEventListener("click", async () => {
    if (!editing) await deletePhoto(formId);
    wrap.innerHTML = "";
  });

  document.getElementById("save-question-btn").addEventListener("click", () => {
    const questionText = document.getElementById("q-text").value.trim();
    if (!questionText) {
      alert(UI("alertNoQuestionText"));
      return;
    }
    const qType = document.getElementById("q-type").value;
    const parentId = document.getElementById("q-parent").value || null;

    const payload = {
      topicId: activeManagedTopicId,
      parentId,
      type: qType,
      question: questionText,
      questionBg: document.getElementById("q-text-bg").value.trim(),
      explanation: document.getElementById("q-explanation").value.trim(),
      explanationBg: document.getElementById("q-explanation-bg").value.trim(),
      order: editing ? editing.order : state.data.questions.length + 1,
    };

    if (qType === "test") {
      const cleanPairs = currentOptions
        .map((o, i) => ({ de: o.trim(), bg: (currentOptionsBg[i] || "").trim() }))
        .filter((p) => p.de.length > 0);
      if (cleanPairs.length < 2) {
        alert(UI("alertNeedTwoOptions"));
        return;
      }
      payload.options = cleanPairs.map((p) => p.de);
      payload.optionsBg = cleanPairs.map((p) => p.bg);
      payload.correctIndex = Math.min(correctIndex, cleanPairs.length - 1);
      payload.modelAnswer = "";
      payload.modelAnswerBg = "";
    } else {
      payload.options = [];
      payload.optionsBg = [];
      payload.correctIndex = null;
      payload.modelAnswer = document.getElementById("q-model-answer").value.trim();
      payload.modelAnswerBg = document.getElementById("q-model-answer-bg").value.trim();
    }

    if (editing) {
      Object.assign(editing, payload);
    } else {
      payload.id = formId;
      state.data.questions.push(payload);
    }
    saveData();
    wrap.innerHTML = "";
    renderQuestionManager(activeManagedTopicId);
  });
}

/* ---------- Stats ---------- */

function renderStats() {
  const container = document.getElementById("stats-container");

  function rowFor(t) {
    const qs = topLevelQuestions(t.id).concat(
      state.data.questions.filter((q) => q.topicId === t.id && q.parentId)
    );
    const answered = qs.filter((q) => state.progress[q.id]);
    const correct = qs.filter((q) => state.progress[q.id] && state.progress[q.id].lastResult === "correct");
    const pct = answered.length ? Math.round((correct.length / answered.length) * 100) : 0;
    return `<tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${qs.length}</td>
      <td>${answered.length}</td>
      <td>${correct.length}</td>
      <td>${pct}%</td>
    </tr>`;
  }

  function rowsForPart(part) {
    const topics = topicsByPart(part);
    if (topics.length === 0) return "";
    return `<tr><td colspan="5"><strong>${partLabel(part)}</strong></td></tr>` + topics.map(rowFor).join("");
  }

  function ownRow() {
    const qs = answeredOwnQuestions();
    if (qs.length === 0) return "";
    const answered = qs.filter((q) => state.progress[q.id]);
    const correct = qs.filter((q) => state.progress[q.id] && state.progress[q.id].lastResult === "correct");
    const pct = answered.length ? Math.round((correct.length / answered.length) * 100) : 0;
    return `<tr><td colspan="5"><strong>${UI("ownQuestionsSectionLabel")}</strong></td></tr>
      <tr><td>${UI("ownQuestionsRowLabel")}</td><td>${qs.length}</td><td>${answered.length}</td><td>${correct.length}</td><td>${pct}%</td></tr>`;
  }

  container.innerHTML = `
    <div class="card">
      <h2>${UI("statsHeading")}</h2>
      <table>
        <thead><tr><th>${UI("thTopic")}</th><th>${UI("thTotal")}</th><th>${UI("thAnswered")}</th><th>${UI("thLastCorrect")}</th><th>${UI("thPercent")}</th></tr></thead>
        <tbody>${rowsForPart(1)}${rowsForPart(2)}${ownRow()}</tbody>
      </table>
      <div class="row" style="margin-top:1rem;">
        <button class="btn danger" id="reset-progress-btn">${UI("resetStatsBtn")}</button>
      </div>
    </div>
  `;
  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (!confirm(UI("resetStatsConfirm"))) return;
    state.progress = {};
    saveProgress();
    renderStats();
  });
}

/* ---------- Твой въпрос ---------- */

function renderOwnQuestionsTab() {
  const container = document.getElementById("own-container");
  const pending = ownQuestions().filter((q) => !q.answered);
  const answered = ownQuestions().filter((q) => q.answered);

  function pendingItem(q) {
    return `
      <div class="question-list-item">
        <p><strong>${UI("questionLabel")}</strong> ${escapeHtml(q.question)}</p>
        <div class="row">
          <button type="button" class="btn small secondary" data-copy-own="${q.id}">${UI("copyQuestionBtn")}</button>
          <button type="button" class="btn small danger" data-delete-own="${q.id}">${UI("deleteBtn")}</button>
        </div>
        <div class="field" style="margin-top:.6rem;">
          <label>${UI("answerInputLabel")}</label>
          <textarea data-answer-input="${q.id}" placeholder="${UI("answerInputPlaceholder")}"></textarea>
        </div>
        <div class="field">
          <label>${UI("noteInputLabel")}</label>
          <textarea data-explanation-input="${q.id}"></textarea>
        </div>
        <button type="button" class="btn small" data-save-answer="${q.id}">${UI("saveAnswerBtn")}</button>
      </div>
    `;
  }

  function answeredItem(q) {
    return `
      <div class="question-list-item">
        <p><strong>${UI("questionLabel")}</strong> ${escapeHtml(q.question)}</p>
        <p><strong>${UI("answerLabel")}</strong> ${escapeHtml(q.modelAnswer || "")}</p>
        ${q.explanation ? `<p><strong>${UI("noteLabel")}</strong> ${escapeHtml(q.explanation)}</p>` : ""}
        <p class="muted">${UI("alreadyInTestsNote")}</p>
        <button type="button" class="btn small danger" data-delete-own="${q.id}">${UI("deleteBtn")}</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card">
      <h2>${UI("ownTabHeading")}</h2>
      <p class="muted">${UI("ownTabDesc")}</p>
      <div class="field">
        <label>${UI("newQuestionLabel")}</label>
        <textarea id="own-q-text" placeholder="${UI("newQuestionPlaceholder")}"></textarea>
      </div>
      <button class="btn" id="save-own-question-btn">${UI("saveQuestionBtn")}</button>
    </div>
    <div class="card">
      <h2>${UI("pendingHeading", pending.length)}</h2>
      ${pending.map(pendingItem).join("") || `<p class="muted">${UI("noPending")}</p>`}
    </div>
    <div class="card">
      <h2>${UI("answeredHeading", answered.length)}</h2>
      ${answered.map(answeredItem).join("") || `<p class="muted">${UI("noAnswered")}</p>`}
    </div>
  `;

  document.getElementById("save-own-question-btn").addEventListener("click", () => {
    const text = document.getElementById("own-q-text").value.trim();
    if (!text) return;
    state.data.questions.push({
      id: uid("own"),
      topicId: null,
      parentId: null,
      type: "open",
      own: true,
      answered: false,
      question: text,
      options: [],
      correctIndex: null,
      modelAnswer: "",
      explanation: "",
      order: state.data.questions.length + 1,
    });
    saveData();
    renderOwnQuestionsTab();
  });

  container.querySelectorAll("[data-copy-own]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const q = getQuestion(btn.dataset.copyOwn);
      try {
        await navigator.clipboard.writeText(q.question);
        btn.textContent = UI("copiedBtn");
        setTimeout(() => (btn.textContent = UI("copyQuestionBtn")), 1500);
      } catch (e) {
        alert(UI("copyFailAlert"));
      }
    });
  });

  container.querySelectorAll("[data-save-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.saveAnswer;
      const q = getQuestion(id);
      const answer = container.querySelector(`[data-answer-input="${id}"]`).value.trim();
      const note = container.querySelector(`[data-explanation-input="${id}"]`).value.trim();
      if (!answer) {
        alert(UI("saveAnswerAlert"));
        return;
      }
      q.modelAnswer = answer;
      q.explanation = note;
      q.answered = true;
      saveData();
      renderOwnQuestionsTab();
    });
  });

  container.querySelectorAll("[data-delete-own]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm(UI("deleteOwnConfirm"))) return;
      const id = btn.dataset.deleteOwn;
      state.data.questions = state.data.questions.filter((q) => q.id !== id);
      saveData();
      deletePhoto(id);
      renderOwnQuestionsTab();
    });
  });
}

/* ---------- Как се ползва ---------- */

function renderGuide() {
  const container = document.getElementById("guide-container");
  const steps = UI("guide1Steps")
    .map((s) => s.replace("{part1}", partLabel(1)).replace("{part2}", partLabel(2)))
    .map((s) => `<li>${s}</li>`)
    .join("");
  container.innerHTML = `
    <div class="card">
      <h2>${UI("guideIntroTitle")}</h2>
      <p class="muted">${UI("guideIntroDesc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide1Title")}</h2>
      <p>${UI("guide1Intro")}</p>
      <ol>${steps}</ol>
    </div>

    <div class="card">
      <h2>${UI("guide2Title")}</h2>
      <p>${UI("guide2Desc")}</p>
      <p class="muted">${UI("guide2Note")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide3Title")}</h2>
      <p>${UI("guide3Desc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide4Title")}</h2>
      <p>${UI("guide4Desc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide5Title")}</h2>
      <p>${UI("guide5Desc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide6Title")}</h2>
      <p>${UI("guide6Desc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guide7Title")}</h2>
      <p>${UI("guide7Desc")}</p>
    </div>

    <div class="card">
      <h2>${UI("guideCopyrightTitle")}</h2>
      <p>${UI("guideCopyrightDesc")}</p>
    </div>
  `;
}

/* ---------- Export / Import / Reset ---------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `verkehrsleiter-daten-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.topics || !parsed.questions) throw new Error(UI("importInvalidFormat"));
      if (!confirm(UI("importConfirm"))) return;
      state.data = parsed;
      saveData();
      renderAdmin();
    } catch (e) {
      alert(UI("importInvalidAlert"));
    }
  };
  reader.readAsText(file);
  evt.target.value = "";
}

function resetToSeed() {
  if (!confirm(UI("resetSeedConfirm"))) return;
  state.data = structuredClone(SEED_DATA);
  saveData();
  clearAllPhotos();
  renderAdmin();
}

/* ---------- Utils ---------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* ---------- Init ---------- */

function init() {
  state.data = loadData();
  state.progress = loadProgress();
  initTabs();
  initLangToggle();
  switchView("study");
}

document.addEventListener("DOMContentLoaded", init);
