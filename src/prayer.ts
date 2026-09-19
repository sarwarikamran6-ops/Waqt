import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  Qibla,
} from "adhan";
import type { HighLat, MethodKey, Offsets, Place, Settings, Slot } from "./types";
import { SLOTS } from "./types";

export type Civil = { year: number; month: number; day: number };
export type SlotTime = { slot: Slot; time: Date };

const highLatMap: Record<HighLat, (typeof HighLatitudeRule)[keyof typeof HighLatitudeRule]> = {
  middleofthenight: HighLatitudeRule.MiddleOfTheNight,
  seventhofthenight: HighLatitudeRule.SeventhOfTheNight,
  twilightangle: HighLatitudeRule.TwilightAngle,
};

export function civilFrom(date: Date, timeZone: string): Civil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

export function addDays(c: Civil, days: number): Civil {
  const dt = new Date(Date.UTC(c.year, c.month - 1, c.day + days));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function dayKey(c: Civil): string {
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

export function noonInZone(c: Civil, timeZone: string): Date {
  let utc = Date.UTC(c.year, c.month - 1, c.day, 12, 0, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = fmt.formatToParts(new Date(utc));
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const cur = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"));
    const want = Date.UTC(c.year, c.month - 1, c.day, 12);
    utc += want - cur;
  }
  return new Date(utc);
}

function parameters(method: MethodKey, settings: Settings) {
  const params = CalculationMethod[method]();
  params.madhab = settings.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = highLatMap[settings.highLat];
  params.adjustments = { ...settings.offsets };
  return params;
}

export function slotsFor(place: Place, settings: Settings, c: Civil): SlotTime[] {
  const date = new Date(c.year, c.month - 1, c.day, 12, 0, 0, 0);
  const times = new PrayerTimes(new Coordinates(place.latitude, place.longitude), date, parameters(settings.method, settings));
  const map: Record<Slot, Date> = {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
  return SLOTS.map((slot) => ({ slot, time: map[slot] }));
}

export function qiblaBearing(place: Place): number {
  return Qibla(new Coordinates(place.latitude, place.longitude));
}

export function formatClock(date: Date, timeZone: string, lang: string): string {
  const locale = lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export type Hijri = { year: number; month: number; day: number };

const HIJRI_MONTHS: Record<"en" | "ar" | "fr", readonly string[]> = {
  en: [
    "Muharram",
    "Safar",
    "Rabi al-Awwal",
    "Rabi al-Thani",
    "Jumada al-Awwal",
    "Jumada al-Thani",
    "Rajab",
    "Shaban",
    "Ramadan",
    "Shawwal",
    "Dhul Qadah",
    "Dhul Hijjah",
  ],
  ar: [
    "محرم",
    "صفر",
    "ربيع الأول",
    "ربيع الثاني",
    "جمادى الأولى",
    "جمادى الآخرة",
    "رجب",
    "شعبان",
    "رمضان",
    "شوال",
    "ذو القعدة",
    "ذو الحجة",
  ],
  fr: [
    "Mouharram",
    "Safar",
    "Rabi al-Awwal",
    "Rabi al-Thani",
    "Joumada al-Oula",
    "Joumada al-Thania",
    "Rajab",
    "Chaabane",
    "Ramadan",
    "Chawwal",
    "Dhou al-Qada",
    "Dhou al-Hijja",
  ],
};

function hijriLang(lang: string): "en" | "ar" | "fr" {
  return lang === "ar" || lang === "fr" ? lang : "en";
}

function localDigits(n: number, lang: string): string {
  const text = String(n);
  if (lang !== "ar") return text;
  return text.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export function hijriFrom(date: Date, timeZone: string): Hijri {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    timeZone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

export function hijriMonthName(month: number, lang: string): string {
  return HIJRI_MONTHS[hijriLang(lang)][month - 1] ?? "";
}

export function formatHijriMonth(start: Hijri, end: Hijri, lang: string): string {
  const a = hijriMonthName(start.month, lang);
  const b = hijriMonthName(end.month, lang);
  const y1 = localDigits(start.year, lang);
  const y2 = localDigits(end.year, lang);
  if (start.year === end.year && start.month === end.month) return `${a} ${y1}`;
  if (start.year === end.year) return `${a} – ${b} ${y2}`;
  return `${a} ${y1} – ${b} ${y2}`;
}

export function formatHijri(date: Date, timeZone: string, lang: string): string {
  const h = hijriFrom(date, timeZone);
  const name = hijriMonthName(h.month, lang);
  const day = localDigits(h.day, lang);
  const year = localDigits(h.year, lang);
  if (lang === "ar") return `${day} ${name} ${year} هـ`;
  return `${day} ${name} ${year} AH`;
}

export function formatGregorian(date: Date, timeZone: string, lang: string): string {
  const locale = lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function remainLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export function emptyOffsets(): Offsets {
  return { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}
