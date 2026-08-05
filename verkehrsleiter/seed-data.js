// Примерни начални въпроси — ОРИГИНАЛНО съдържание, написано от нулата по темите
// на изпита "Fachkundeprüfung Güterkraftverkehr (Verkehrsleiter)".
// НЕ е копирано от книгите на Siegfried Allert / AVB Medien Verlag — те са защитени
// с авторски права. Целта на тези въпроси е само да покажат как работи приложението.
// Истинските въпроси от книгите се въвеждат ръчно през "Управление на съдържанието".
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
      options: [
        "Zuverlässigkeit, finanzielle Leistungsfähigkeit, fachliche Eignung, tatsächlicher und dauerhafter Sitz",
        "Alter über 25 Jahre, Führerschein Klasse CE, Firmensitz in der EU, Deutschkenntnisse",
        "Mindestens 5 Fahrzeuge, eigene Werkstatt, Bankbürgschaft, Mitgliedschaft im Verband",
        "Gewerbeanmeldung, Steuerberater, Handelsregistereintrag, IHK-Mitgliedschaft",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Nach Art. 3 der VO (EG) 1071/2009 sind die vier Grundvoraussetzungen: Zuverlässigkeit (gute Leumund), finanzielle Leistungsfähigkeit, fachliche Eignung (Sachkunde) und ein tatsächlicher und dauerhafter Sitz in einem Mitgliedstaat.\n\nНа български: Регламент (ЕО) 1071/2009 изисква четири основни условия за достъп до професията превозвач: благонадеждност, финансова стабилност, професионална компетентност и действително и постоянно established място на дейност в държава членка.",
      order: 1,
    },
    {
      id: "q-nat-2",
      topicId: "t-national",
      parentId: null,
      type: "open",
      question:
        "Was versteht man unter der 'finanziellen Leistungsfähigkeit' eines Verkehrsunternehmers und welcher Betrag ist als Richtwert je Fahrzeug vorgeschrieben?",
      options: [],
      correctIndex: null,
      modelAnswer:
        "Der Unternehmer muss nachweisen, dass er über ausreichend Eigenkapital und Reserven verfügt, um den Geschäftsbetrieb ordnungsgemäß zu führen. Als Richtwert gilt: 9.000 € für das erste Fahrzeug und 5.000 € für jedes weitere Fahrzeug (Jahresabschluss durch Steuerberater/Wirtschaftsprüfer bestätigt, alternativ Bankbürgschaft oder Versicherung).",
      explanation:
        "Wichtig: Die Beträge können sich ändern und sollten im aktuellen Fragenkatalog / bei der IHK verifiziert werden.\n\nНа български: Финансовата стабилност се доказва с капитал и резерви — ориентировъчно 9000 € за първото превозно средство и по 5000 € за всяко следващо, потвърдени от годишен финансов отчет или банкова гаранция. Сумите могат да се променят — да се провери актуалната стойност.",
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
      options: [
        "Maximal 3 Kabotagebeförderungen innerhalb von 7 Tagen",
        "Maximal 5 Kabotagebeförderungen innerhalb von 14 Tagen",
        "Unbegrenzt viele innerhalb von 30 Tagen",
        "Maximal 1 Kabotagebeförderung innerhalb von 3 Tagen",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Nach der Entladung der grenzüberschreitenden Ladung dürfen bis zu 3 Kabotagebeförderungen innerhalb von 7 Tagen im Aufnahmemitgliedstaat durchgeführt werden.\n\nНа български: След разтоварване на международния товар може да се извършат до 3 каботажни превоза в рамките на 7 дни на територията на приемащата държава членка.",
      order: 1,
    },
    {
      id: "q-int-1-follow",
      topicId: "t-international",
      parentId: "q-int-1",
      type: "open",
      question:
        "Свързан казус: Транспортна фирма извършва каботаж в Германия и на 4-тия ден получава нов международен превоз с товарене в Германия. Може ли да продължи да извършва каботаж след това в друга държава членка веднага?",
      options: [],
      correctIndex: null,
      modelAnswer:
        "Не веднага. След приключване на каботажните превози в дадена държава членка, превозвачът трябва да напусне тази държава с празно превозно средство или да изчака нов период от 4 дни, преди да извърши нов каботаж в СЪЩАТА държава членка с превозни средства от същата държава на регистрация. Каботаж в ДРУГА държава членка е допустим само след ново международно превозване до нея.",
      explanation:
        "Целта на правилото е да предотврати системен/постоянен каботаж, който би заместил вътрешния пазар на превозвача domicile в тази държава.",
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
      options: [
        "T1-Versandschein",
        "CMR-Frachtbrief",
        "ATA-Carnet",
        "EUR.1-Warenverkehrsbescheinigung",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Das T1-Dokument begleitet Nicht-Unionswaren im externen Versandverfahren, bis die Ware verzollt (in den freien Verkehr überführt) wird. Der CMR-Frachtbrief ist dagegen ein zivilrechtlicher Beförderungsvertrag, kein Zolldokument.\n\nНа български: T1 придружава несъюзни стоки в транзитен режим до тяхното освобождаване за свободно обращение. CMR товарителницата е гражданскоправен документ за превоз, не митнически документ.",
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
      options: [
        "9 Stunden, bis zu 2× pro Woche auf 10 Stunden verlängerbar",
        "8 Stunden, ohne Verlängerungsmöglichkeit",
        "10 Stunden, täglich verlängerbar auf 11 Stunden",
        "12 Stunden, unbegrenzt verlängerbar",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Die tägliche Lenkzeit beträgt grundsätzlich 9 Stunden und darf höchstens zweimal pro Woche auf 10 Stunden verlängert werden.\n\nНа български: Дневното време на управление е принципно 9 часа и може да се удължава максимум 2 пъти седмично до 10 часа.",
      order: 1,
    },
    {
      id: "q-svr-2",
      topicId: "t-strassenverkehrsrecht",
      parentId: null,
      type: "open",
      question:
        "Welche wöchentliche Mindestruhezeit muss ein Fahrer grundsätzlich einhalten und wie oft darf eine reduzierte Ruhezeit genommen werden?",
      options: [],
      correctIndex: null,
      modelAnswer:
        "Die regelmäßige wöchentliche Ruhezeit beträgt mindestens 45 zusammenhängende Stunden. Sie kann alle zwei aufeinanderfolgende Wochen auf mindestens 24 Stunden reduziert werden, wobei die Verkürzung innerhalb von drei Wochen ausgeglichen werden muss.",
      explanation:
        "Zwei reduzierte wöchentliche Ruhezeiten dürfen nicht unmittelbar aufeinanderfolgen.\n\nНа български: Редовната седмична почивка е минимум 45 последователни часа, като на всеки две последователни седмици може да се намали до 24 часа, но намалението трябва да се компенсира в рамките на три седмици.",
      order: 2,
    },

    // --- Umweltschutz ---
    {
      id: "q-umwelt-1",
      topicId: "t-umweltschutz",
      parentId: null,
      type: "test",
      question:
        "Wovon hängt die Höhe der Lkw-Maut in Deutschland unter anderem ab?",
      options: [
        "Achszahl, Schadstoffklasse (Euro-Emissionsklasse) und CO2-Klasse des Fahrzeugs sowie gefahrene Strecke",
        "Nur von der Anzahl der beförderten Paletten",
        "Ausschließlich vom Kraftstoffverbrauch pro 100 km",
        "Nur vom zulässigen Gesamtgewicht, unabhängig von der Strecke",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Die Maut berechnet sich u. a. nach Achsklasse, Schadstoffklasse/CO2-Klasse und gefahrener mautpflichtiger Strecke.\n\nНа български: Пътната такса (Maut) в Германия зависи от броя оси, екологичния клас (Euro клас/CO2 клас) на превозното средство и изминатото разстояние по платените пътища.",
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
      options: [
        "CMR (Übereinkommen über den Beförderungsvertrag im internationalen Straßengüterverkehr)",
        "ADR-Übereinkommen",
        "SOLAS-Übereinkommen",
        "Warschauer Abkommen",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Die CMR regelt die Haftung des Frachtführers im grenzüberschreitenden Straßengüterverkehr, u. a. mit einer Haftungshöchstgrenze von 8,33 Sonderziehungsrechten (SZR) pro kg Rohgewicht des beschädigten/verlorenen Gutes.\n\nНа български: CMR конвенцията урежда отговорността на превозвача при международен автомобилен превоз на товари, включително максимален размер на обезщетението от 8,33 SDR (специални права на тираж) на килограм бруто тегло на увредената/загубена стока.",
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
      options: [
        "Eine gültige ADR-Bescheinigung (Gefahrgutführerschein)",
        "Nur den normalen Führerschein Klasse C/CE",
        "Eine Sondergenehmigung der Polizei für jede Fahrt",
        "Ein internationales Zollcarnet",
      ],
      correctIndex: 0,
      modelAnswer: "",
      explanation:
        "Fahrer, die gefährliche Güter oberhalb der Freigrenzen befördern, benötigen eine gültige ADR-Bescheinigung (Basiskurs, ggf. Aufbaukurse Tank/Klasse 1/Klasse 7), die durch Schulung und Prüfung erworben und alle 5 Jahre erneuert wird.\n\nНа български: Водачите, превозващи опасни товари над освободените количества, се нуждаят от валидно ADR свидетелство (базов курс, при нужда — надграждащи курсове за цистерни/клас 1/клас 7), издавано след обучение и изпит, с валидност 5 години.",
      order: 1,
    },
    {
      id: "q-adr-2",
      topicId: "t-adr",
      parentId: null,
      type: "open",
      question:
        "Wofür stehen die orangefarbenen Warntafeln an einem Gefahrguttransporter und was bedeuten die Zahlen darauf?",
      options: [],
      correctIndex: null,
      modelAnswer:
        "Die orangefarbene Warntafel kennzeichnet ein Fahrzeug mit gefährlichen Gütern. Die obere Zahl (Kemler-Zahl / Gefahrnummer) beschreibt die Art der Gefahr (z. B. Entzündbarkeit, Giftigkeit), die untere Zahl ist die UN-Nummer, die den konkreten Stoff identifiziert.",
      explanation:
        "Bei einer verdoppelten Ziffer wird die Gefahr verstärkt angezeigt (z. B. 33 = leicht entzündbarer flüssiger Stoff); ein 'X' vor der Zahl bedeutet, dass der Stoff gefährlich mit Wasser reagiert.\n\nНа български: Оранжевата табела обозначава превозно средство с опасни товари. Горното число (число на Kemler) показва вида опасност, долното е UN номерът на конкретното вещество. Удвоена цифра означава засилена опасност, а буква 'X' пред числото — опасна реакция с вода.",
      order: 2,
    },
  ],
};
