// Примерни начални въпроси — ОРИГИНАЛНО съдържание, написано от нулата по темите
// на изпита "Fachkundeprüfung Güterkraftverkehr (Verkehrsleiter)".
// НЕ е копирано от книгите на Siegfried Allert / AVB Medien Verlag — те са защитени
// с авторски права. Целта на тези въпроси е само да покажат как работи приложението.
// Истинските въпроси от книгите се въвеждат ръчно през "Управление на съдържанието".
//
// Всеки въпрос има немски текст (question/options/modelAnswer/explanation — основните
// полета, каквито се задават на изпита) и по желание успореден български превод
// (questionBg/optionsBg/modelAnswerBg/explanationBg), за бутона БГ/DE.
const SEED_DATA = {
  topics: [
    // Teil 1 — Fragenkatalog Güterkraftverkehr, Teil 1
    {
      id: "t-national",
      name: "Nationaler Güterkraftverkehr",
      description: "Национален товарен автомобилен транспорт",
      part: 1,
    },
    {
      id: "t-international",
      name: "Internationaler Güterkraftverkehr",
      description: "Международен товарен автомобилен транспорт",
      part: 1,
    },
    {
      id: "t-zoll",
      name: "Zoll",
      description: "Митническо право",
      part: 1,
    },
    {
      id: "t-gemischt",
      name: "Gemischter Fragenkatalog",
      description: "Смесен въпросник (обобщение на Част 1)",
      part: 1,
    },
    // Teil 2 — Fragenkatalog Güterkraftverkehr, Teil 2
    {
      id: "t-strassenverkehrsrecht",
      name: "Straßenverkehrsrecht",
      description: "Пътнотранспортно право",
      part: 2,
    },
    {
      id: "t-umweltschutz",
      name: "Umweltschutz",
      description: "Опазване на околната среда",
      part: 2,
    },
    {
      id: "t-versicherungsrecht",
      name: "Versicherungsrecht",
      description: "Застрахователно право",
      part: 2,
    },
    {
      id: "t-adr",
      name: "Gefahrguttransport / ADR-Recht",
      description: "Превоз на опасни товари / ADR",
      part: 2,
    },
  ],
  questions: [
    // --- Nationaler Güterkraftverkehr ---
    {
      id: "q-nat-1",
      topicId: "t-national",
      parentId: null,
      type: "test",
      question:
        "Welche vier Voraussetzungen müssen nach der EU-Verordnung 1071/2009 für den Zugang zum Beruf des Kraftverkehrsunternehmers grundsätzlich erfüllt sein?",
      questionBg:
        "Кои четири условия трябва по принцип да бъдат изпълнени според Регламент (ЕО) 1071/2009 за достъп до професията превозвач?",
      options: [
        "Zuverlässigkeit, finanzielle Leistungsfähigkeit, fachliche Eignung, tatsächlicher und dauerhafter Sitz",
        "Alter über 25 Jahre, Führerschein Klasse CE, Firmensitz in der EU, Deutschkenntnisse",
        "Mindestens 5 Fahrzeuge, eigene Werkstatt, Bankbürgschaft, Mitgliedschaft im Verband",
        "Gewerbeanmeldung, Steuerberater, Handelsregistereintrag, IHK-Mitgliedschaft",
      ],
      optionsBg: [
        "Благонадеждност, финансова стабилност, професионална компетентност, действително и постоянно място на дейност",
        "Възраст над 25 години, свидетелство за управление кат. CE, седалище на фирмата в ЕС, владеене на немски език",
        "Минимум 5 превозни средства, собствен сервиз, банкова гаранция, членство в сдружение",
        "Регистрация на дейност, счетоводител, вписване в търговски регистър, членство в ИХК",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Nach Art. 3 der VO (EG) 1071/2009 sind die vier Grundvoraussetzungen: Zuverlässigkeit (gute Leumund), finanzielle Leistungsfähigkeit, fachliche Eignung (Sachkunde) und ein tatsächlicher und dauerhafter Sitz in einem Mitgliedstaat.",
      explanationBg:
        "Регламент (ЕО) 1071/2009 изисква четири основни условия за достъп до професията превозвач: благонадеждност, финансова стабилност, професионална компетентност и действително и постоянно установено място на дейност в държава членка.",
      order: 1,
    },
    {
      id: "q-nat-2",
      topicId: "t-national",
      parentId: null,
      type: "open",
      question:
        "Was versteht man unter der 'finanziellen Leistungsfähigkeit' eines Verkehrsunternehmers und welcher Betrag ist als Richtwert je Fahrzeug vorgeschrieben?",
      questionBg:
        "Какво се разбира под „финансова стабилност“ на превозвача и каква сума е ориентировъчно предписана на превозно средство?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Der Unternehmer muss nachweisen, dass er über ausreichend Eigenkapital und Reserven verfügt, um den Geschäftsbetrieb ordnungsgemäß zu führen. Als Richtwert gilt: 9.000 € für das erste Fahrzeug und 5.000 € für jedes weitere Fahrzeug (Jahresabschluss durch Steuerberater/Wirtschaftsprüfer bestätigt, alternativ Bankbürgschaft oder Versicherung).",
      modelAnswerBg:
        "Превозвачът трябва да докаже, че разполага с достатъчно собствен капитал и резерви, за да управлява надлежно дейността си. Като ориентировъчна стойност важи: 9000 € за първото превозно средство и по 5000 € за всяко следващо (потвърдени с годишен финансов отчет от счетоводител/одитор, алтернативно банкова гаранция или застраховка).",
      explanation:
        "Wichtig: Die Beträge können sich ändern und sollten im aktuellen Fragenkatalog / bei der IHK verifiziert werden.",
      explanationBg:
        "Важно: Сумите могат да се променят и трябва да се проверяват в актуалния въпросник / при ИХК.",
      order: 2,
    },

    // --- Internationaler Güterkraftverkehr ---
    {
      id: "q-int-1",
      topicId: "t-international",
      parentId: null,
      type: "test",
      question:
        "Wie viele Kabotagebeförderungen dürfen nach VO (EG) 1072/2009 im Anschluss an eine grenzüberschreitende Beförderung im Aufnahmemitgliedstaat innerhalb welchen Zeitraums durchgeführt werden?",
      questionBg:
        "Колко каботажни превоза са разрешени според Регламент (ЕО) 1072/2009 след международен превоз в приемащата държава членка и в какъв срок?",
      options: [
        "Maximal 3 Kabotagebeförderungen innerhalb von 7 Tagen",
        "Maximal 5 Kabotagebeförderungen innerhalb von 14 Tagen",
        "Unbegrenzt viele innerhalb von 30 Tagen",
        "Maximal 1 Kabotagebeförderung innerhalb von 3 Tagen",
      ],
      optionsBg: [
        "Максимум 3 каботажни превоза в рамките на 7 дни",
        "Максимум 5 каботажни превоза в рамките на 14 дни",
        "Неограничен брой в рамките на 30 дни",
        "Максимум 1 каботажен превоз в рамките на 3 дни",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Nach der Entladung der grenzüberschreitenden Ladung dürfen bis zu 3 Kabotagebeförderungen innerhalb von 7 Tagen im Aufnahmemitgliedstaat durchgeführt werden.",
      explanationBg:
        "След разтоварване на международния товар може да се извършат до 3 каботажни превоза в рамките на 7 дни на територията на приемащата държава членка.",
      order: 1,
    },
    {
      id: "q-int-1-follow",
      topicId: "t-international",
      parentId: "q-int-1",
      type: "open",
      question:
        "Verknüpfter Fall: Ein Transportunternehmen führt Kabotage in Deutschland durch und erhält am 4. Tag einen neuen grenzüberschreitenden Auftrag mit Beladung in Deutschland. Darf es danach sofort in einem anderen Mitgliedstaat weiter Kabotage durchführen?",
      questionBg:
        "Свързан казус: Транспортна фирма извършва каботаж в Германия и на 4-тия ден получава нов международен превоз с товарене в Германия. Може ли да продължи да извършва каботаж след това в друга държава членка веднага?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Nicht sofort. Nach Abschluss der Kabotagebeförderungen in einem Mitgliedstaat muss das Fahrzeug diesen Staat leer verlassen oder eine neue 4-Tage-Frist abwarten, bevor in DEMSELBEN Mitgliedstaat mit Fahrzeugen desselben Zulassungsstaats erneut Kabotage durchgeführt werden darf. Kabotage in einem ANDEREN Mitgliedstaat ist erst nach einer neuen grenzüberschreitenden Beförderung dorthin zulässig.",
      modelAnswerBg:
        "Не веднага. След приключване на каботажните превози в дадена държава членка, превозвачът трябва да напусне тази държава с празно превозно средство или да изчака нов период от 4 дни, преди да извърши нов каботаж в СЪЩАТА държава членка с превозни средства от същата държава на регистрация. Каботаж в ДРУГА държава членка е допустим само след ново международно превозване до нея.",
      explanation:
        "Ziel der Regel ist es, eine systematische/dauerhafte Kabotage zu verhindern, die den heimischen Markt des dort niedergelassenen Frachtführers verdrängen würde.",
      explanationBg:
        "Целта на правилото е да предотврати системен/постоянен каботаж, който би заместил вътрешния пазар на превозвача, установен в тази държава.",
      order: 1,
    },

    // --- Zoll ---
    {
      id: "q-zoll-1",
      topicId: "t-zoll",
      parentId: null,
      type: "test",
      question:
        "Welches Zolldokument wird für den Versand von Nicht-Unionswaren im gemeinsamen Versandverfahren (z. B. Schweiz, Türkei) typischerweise verwendet?",
      questionBg:
        "Кой митнически документ обикновено се използва за превоз на несъюзни стоки в общ транзитен режим (напр. Швейцария, Турция)?",
      options: [
        "T1-Versandschein",
        "CMR-Frachtbrief",
        "ATA-Carnet",
        "EUR.1-Warenverkehrsbescheinigung",
      ],
      optionsBg: [
        "T1 транзитен документ",
        "CMR товарителница",
        "ATA карнет",
        "EUR.1 сертификат за движение на стоки",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Das T1-Dokument begleitet Nicht-Unionswaren im externen Versandverfahren, bis die Ware verzollt (in den freien Verkehr überführt) wird. Der CMR-Frachtbrief ist dagegen ein zivilrechtlicher Beförderungsvertrag, kein Zolldokument.",
      explanationBg:
        "T1 придружава несъюзни стоки в транзитен режим до тяхното освобождаване за свободно обращение. CMR товарителницата е гражданскоправен документ за превоз, не митнически документ.",
      order: 1,
    },

    // --- Straßenverkehrsrecht ---
    {
      id: "q-svr-1",
      topicId: "t-strassenverkehrsrecht",
      parentId: null,
      type: "test",
      question:
        "Wie lange darf die tägliche Lenkzeit eines Berufskraftfahrers nach VO (EG) 561/2006 maximal betragen und wie oft darf sie pro Woche verlängert werden?",
      questionBg:
        "Колко максимално може да бъде дневното време на управление на професионален шофьор според Регламент (ЕО) 561/2006 и колко пъти седмично може да се удължава?",
      options: [
        "9 Stunden, bis zu 2× pro Woche auf 10 Stunden verlängerbar",
        "8 Stunden, ohne Verlängerungsmöglichkeit",
        "10 Stunden, täglich verlängerbar auf 11 Stunden",
        "12 Stunden, unbegrenzt verlängerbar",
      ],
      optionsBg: [
        "9 часа, до 2 пъти седмично удължаване до 10 часа",
        "8 часа, без възможност за удължаване",
        "10 часа, всекидневно удължаване до 11 часа",
        "12 часа, неограничено удължаване",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Die tägliche Lenkzeit beträgt grundsätzlich 9 Stunden und darf höchstens zweimal pro Woche auf 10 Stunden verlängert werden.",
      explanationBg:
        "Дневното време на управление е принципно 9 часа и може да се удължава максимум 2 пъти седмично до 10 часа.",
      order: 1,
    },
    {
      id: "q-svr-2",
      topicId: "t-strassenverkehrsrecht",
      parentId: null,
      type: "open",
      question:
        "Welche wöchentliche Mindestruhezeit muss ein Fahrer grundsätzlich einhalten und wie oft darf eine reduzierte Ruhezeit genommen werden?",
      questionBg:
        "Каква минимална седмична почивка трябва по принцип да спазва водачът и колко пъти може да се взима намалена почивка?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Die regelmäßige wöchentliche Ruhezeit beträgt mindestens 45 zusammenhängende Stunden. Sie kann alle zwei aufeinanderfolgende Wochen auf mindestens 24 Stunden reduziert werden, wobei die Verkürzung innerhalb von drei Wochen ausgeglichen werden muss.",
      modelAnswerBg:
        "Редовната седмична почивка е минимум 45 последователни часа. Тя може да се намалява на всеки две последователни седмици до минимум 24 часа, като намалението трябва да бъде компенсирано в рамките на три седмици.",
      explanation:
        "Zwei reduzierte wöchentliche Ruhezeiten dürfen nicht unmittelbar aufeinanderfolgen.",
      explanationBg:
        "Две намалени седмични почивки не могат да следват директно една след друга.",
      order: 2,
    },

    // --- Umweltschutz ---
    {
      id: "q-umwelt-1",
      topicId: "t-umweltschutz",
      parentId: null,
      type: "test",
      question: "Wovon hängt die Höhe der Lkw-Maut in Deutschland unter anderem ab?",
      questionBg:
        "От какво зависи, наред с други неща, размерът на пътната такса (Maut) за камиони в Германия?",
      options: [
        "Achszahl, Schadstoffklasse (Euro-Emissionsklasse) und CO2-Klasse des Fahrzeugs sowie gefahrene Strecke",
        "Nur von der Anzahl der beförderten Paletten",
        "Ausschließlich vom Kraftstoffverbrauch pro 100 km",
        "Nur vom zulässigen Gesamtgewicht, unabhängig von der Strecke",
      ],
      optionsBg: [
        "Брой оси, екологичен клас (Euro клас на емисии) и CO2 клас на превозното средство, както и изминато разстояние",
        "Само от броя на превозените палети",
        "Единствено от разхода на гориво на 100 км",
        "Само от допустимото общо тегло, независимо от разстоянието",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Die Maut berechnet sich u. a. nach Achsklasse, Schadstoffklasse/CO2-Klasse und gefahrener mautpflichtiger Strecke.",
      explanationBg:
        "Таксата се изчислява, наред с други неща, според класа на осите, екологичния/CO2 клас и изминатото платено разстояние.",
      order: 1,
    },

    // --- Versicherungsrecht ---
    {
      id: "q-vers-1",
      topicId: "t-versicherungsrecht",
      parentId: null,
      type: "test",
      question:
        "Nach welchem internationalen Übereinkommen richtet sich grundsätzlich die Haftung des Frachtführers für Verlust oder Beschädigung des Gutes bei grenzüberschreitenden Straßentransporten?",
      questionBg:
        "Според коя международна конвенция по принцип се урежда отговорността на превозвача за загуба или повреда на товара при международен автомобилен превоз?",
      options: [
        "CMR (Übereinkommen über den Beförderungsvertrag im internationalen Straßengüterverkehr)",
        "ADR-Übereinkommen",
        "SOLAS-Übereinkommen",
        "Warschauer Abkommen",
      ],
      optionsBg: [
        "CMR (Конвенция за договора за международен автомобилен превоз на товари)",
        "ADR конвенция",
        "SOLAS конвенция",
        "Варшавска конвенция",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Die CMR regelt die Haftung des Frachtführers im grenzüberschreitenden Straßengüterverkehr, u. a. mit einer Haftungshöchstgrenze von 8,33 Sonderziehungsrechten (SZR) pro kg Rohgewicht des beschädigten/verlorenen Gutes.",
      explanationBg:
        "CMR конвенцията урежда отговорността на превозвача при международен автомобилен превоз на товари, включително максимален размер на обезщетението от 8,33 SDR (специални права на тираж) на килограм бруто тегло на увредената/загубена стока.",
      order: 1,
    },

    // --- ADR ---
    {
      id: "q-adr-1",
      topicId: "t-adr",
      parentId: null,
      type: "test",
      question:
        "Welches Dokument benötigt ein Fahrer, der gefährliche Güter nach ADR im Tankfahrzeug oder in Stückgut über den freigestellten Mengen befördert?",
      questionBg:
        "Какъв документ е необходим на водач, който превозва опасни товари по ADR в цистерна или като насипен товар над освободените количества?",
      options: [
        "Eine gültige ADR-Bescheinigung (Gefahrgutführerschein)",
        "Nur den normalen Führerschein Klasse C/CE",
        "Eine Sondergenehmigung der Polizei für jede Fahrt",
        "Ein internationales Zollcarnet",
      ],
      optionsBg: [
        "Валидно ADR свидетелство (свидетелство за опасни товари)",
        "Само обикновено свидетелство за управление кат. C/CE",
        "Специално полицейско разрешение за всяко пътуване",
        "Международен митнически карнет",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Fahrer, die gefährliche Güter oberhalb der Freigrenzen befördern, benötigen eine gültige ADR-Bescheinigung (Basiskurs, ggf. Aufbaukurse Tank/Klasse 1/Klasse 7), die durch Schulung und Prüfung erworben und alle 5 Jahre erneuert wird.",
      explanationBg:
        "Водачите, превозващи опасни товари над освободените количества, се нуждаят от валидно ADR свидетелство (базов курс, при нужда — надграждащи курсове за цистерни/клас 1/клас 7), издавано след обучение и изпит, с валидност 5 години.",
      order: 1,
    },
    {
      id: "q-adr-2",
      topicId: "t-adr",
      parentId: null,
      type: "open",
      question:
        "Wofür stehen die orangefarbenen Warntafeln an einem Gefahrguttransporter und was bedeuten die Zahlen darauf?",
      questionBg:
        "За какво служат оранжевите предупредителни табели на превозно средство за опасни товари и какво означават числата на тях?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Die orangefarbene Warntafel kennzeichnet ein Fahrzeug mit gefährlichen Gütern. Die obere Zahl (Kemler-Zahl / Gefahrnummer) beschreibt die Art der Gefahr (z. B. Entzündbarkeit, Giftigkeit), die untere Zahl ist die UN-Nummer, die den konkreten Stoff identifiziert.",
      modelAnswerBg:
        "Оранжевата табела обозначава превозно средство с опасни товари. Горното число (число на Kemler / номер на опасност) описва вида на опасността (напр. запалимост, токсичност), долното число е UN номерът, който идентифицира конкретното вещество.",
      explanation:
        "Bei einer verdoppelten Ziffer wird die Gefahr verstärkt angezeigt (z. B. 33 = leicht entzündbarer flüssiger Stoff); ein 'X' vor der Zahl bedeutet, dass der Stoff gefährlich mit Wasser reagiert.",
      explanationBg:
        "При удвоена цифра опасността се обозначава като по-силна (напр. 33 = леснозапалима течност); буквата 'X' пред числото означава, че веществото реагира опасно с вода.",
      order: 2,
    },
  ],
};
