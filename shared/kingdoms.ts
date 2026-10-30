/**
 * Territorial / political entities for the interactive historical map and the
 * strategy game. Polygons are STYLISED approximations of historically attested
 * areas of influence, NOT surveyed borders: pre-modern steppe polities had
 * fluid, overlapping frontiers. Every entry carries an `accuracy` field that the
 * UI renders as an explicit disclaimer.
 */
export interface Kingdom {
  id: string;
  name: string;
  from: number;
  to: number;
  color: string;
  center: [number, number]; // lng, lat
  /** Stylised polygon ring of [lng, lat] pairs. */
  polygon: [number, number][];
  accuracy: 'stylised' | 'approximate';
  description: string;
  capitals?: string[];
  sourceIds: string[];
}

export const KINGDOMS: Kingdom[] = [
  {
    id: 'saka',
    name: 'Сақ тайпалық одақтары',
    from: -800,
    to: -200,
    color: '#c9a227',
    center: [68, 44],
    polygon: [
      [52, 47], [58, 50], [70, 50], [82, 48], [86, 44], [82, 40], [72, 38], [62, 39], [54, 42],
    ],
    accuracy: 'stylised',
    description:
      'Сақ тайпалары Жетісу, Орталық Қазақстан және Арал өңірін мекендеді. Біртұтас мемлекеттік шекара емес, тайпалық одақтар жүйесі болды.',
    sourceIds: ['ehistory', 'nurkenov'],
  },
  {
    id: 'hun',
    name: 'Ғұн (хунну) мемлекеті',
    from: -209,
    to: 450,
    color: '#8a5a3b',
    center: [88, 47],
    polygon: [
      [70, 52], [85, 54], [100, 52], [108, 46], [102, 40], [86, 39], [74, 42],
    ],
    accuracy: 'stylised',
    description:
      'Ғұн империясының ядросы қазіргі Моңғолия аумағында болды; ықпалы Қазақстанның шығыс өңірлеріне тарады.',
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'turkic',
    name: 'Түрік қағанаты',
    from: 552,
    to: 603,
    color: '#2fb3a8',
    center: [80, 47],
    polygon: [
      [52, 50], [72, 54], [95, 53], [110, 46], [100, 39], [80, 38], [60, 42], [50, 46],
    ],
    accuracy: 'stylised',
    description: '552–603 жж. біртұтас Түрік қағанаты Алтайдан Еділге дейінгі даланы қамтыды.',
    capitals: ['Өтүкен'],
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'west-turkic',
    name: 'Батыс Түрік қағанаты',
    from: 603,
    to: 704,
    color: '#3fa9a0',
    center: [68, 44],
    polygon: [
      [50, 48], [62, 51], [78, 49], [82, 43], [74, 38], [60, 38], [50, 42],
    ],
    accuracy: 'stylised',
    description: 'Батыс Түрік қағанаты Жетісу мен Сырдария бойын, Еділге дейінгі даланың батысын қамтыды.',
    capitals: ['Суяб', 'Тараз'],
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'karluk',
    name: 'Қарлұқ мемлекеті',
    from: 756,
    to: 940,
    color: '#6f8f5f',
    center: [78, 44],
    polygon: [
      [66, 47], [80, 48], [90, 45], [86, 40], [72, 39], [64, 42],
    ],
    accuracy: 'stylised',
    description: 'Қарлұқ мемлекеті Ыстықкөл мен Іле өңірінде орналасып, Жетісуда ықпалды болды.',
    capitals: ['Суяб'],
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'karakhanid',
    name: 'Қараханид мемлекеті',
    from: 942,
    to: 1212,
    color: '#7a4fa3',
    center: [72, 43],
    polygon: [
      [62, 46], [76, 47], [86, 43], [84, 38], [70, 36], [60, 40],
    ],
    accuracy: 'stylised',
    description: 'Қараханид мемлекеті Сырдария бойы, Жетісу және Шығыс Түркістанды қамтыды.',
    capitals: ['Баласағұн', 'Самарқанд', 'Қашғар'],
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'kipchak',
    name: 'Дешті Қыпшақ',
    from: 1050,
    to: 1219,
    color: '#4b7f9e',
    center: [62, 48],
    polygon: [
      [38, 52], [58, 54], [78, 52], [84, 46], [72, 42], [50, 42], [38, 46],
    ],
    accuracy: 'stylised',
    description:
      'Қыпшақ тайпаларының конфедерациясы Еділден Ертістікке дейінгі даланы мекендеді; бір орталық билік болмады.',
    sourceIds: ['ehistory', 'klyashtorny'],
  },
  {
    id: 'golden-horde',
    name: 'Алтын Орда',
    from: 1243,
    to: 1446,
    color: '#c98a1f',
    center: [60, 49],
    polygon: [
      [32, 53], [56, 56], [78, 54], [86, 47], [70, 42], [46, 42], [34, 46],
    ],
    accuracy: 'approximate',
    description: 'Алтын Орда Еділден Ертістікке, Хорезмнен Сібірге дейінгі аумақты қамтыды.',
    capitals: ['Сарай-Бату', 'Сарай-Берке', 'Сарайшық'],
    sourceIds: ['ehistory', 'nurkenov'],
  },
  {
    id: 'ak-orda',
    name: 'Ақ Орда',
    from: 1361,
    to: 1428,
    color: '#d9b26a',
    center: [70, 47],
    polygon: [
      [58, 52], [76, 54], [88, 50], [86, 43], [70, 41], [58, 45],
    ],
    accuracy: 'stylised',
    description: 'Ақ Орда — Жошы ұлысының шығыс бөлігіндегі дербес саяси құрылым.',
    capitals: ['Сығанақ'],
    sourceIds: ['ehistory', 'nurkenov'],
    note: 'Ақ Орда мен Көк Орда атауларының тарихнамада қолданылуы әртүрлі.',
  } as Kingdom & { note?: string },
  {
    id: 'moghulistan',
    name: 'Моғолстан',
    from: 1347,
    to: 1570,
    color: '#8e6b3f',
    center: [80, 43],
    polygon: [
      [72, 46], [86, 47], [94, 43], [92, 38], [78, 37], [70, 40],
    ],
    accuracy: 'stylised',
    description: 'Моғолстан Жетісу мен Шығыс Түркістанды қамтыған мемлекет (14–16 ғғ.).',
    sourceIds: ['khoja', 'ehistory'],
  },
  {
    id: 'abulkhair',
    name: 'Әбілхайыр хандығы',
    from: 1428,
    to: 1468,
    color: '#a3682f',
    center: [64, 48],
    polygon: [
      [50, 52], [68, 54], [80, 50], [76, 43], [60, 42], [50, 46],
    ],
    accuracy: 'stylised',
    description: 'Өзбектердің көшпелі хандығы; Керей мен Жәнібек осы хандықтан бөлініп шықты.',
    capitals: ['Сығанақ'],
    sourceIds: ['ehistory', 'khoja'],
  },
  {
    id: 'kazakh-khanate',
    name: 'Қазақ хандығы',
    from: 1465,
    to: 1847,
    color: '#2fb3a8',
    center: [68, 46],
    polygon: [
      [52, 48], [64, 52], [82, 52], [88, 46], [80, 40], [64, 39], [54, 43],
    ],
    accuracy: 'approximate',
    description:
      'Қазақ хандығы үш жүзге (Ұлы, Орта, Кіші) бөлінген көшпелі мемлекет. Шекаралары дәуірге қарай өзгерді.',
    capitals: ['Созақ', 'Сығанақ', 'Түркістан'],
    sourceIds: ['ehistory', 'khoja', 'kunanbaev'],
  },
  {
    id: 'russian-empire',
    name: 'Ресей империясы (Дала және Түркістан өлкелері)',
    from: 1867,
    to: 1917,
    color: '#5a6b7c',
    center: [62, 50],
    polygon: [
      [46, 50], [60, 55], [85, 55], [94, 47], [86, 38], [62, 36], [48, 42],
    ],
    accuracy: 'approximate',
    description:
      '1867–1868 жж. реформалар бойынша Түркістан генерал-губернаторлығы және Дала генерал-губернаторлығы құрылды.',
    sourceIds: ['ehistory', 'archive'],
  },
  {
    id: 'soviet-kazakhstan',
    name: 'Қазақ КСР',
    from: 1936,
    to: 1991,
    color: '#b04a4a',
    center: [68, 48],
    polygon: [
      [46, 48], [52, 55], [76, 56], [88, 52], [88, 42], [68, 39], [52, 42],
    ],
    accuracy: 'approximate',
    description: 'Қазақ КСР шекарасы 1936 ж. қалыптасып, бүгінгі Қазақстан шекарасының негізі болды.',
    capitals: ['Алматы'],
    sourceIds: ['ehistory', 'constitution'],
  },
  {
    id: 'kazakhstan',
    name: 'Қазақстан Республикасы',
    from: 1991,
    to: 2026,
    color: '#2fb3a8',
    center: [68, 48],
    polygon: [
      [46.5, 47.1], [47.9, 49.0], [50.3, 50.6], [53.9, 52.2], [57.3, 53.6], [61.4, 55.1],
      [65.8, 55.6], [70.3, 55.6], [74.0, 54.1], [77.6, 54.1], [80.6, 52.6], [84.0, 52.2],
      [86.4, 50.4], [87.2, 49.1], [86.6, 47.2], [84.0, 45.0], [80.4, 44.0], [78.0, 42.6],
      [74.0, 42.6], [71.0, 42.1], [68.3, 41.0], [66.4, 41.6], [64.0, 43.0], [61.0, 43.6],
      [58.3, 45.1], [55.3, 45.1], [52.3, 45.0], [49.4, 46.3],
    ],
    accuracy: 'approximate',
    description:
      'Тәуелсіз Қазақстан Республикасы. Шекара 1991 жылдан кейін халықаралық деңгейде мойындалды.',
    capitals: ['Алматы (1991–1997)', 'Астана (1997 жылдан)'],
    sourceIds: ['constitution', 'ehistory'],
  },
];

/** Important historical routes rendered on the map (Silk Road branches). */
export interface HistoricalRoute {
  id: string;
  name: string;
  period: string;
  points: [number, number][];
  description: string;
}

export const HISTORICAL_ROUTES: HistoricalRoute[] = [
  {
    id: 'silk-road-north',
    name: 'Ұлы Жібек жолы (солтүстік тармақ)',
    period: 'б.з. 1–14 ғғ.',
    points: [
      [69.6, 40.3], [70.4, 41.9], [71.4, 42.9], [72.9, 43.3], [71.4, 44.8], [69.7, 45.6],
      [66.9, 46.7], [65.0, 47.8], [63.0, 48.8], [61.0, 49.9], [58.0, 51.2], [54.0, 52.4],
    ],
    description: 'Оңтүстік Қазақстаннан Жайық пен Еділге дейін жалғасқан сауда бағыты.',
  },
  {
    id: 'silk-road-south',
    name: 'Ұлы Жібек жолы (оңтүстік тармақ)',
    period: 'б.з. 1–13 ғғ.',
    points: [
      [69.6, 40.3], [70.2, 42.0], [70.5, 42.9], [72.3, 42.9], [74.5, 42.7], [76.9, 43.2],
      [80.2, 44.9], [82.9, 45.0],
    ],
    description: 'Тараз, Құлан, Меркі арқылы өткен тармақ.',
  },
];
