export type Lang = "en" | "ar" | "fr";
export type Theme = "light" | "dark" | "system";
export type MadhabKey = "shafi" | "hanafi";
export type HighLat = "middleofthenight" | "seventhofthenight" | "twilightangle";
export type MethodKey =
  | "MuslimWorldLeague"
  | "Egyptian"
  | "Karachi"
  | "UmmAlQura"
  | "Dubai"
  | "MoonsightingCommittee"
  | "NorthAmerica"
  | "Kuwait"
  | "Qatar"
  | "Singapore"
  | "Tehran"
  | "Turkey";

export type Salah = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type Slot = Salah | "sunrise";

export type Screen =
  | "today"
  | "prayers"
  | "quran"
  | "hadith"
  | "qibla"
  | "tasbih"
  | "names"
  | "duas"
  | "favorites"
  | "settings";

export type Place = {
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

export type Offsets = Record<Slot, number>;

export type Settings = {
  method: MethodKey;
  madhab: MadhabKey;
  highLat: HighLat;
  lang: Lang;
  theme: Theme;
  chime: boolean;
  notify: boolean;
  autoLocation: boolean;
  offsets: Offsets;
};

export type Fav = {
  id: string;
  kind: "verse" | "hadith" | "dua" | "name";
  title: string;
  text: string;
  sub?: string;
};

export const SLOTS: Slot[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
export const SALAHS: Salah[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export const METHODS: { key: MethodKey; en: string; ar: string; fr: string }[] = [
  { key: "MuslimWorldLeague", en: "Muslim World League", ar: "رابطة العالم الإسلامي", fr: "Ligue islamique mondiale" },
  { key: "NorthAmerica", en: "ISNA (North America)", ar: "إسنا", fr: "ISNA (Amérique du Nord)" },
  { key: "Egyptian", en: "Egyptian", ar: "الهيئة المصرية", fr: "Égyptienne" },
  { key: "UmmAlQura", en: "Umm al-Qura", ar: "أم القرى", fr: "Umm al-Qura" },
  { key: "Dubai", en: "Dubai", ar: "دبي", fr: "Dubaï" },
  { key: "Qatar", en: "Qatar", ar: "قطر", fr: "Qatar" },
  { key: "Kuwait", en: "Kuwait", ar: "الكويت", fr: "Koweït" },
  { key: "Karachi", en: "Karachi", ar: "كراتشي", fr: "Karachi" },
  { key: "Singapore", en: "Singapore", ar: "سنغافورة", fr: "Singapour" },
  { key: "Turkey", en: "Turkey", ar: "تركيا", fr: "Turquie" },
  { key: "Tehran", en: "Tehran", ar: "طهران", fr: "Téhéran" },
  { key: "MoonsightingCommittee", en: "Moonsighting Committee", ar: "لجنة رؤية الهلال", fr: "Comité d'observation" },
];

export const DEFAULT_SETTINGS: Settings = {
  method: "MuslimWorldLeague",
  madhab: "shafi",
  highLat: "middleofthenight",
  lang: "en",
  theme: "system",
  chime: true,
  notify: false,
  autoLocation: true,
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
};
