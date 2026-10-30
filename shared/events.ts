/**
 * Curated historical event catalogue used by the timeline, the quiz database
 * and the "find the mistake" / chronological-ordering question generators.
 * Dates follow the standard Kazakhstani academic chronology (see shared/sources).
 */
export interface HistoricalEvent {
  id: string;
  year: number; // negative = BCE
  yearLabel: string;
  title: string;
  periodId: string;
  summary: string;
  place?: string;
  sourceIds: string[];
  disputed?: boolean;
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  { id: 'botai', year: -3700, yearLabel: 'б.з.д. 4–3 мыңж.', title: 'Ботай мәдениеті', periodId: 'stone', summary: 'Солтүстік Қазақстандағы энеолиттік тұрақ; жылқыны қолға үйретудің ерте дәлелдері қатарында зерттеледі.', place: 'Солтүстік Қазақстан', sourceIds: ['ehistory', 'museum'], disputed: true },
  { id: 'andronovo', year: -2000, yearLabel: 'б.з.д. 2 мыңж.', title: 'Андронов мәдениеті', periodId: 'bronze', summary: 'Далалық мал шаруашылығы мен қола металлургиясының қалыптасуы.', place: 'Сарыарқа, Орал өңірі', sourceIds: ['ehistory', 'nurkenov'] },
  { id: 'tamgaly', year: -1500, yearLabel: 'б.з.д. 2 мыңж.', title: 'Тамғалы петроглифтері', periodId: 'bronze', summary: 'Жетісудағы жартас суреттері — қола дәуірі өнерінің көрнекті ескерткіші.', place: 'Жетісу', sourceIds: ['heritage'] },
  { id: 'essik', year: -500, yearLabel: 'б.з.д. 5–4 ғғ.', title: 'Есік "Алтын адамы"', periodId: 'saka', summary: 'Есік қорғанынан табылған алтын киімді сақ жауынгерінің жерлеу кешені.', place: 'Есік, Алматы облысы', sourceIds: ['ehistory', 'museum'] },
  { id: 'modu', year: -209, yearLabel: 'б.з.д. 209 ж.', title: 'Мөде қағанның ғұн тайпаларын біріктіруі', periodId: 'hun', summary: 'Ғұн империясының саяси негізі қаланды.', sourceIds: ['ehistory', 'klyashtorny'] },
  { id: 'turkic552', year: 552, yearLabel: '552 ж.', title: 'Түрік қағанатының құрылуы', periodId: 'turkic', summary: 'Бұмын қаған Жужан қағанатын жеңіп, Түрік қағанатын құрды.', sourceIds: ['ehistory', 'klyashtorny'] },
  { id: 'turkic603', year: 603, yearLabel: '603 ж.', title: 'Түрік қағанатының екіге бөлінуі', periodId: 'turkic', summary: 'Шығыс және Батыс Түрік қағанаттары құрылды.', sourceIds: ['ehistory', 'klyashtorny'] },
  { id: 'kultegin', year: 732, yearLabel: '732 ж.', title: 'Күлтегін ескерткіші', periodId: 'turkic', summary: 'Күлтегін құрметіне қойылған ежелгі түркі жазба ескерткіші.', place: 'Орхон өзені', sourceIds: ['orhon', 'heritage'] },
  { id: 'bilge', year: 735, yearLabel: '735 ж.', title: 'Білге қаған ескерткіші', periodId: 'turkic', summary: 'Білге қағанның құрметіне арналған жазба ескерткіш.', place: 'Орхон өзені', sourceIds: ['orhon'] },
  { id: 'karakhanid', year: 942, yearLabel: '942 ж. шамасы', title: 'Қараханид мемлекетінің құрылуы', periodId: 'karakhanid', summary: 'Орталық Азияда түркі-ислам мемлекеті қалыптасты.', sourceIds: ['ehistory', 'klyashtorny'], disputed: true },
  { id: 'kutadgu', year: 1069, yearLabel: '1069–1070 жж.', title: '"Құтадғу білік" жазылды', periodId: 'karakhanid', summary: 'Жүсіп Баласағұнның дидактикалық дастаны — түркі әдебиетінің классикасы.', sourceIds: ['ehistory', 'nurkenov'] },
  { id: 'divani', year: 1072, yearLabel: '1072–1074 жж.', title: '"Диуани лұғат-ит-түрк" жазылды', periodId: 'karakhanid', summary: 'Махмұд Қашқаридың түркі тілдері сөздігі.', sourceIds: ['ehistory'] },
  { id: 'otrar1218', year: 1218, yearLabel: '1218–1219 жж.', title: 'Отырар оқиғасы', periodId: 'mongol', summary: 'Отырардағы керуен оқиғасы моңғол жорығының басталуына себеп болды.', place: 'Отырар', sourceIds: ['ehistory', 'kunanbaev'] },
  { id: 'otrar1221', year: 1221, yearLabel: '1221 ж.', title: 'Отырардың құлауы', periodId: 'mongol', summary: 'Ұзақ қоршаудан кейін Отырар моңғол әскеріне берілді.', place: 'Отырар', sourceIds: ['ehistory'] },
  { id: 'goldenhorde', year: 1243, yearLabel: '1240-жылдар', title: 'Алтын Орданың қалыптасуы', periodId: 'goldenhorde', summary: 'Жошы ұлысы негізінде Алтын Орда мемлекеті құрылды.', sourceIds: ['ehistory', 'nurkenov'] },
  { id: 'uzbekkhan', year: 1313, yearLabel: '1313–1341 жж.', title: 'Өзбек ханның билігі', periodId: 'goldenhorde', summary: 'Алтын Ордада ислам мемлекеттік дін ретінде нығайды, сауда дамыды.', sourceIds: ['ehistory', 'nurkenov'] },
  { id: 'khanate1465', year: 1465, yearLabel: '1465 ж. шамасы', title: 'Қазақ хандығының құрылуы', periodId: 'khanate', summary: 'Керей мен Жәнібек хандар Қазақ хандығының негізін қалады.', sourceIds: ['ehistory', 'khoja'], disputed: true },
  { id: 'kasym', year: 1511, yearLabel: '1511–1523 жж.', title: 'Қасым ханның билігі', periodId: 'khanate', summary: 'Хандық аумағы кеңейді, "Қасым ханның қасқа жолы" заңдар жинағы қалыптасты.', sourceIds: ['ehistory', 'kunanbaev'] },
  { id: 'jetizhargy', year: 1680, yearLabel: '1680–1715 жж.', title: 'Тәуке хан және "Жеті Жарғы"', periodId: 'khanate', summary: 'Тәуке хан тұсында әдет-құқық нормалары жүйеленді ("Жеті Жарғы").', sourceIds: ['ehistory', 'kunanbaev'], disputed: true },
  { id: 'protectorate1731', year: 1731, yearLabel: '1731 ж.', title: 'Кіші жүздің бір бөлігі Ресей протекторатын қабылдады', periodId: 'russian', summary: 'Әбілқайыр хан бастаған Кіші жүз өкілдері Ресей протекторатын қабылдады.', sourceIds: ['ehistory', 'archive'] },
  { id: 'kenesary', year: 1837, yearLabel: '1837–1847 жж.', title: 'Кенесары Қасымұлының қозғалысы', periodId: 'russian', summary: 'Ұлт-азаттық қозғалысы; 1847 ж. Кенесары қаза тапты.', sourceIds: ['ehistory', 'kunanbaev'] },
  { id: 'reform1867', year: 1867, yearLabel: '1867–1868 жж.', title: 'Әкімшілік реформалар', periodId: 'russian', summary: '"Уақытша ережелер" бойынша Түркістан және Дала генерал-губернаторлықтары құрылды.', sourceIds: ['ehistory', 'archive'] },
  { id: 'uprising1916', year: 1916, yearLabel: '1916 ж.', title: 'Ұлт-азаттық көтеріліс', periodId: 'russian', summary: 'Орталық Азиядағы көтеріліс — соғыс жұмыстарына жұмылдыруға қарсы қарсылық.', sourceIds: ['ehistory', 'archive'] },
  { id: 'alash1917', year: 1917, yearLabel: '1917 ж. желтоқсан', title: 'Алашорда үкіметінің құрылуы', periodId: 'alash', summary: 'Алаш партиясының бағдарламасы негізінде Алашорда үкіметі жарияланды.', sourceIds: ['ehistory', 'archive'] },
  { id: 'kazassr', year: 1920, yearLabel: '1920 ж.', title: 'Қазақ АКСР-інің құрылуы', periodId: 'soviet', summary: 'Кеңестік автономия жарияланды.', sourceIds: ['ehistory', 'archive'] },
  { id: 'kazssr', year: 1936, yearLabel: '1936 ж.', title: 'Қазақ КСР-інің құрылуы', periodId: 'soviet', summary: 'Қазақстан одақтас республика мәртебесін алды.', sourceIds: ['ehistory', 'constitution'] },
  { id: 'virgin', year: 1954, yearLabel: '1954 ж.', title: 'Тың жерлерді игеру науқаны', periodId: 'soviet', summary: 'Солтүстік Қазақстанда ауқымды тың жерлерді игеру басталды.', sourceIds: ['ehistory', 'archive'] },
  { id: 'zheltoksan', year: 1986, yearLabel: '1986 ж. 17–18 желтоқсан', title: 'Желтоқсан оқиғасы', periodId: 'soviet', summary: 'Алматыдағы жастар наразылығы.', place: 'Алматы', sourceIds: ['ehistory', 'archive'] },
  { id: 'independence', year: 1991, yearLabel: '1991 ж. 16 желтоқсан', title: 'Тәуелсіздік жарияланды', periodId: 'independent', summary: '"Қазақстан Республикасының мемлекеттік тәуелсіздігі туралы" конституциялық заң қабылданды.', sourceIds: ['ehistory', 'constitution'] },
  { id: 'constitution1995', year: 1995, yearLabel: '1995 ж. 30 тамыз', title: 'Жаңа Конституция', periodId: 'independent', summary: 'Референдумда Қазақстан Республикасының Конституциясы қабылданды.', sourceIds: ['constitution', 'ehistory'] },
  { id: 'astana', year: 1997, yearLabel: '1997 ж.', title: 'Астананы көшіру', periodId: 'independent', summary: 'Ақмола жаңа астана болып жарияланды; 1998 ж. Астана аталды.', sourceIds: ['ehistory'] },
  { id: 'osce2010', year: 2010, yearLabel: '2010 ж.', title: 'ЕҚЫҰ төрағалығы', periodId: 'independent', summary: 'Қазақстан ЕҚЫҰ-ға төрағалық етті.', sourceIds: ['ehistory'] },
  { id: 'eaeu2015', year: 2015, yearLabel: '2015 ж.', title: 'Еуразиялық экономикалық одақ', periodId: 'independent', summary: 'ЕАЭО туралы шартқа қол қойылды.', sourceIds: ['ehistory'] },
];

export const eventById = (id: string) => HISTORICAL_EVENTS.find((e) => e.id === id);
