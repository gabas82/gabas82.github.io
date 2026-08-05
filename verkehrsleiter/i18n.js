"use strict";

/* Речник на целия интерфейс (не съдържанието на въпросите — това е отделно,
   виж t()/tOptions() в app.js). Всеки ключ има bg/de стойност — низ или
   функция(args), ако текстът съдържа динамични части (брой, име и т.н.). */
const UI_STRINGS = {
  // Заглавна част
  appSubtitle: {
    bg: "Учебно помагало за подготовка за IHK-Fachkundeprüfung",
    de: "Lernhilfe zur Vorbereitung auf die IHK-Fachkundeprüfung",
  },
  langToggleTitle: {
    bg: "Език на целия интерфейс и на въпросите",
    de: "Sprache der gesamten Oberfläche und der Fragen",
  },
  langCaption: {
    bg: "✓ Езикът е превключен на български.",
    de: "✓ Die Sprache wurde auf Deutsch umgeschaltet.",
  },
  footerNote: {
    bg: "Данните се пазят локално в браузъра на това устройство. Изтегляй редовно резервно копие от „Управление на съдържанието“.",
    de: "Die Daten werden nur lokal im Browser dieses Geräts gespeichert. Lade regelmäßig ein Backup über „Inhaltsverwaltung“ herunter.",
  },

  part1Label: { bg: "Част 1 (Teil 1)", de: "Teil 1" },
  part2Label: { bg: "Част 2 (Teil 2)", de: "Teil 2" },

  // Навигация
  navStudy: { bg: "Учи", de: "Lernen" },
  navAdmin: { bg: "Управление на съдържанието", de: "Inhaltsverwaltung" },
  navStats: { bg: "Статистика", de: "Statistik" },
  navOwn: { bg: "Твой въпрос", de: "Deine Frage" },
  navGuide: { bg: "Как се ползва", de: "Anleitung" },

  // Учи: настройка
  setupTitle: { bg: "Настрой теста", de: "Test einstellen" },
  topicLabel: { bg: "Тема", de: "Thema" },
  allTopicsOption: {
    bg: (n) => `Всички теми — смесен тест (${n})`,
    de: (n) => `Alle Themen — gemischter Test (${n})`,
  },
  shuffleLabel: { bg: "Разбъркай въпросите", de: "Fragen mischen" },
  wrongOnlyLabel: {
    bg: "Само въпроси, на които преди си отговорил(а) грешно",
    de: "Nur Fragen, die du vorher falsch beantwortet hast",
  },
  startBtn: { bg: "Започни", de: "Starten" },
  examTitle: { bg: "Пробен изпит", de: "Probeprüfung" },
  examDesc: {
    bg: (n, total) =>
      `Избира ${n} въпроса от всички теми (Част 1 и Част 2, плюс отговорените ти лични въпроси). Приоритет имат тези, на които никога не си отговаряла, или последно си сгрешила — за да се учат по-лесно; след тях се допълва на ротационен принцип с останалите, отдавна невключвани. В момента общо разполагаеми: ${total}.`,
    de: (n, total) =>
      `Wählt ${n} Fragen aus allen Themen (Teil 1 und Teil 2, plus deine beantworteten eigenen Fragen). Priorität haben Fragen, die du noch nie beantwortet oder zuletzt falsch beantwortet hast — damit sie leichter gelernt werden; danach wird rotierend mit den übrigen, lange nicht abgefragten Fragen aufgefüllt. Aktuell insgesamt verfügbar: ${total}.`,
  },
  examStartBtn: {
    bg: (n) => `Започни пробен изпит (${n} въпроса)`,
    de: (n) => `Probeprüfung starten (${n} Fragen)`,
  },
  noQuestionsForFilter: {
    bg: 'Няма въпроси за тези настройки. Добави въпроси от "Управление на съдържанието" или махни филтъра.',
    de: 'Keine Fragen für diese Einstellungen. Füge Fragen über "Inhaltsverwaltung" hinzu oder entferne den Filter.',
  },
  noQuestionsAtAll: {
    bg: 'Все още няма въпроси в базата. Добави въпроси от "Управление на съдържанието".',
    de: 'Es gibt noch keine Fragen in der Datenbank. Füge Fragen über "Inhaltsverwaltung" hinzu.',
  },

  // Учи: самият въпрос
  ownQuestionPillFallback: { bg: "Твой допълнителен въпрос", de: "Deine zusätzliche Frage" },
  followUpTag: {
    bg: "↳ Свързан казус към предходния въпрос",
    de: "↳ Verknüpfter Fall zur vorherigen Frage",
  },
  openAnswerPlaceholder: {
    bg: "(по желание) напиши своя отговор тук, преди да провериш верния...",
    de: "(optional) schreibe hier deine Antwort, bevor du die richtige Antwort prüfst...",
  },
  revealBtn: { bg: "Покажи верния отговор", de: "Richtige Antwort anzeigen" },
  correctBanner: { bg: "✓ Вярно", de: "✓ Richtig" },
  wrongBanner: { bg: "✗ Грешно", de: "✗ Falsch" },
  modelAnswerLabel: { bg: "Модел за верен отговор:", de: "Musterantwort:" },
  noModelAnswerText: { bg: "(няма въведен)", de: "(nicht eingegeben)" },
  explanationLabel: { bg: "Обяснение:", de: "Erklärung:" },
  ownNoteText: {
    bg: "Твой допълнителен въпрос — отговорът е от външен източник, който ти сама си записала, не от учебниците.",
    de: "Deine zusätzliche Frage — die Antwort stammt aus einer externen Quelle, die du selbst eingetragen hast, nicht aus den Lehrbüchern.",
  },
  continueFollowUpBtn: { bg: "Продължи към свързания казус →", de: "Weiter zum verknüpften Fall →" },
  nextQuestionBtn: { bg: "Следващ въпрос →", de: "Nächste Frage →" },

  // Учи: обобщение
  summaryTitle: { bg: "Резултат", de: "Ergebnis" },
  examSummaryTitle: {
    bg: (n) => `Резултат от пробния изпит (${n} въпроса)`,
    de: (n) => `Ergebnis der Probeprüfung (${n} Fragen)`,
  },
  correctAnswersLabel: { bg: "Верни отговори:", de: "Richtige Antworten:" },
  examNote: {
    bg: "Прагът за успешен резултат зависи от актуалните изисквания на съответната IHK камара — провери го там. Направи нов пробен изпит по-късно, за да обходиш ротационно и останалите въпроси.",
    de: "Die Bestehensgrenze hängt von den aktuellen Anforderungen der jeweiligen IHK ab — dort prüfen. Mache später eine neue Probeprüfung, um rotierend auch die übrigen Fragen abzudecken.",
  },
  newTestBtn: { bg: "Нов тест", de: "Neuer Test" },

  // Управление на съдържанието
  topicsHeading: { bg: "Теми", de: "Themen" },
  manageQuestionsBtn: { bg: "Управлявай въпроси", de: "Fragen verwalten" },
  deleteTopicBtn: { bg: "Изтрий темата", de: "Thema löschen" },
  noTopicsInPart: { bg: "Все още няма теми в тази част.", de: "Noch keine Themen in diesem Teil." },
  questionCountSuffix: { bg: (n) => `${n} въпрос(а)`, de: (n) => `${n} Frage(n)` },
  newTopicPlaceholder: {
    bg: "Име на новата тема (напр. Straßenverkehrsrecht)",
    de: "Name des neuen Themas (z. B. Straßenverkehrsrecht)",
  },
  addTopicBtn: { bg: "+ Добави тема", de: "+ Thema hinzufügen" },
  backupHeading: { bg: "Резервно копие", de: "Backup" },
  backupDesc: {
    bg: "Съдържанието се пази автоматично в браузъра. За да го запазиш трайно (или пренесеш на друго устройство), изтегли резервно копие.",
    de: "Der Inhalt wird automatisch im Browser gespeichert. Um ihn dauerhaft zu sichern (oder auf ein anderes Gerät zu übertragen), lade ein Backup herunter.",
  },
  exportBtn: { bg: "Изтегли JSON", de: "JSON herunterladen" },
  importBtn: { bg: "Качи JSON", de: "JSON hochladen" },
  resetSeedBtn: { bg: "Върни примерните въпроси", de: "Beispielfragen wiederherstellen" },
  deleteTopicConfirm: {
    bg: (name) => `Да изтрия темата "${name}" и всичките ѝ въпроси?`,
    de: (name) => `Thema "${name}" und alle seine Fragen löschen?`,
  },

  questionsHeading: { bg: (name) => `Въпроси: ${name}`, de: (name) => `Fragen: ${name}` },
  addQuestionBtn: { bg: "+ Добави въпрос", de: "+ Frage hinzufügen" },
  noQuestionsInTopic: { bg: "Все още няма въпроси в тази тема.", de: "Noch keine Fragen in diesem Thema." },
  testPill: { bg: "Тест", de: "Test" },
  openPill: { bg: "Отворен", de: "Offen" },
  editBtn: { bg: "Редактирай", de: "Bearbeiten" },
  deleteBtn: { bg: "Изтрий", de: "Löschen" },
  deleteQuestionWithChildrenConfirm: {
    bg: "Този въпрос има свързани казуси, които също ще бъдат изтрити. Продължи?",
    de: "Diese Frage hat verknüpfte Fälle, die ebenfalls gelöscht werden. Fortfahren?",
  },
  deleteQuestionConfirm: { bg: "Да изтрия този въпрос?", de: "Diese Frage löschen?" },

  // Форма за въпрос
  editQuestionTitle: { bg: "Редактирай въпрос", de: "Frage bearbeiten" },
  newQuestionTitle: { bg: "Нов въпрос", de: "Neue Frage" },
  photoLabel: {
    bg: "Снимка на въпроса от книгата — за лична справка (по желание)",
    de: "Foto der Frage aus dem Buch — nur zur persönlichen Referenz (optional)",
  },
  photoDesc: {
    bg: "Остава само в този браузър, на това устройство — НЕ се публикува никъде, НЕ влиза в резервното копие (JSON износ) и НЕ се качва в интернет. Служи само за твоя памет, докато преписваш въпроса със свои думи в полетата по-долу.",
    de: "Bleibt nur in diesem Browser, auf diesem Gerät — wird NIRGENDWO veröffentlicht, NICHT im Backup (JSON-Export) enthalten und NICHT ins Internet hochgeladen. Dient nur als Gedächtnisstütze, während du die Frage unten mit eigenen Worten einträgst.",
  },
  removePhotoBtn: { bg: "Изтрий снимката", de: "Foto löschen" },
  photoAlt: { bg: "Снимка за лична справка", de: "Foto zur persönlichen Referenz" },
  parentLabel: {
    bg: "Основен въпрос ли е, или свързан казус към друг въпрос?",
    de: "Ist es eine eigenständige Frage oder ein verknüpfter Fall zu einer anderen Frage?",
  },
  parentNoneOption: { bg: "— Самостоятелен (основен) въпрос —", de: "— Eigenständige (Haupt-)Frage —" },
  typeLabel: { bg: "Вид на въпроса", de: "Fragetyp" },
  typeTestOption: { bg: "Тест с избор (А/Б/В...)", de: "Multiple-Choice-Test (A/B/C...)" },
  typeOpenOption: { bg: "Отворен / обяснителен въпрос", de: "Offene / erklärende Frage" },
  questionDeLabel: {
    bg: "Текст на въпроса — немски (препиши със свои думи, вдъхновен от снимката по-горе)",
    de: "Fragetext — Deutsch (mit eigenen Worten, angelehnt an das Foto oben)",
  },
  questionBgLabel: {
    bg: "Текст на въпроса — български (по желание, за бутона БГ/DE)",
    de: "Fragetext — Bulgarisch (optional, für den БГ/DE-Umschalter)",
  },
  optionsLabel: {
    bg: "Отговори — немски (ляво) и български превод (дясно, по желание); маркирай верния",
    de: "Antworten — Deutsch (links) und bulgarische Übersetzung (rechts, optional); richtige markieren",
  },
  addOptionBtn: { bg: "+ Добави отговор", de: "+ Antwort hinzufügen" },
  modelAnswerDeLabel: { bg: "Модел за верен отговор / резюме — немски", de: "Musterantwort / Zusammenfassung — Deutsch" },
  modelAnswerBgLabel: { bg: "Модел за верен отговор — български (по желание)", de: "Musterantwort — Bulgarisch (optional)" },
  explanationDeLabel: {
    bg: "Обяснение — немски (защо е верен отговорът; показва се винаги след отговор)",
    de: "Erklärung — Deutsch (warum die Antwort richtig ist; wird immer nach der Antwort angezeigt)",
  },
  explanationBgLabel: { bg: "Обяснение — български (по желание)", de: "Erklärung — Bulgarisch (optional)" },
  saveBtn: { bg: "Запази", de: "Speichern" },
  cancelBtn: { bg: "Отказ", de: "Abbrechen" },
  optionPlaceholderDe: { bg: (l) => `Отговор ${l} — DE`, de: (l) => `Antwort ${l} — DE` },
  optionPlaceholderBg: { bg: (l) => `Отговор ${l} — БГ (по желание)`, de: (l) => `Antwort ${l} — BG (optional)` },
  correctOptionTitle: { bg: "Верен отговор", de: "Richtige Antwort" },
  alertNoQuestionText: { bg: "Моля, въведи текст на въпроса.", de: "Bitte gib den Fragetext ein." },
  alertNeedTwoOptions: { bg: "Добави поне два отговора.", de: "Füge mindestens zwei Antworten hinzu." },

  // Статистика
  statsHeading: { bg: "Статистика по теми", de: "Statistik nach Themen" },
  thTopic: { bg: "Тема", de: "Thema" },
  thTotal: { bg: "Общо въпроси", de: "Fragen insgesamt" },
  thAnswered: { bg: "Отговорени", de: "Beantwortet" },
  thLastCorrect: { bg: "Последно верни", de: "Zuletzt richtig" },
  thPercent: { bg: "%", de: "%" },
  ownQuestionsSectionLabel: { bg: "Твои допълнителни въпроси", de: "Deine zusätzlichen Fragen" },
  ownQuestionsRowLabel: { bg: "Твои въпроси", de: "Deine Fragen" },
  resetStatsBtn: { bg: "Изчисти статистиката", de: "Statistik zurücksetzen" },
  resetStatsConfirm: {
    bg: "Да изчистя ли цялата статистика (запазените верни/грешни отговори)?",
    de: "Die gesamte Statistik (gespeicherte richtige/falsche Antworten) zurücksetzen?",
  },

  // Твой въпрос
  ownTabHeading: { bg: "Твой допълнителен въпрос", de: "Deine zusätzliche Frage" },
  ownTabDesc: {
    bg: "За неща, които не са ти ясни и не идват директно от двете книги. Записваш въпроса тук, после го задаваш встрани (напр. на мен, в чата с Клод, или на друг източник), и накрая поставяш получения отговор обратно тук. Той остава само в твоята лична база на това устройство и после ще излиза заедно с останалите въпроси в тестовете — ясно отбелязан като „твой допълнителен въпрос“, за да е видно, че не е от учебниците.",
    de: "Für Dinge, die dir nicht klar sind und nicht direkt aus den beiden Büchern stammen. Du trägst die Frage hier ein, stellst sie dann woanders (z. B. mir im Chat mit Claude oder einer anderen Quelle) und trägst am Ende die erhaltene Antwort hier wieder ein. Sie bleibt nur in deiner persönlichen Datenbank auf diesem Gerät und erscheint danach zusammen mit den übrigen Fragen in den Tests — klar als „deine zusätzliche Frage“ gekennzeichnet, damit erkennbar ist, dass sie nicht aus den Lehrbüchern stammt.",
  },
  newQuestionLabel: { bg: "Нов въпрос", de: "Neue Frage" },
  newQuestionPlaceholder: {
    bg: "Напр.: Защо точно 45 часа седмична почивка, а не 24?",
    de: "Z. B.: Warum genau 45 Stunden wöchentliche Ruhezeit und nicht 24?",
  },
  saveQuestionBtn: { bg: "Запази въпроса", de: "Frage speichern" },
  pendingHeading: { bg: (n) => `Чакат отговор (${n})`, de: (n) => `Warten auf Antwort (${n})` },
  noPending: { bg: "Няма чакащи въпроси.", de: "Keine wartenden Fragen." },
  answeredHeading: { bg: (n) => `Отговорени (${n})`, de: (n) => `Beantwortet (${n})` },
  noAnswered: { bg: "Все още няма отговорени.", de: "Noch keine beantwortet." },
  questionLabel: { bg: "Въпрос:", de: "Frage:" },
  answerLabel: { bg: "Отговор:", de: "Antwort:" },
  noteLabel: { bg: "Бележка:", de: "Notiz:" },
  copyQuestionBtn: { bg: "Копирай въпроса", de: "Frage kopieren" },
  copiedBtn: { bg: "Копирано ✓", de: "Kopiert ✓" },
  answerInputLabel: { bg: "Постави отговора тук, когато го получиш", de: "Füge hier die Antwort ein, sobald du sie erhältst" },
  answerInputPlaceholder: { bg: "Отговорът, който получи...", de: "Die Antwort, die du erhalten hast..." },
  noteInputLabel: { bg: "Бележка / обяснение (по желание)", de: "Notiz / Erklärung (optional)" },
  saveAnswerBtn: { bg: "Запази отговора", de: "Antwort speichern" },
  alreadyInTestsNote: {
    bg: 'Вече излиза заедно с останалите въпроси във "Всички теми" и в пробния изпит.',
    de: 'Erscheint bereits zusammen mit den übrigen Fragen unter "Alle Themen" und in der Probeprüfung.',
  },
  deleteOwnConfirm: { bg: "Да изтрия този въпрос?", de: "Diese Frage löschen?" },
  copyFailAlert: {
    bg: "Не успях да копирам автоматично — маркирай текста на въпроса и го копирай ръчно.",
    de: "Automatisches Kopieren fehlgeschlagen — markiere den Fragetext und kopiere ihn manuell.",
  },
  saveAnswerAlert: { bg: "Постави отговора, преди да запазиш.", de: "Füge die Antwort ein, bevor du speicherst." },

  // Импорт/износ/ресет
  importInvalidFormat: { bg: "Невалиден формат", de: "Ungültiges Format" },
  importConfirm: {
    bg: "Това ще замени текущото съдържание с файла, който качваш. Продължи?",
    de: "Dies ersetzt den aktuellen Inhalt durch die hochgeladene Datei. Fortfahren?",
  },
  importInvalidAlert: {
    bg: "Файлът не изглежда валиден JSON износ от това приложение.",
    de: "Die Datei scheint kein gültiger JSON-Export dieser Anwendung zu sein.",
  },
  resetSeedConfirm: {
    bg: "Това ще изтрие текущото съдържание и ще върне примерните въпроси. Препоръчително е първо да изтеглиш резервно копие. Продължи?",
    de: "Dies löscht den aktuellen Inhalt und stellt die Beispielfragen wieder her. Es wird empfohlen, vorher ein Backup herunterzuladen. Fortfahren?",
  },

  // Как се ползва
  guideIntroTitle: { bg: "Как се ползва помагалото", de: "Wie die Lernhilfe funktioniert" },
  guideIntroDesc: { bg: "Кратка легенда — какво прави всеки бутон.", de: "Kurze Anleitung — was jeder Button macht." },

  guide1Title: { bg: "1. Вписване на въпроси от книгите", de: "1. Fragen aus den Büchern eintragen" },
  guide1Intro: { bg: "Отиди в „Управление на съдържанието“:", de: "Gehe zu „Inhaltsverwaltung“:" },
  guide1Steps: {
    bg: [
      "Темите вече са готови, разделени в „{part1}“ и „{part2}“ — точно като главите в двете книги. Ако ти трябва нова тема, пиши ѝ име долу и избери част 1 или 2.",
      "Натисни „Управлявай въпроси“ на темата, по която точно четеш в момента.",
      "Натисни „+ Добави въпрос“.",
      "По желание — прикачи снимка на страницата от книгата с бутона за снимка. Тя остава <strong>само на този телефон/браузър</strong>, само за твоя памет — никога не се публикува, не излиза в резервното копие и не се качва никъде.",
      "Гледайки въпроса в книгата (или снимката), препиши го със свои думи: избери „Тест с избор“ или „Отворен/обяснителен въпрос“, попълни отговорите (при тест) или модела за верен отговор (при отворен), и обяснението защо той е верен.",
      "Всяко поле за текст има два реда — немски (основният, какъвто е на изпита) и български (по желание). Не е задължително да пълниш и двата веднага — можеш да довършиш българския превод по-късно.",
      "Ако от въпроса произлиза свързан казус, добави го като нов въпрос и в полето „Основен въпрос ли е, или свързан казус“ избери въпроса, към който принадлежи — ще излиза автоматично веднага след него.",
      "Натисни „Запази“. Въпросът вече е част от базата.",
    ],
    de: [
      "Die Themen sind bereits fertig, aufgeteilt in „{part1}“ und „{part2}“ — genau wie die Kapitel in den beiden Büchern. Falls du ein neues Thema brauchst, gib unten einen Namen ein und wähle Teil 1 oder 2.",
      "Klicke auf „Fragen verwalten“ bei dem Thema, das du gerade liest.",
      "Klicke auf „+ Frage hinzufügen“.",
      "Optional — hänge ein Foto der Buchseite über den Foto-Button an. Es bleibt <strong>nur auf diesem Telefon/Browser</strong>, nur als Gedächtnisstütze — wird nie veröffentlicht, erscheint nicht im Backup und wird nirgendwo hochgeladen.",
      "Schau dir die Frage im Buch (oder auf dem Foto) an und schreibe sie mit eigenen Worten: wähle „Multiple-Choice-Test“ oder „Offene/erklärende Frage“, fülle die Antworten (bei Test) oder die Musterantwort (bei offen) aus, sowie die Erklärung, warum sie richtig ist.",
      "Jedes Textfeld hat zwei Zeilen — Deutsch (die Hauptsprache, wie in der Prüfung) und Bulgarisch (optional). Du musst nicht beide sofort ausfüllen — die bulgarische Übersetzung kannst du auch später ergänzen.",
      "Wenn sich aus der Frage ein verknüpfter Fall ergibt, füge ihn als neue Frage hinzu und wähle im Feld „Ist es eine eigenständige Frage oder ein verknüpfter Fall“ die Frage aus, zu der er gehört — er erscheint dann automatisch direkt danach.",
      "Klicke auf „Speichern“. Die Frage ist jetzt Teil der Datenbank.",
    ],
  },

  guide2Title: { bg: "2. Бутон БГ/DE", de: "2. БГ/DE-Umschalter" },
  guide2Desc: {
    bg: "Горе вдясно в заглавието има превключвател „БГ / DE“. Той сменя <strong>целия интерфейс</strong> на приложението, както и езика на въпросите, отговорите и обясненията. Ако за даден въпрос няма въведен български превод, автоматично се показва немският текст. Полезно е да учиш на български, докато разбираш материала, и после да превключваш на немски, за да видиш и запомниш точната формулировка, каквато ще ти трябва на изпита.",
    de: "Oben rechts im Kopfbereich gibt es einen Umschalter „БГ / DE“. Er ändert <strong>die gesamte Oberfläche</strong> der App sowie die Sprache der Fragen, Antworten und Erklärungen. Falls für eine Frage keine bulgarische Übersetzung eingegeben wurde, wird automatisch der deutsche Text angezeigt. Es ist nützlich, auf Bulgarisch zu lernen, während du den Stoff verstehst, und danach auf Deutsch umzuschalten, um die genaue Formulierung zu sehen und zu behalten, die du in der Prüfung brauchst.",
  },
  guide2Note: {
    bg: "Малкият надпис с отметка под бутоните потвърждава веднага, че превключването е сработило.",
    de: "Der kleine Hinweis mit Häkchen unter den Buttons bestätigt sofort, dass das Umschalten funktioniert hat.",
  },

  guide3Title: { bg: "3. Учене", de: "3. Lernen" },
  guide3Desc: {
    bg: "В „Учи“ избираш тема (или „Всички теми“), по желание разбъркване или само въпросите, на които преди си грешала, и натискаш „Започни“. При тест веднага виждаш кой отговор е верен (зелено) и кой си избрала грешно (червено), плюс обяснение защо. При отворен въпрос — пишеш (по желание) и показваш верния отговор.",
    de: "Unter „Lernen“ wählst du ein Thema (oder „Alle Themen“), optional Mischen oder nur die Fragen, die du vorher falsch beantwortet hast, und klickst auf „Starten“. Bei einem Test siehst du sofort, welche Antwort richtig ist (grün) und welche du falsch gewählt hast (rot), plus eine Erklärung. Bei einer offenen Frage schreibst du (optional) und zeigst die richtige Antwort an.",
  },

  guide4Title: { bg: "4. Пробен изпит", de: "4. Probeprüfung" },
  guide4Desc: {
    bg: "Бутонът в „Учи“ прави тест от 30 въпроса от цялата база (Част 1 + Част 2 + твоите отговорени лични въпроси). С приоритет излизат тези, които никога не си пробвала или последно си сгрешила — за да се учат по-лесно. С времето, докато базата расте, обхваща постепенно всичко.",
    de: "Der Button unter „Lernen“ erstellt einen Test mit 30 Fragen aus der gesamten Datenbank (Teil 1 + Teil 2 + deine beantworteten eigenen Fragen). Priorität haben Fragen, die du noch nie versucht oder zuletzt falsch beantwortet hast — damit sie leichter gelernt werden. Mit der Zeit, während die Datenbank wächst, wird nach und nach alles abgedeckt.",
  },

  guide5Title: { bg: "5. Твой допълнителен въпрос", de: "5. Deine zusätzliche Frage" },
  guide5Desc: {
    bg: "За неща извън двете книги, които не са ти ясни. Записваш въпроса в раздел „Твой въпрос“, задаваш го встрани (напр. на мен в чата), и после поставяш получения отговор обратно там. Остава завинаги в личната ти база и после излиза заедно с останалите въпроси в тестовете, ясно отбелязан като „твой допълнителен въпрос“ — за да е видно, че не е от учебниците.",
    de: "Für Dinge außerhalb der beiden Bücher, die dir nicht klar sind. Du trägst die Frage im Bereich „Deine Frage“ ein, stellst sie woanders (z. B. mir im Chat), und trägst die erhaltene Antwort danach dort wieder ein. Sie bleibt dauerhaft in deiner persönlichen Datenbank und erscheint danach zusammen mit den übrigen Fragen in den Tests, klar als „deine zusätzliche Frage“ gekennzeichnet — damit erkennbar ist, dass sie nicht aus den Lehrbüchern stammt.",
  },

  guide6Title: { bg: "6. Статистика", de: "6. Statistik" },
  guide6Desc: {
    bg: "Показва процент верни отговори по теми (и за твоите лични въпроси), с бутон за нулиране.",
    de: "Zeigt den Prozentsatz richtiger Antworten nach Themen (und für deine eigenen Fragen), mit einem Button zum Zurücksetzen.",
  },

  guide7Title: { bg: "7. Резервно копие", de: "7. Backup" },
  guide7Desc: {
    bg: "Всичко се пази само в браузъра на устройството (localStorage). От „Управление на съдържанието“ редовно изтегляй JSON резервно копие — особено след като добавиш много въпроси — за да не се загуби при смяна на телефон или изчистване на кеша. При нужда се качва обратно със „Качи JSON“.",
    de: "Alles wird nur im Browser des Geräts gespeichert (localStorage). Lade über „Inhaltsverwaltung“ regelmäßig ein JSON-Backup herunter — besonders nachdem du viele Fragen hinzugefügt hast — damit nichts verloren geht, wenn du das Telefon wechselst oder den Cache leerst. Bei Bedarf lädst du es über „JSON hochladen“ wieder hoch.",
  },

  guideCopyrightTitle: { bg: "Важно за авторските права", de: "Wichtig zum Urheberrecht" },
  guideCopyrightDesc: {
    bg: "Никога не преписвай въпрос дословно, дума по дума от книгата, в текст, който би могъл да стане публичен (сайтът е публично видим). Препиши го със свои думи, докато го учиш — снимката служи само като лична памет и не се публикува. Така помагалото расте без да нарушава правата на автора на двете книги.",
    de: "Übertrage eine Frage niemals wortwörtlich aus dem Buch in einen Text, der öffentlich werden könnte (die Seite ist öffentlich sichtbar). Schreibe sie mit eigenen Worten, während du sie lernst — das Foto dient nur als persönliche Gedächtnisstütze und wird nicht veröffentlicht. So wächst die Lernhilfe, ohne die Rechte des Autors der beiden Bücher zu verletzen.",
  },
};

function UI(key, ...args) {
  const entry = UI_STRINGS[key];
  if (!entry) return key;
  const val = entry[getLang()];
  return typeof val === "function" ? val(...args) : val;
}
