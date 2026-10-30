/**
 * Artifact catalogue used by image-identification questions and by the
 * match-3 symbols. Every item is a STYLISED drawing rendered locally as SVG
 * (src/components/Artifact.tsx) — none is presented as a photographic replica.
 */
export interface Artifact {
  id: string;
  name: string;
  periodId: string;
  kind: 'ornament' | 'weapon' | 'coin' | 'monument' | 'inscription' | 'vessel' | 'headgear';
  description: string;
  sourceIds: string[];
}

export const ARTIFACTS: Artifact[] = [
  { id: 'essik-man', name: 'Есік "Алтын адамы" киімі', periodId: 'saka', kind: 'headgear', description: 'Алтын қаңылтырлармен безендірілген бас киім мен киім үлгісі — сақ дәуірінің элиталық жерлеу дәстүрінің көрсеткіші.', sourceIds: ['ehistory', 'museum'] },
  { id: 'animal-style', name: 'Аң стиліндегі өрнек', periodId: 'saka', kind: 'ornament', description: 'Сақ өнерінің "аң стилі" — бұғы, барыс, қанатты жануар бейнелері жиі кездеседі.', sourceIds: ['heritage'] },
  { id: 'saka-kazan', name: 'Қола қазан', periodId: 'saka', kind: 'vessel', description: 'Көшпелілердің қола қазаны — ырым-жоралғы және тұрмыстық зат.', sourceIds: ['museum'] },
  { id: 'hun-bow', name: 'Ғұн садағы', periodId: 'hun', kind: 'weapon', description: 'Күрделі құрылымды садақ — далалық әскери технологияның маңызды элементі.', sourceIds: ['ehistory'] },
  { id: 'turik-stone', name: 'Түркі жазба тасы', periodId: 'turkic', kind: 'inscription', description: 'Орхон-Енисей жазу үлгісіндегі руналық жазба — ежелгі түркі жазба мәдениетінің ескерткіші.', sourceIds: ['orhon'] },
  { id: 'karakhanid-coin', name: 'Қараханид дирхемі', periodId: 'karakhanid', kind: 'coin', description: 'Ортағасырлық күміс дирхем — сауда байланыстарының дәлелі; номиналы мен билеуші аты теңге бетінде жазылған.', sourceIds: ['museum'] },
  { id: 'kipchak-mask', name: 'Қыпшақ бетпердесі', periodId: 'kipchak', kind: 'headgear', description: 'Көшпелі жауынгерлерге тән металл бетперде үлгісі (стильденген бейне).', sourceIds: ['museum'] },
  { id: 'sarai', name: 'Сарайшық қаласының қабырғасы', periodId: 'goldenhorde', kind: 'monument', description: 'Сарайшық — Жайық бойындағы ортағасырлық қала; қазба жұмыстары қала мәдениетінің деңгейін көрсетеді.', sourceIds: ['museum', 'ehistory'] },
  { id: 'otrar-wall', name: 'Отырар қорғаны', periodId: 'mongol', kind: 'monument', description: 'Отырардың қорғаныс құрылыстары — 1219–1221 жж. қоршаудың орны.', sourceIds: ['ehistory'] },
  { id: 'khanate-tamga', name: 'Хандық таңбасы', periodId: 'khanate', kind: 'ornament', description: 'Тайпалық таңбалар — ру-тайпалық құрылымның таңбалық жүйесі.', sourceIds: ['qazenc'] },
  { id: 'zhambyl-dombra', name: 'Домбыра', periodId: 'khanate', kind: 'vessel', description: 'Екі ішекті аспап — қазақтың музыкалық мұрасының негізі.', sourceIds: ['qazenc'] },
  { id: 'turkestan', name: 'Қожа Ахмет Ясауи кесенесі', periodId: 'khanate', kind: 'monument', description: 'Түркістандағы кесене — Тимур дәуірінде (14 ғ. соңы) салынған сәулет ескерткіші.', sourceIds: ['heritage'] },
  { id: 'yurt', name: 'Киіз үй', periodId: 'khanate', kind: 'monument', description: 'Көшпелі тұрғын үй — қазақтың дәстүрлі тұрмыстық мәдениетінің символы.', sourceIds: ['qazenc'] },
  { id: 'alash-press', name: 'Алаш баспасөзі', periodId: 'alash', kind: 'inscription', description: '"Қазақ" газеті — 1913 жылдан шыққан ұлттық басылым.', sourceIds: ['ehistory', 'archive'] },
  { id: 'soviet-sputnik', name: 'Ғарыш дәуірінің белгісі', periodId: 'soviet', kind: 'monument', description: 'Байқоңыр — 1955 жылдан бастап ғарыш айлағы; Қазақстан ғарыш тарихының орталығы.', sourceIds: ['ehistory'] },
  { id: 'astana-baiterek', name: 'Бәйтерек монументі', periodId: 'independent', kind: 'monument', description: 'Астанадағы монумент (1997 ж. ашылды) — жаңа астананың символы.', sourceIds: ['ehistory'] },
  { id: 'kazakh-flag', name: 'Мемлекеттік ту', periodId: 'independent', kind: 'ornament', description: 'Көк аспан түсі, алтын күн мен қыран бейнесі — 1992 ж. бекітілген мемлекеттік рәміз.', sourceIds: ['constitution'] },
];

export const artifactById = (id: string) => ARTIFACTS.find((a) => a.id === id);
