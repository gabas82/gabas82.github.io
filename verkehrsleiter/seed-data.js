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
    {
      id: "q-nat-3",
      topicId: "t-national",
      parentId: null,
      type: "test",
      question:
        "Welche Aussage über den 'Werkverkehr' nach § 1 Abs. 2 GüKG trifft NICHT zu?",
      questionBg:
        "Кое твърдение за „Werkverkehr“ (превоз за собствена сметка) според § 1, ал. 2 от германския GüKG НЕ е вярно?",
      options: [
        "Die beförderten Güter gehören dem Unternehmen oder wurden von ihm veräußert/erworben",
        "Der Transport dient der Erzielung von Frachtgewinn als Haupterwerbszweck des Unternehmens",
        "Die Fahrzeuge werden von eigenem Personal des Unternehmens geführt",
        "Der Gütertransport ist nur ein Nebengeschäft im Rahmen der Gesamttätigkeit des Unternehmens",
      ],
      optionsBg: [
        "Превозваните стоки принадлежат на предприятието или са продадени/закупени от него",
        "Транспортът служи за реализиране на печалба от превоза като основна дейност на предприятието",
        "Превозните средства се управляват от собствен персонал на предприятието",
        "Превозът на стоки е само съпътстваща дейност в рамките на цялостната дейност на предприятието",
      ],
      correctIndex: 1,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Werkverkehr ist gerade KEIN gewerblicher, gewinnorientierter Güterkraftverkehr — er dient nicht der Erzielung von Frachtgewinn, sondern ist Hilfstätigkeit zur eigentlichen Unternehmenstätigkeit. Deshalb unterliegt er nicht der Erlaubnispflicht nach § 3 GüKG.",
      explanationBg:
        "Werkverkehr точно НЕ е стопански, печеливш товарен транспорт — той не служи за реализиране на печалба от превоза, а е спомагателна дейност към основната дейност на предприятието. Затова не подлежи на изискването за лиценз по § 3 GüKG.",
      order: 3,
    },
    {
      id: "q-nat-4",
      topicId: "t-national",
      parentId: null,
      type: "open",
      question:
        "Welche Konsequenzen drohen einem Unternehmer, der gewerblichen Güterkraftverkehr ohne die nach § 3 GüKG erforderliche Erlaubnis durchführt?",
      questionBg:
        "Какви последствия грозят превозвач, който извършва стопански товарен транспорт без изискваното по § 3 GüKG разрешение?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Es handelt sich um eine Ordnungswidrigkeit (in schweren Fällen ggf. Straftat); es drohen Bußgelder, die Kontrollbehörden (u. a. BAG) können die Weiterfahrt untersagen bzw. Fahrzeug/Ladung sicherstellen, und der Vorfall wirkt sich negativ auf die Zuverlässigkeitsprüfung bei einer künftigen Erlaubnisbeantragung aus.",
      modelAnswerBg:
        "Това е административно нарушение (при тежки случаи евентуално престъпление); грозят глоби, контролните органи (напр. BAG) могат да забранят продължаването на пътуването или да задържат превозното средство/товара, а инцидентът се отразява негативно на проверката за благонадеждност при бъдещо кандидатстване за лиценз.",
      explanation:
        "Zusätzlich haftet der Unternehmer zivilrechtlich für Schäden, die im Rahmen der unerlaubten Fahrt entstehen, wie bei jedem anderen Transport auch.",
      explanationBg:
        "Освен това превозвачът носи и гражданска отговорност за щети, възникнали по време на неразрешения превоз, както при всеки друг транспорт.",
      order: 4,
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
    {
      id: "q-int-2",
      topicId: "t-international",
      parentId: null,
      type: "test",
      question:
        "Welches Dokument muss ein Fahrer bei grenzüberschreitendem gewerblichem Güterkraftverkehr innerhalb der EU im Fahrzeug mitführen?",
      questionBg:
        "Какъв документ трябва да носи водачът в превозното средство при международен стопански автомобилен превоз в рамките на ЕС?",
      options: [
        "Eine beglaubigte Kopie der Gemeinschaftslizenz (bei Drittstaatsangehörigen zusätzlich eine Fahrerbescheinigung)",
        "Nur die nationale Erlaubnis reicht für die gesamte EU aus",
        "Ein ATA-Carnet",
        "Eine CEMT-Genehmigung ist für jede EU-Fahrt zwingend erforderlich",
      ],
      optionsBg: [
        "Заверено копие от Общностния лиценз (при водачи от трети държави — допълнително и свидетелство за водач)",
        "Само националното разрешение е достатъчно за целия ЕС",
        "ATA карнет",
        "CEMT разрешително е задължително за всяко пътуване в ЕС",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Nach VO (EG) 1072/2009 ist für grenzüberschreitenden Verkehr innerhalb der EU eine beglaubigte Kopie der Gemeinschaftslizenz mitzuführen; Fahrer, die Staatsangehörige eines Drittstaats sind, benötigen zusätzlich eine Fahrerbescheinigung.",
      explanationBg:
        "Според Регламент (ЕО) 1072/2009 за международен превоз в рамките на ЕС трябва да се носи заверено копие от Общностния лиценз; водачи, граждани на трета държава, се нуждаят допълнително от свидетелство за водач.",
      order: 2,
    },
    {
      id: "q-int-3",
      topicId: "t-international",
      parentId: null,
      type: "open",
      question:
        "Wofür wird eine CEMT-Genehmigung benötigt und wann kommt sie typischerweise zum Einsatz?",
      questionBg:
        "За какво служи CEMT разрешителното и кога обичайно се използва?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Die CEMT-Genehmigung (Konferenz der europäischen Verkehrsminister) wird für bestimmte grenzüberschreitende gewerbliche Güterkraftverkehre benötigt, die nicht durch die EU-Gemeinschaftslizenz abgedeckt sind — insbesondere für Verkehre mit oder durch Nicht-EU-Staaten, die dem CEMT-System angehören. Sie wird im Rahmen eines jährlichen Kontingentverfahrens zugeteilt.",
      modelAnswerBg:
        "CEMT разрешителното (Конференция на европейските министри на транспорта) е необходимо за определени международни стопански автомобилни превози, които не се покриват от Общностния лиценз на ЕС — най-вече за превози с или през държави извън ЕС, участващи в системата CEMT. Разпределя се по годишна квотна процедура.",
      explanation:
        "Die Anzahl der verfügbaren CEMT-Genehmigungen ist kontingentiert und wird jährlich neu zugeteilt — sie ist daher begrenzt verfügbar.",
      explanationBg:
        "Броят на наличните CEMT разрешителни е квотиран и се разпределя ежегодно наново — затова е ограничен на брой.",
      order: 3,
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
    {
      id: "q-zoll-2",
      topicId: "t-zoll",
      parentId: null,
      type: "test",
      question: "Wofür wird ein ATA-Carnet hauptsächlich verwendet?",
      questionBg: "За какво служи основно ATA карнетът?",
      options: [
        "Vorübergehende zollfreie Einfuhr von Waren (z. B. Berufsausrüstung, Messegüter, Warenmuster)",
        "Dauerhafte Verzollung von Importwaren in den freien Verkehr",
        "Ersatz für die Gemeinschaftslizenz im grenzüberschreitenden Verkehr",
        "Nachweis der Kabotageberechtigung eines Fahrzeugs",
      ],
      optionsBg: [
        "Временен безмитен внос на стоки (напр. професионално оборудване, изложбени стоки, мостри)",
        "Окончателно освобождаване на внасяни стоки за свободно обращение",
        "Заместител на Общностния лиценз при международен превоз",
        "Доказателство за право на каботаж на превозно средство",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Das ATA-Carnet ist ein internationales Zolldokument für die vorübergehende zollfreie Ein-/Ausfuhr bestimmter Warenarten, gültig in den Mitgliedsländern des ATA-Systems, meist mit einer Gültigkeit von bis zu einem Jahr.",
      explanationBg:
        "ATA карнетът е международен митнически документ за временен безмитен внос/износ на определени видове стоки, валиден в държавите — членки на системата ATA, обикновено с валидност до една година.",
      order: 2,
    },
    {
      id: "q-zoll-3",
      topicId: "t-zoll",
      parentId: null,
      type: "open",
      question:
        "Was ist der Unterschied zwischen einer präferenziellen und einer nicht-präferenziellen Ursprungsbescheinigung im Zollrecht?",
      questionBg:
        "Каква е разликата между преференциален и непреференциален сертификат за произход в митническото право?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Eine präferenzielle Ursprungsbescheinigung (z. B. EUR.1) ermöglicht Zollvergünstigungen aufgrund von Freihandelsabkommen zwischen der EU und bestimmten Ländern. Eine nicht-präferenzielle Ursprungsbescheinigung weist lediglich den wirtschaftlichen Ursprung einer Ware nach, ohne Zollvorteile zu gewähren (z. B. für Handelsstatistiken oder Embargoprüfungen).",
      modelAnswerBg:
        "Преференциалният сертификат за произход (напр. EUR.1) дава право на митнически облекчения въз основа на споразумения за свободна търговия между ЕС и определени държави. Непреференциалният сертификат само удостоверява икономическия произход на стоката, без да предоставя митнически предимства (напр. за търговска статистика или проверка на ембарго).",
      explanation:
        "Die Wahl des richtigen Dokuments hängt vom jeweiligen Handelsabkommen und Bestimmungsland ab und sollte im Einzelfall geprüft werden.",
      explanationBg:
        "Изборът на правилния документ зависи от конкретното търговско споразумение и държавата на местоназначение и трябва да се провери за всеки отделен случай.",
      order: 3,
    },

    // --- Gemischter Fragenkatalog ---
    {
      id: "q-gem-1",
      topicId: "t-gemischt",
      parentId: null,
      type: "test",
      question:
        "Welche Institution ist in Deutschland u. a. für die Kontrolle des gewerblichen Güterkraftverkehrs (Lenk- und Ruhezeiten, Kabotage, Erlaubnispflicht) zuständig?",
      questionBg:
        "Коя институция в Германия отговаря, наред с други неща, за контрола на стопанския автомобилен транспорт (време на управление и почивка, каботаж, изискване за лиценз)?",
      options: [
        "Bundesamt für Güterverkehr (BAG)",
        "Kraftfahrt-Bundesamt (KBA)",
        "Bundesnetzagentur",
        "Deutsche Rentenversicherung",
      ],
      optionsBg: [
        "Федерална служба за товарен транспорт (BAG)",
        "Федерална служба за моторни превозни средства (KBA)",
        "Федерална мрежова агенция",
        "Германско пенсионно осигуряване",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Das Bundesamt für Güterverkehr (BAG) kontrolliert u. a. die Einhaltung der Lenk- und Ruhezeiten, der Kabotagevorschriften, der Erlaubnispflicht und weiterer Vorschriften im gewerblichen Güterkraftverkehr.",
      explanationBg:
        "Федералната служба за товарен транспорт (BAG) контролира, наред с други неща, спазването на времето на управление и почивка, каботажните правила, изискването за лиценз и други разпоредби в стопанския автомобилен транспорт.",
      order: 1,
    },
    {
      id: "q-gem-2",
      topicId: "t-gemischt",
      parentId: null,
      type: "open",
      question:
        "Nenne mindestens drei Sachgebiete, die in der Fachkundeprüfung Güterkraftverkehr (Verkehrsleiter) allgemein geprüft werden.",
      questionBg:
        "Посочи поне три предметни области, които обикновено се изпитват на изпита за компетентност Güterkraftverkehr (Verkehrsleiter).",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Beispiele: Zivil- und Handelsrecht, kaufmännische und finanzielle Leitung des Unternehmens, Zugang zum Markt (Erlaubnisrecht), technische Normen und technischer Betrieb, Straßenverkehrssicherheit (u. a. Lenk- und Ruhezeiten), Gefahrguttransport — die genaue Gliederung richtet sich nach dem aktuellen IHK-Fragenkatalog.",
      modelAnswerBg:
        "Примери: гражданско и търговско право, търговско и финансово управление на предприятието, достъп до пазара (лицензионно право), технически норми и техническа експлоатация, безопасност на движението по пътищата (вкл. време на управление и почивка), превоз на опасни товари — точното разделение зависи от актуалния въпросник на ИХК.",
      explanation:
        "Diese Gliederung entspricht grob dem Aufbau der beiden Teile des Fragenkatalogs Güterkraftverkehr (z. B. bei Allert): Teil 1 (nationaler/internationaler Verkehr, Zoll) und Teil 2 (Straßenverkehrsrecht, Umweltschutz, Versicherungsrecht, ADR).",
      explanationBg:
        "Това деление съответства общо на структурата на двете части на въпросника Güterkraftverkehr (напр. на Allert): Част 1 (национален/международен транспорт, митници) и Част 2 (пътен закон, околна среда, застраховане, ADR).",
      order: 2,
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
    {
      id: "q-svr-3",
      topicId: "t-strassenverkehrsrecht",
      parentId: null,
      type: "test",
      question:
        "Ab welchem zulässigen Gesamtgewicht ist grundsätzlich ein Fahrtenschreiber (Kontrollgerät) im gewerblichen Güterkraftverkehr vorgeschrieben?",
      questionBg:
        "От какво допустимо общо тегло по принцип е задължителен тахограф (контролен уред) в стопанския автомобилен транспорт?",
      options: [
        "Über 3,5 Tonnen zulässiges Gesamtgewicht (mit gesetzlichen Ausnahmen)",
        "Über 12 Tonnen zulässiges Gesamtgewicht",
        "Nur bei grenzüberschreitendem Verkehr, unabhängig vom Gewicht",
        "Nur bei Gefahrguttransporten, unabhängig vom Gewicht",
      ],
      optionsBg: [
        "Над 3,5 тона допустимо общо тегло (със законови изключения)",
        "Над 12 тона допустимо общо тегло",
        "Само при международен превоз, независимо от теглото",
        "Само при превоз на опасни товари, независимо от теглото",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Grundsätzlich gilt die Pflicht zum digitalen Kontrollgerät für Fahrzeuge über 3,5 t zulässiges Gesamtgewicht im gewerblichen Güterkraftverkehr; es gibt jedoch gesetzlich geregelte Ausnahmen (z. B. bestimmte Handwerker- oder Werkverkehr-Fahrzeuge) — diese sollten im aktuellen Recht geprüft werden.",
      explanationBg:
        "По принцип задължението за дигитален контролен уред важи за превозни средства над 3,5 тона допустимо общо тегло в стопанския транспорт; съществуват законово уредени изключения (напр. определени превозни средства на занаятчии или Werkverkehr) — те трябва да се проверяват в актуалното законодателство.",
      order: 3,
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
    {
      id: "q-umwelt-2",
      topicId: "t-umweltschutz",
      parentId: null,
      type: "test",
      question:
        "Was benötigt ein Lkw grundsätzlich, um in eine deutsche Umweltzone einfahren zu dürfen?",
      questionBg:
        "От какво по принцип се нуждае камион, за да влезе в екологична зона в Германия?",
      options: [
        "Eine gültige Feinstaubplakette (je nach Schadstoffgruppe)",
        "Eine ADR-Bescheinigung",
        "Ein CEMT-Kontingent",
        "Eine Kabotage-Genehmigung",
      ],
      optionsBg: [
        "Валиден стикер за фини прахови частици (според групата на замърсяване)",
        "ADR свидетелство",
        "CEMT квота",
        "Разрешение за каботаж",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Deutsche Umweltzonen dürfen grundsätzlich nur mit einer gültigen Feinstaubplakette befahren werden, die je nach Schadstoffgruppe des Fahrzeugs vergeben wird; Fahrzeuge ohne oder mit unzureichender Plakette dürfen nicht einfahren.",
      explanationBg:
        "В германските екологични зони по принцип може да се влиза само с валиден стикер за фини прахови частици, издаван според групата на замърсяване на превозното средство; превозни средства без стикер или с недостатъчен стикер нямат право на влизане.",
      order: 2,
    },
    {
      id: "q-umwelt-3",
      topicId: "t-umweltschutz",
      parentId: null,
      type: "open",
      question:
        "Was bedeutet die Euro-Emissionsklasse eines Lkw und warum ist sie für den Verkehrsleiter relevant?",
      questionBg:
        "Какво означава Euro екологичният клас на камион и защо е важен за транспортния мениджър?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Die Euro-Emissionsklasse (z. B. Euro V, Euro VI) gibt an, welche Abgasnormen (u. a. Stickoxide, Partikel) ein Fahrzeug einhält. Sie ist relevant, da sie u. a. die Höhe der Lkw-Maut beeinflusst, den Zugang zu Umweltzonen bestimmt und bei der Flottenplanung und Kostenkalkulation berücksichtigt werden muss.",
      modelAnswerBg:
        "Euro екологичният клас (напр. Euro V, Euro VI) показва какви норми за отработени газове (азотни оксиди, частици и др.) спазва превозното средство. Той е важен, защото влияе на размера на пътната такса, определя достъпа до екологични зони и трябва да се взима предвид при планирането на автопарка и калкулирането на разходите.",
      explanation:
        "Ein Fuhrpark mit höherer Euro-Klasse hat i. d. R. geringere Mautkosten und bessere Zugangsmöglichkeiten zu Umweltzonen, verursacht aber oft höhere Anschaffungskosten.",
      explanationBg:
        "Автопарк с по-висок Euro клас обикновено има по-ниски разходи за пътна такса и по-добър достъп до екологични зони, но често изисква по-високи разходи за придобиване.",
      order: 3,
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
    {
      id: "q-vers-2",
      topicId: "t-versicherungsrecht",
      parentId: null,
      type: "test",
      question:
        "Welche Versicherung ist für jedes zugelassene Kraftfahrzeug in Deutschland gesetzlich vorgeschrieben?",
      questionBg:
        "Коя застраховка е задължителна по закон за всяко регистрирано моторно превозно средство в Германия?",
      options: [
        "Kfz-Haftpflichtversicherung",
        "Kfz-Vollkaskoversicherung",
        "Verkehrsrechtsschutzversicherung",
        "Betriebshaftpflichtversicherung",
      ],
      optionsBg: [
        "Гражданска отговорност на МПС (Kfz-Haftpflicht)",
        "Пълно автокаско",
        "Правна защита при пътнотранспортни произшествия",
        "Обща отговорност на предприятието",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Die Kfz-Haftpflichtversicherung ist in Deutschland für jedes zugelassene Fahrzeug gesetzlich vorgeschrieben und deckt Schäden, die Dritten durch das Fahrzeug zugefügt werden. Kasko-, Rechtsschutz- und Betriebshaftpflichtversicherungen sind dagegen freiwillig bzw. dienen anderen Zwecken.",
      explanationBg:
        "Застраховката „Гражданска отговорност“ на МПС е задължителна по закон в Германия за всяко регистрирано превозно средство и покрива щети, причинени на трети лица от превозното средство. Каско, правна защита и обща отговорност на предприятието са допълнителни и служат за други цели.",
      order: 2,
    },
    {
      id: "q-vers-3",
      topicId: "t-versicherungsrecht",
      parentId: null,
      type: "open",
      question:
        "Was deckt eine Verkehrshaftungsversicherung (Güterschadenhaftpflicht) für einen Frachtführer typischerweise ab?",
      questionBg:
        "Какво обикновено покрива застраховката „отговорност на превозвача“ (Güterschadenhaftpflicht) за превозвач?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Sie deckt die gesetzliche Haftung des Frachtführers für Verlust oder Beschädigung des ihm zur Beförderung anvertrauten Gutes ab (z. B. nach CMR bei grenzüberschreitendem oder HGB bei nationalem Transport), im Rahmen der jeweiligen gesetzlichen Haftungshöchstgrenzen.",
      modelAnswerBg:
        "Тя покрива законовата отговорност на превозвача за загуба или повреда на поверения му за превоз товар (напр. по CMR при международен, или по HGB при национален транспорт), в рамките на съответните законови максимални граници на обезщетение.",
      explanation:
        "Ohne diese Versicherung haftet der Frachtführer im Schadensfall mit dem eigenen Betriebsvermögen — sie ist daher praktisch unverzichtbar für jedes Transportunternehmen.",
      explanationBg:
        "Без тази застраховка превозвачът отговаря при щета с целия си стопански имот — затова тя е практически задължителна за всяка транспортна фирма.",
      order: 3,
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
    {
      id: "q-adr-3",
      topicId: "t-adr",
      parentId: null,
      type: "test",
      question:
        "Welche Person ist in einem Unternehmen, das Gefahrguttransporte durchführt, üblicherweise für die Überwachung der Vorschriftseinhaltung verantwortlich?",
      questionBg:
        "Кое лице обикновено носи отговорност в предприятие, извършващо превоз на опасни товари, за наблюдение на спазването на разпоредбите?",
      options: [
        "Der Gefahrgutbeauftragte",
        "Der Steuerberater des Unternehmens",
        "Der Fuhrparkleiter, ohne besondere Zusatzqualifikation",
        "Es ist keine besondere Zuständigkeit gesetzlich vorgeschrieben",
      ],
      optionsBg: [
        "Консултантът по безопасност за превоз на опасни товари (Gefahrgutbeauftragter)",
        "Счетоводителят на предприятието",
        "Ръководителят на автопарка, без специална допълнителна квалификация",
        "Не е предвидена по закон специална отговорност",
      ],
      correctIndex: 0,
      modelAnswer: "",
      modelAnswerBg: "",
      explanation:
        "Unternehmen, die Gefahrgut befördern, verpacken, verladen oder entladen, müssen grundsätzlich einen Gefahrgutbeauftragten nach der Gefahrgutbeauftragtenverordnung (GbV) bestellen, der die Einhaltung der Vorschriften überwacht und den Unternehmer berät.",
      explanationBg:
        "Предприятия, които превозват, опаковат, товарят или разтоварват опасни товари, по принцип трябва да назначат консултант по безопасност (Gefahrgutbeauftragter) съгласно наредбата GbV, който наблюдава спазването на разпоредбите и консултира превозвача.",
      order: 3,
    },
    {
      id: "q-adr-3-follow",
      topicId: "t-adr",
      parentId: "q-adr-3",
      type: "open",
      question:
        "Verknüpfter Fall: Ein Kleinunternehmen transportiert nur gelegentlich kleine Mengen Gefahrgut unterhalb bestimmter Freigrenzen. Muss es trotzdem einen Gefahrgutbeauftragten bestellen?",
      questionBg:
        "Свързан казус: Малко предприятие превозва само от време на време малки количества опасни товари под определени освободени количества. Трябва ли въпреки това да назначи консултант по безопасност?",
      options: [],
      optionsBg: [],
      correctIndex: null,
      modelAnswer:
        "Es gibt Ausnahmen von der Bestellpflicht bei geringem Gefahrgutaufkommen bzw. Tätigkeiten unterhalb bestimmter Schwellenwerte (§ 1 Abs. 2 GbV). Die genauen aktuellen Schwellenwerte sollten im geltenden Gefahrgutrecht geprüft werden, da sie sich ändern können.",
      modelAnswerBg:
        "Съществуват изключения от задължението за назначаване при малък обем опасни товари или дейности под определени прагови стойности (§ 1, ал. 2 от GbV). Точните актуални прагови стойности трябва да се проверят в действащото законодателство за опасни товари, тъй като могат да се променят.",
      explanation:
        "Wichtig: Auch bei einer Befreiung von der Bestellpflicht bleiben alle übrigen Gefahrgutvorschriften (z. B. Verpackung, Kennzeichnung, Fahrzeugausrüstung) weiterhin zu beachten.",
      explanationBg:
        "Важно: Дори при освобождаване от задължението за назначаване, всички останали разпоредби за опасни товари (напр. опаковане, обозначаване, оборудване на превозното средство) продължават да важат.",
      order: 1,
    },
  ],
};
