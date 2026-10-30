/**
 * Source registry. Every historical claim in the application references one or
 * more of these institutional / academic sources. `type` marks the reliability
 * class so the UI can distinguish primary documents from scholarly synthesis.
 */
export interface Source {
  id: string;
  title: string;
  publisher: string;
  kind: 'institutional' | 'academic' | 'primary' | 'encyclopedia' | 'museum';
  url?: string;
}

export const SOURCES: Source[] = [
  {
    id: 'ehistory',
    title: 'E-history.kz — Қазақстан тарихы ұлттық порталы',
    publisher: 'ҚР Мәдениет және ақпарат министрлігіне қарасты портал',
    kind: 'institutional',
    url: 'https://e-history.kz',
  },
  {
    id: 'qazenc',
    title: 'Қазақстан ұлттық энциклопедиясы (1–10 т.)',
    publisher: 'Қазақ энциклопедиясы',
    kind: 'encyclopedia',
  },
  {
    id: 'nurkenov',
    title: 'К. Нұркенов, "Қазақстан тарихы" академиялық курс (окулық)',
    publisher: 'Университеттік оқулық, Қазақстан тарихы кафедраларында қолданылады',
    kind: 'academic',
  },
  {
    id: 'kunanbaev',
    title: 'А. Құнанбаев атындағы академиялық басылымдар — Қазақстан тарихынан хрестоматиялық жинақтар',
    publisher: 'Оқу-әдістемелік басылымдар',
    kind: 'academic',
  },
  {
    id: 'klyashtorny',
    title: 'С. Г. Кляшторный, Т. И. Султанов, "Казахстан: летопись трёх тысячелетий"',
    publisher: 'Академиялық монография',
    kind: 'academic',
  },
  {
    id: 'heritage',
    title: 'ЮНЕСКО Әлемдік мұра нысандары және Қазақстанның мәдени мұрасы (Мәдени мұра бағдарламасы)',
    publisher: 'ЮНЕСКО / ҚР Мәдениет министрлігі',
    kind: 'institutional',
    url: 'https://whc.unesco.org',
  },
  {
    id: 'museum',
    title: 'ҚР Ұлттық мұражайы — археологиялық қор мен экспозиция материалдары',
    publisher: 'Қазақстан Республикасының Ұлттық мұражайы',
    kind: 'museum',
  },
  {
    id: 'archive',
    title: 'ҚР Орталық мемлекеттік мұрағаты — құжаттық материалдар',
    publisher: 'Орталық мемлекеттік мұрағат',
    kind: 'primary',
  },
  {
    id: 'constitution',
    title: 'Қазақстан Республикасының Конституциясы (1995 ж., өзгертулермен)',
    publisher: 'ҚР Заңнамасы',
    kind: 'primary',
  },
  {
    id: 'khoja',
    title: 'Мұхаммед Хайдар Дулати, "Тарих-и Рашиди" (16 ғ. жазба дерек)',
    publisher: 'Ортағасырлық тарихи дереккөз',
    kind: 'primary',
  },
  {
    id: 'kadyrgali',
    title: 'Қадырғали Жалайыр, "Жамиғ ат-тауарих" (16 ғ. жазба дерек)',
    publisher: 'Ортағасырлық тарихи дереккөз',
    kind: 'primary',
  },
  {
    id: 'orhon',
    title: 'Орхон-Енисей жазба ескерткіштері (Күлтегін, Білге қаған, Тоныкөк)',
    publisher: 'Ежелгі түркі жазба ескерткіштері, ғылыми транскрипциялар',
    kind: 'primary',
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
