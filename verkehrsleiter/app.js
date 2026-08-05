"use strict";

const STORAGE_KEY = "vl_data_v1";
const PROGRESS_KEY = "vl_progress_v1";

let state = {
  data: null,
  progress: null,
  quiz: null, // active quiz session
};

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
  return part === 2 ? "Част 2 (Teil 2)" : "Част 1 (Teil 1)";
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

/* ---------- Tabs ---------- */

function initTabs() {
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "study") renderStudySetup();
  if (view === "admin") renderAdmin();
  if (view === "stats") renderStats();
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
      <h2>Настрой теста</h2>
      <div class="field">
        <label>Тема</label>
        <select id="study-topic">
          <option value="__all__">Всички теми — смесен тест (${totalQuestions})</option>
          <optgroup label="${partLabel(1)}">${optionsForPart(1)}</optgroup>
          <optgroup label="${partLabel(2)}">${optionsForPart(2)}</optgroup>
        </select>
      </div>
      <div class="row" style="margin-bottom:.8rem;">
        <label style="display:flex;align-items:center;gap:.4rem;margin:0;">
          <input type="checkbox" id="study-shuffle" checked /> Разбъркай въпросите
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;margin:0;">
          <input type="checkbox" id="study-wrong-only" /> Само въпроси, на които преди си отговорил(а) грешно
        </label>
      </div>
      <button class="btn" id="start-quiz-btn">Започни</button>
    </div>
    <div class="card">
      <h2>Пробен изпит</h2>
      <p class="muted">Избира ${EXAM_SIZE} въпроса от всички теми (Част 1 и Част 2) на ротационен принцип — така че при повторни пробни изпити приоритет имат въпросите, които отдавна не си виждала, докато базата расте. В момента общо разполагаеми: ${totalQuestions}.</p>
      <button class="btn secondary" id="start-exam-btn">Започни пробен изпит (${EXAM_SIZE} въпроса)</button>
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
      ? state.data.topics.flatMap((t) => topLevelQuestions(t.id))
      : topLevelQuestions(topicId);

  if (wrongOnly) {
    pool = pool.filter((q) => state.progress[q.id] && state.progress[q.id].lastResult === "wrong");
  }

  if (shuffleOn) pool = shuffle(pool);

  if (pool.length === 0) {
    document.getElementById("quiz-area").innerHTML =
      '<div class="card muted">Няма въпроси за тези настройки. Добави въпроси от "Управление на съдържанието" или махни филтъра.</div>';
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

function startMockExam() {
  const EXAM_SIZE = 30;
  const allTop = state.data.topics.flatMap((t) => topLevelQuestions(t.id));

  if (allTop.length === 0) {
    document.getElementById("quiz-area").innerHTML =
      '<div class="card muted">Все още няма въпроси в базата. Добави въпроси от "Управление на съдържанието".</div>';
    return;
  }

  // Ротация: най-отдавна (или никога) явявалите се на пробен изпит въпроси излизат първи.
  const sorted = allTop.slice().sort((a, b) => {
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
    optionsHtml = q.options
      .map(
        (opt, i) =>
          `<button class="option-btn" data-index="${i}">${String.fromCharCode(65 + i)}) ${escapeHtml(opt)}</button>`
      )
      .join("");
  } else {
    optionsHtml = `
      <textarea id="open-answer" placeholder="(по желание) напиши своя отговор тук, преди да провериш верния..."></textarea>
      <button class="btn secondary" id="reveal-btn" style="margin-top:.5rem;">Покажи верния отговор</button>
    `;
  }

  area.innerHTML = `
    <div class="card">
      <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <span class="pill">${escapeHtml(topic ? topic.name : "")}</span>
      ${isFollowUp ? '<span class="follow-up-tag">↳ Свързан казус към предходния въпрос</span>' : ""}
      <h2 style="margin-top:.6rem;">${escapeHtml(q.question)}</h2>
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
    bannerHtml = '<div class="result-banner correct">✓ Вярно</div>';
    boxClass += " correct";
    recordProgress(q.id, "correct");
    quiz.correctCount++;
  } else if (isCorrect === false) {
    bannerHtml = '<div class="result-banner wrong">✗ Грешно</div>';
    boxClass += " wrong";
    recordProgress(q.id, "wrong");
  } else {
    recordProgress(q.id, "reviewed");
  }
  if (!isFollowUp) quiz.totalAnswered++;

  let modelAnswerHtml = "";
  if (q.type === "open") {
    modelAnswerHtml = `<p><strong>Модел за верен отговор:</strong><br>${escapeHtml(q.modelAnswer || "(няма въведен)")}</p>`;
  }

  feedback.innerHTML = `
    ${bannerHtml}
    <div class="${boxClass}">
      ${modelAnswerHtml}
      ${q.explanation ? `<p><strong>Обяснение:</strong><br>${escapeHtml(q.explanation)}</p>` : ""}
    </div>
  `;

  const followUps = followUpsOf(q.id);
  const nav = document.getElementById("quiz-nav");
  const label = followUps.length > 0 ? "Продължи към свързания казус →" : "Следващ въпрос →";
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
  const title = quiz.isExam ? `Резултат от пробния изпит (${quiz.examSize} въпроса)` : "Резултат";
  const examNote = quiz.isExam
    ? '<p class="muted">Прагът за успешен резултат зависи от актуалните изисквания на съответната IHK камара — провери го там. Направи нов пробен изпит по-късно, за да обходиш ротационно и останалите въпроси.</p>'
    : "";
  area.innerHTML = `
    <div class="card">
      <h2>${title}</h2>
      <p>Верни отговори: <strong>${quiz.correctCount} / ${quiz.totalAnswered}</strong> (${pct}%)</p>
      ${examNote}
      <div class="row">
        <button class="btn" id="restart-btn">Нов тест</button>
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
            <div class="muted">${escapeHtml(t.description || "")} · ${count} въпрос(а)</div>
          </div>
          <div class="row">
            <button class="btn small secondary" data-manage-topic="${t.id}">Управлявай въпроси</button>
            <button class="btn small danger" data-delete-topic="${t.id}">Изтрий темата</button>
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
      ${rows || '<p class="muted">Все още няма теми в тази част.</p>'}
    `;
  }

  container.innerHTML = `
    <div class="card">
      <h2>Теми</h2>
      ${partSection(1)}
      ${partSection(2)}
      <div class="row" style="margin-top:1rem;">
        <input type="text" id="new-topic-name" placeholder="Име на новата тема (напр. Straßenverkehrsrecht)" style="flex:1;min-width:220px;" />
        <select id="new-topic-part" style="max-width:220px;">
          <option value="1">${partLabel(1)}</option>
          <option value="2">${partLabel(2)}</option>
        </select>
        <button class="btn" id="add-topic-btn">+ Добави тема</button>
      </div>
    </div>
    <div id="question-manager"></div>
    <div class="card">
      <h2>Резервно копие</h2>
      <p class="muted">Съдържанието се пази автоматично в браузъра. За да го запазиш трайно (или пренесеш на друго устройство), изтегли резервно копие.</p>
      <div class="row">
        <button class="btn secondary" id="export-btn">Изтегли JSON</button>
        <label class="btn secondary" style="margin:0;">
          Качи JSON
          <input type="file" id="import-input" accept="application/json" class="hidden" />
        </label>
        <button class="btn danger" id="reset-seed-btn">Върни примерните въпроси</button>
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
  if (!confirm(`Да изтрия темата "${topic.name}" и всичките ѝ въпроси?`)) return;
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
                <span class="pill">${q.type === "test" ? "Тест" : "Отворен"}</span>
                ${escapeHtml(q.question).slice(0, 100)}${q.question.length > 100 ? "…" : ""}
              </div>
              <div class="row">
                <button class="btn small secondary" data-edit-q="${q.id}">Редактирай</button>
                <button class="btn small danger" data-delete-q="${q.id}">Изтрий</button>
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
        <h2>Въпроси: ${escapeHtml(topic.name)}</h2>
        <button class="btn" id="add-question-btn">+ Добави въпрос</button>
      </div>
      ${tree || '<p class="muted">Все още няма въпроси в тази тема.</p>'}
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
  const msg = hasChildren
    ? "Този въпрос има свързани казуси, които също ще бъдат изтрити. Продължи?"
    : "Да изтрия този въпрос?";
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
          q.question.slice(0, 60)
        )}</option>`
    )
    .join("");

  const type = editing ? editing.type : "test";
  const options = editing && editing.options && editing.options.length ? editing.options : ["", ""];
  const formId = editing ? editing.id : uid("q");

  wrap.innerHTML = `
    <div class="card" style="background:var(--accent-bg);margin-top:1rem;">
      <h2>${editing ? "Редактирай въпрос" : "Нов въпрос"}</h2>

      <div class="field">
        <label>Снимка на въпроса от книгата — за лична справка (по желание)</label>
        <p class="muted" style="margin-top:0;">
          Остава само в този браузър, на това устройство — НЕ се публикува никъде, НЕ влиза в резервното копие (JSON износ) и НЕ се качва в интернет. Служи само за твоя памет, докато преписваш въпроса със свои думи в полетата по-долу.
        </p>
        <input type="file" id="q-photo-input" accept="image/*" capture="environment" />
        <div id="q-photo-preview" style="margin-top:.5rem;"></div>
      </div>

      <div class="field">
        <label>Основен въпрос ли е, или свързан казус към друг въпрос?</label>
        <select id="q-parent">
          <option value="">— Самостоятелен (основен) въпрос —</option>
          ${parentOptions}
        </select>
      </div>
      <div class="field">
        <label>Вид на въпроса</label>
        <select id="q-type">
          <option value="test" ${type === "test" ? "selected" : ""}>Тест с избор (А/Б/В...)</option>
          <option value="open" ${type === "open" ? "selected" : ""}>Отворен / обяснителен въпрос</option>
        </select>
      </div>
      <div class="field">
        <label>Текст на въпроса (препиши със свои думи, вдъхновен от снимката по-горе)</label>
        <textarea id="q-text">${editing ? escapeHtml(editing.question) : ""}</textarea>
      </div>

      <div id="test-fields" class="field">
        <label>Отговори (маркирай верния)</label>
        <div id="options-list"></div>
        <button type="button" class="btn small secondary" id="add-option-btn">+ Добави отговор</button>
      </div>

      <div id="open-fields" class="field hidden">
        <label>Модел за верен отговор / резюме</label>
        <textarea id="q-model-answer">${editing ? escapeHtml(editing.modelAnswer || "") : ""}</textarea>
      </div>

      <div class="field">
        <label>Обяснение (защо е верен отговорът; показва се винаги след отговор)</label>
        <textarea id="q-explanation">${editing ? escapeHtml(editing.explanation || "") : ""}</textarea>
      </div>

      <div class="row">
        <button class="btn" id="save-question-btn">Запази</button>
        <button class="btn secondary" id="cancel-question-btn">Отказ</button>
      </div>
    </div>
  `;

  const optionsListEl = document.getElementById("options-list");
  let currentOptions = options.slice();
  let correctIndex = editing && editing.correctIndex != null ? editing.correctIndex : 0;

  function renderOptions() {
    optionsListEl.innerHTML = currentOptions
      .map(
        (opt, i) => `
        <div class="option-input-row">
          <input type="radio" name="correct-opt" value="${i}" ${i === correctIndex ? "checked" : ""} title="Верен отговор" />
          <input type="text" data-opt-index="${i}" value="${escapeHtml(opt)}" placeholder="Отговор ${String.fromCharCode(65 + i)}" />
          ${currentOptions.length > 2 ? `<button type="button" class="btn small danger" data-remove-opt="${i}">✕</button>` : ""}
        </div>
      `
      )
      .join("");

    optionsListEl.querySelectorAll("input[type=text]").forEach((inp) => {
      inp.addEventListener("input", () => {
        currentOptions[Number(inp.dataset.optIndex)] = inp.value;
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
        if (correctIndex >= currentOptions.length) correctIndex = 0;
        renderOptions();
      });
    });
  }
  renderOptions();

  document.getElementById("add-option-btn").addEventListener("click", () => {
    currentOptions.push("");
    renderOptions();
  });

  function toggleTypeFields() {
    const t = document.getElementById("q-type").value;
    document.getElementById("test-fields").classList.toggle("hidden", t !== "test");
    document.getElementById("open-fields").classList.toggle("hidden", t !== "open");
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
      <img src="${dataUrl}" alt="Снимка за лична справка" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--border);display:block;" />
      <button type="button" class="btn small danger" id="remove-photo-btn" style="margin-top:.4rem;">Изтрий снимката</button>
    `;
    document.getElementById("remove-photo-btn").addEventListener("click", async () => {
      await deletePhoto(formId);
      renderPhotoPreview(null);
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
      alert("Моля, въведи текст на въпроса.");
      return;
    }
    const qType = document.getElementById("q-type").value;
    const parentId = document.getElementById("q-parent").value || null;

    const payload = {
      topicId: activeManagedTopicId,
      parentId,
      type: qType,
      question: questionText,
      explanation: document.getElementById("q-explanation").value.trim(),
      order: editing ? editing.order : state.data.questions.length + 1,
    };

    if (qType === "test") {
      const cleanOptions = currentOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      if (cleanOptions.length < 2) {
        alert("Добави поне два отговора.");
        return;
      }
      payload.options = cleanOptions;
      payload.correctIndex = Math.min(correctIndex, cleanOptions.length - 1);
      payload.modelAnswer = "";
    } else {
      payload.options = [];
      payload.correctIndex = null;
      payload.modelAnswer = document.getElementById("q-model-answer").value.trim();
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

  container.innerHTML = `
    <div class="card">
      <h2>Статистика по теми</h2>
      <table>
        <thead><tr><th>Тема</th><th>Общо въпроси</th><th>Отговорени</th><th>Последно верни</th><th>%</th></tr></thead>
        <tbody>${rowsForPart(1)}${rowsForPart(2)}</tbody>
      </table>
      <div class="row" style="margin-top:1rem;">
        <button class="btn danger" id="reset-progress-btn">Изчисти статистиката</button>
      </div>
    </div>
  `;
  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (!confirm("Да изчистя ли цялата статистика (запазените верни/грешни отговори)?")) return;
    state.progress = {};
    saveProgress();
    renderStats();
  });
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
      if (!parsed.topics || !parsed.questions) throw new Error("Невалиден формат");
      if (!confirm("Това ще замени текущото съдържание с файла, който качваш. Продължи?")) return;
      state.data = parsed;
      saveData();
      renderAdmin();
    } catch (e) {
      alert("Файлът не изглежда валиден JSON износ от това приложение.");
    }
  };
  reader.readAsText(file);
  evt.target.value = "";
}

function resetToSeed() {
  if (!confirm("Това ще изтрие текущото съдържание и ще върне примерните въпроси. Препоръчително е първо да изтеглиш резервно копие. Продължи?")) return;
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
  switchView("study");
}

document.addEventListener("DOMContentLoaded", init);
