import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { appYear, codeMatches, unlockIsCurrent } from "./free-code";
import chaptersJson from "./chapters.json";
import booksJson from "./hadith-books.json";
import { DUAS, NAMES, PHRASES } from "./content";
import { t, type Key } from "./i18n";
import { loadHadith, loadVerses, saveQuran, searchCities, translationEdition, type HadithRow, type Verse } from "./api";
import { arrowDegrees, compassPoint, declination, magneticHeading, trueHeading, turnDelta } from "./qibla";
import { addDays, civilFrom, dayKey, formatClock, formatGregorian, formatHijri, formatHijriMonth, hijriFrom, hijriMonthName, noonInZone, qiblaBearing, remainLabel, slotsFor, type Civil } from "./prayer";
import { DEFAULT_SETTINGS, METHODS, SALAHS, type Fav, type Place, type Salah, type Screen, type Settings, type Slot } from "./types";

type Chapter = { n: number; en: string; name: string; ar: string; verses: number; place: string };
const CHAPTERS = chaptersJson as Chapter[];
const BOOKS = booksJson as Record<string, { name: string; sections: Record<string, string> }>;
const BOOK_ORDER = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "malik", "nawawi", "qudsi"];
type Log = Record<string, Partial<Record<Salah, boolean>>>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadSettings(): Settings {
  const s = read("waqt-settings", DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s, offsets: { ...DEFAULT_SETTINGS.offsets, ...(s.offsets ?? {}) } };
}

function loadPlace(): Place | null {
  try {
    const raw = localStorage.getItem("waqt-place");
    if (!raw) return null;
    const p = JSON.parse(raw) as Place;
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number" || !p.timeZone) return null;
    return p;
  } catch {
    return null;
  }
}

function playChime() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const start = now + i * 0.16;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(start);
    o.stop(start + 1);
  });
  window.setTimeout(() => void ctx.close(), 2200);
}

let adhanPlayer: HTMLAudioElement | null = null;

function adhanUrl(kind: "fajr" | "regular"): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}adhan/${kind}.mp3`;
}

function playAdhan(slot: Slot) {
  const kind = slot === "fajr" ? "fajr" : "regular";
  try {
    if (adhanPlayer) {
      adhanPlayer.pause();
      adhanPlayer.currentTime = 0;
    }
    const audio = new Audio(adhanUrl(kind));
    adhanPlayer = audio;
    audio.preload = "auto";
    void audio.play().catch(() => playChime());
  } catch {
    playChime();
  }
}

function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [place, setPlaceState] = useState<Place | null>(loadPlace);
  const [screen, setScreen] = useState<Screen>("today");
  const [log, setLog] = useState<Log>(() => {
    try {
      return JSON.parse(localStorage.getItem("waqt-log") || "{}") as Log;
    } catch {
      return {};
    }
  });
  const [favs, setFavs] = useState<Fav[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("waqt-favs") || "[]") as Fav[];
    } catch {
      return [];
    }
  });
  const [now, setNow] = useState(() => Date.now());
  const [banner, setBanner] = useState<string | null>(null);
  const [free, setFree] = useState(() => {
    if (unlockIsCurrent(localStorage.getItem("waqt-free-year"))) return true;
    return appYear() === 1 && localStorage.getItem("waqt-free") === "1";
  });
  const settingsRef = useRef(settings);
  const placeRef = useRef(place);
  settingsRef.current = settings;
  placeRef.current = place;

  function setSettings(next: Settings) {
    setSettingsState(next);
    localStorage.setItem("waqt-settings", JSON.stringify(next));
  }
  function setPlace(next: Place) {
    setPlaceState(next);
    localStorage.setItem("waqt-place", JSON.stringify(next));
  }
  function toggleLog(key: string, salah: Salah) {
    setLog((prev) => {
      const day = { ...(prev[key] ?? {}), [salah]: !prev[key]?.[salah] };
      const next = { ...prev, [key]: day };
      localStorage.setItem("waqt-log", JSON.stringify(next));
      return next;
    });
  }
  function hasFav(id: string) {
    return favs.some((f) => f.id === id);
  }
  function toggleFav(item: Fav) {
    setFavs((prev) => {
      const next = prev.some((f) => f.id === item.id) ? prev.filter((f) => f.id !== item.id) : [item, ...prev];
      localStorage.setItem("waqt-favs", JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
      root.lang = settings.lang;
      root.dir = settings.lang === "ar" ? "rtl" : "ltr";
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, settings.lang]);

  useEffect(() => {
    const fired = new Set<string>();
    let last = Date.now();
    const id = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      const currentPlace = placeRef.current;
      const currentSettings = settingsRef.current;
      const prev = last;
      last = n;
      if (!currentPlace || !currentSettings.chime) return;
      const today = civilFrom(new Date(n), currentPlace.timeZone);
      for (const day of [today, addDays(today, 1)]) {
        for (const slot of slotsFor(currentPlace, currentSettings, day)) {
          if (slot.slot === "sunrise") continue;
          const at = slot.time.getTime();
          const key = `${dayKey(day)}-${slot.slot}`;
          if (at > prev && at <= n && !fired.has(key)) {
            fired.add(key);
            playAdhan(slot.slot);
            const label = t(currentSettings.lang, slot.slot);
            setBanner(label);
            if (currentSettings.notify && "Notification" in window && Notification.permission === "granted") {
              new Notification(label, { body: formatClock(slot.time, currentPlace.timeZone, currentSettings.lang) });
            }
          }
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const lang = settings.lang;
  if (!free) return <FreeCode lang={lang} onUnlock={() => setFree(true)} />;
  const model = {
    settings,
    setSettings,
    place,
    setPlace,
    screen,
    setScreen,
    log,
    toggleLog,
    favs,
    hasFav,
    toggleFav,
    now,
    banner,
    clearBanner: () => setBanner(null),
  };

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <strong>{t(lang, "appName")}</strong>
            <em>{place ? place.label.split(",")[0] : t(lang, "setLocation")}</em>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button key={item.id} className={screen === item.id ? "nav-btn on" : "nav-btn"} aria-current={screen === item.id ? "page" : undefined} onClick={() => setScreen(item.id)}>
              <Icon name={item.id} />
              <span>{t(lang, item.key)}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="stage">
        {banner && (
          <button className="banner" onClick={() => setBanner(null)}>
            {banner}
          </button>
        )}
        {screen === "today" && <Today {...model} />}
        {screen === "prayers" && <Prayers {...model} />}
        {screen === "quran" && <Quran {...model} />}
        {screen === "hadith" && <Hadith {...model} />}
        {screen === "qibla" && <QiblaView {...model} />}
        {screen === "tasbih" && <Tasbih {...model} />}
        {screen === "names" && <Names {...model} />}
        {screen === "duas" && <Duas {...model} />}
        {screen === "favorites" && <Favorites {...model} />}
        {screen === "settings" && <SettingsView {...model} />}
      </main>
    </div>
  );
}

function FreeCode({ lang, onUnlock }: { lang: Settings["lang"]; onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!codeMatches(code)) {
      setBad(true);
      return;
    }
    localStorage.setItem("waqt-free-year", String(appYear()));
    onUnlock();
  }
  return (
    <main className="stage">
      <form className="search" onSubmit={submit}>
        <h1>{t(lang, "appName")}</h1>
        <p className="lede">CA$1.99</p>
        <label>
          <span>{t(lang, "freeCode")}</span>
          <input
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              setCode(event.target.value);
              setBad(false);
            }}
          />
        </label>
        {bad && <p className="warn">{t(lang, "freeWrong")}</p>}
        <button className="primary" type="submit">{t(lang, "freeUnlock")}</button>
      </form>
    </main>
  );
}

type Model = {
  settings: Settings;
  setSettings: (s: Settings) => void;
  place: Place | null;
  setPlace: (p: Place) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  log: Log;
  toggleLog: (key: string, salah: Salah) => void;
  favs: Fav[];
  hasFav: (id: string) => boolean;
  toggleFav: (f: Fav) => void;
  now: number;
  banner: string | null;
  clearBanner: () => void;
};

const NAV: { id: Screen; key: Key }[] = [
  { id: "today", key: "today" },
  { id: "prayers", key: "prayers" },
  { id: "quran", key: "quran" },
  { id: "hadith", key: "hadith" },
  { id: "qibla", key: "qibla" },
  { id: "tasbih", key: "tasbih" },
  { id: "names", key: "names" },
  { id: "duas", key: "duas" },
  { id: "favorites", key: "favorites" },
  { id: "settings", key: "settings" },
];

function Icon({ name }: { name: Screen }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {name === "today" && <circle cx="12" cy="12" r="4" {...common} />}
      {name === "today" && <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" {...common} />}
      {name === "prayers" && <path d="M5 6h14M5 12h14M5 18h9" {...common} />}
      {name === "quran" && <path d="M5 4.5h6.2A2.8 2.8 0 0 1 14 7.3V20a2.2 2.2 0 0 0-2.2-1.6H5zM19 4.5h-6.2A2.8 2.8 0 0 0 10 7.3V20a2.2 2.2 0 0 1 2.2-1.6H19z" {...common} />}
      {name === "hadith" && <path d="M7 4.5h10v15l-5-2.4-5 2.4z" {...common} />}
      {name === "qibla" && <><circle cx="12" cy="12" r="8" {...common} /><path d="M12 8.2 13.4 12 12 11.2 10.6 12z" {...common} /></>}
      {name === "tasbih" && <><circle cx="12" cy="12" r="7.2" {...common} /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></>}
      {name === "names" && <path d="M4.5 7.5h6M4.5 12h15M4.5 16.5h10" {...common} />}
      {name === "duas" && <path d="M8 14.5c1.4-3 2.2-4.6 4-7 1.8 2.4 2.6 4 4 7-1.6 2.4-6.4 2.4-8 0z" {...common} />}
      {name === "favorites" && <path d="m12 4.2 1.9 4.2 4.6.4-3.5 3 1.1 4.5L12 14.1 7.9 16.3 9 11.8 5.5 8.8l4.6-.4z" {...common} />}
      {name === "settings" && <><circle cx="12" cy="12" r="3" {...common} /><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" {...common} /></>}
    </svg>
  );
}

function CitySearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const { settings } = useModel();
  const lang = settings.lang;

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const rows = await searchCities(q.trim(), ac.signal);
        setHits(rows);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setHits([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  function locate() {
    setGpsError(false);
    if (!navigator.geolocation) {
      setGpsError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          if (res.ok) {
            const data = (await res.json()) as { city?: string; locality?: string; countryName?: string };
            const city = data.city || data.locality;
            if (city) label = [city, data.countryName].filter(Boolean).join(", ");
          }
        } catch {
          /* coordinates are enough */
        }
        onPick({ label, latitude, longitude, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="search">
      <button className="primary" onClick={locate}>
        {t(lang, "useMyLocation")}
      </button>
      {gpsError && <p className="warn">{t(lang, "locationFailed")}</p>}
      <label>
        <span>{t(lang, "searchCity")}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "searchCity")} />
      </label>
      {busy && <p className="muted">{t(lang, "searching")}</p>}
      {!busy && q.trim().length >= 2 && hits.length === 0 && <p className="muted">{t(lang, "noPlaces")}</p>}
      <ul className="hits">
        {hits.map((hit) => (
          <li key={`${hit.latitude}-${hit.longitude}`}>
            <button onClick={() => onPick(hit)}>{hit.label}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ModelCtx = { current: null as Model | null };
function useModel() {
  if (!ModelCtx.current) throw new Error("missing model");
  return ModelCtx.current;
}

function Today(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  if (!m.place) {
    return (
      <section>
        <h1>{t(lang, "setLocation")}</h1>
        <p className="lede">{t(lang, "locationHelp")}</p>
        <CitySearch onPick={m.setPlace} />
      </section>
    );
  }
  const place = m.place;
  const today = civilFrom(new Date(m.now), place.timeZone);
  const slots = slotsFor(place, m.settings, today);
  const upcoming = slots.find((s) => s.time.getTime() > m.now);
  const next = upcoming ?? slotsFor(place, m.settings, addDays(today, 1))[0];
  const key = dayKey(today);
  const logged = SALAHS.filter((s) => m.log[key]?.[s]).length;
  const noon = noonInZone(today, place.timeZone);
  const hijriToday = hijriFrom(noon, place.timeZone);
  const monthTotal = Object.entries(m.log).reduce((sum, [k, v]) => {
    const [y, mo, d] = k.split("-").map(Number);
    if (!y || !mo || !d) return sum;
    const h = hijriFrom(noonInZone({ year: y, month: mo, day: d }, place.timeZone), place.timeZone);
    if (h.year !== hijriToday.year || h.month !== hijriToday.month) return sum;
    return sum + SALAHS.filter((s) => v[s]).length;
  }, 0);

  return (
    <section>
      <header className="top">
        <div>
          <p className="kicker">{formatGregorian(noon, place.timeZone, lang)}</p>
          <h1>{formatHijri(noon, place.timeZone, lang)}</h1>
        </div>
        <button className="loc" onClick={() => m.setScreen("settings")}>
          {place.label}
        </button>
      </header>
      <div className="columns">
        <div>
          <article className="hero">
            <p className="kicker light">{t(lang, "nextUp")}</p>
            <h2>{t(lang, next.slot)}</h2>
            <p className="clock">{formatClock(next.time, place.timeZone, lang)}</p>
            <p className="remain">{remainLabel(next.time.getTime() - m.now)}</p>
          </article>
          <ul className="salah-list">
            {slots.map((slot) => {
              const past = slot.time.getTime() <= m.now;
              const isNext = !upcoming ? false : slot.slot === upcoming.slot;
              const salah = slot.slot === "sunrise" ? null : slot.slot;
              return (
                <li key={slot.slot} className={isNext ? "salah next" : past ? "salah past" : "salah"}>
                  {salah ? (
                    <button className={m.log[key]?.[salah] ? "check on" : "check"} aria-pressed={!!m.log[key]?.[salah]} onClick={() => m.toggleLog(key, salah)} />
                  ) : (
                    <span className="check ghost" />
                  )}
                  <span>{t(lang, slot.slot)}</span>
                  <time>{formatClock(slot.time, place.timeZone, lang)}</time>
                </li>
              );
            })}
          </ul>
        </div>
        <aside className="stack">
          <article className="card">
            <p className="kicker">{t(lang, "prayedToday")}</p>
            <p className="stat">
              {logged}
              <span>/5</span>
            </p>
            <div className="dots">
              {SALAHS.map((s) => (
                <i key={s} className={m.log[key]?.[s] ? "on" : ""} />
              ))}
            </div>
          </article>
          <article className="card">
            <p className="kicker">{hijriMonthName(hijriToday.month, lang)}</p>
            <p className="stat">{monthTotal}</p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function Prayers(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const place = m.place;
  const base = place ? civilFrom(new Date(m.now), place.timeZone) : civilFrom(new Date(), "UTC");
  const [cursor, setCursor] = useState<Civil>({ year: base.year, month: base.month, day: 1 });
  const [selected, setSelected] = useState<Civil>(base);
  if (!place) return <NeedPlace m={m} />;
  const slots = slotsFor(place, m.settings, selected);
  const noon = noonInZone(cursor, place.timeZone);
  const gregorianLabel = new Intl.DateTimeFormat(lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: place.timeZone,
  }).format(noon);
  const days = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const first = noonInZone({ year: cursor.year, month: cursor.month, day: 1 }, place.timeZone);
  const firstHijri = hijriFrom(first, place.timeZone);
  const lastHijri = hijriFrom(noonInZone({ year: cursor.year, month: cursor.month, day: days }, place.timeZone), place.timeZone);
  const hijriLabel = formatHijriMonth(firstHijri, lastHijri, lang);
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: place.timeZone }).format(first);
  const pad = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const heads = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US", { weekday: "narrow" }).format(new Date(2024, 0, 7 + i)),
  );
  const today = civilFrom(new Date(m.now), place.timeZone);

  function move(delta: number) {
    const dt = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: 1 });
  }

  return (
    <section>
      <header className="top">
        <h1>{t(lang, "prayers")}</h1>
        <button className="loc" onClick={() => m.setScreen("settings")}>
          {METHODS.find((x) => x.key === m.settings.method)?.[lang]}
        </button>
      </header>
      <div className="columns">
        <article className="card">
          <div className="month-bar">
            <button onClick={() => move(-1)} aria-label="prev">‹</button>
            <div className="month-title">
              <strong>{hijriLabel}</strong>
              <span>{gregorianLabel}</span>
            </div>
            <button onClick={() => move(1)} aria-label="next">›</button>
          </div>
          <div className="cal">
            {heads.map((h, i) => (
              <span key={i} className="dow">{h}</span>
            ))}
            {Array.from({ length: pad }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const on = selected.year === cursor.year && selected.month === cursor.month && selected.day === day;
              const isToday = today.year === cursor.year && today.month === cursor.month && today.day === day;
              const at = noonInZone({ year: cursor.year, month: cursor.month, day }, place.timeZone);
              const hijri = hijriFrom(at, place.timeZone);
              const hijriDay = lang === "ar" ? hijri.day.toLocaleString("ar-EG") : String(hijri.day);
              return (
                <button key={day} className={on ? "day on" : isToday ? "day today" : "day"} title={formatHijri(at, place.timeZone, lang)} onClick={() => setSelected({ year: cursor.year, month: cursor.month, day })}>
                  <b>{day}</b>
                  <small>{hijriDay}</small>
                </button>
              );
            })}
          </div>
        </article>
        <article className="card">
          <p className="kicker">{formatHijri(noonInZone(selected, place.timeZone), place.timeZone, lang)}</p>
          <ul className="plain">
            {slots.map((slot) => (
              <li key={slot.slot}>
                <span>{t(lang, slot.slot)}</span>
                <time>{formatClock(slot.time, place.timeZone, lang)}</time>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function Quran(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [q, setQ] = useState("");
  const [n, setN] = useState(1);
  const [showTr, setShowTr] = useState(lang !== "ar");
  const [arabic, setArabic] = useState<Verse[]>([]);
  const [translated, setTranslated] = useState<Verse[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const edition = translationEdition(lang);
  const chapter = CHAPTERS.find((c) => c.n === n) ?? CHAPTERS[0];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CHAPTERS;
    return CHAPTERS.filter((c) => `${c.n} ${c.en} ${c.name} ${c.ar}`.toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(false);
    (async () => {
      try {
        const ar = await loadVerses("ara-quranuthmanihaf", n);
        const tr = edition ? await loadVerses(edition, n) : [];
        if (!live) return;
        setArabic(ar);
        setTranslated(tr);
      } catch {
        if (live) setError(true);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [n, edition, tick]);

  return (
    <section className="fill">
      <header className="top">
        <h1>{t(lang, "quran")}</h1>
        <label className="toggle">
          <input type="checkbox" checked={showTr} onChange={(e) => setShowTr(e.target.checked)} />
          {t(lang, "showTranslation")}
        </label>
      </header>
      <div className="split">
        <div className="pane">
          <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "search")} />
          <ul className="menu">
            {filtered.map((c) => (
              <li key={c.n}>
                <button className={c.n === n ? "on" : ""} onClick={() => setN(c.n)}>
                  <b>{c.n}</b>
                  <span>
                    <strong className="arabic inline">{c.ar}</strong>
                    <small>{c.en}</small>
                  </span>
                  <em>{c.verses}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="pane read">
          <header className="surah-head">
            <p className="arabic title">{chapter.ar}</p>
            <p>{chapter.en}</p>
          </header>
          {busy && <p className="muted">{t(lang, "loading")}</p>}
          {error && (
            <div className="empty">
              <p>{t(lang, "loadError")}</p>
              <button className="primary" onClick={() => setTick((x) => x + 1)}>{t(lang, "retry")}</button>
            </div>
          )}
          {!busy && !error && (
            <ol className="verses">
              {arabic.map((v, i) => {
                const id = `v-${v.chapter}-${v.verse}`;
                return (
                  <li key={id}>
                    <div className="verse-tools">
                      <span>{v.verse}</span>
                      <Star
                        on={m.hasFav(id)}
                        onClick={() =>
                          m.toggleFav({
                            id,
                            kind: "verse",
                            title: `${chapter.en} ${v.verse}`,
                            text: v.text,
                            sub: translated[i]?.text,
                          })
                        }
                      />
                    </div>
                    <p className="arabic">{v.text}</p>
                    {showTr && translated[i] && <p className="tr">{translated[i].text}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function Hadith(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [book, setBook] = useState(BOOK_ORDER[0]);
  const sections = Object.entries(BOOKS[book]?.sections ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  const [section, setSection] = useState(sections[0]?.[0] ?? "1");
  const [rows, setRows] = useState<HadithRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(false);
    loadHadith(book, section)
      .then((data) => {
        if (live) setRows(data);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [book, section, tick]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.en} ${r.ar} ${r.n}`.toLowerCase().includes(needle)) : rows;

  return (
    <section className="fill">
      <header className="top">
        <h1>{t(lang, "hadith")}</h1>
        <input className="grow slim" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "search")} />
      </header>
      <div className="book-row">
        {BOOK_ORDER.map((id) => (
          <button key={id} className={id === book ? "chip on" : "chip"} onClick={() => {
            const first = Object.entries(BOOKS[id]?.sections ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))[0]?.[0] ?? "1";
            setBook(id);
            setSection(first);
          }}>
            {BOOKS[id]?.name ?? id}
          </button>
        ))}
      </div>
      <div className="split">
        <ul className="menu pane">
          {sections.map(([id, name]) => (
            <li key={id}>
              <button className={id === section ? "on" : ""} onClick={() => setSection(id)}>
                <span>{name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pane read">
          {busy && <p className="muted">{t(lang, "loading")}</p>}
          {error && (
            <div className="empty">
              <p>{t(lang, "loadError")}</p>
              <button className="primary" onClick={() => setTick((x) => x + 1)}>{t(lang, "retry")}</button>
            </div>
          )}
          {!busy && !error && (
            <ul className="hadiths">
              {shown.map((row) => {
                const id = `h-${book}-${row.n}`;
                return (
                  <li key={id}>
                    <div className="verse-tools">
                      <span>{row.n}</span>
                      <Star
                        on={m.hasFav(id)}
                        onClick={() => m.toggleFav({ id, kind: "hadith", title: `${BOOKS[book]?.name ?? book} ${row.n}`, text: row.ar || row.en, sub: row.en })}
                      />
                    </div>
                    {row.ar && <p className="arabic">{row.ar}</p>}
                    <p>{row.en}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function QiblaView(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [heading, setHeading] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const handler = (event: Event) => {
      const angle = window.screen?.orientation?.angle ?? 0;
      const turned = (window as Window & { orientation?: number }).orientation ?? 0;
      const magnetic = magneticHeading(event as DeviceOrientationEvent, angle, turned);
      if (magnetic == null) return;
      setHeading(magnetic);
    };
    window.addEventListener("deviceorientationabsolute", handler, true);
    window.addEventListener("deviceorientation", handler, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler, true);
      window.removeEventListener("deviceorientation", handler, true);
    };
  }, [armed]);

  if (!m.place) return <NeedPlace m={m} />;
  const qibla = qiblaBearing(m.place);
  const variation = declination(m.place.latitude, m.place.longitude);
  const headingTrue = heading == null ? null : trueHeading(heading, variation);
  const needle = arrowDegrees(qibla, headingTrue);
  let hint = t(lang, "northUp");
  if (headingTrue != null) {
    const diff = turnDelta(qibla, headingTrue);
    if (Math.abs(diff) < 6) hint = t(lang, "facingQibla");
    else if (diff > 0) hint = `${t(lang, "turnRight")} ${Math.round(diff)}°`;
    else hint = `${t(lang, "turnLeft")} ${Math.round(-diff)}°`;
  }

  async function enable() {
    const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (typeof ctor.requestPermission === "function") {
      const result = await ctor.requestPermission();
      if (result !== "granted") return;
    }
    setArmed(true);
  }

  return (
    <section className="qibla" data-qibla={Math.round(qibla)} data-needle={Math.round(needle)}>
      <header className="top">
        <div>
          <h1>{t(lang, "qibla")}</h1>
          <p className="lede">{m.place.label}</p>
          <p className="lede">
            {Math.round(qibla)}° {t(lang, "fromNorth")} · {compassPoint(qibla)}
          </p>
        </div>
        <button className="primary" onClick={() => void enable()}>
          {t(lang, "enableCompass")}
        </button>
      </header>
      <div className="compass-wrap">
        <div className="lubber" />
        <div className="dial" style={{ transform: `rotate(${headingTrue == null ? 0 : -headingTrue}deg)` }}>
          <span className="n">N</span>
          <span className="e">E</span>
          <span className="s">S</span>
          <span className="w">W</span>
          <span className="qibla-arrow" style={{ transform: `rotate(${qibla}deg)` }} />
        </div>
      </div>
      <p className="hint">{hint}</p>
    </section>
  );
}

function Tasbih(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [phrase, setPhrase] = useState(0);
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState(33);
  const item = PHRASES[phrase];
  return (
    <section className="tasbih">
      <header className="top">
        <h1>{t(lang, "tasbih")}</h1>
        <div className="seg">
          {[33, 34, 99, 100].map((n) => (
            <button key={n} className={target === n ? "on" : ""} onClick={() => setTarget(n)}>
              {n}
            </button>
          ))}
        </div>
      </header>
      <div className="chips">
        {PHRASES.map((p, i) => (
          <button key={p.en} className={i === phrase ? "chip on" : "chip"} onClick={() => { setPhrase(i); setCount(0); }}>
            {p.en}
          </button>
        ))}
      </div>
      <button
        className={count >= target ? "pad done" : "pad"}
        onClick={() => {
          setCount((c) => c + 1);
          if (navigator.vibrate) navigator.vibrate(8);
        }}
      >
        <span className="arabic phrase">{item.ar}</span>
        <strong>{count}</strong>
        <em>
          {t(lang, "target")} {target}
        </em>
      </button>
      <button className="text" onClick={() => setCount(0)}>
        {t(lang, "reset")}
      </button>
    </section>
  );
}

function Names(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(0);
  const needle = q.trim().toLowerCase();
  const list = NAMES.map((row, i) => ({ i, ar: row[0], tr: row[1], en: row[2] })).filter((row) =>
    !needle ? true : `${row.i + 1} ${row.tr} ${row.en} ${row.ar}`.toLowerCase().includes(needle),
  );
  const current = NAMES[open];
  return (
    <section>
      <header className="top">
        <h1>{t(lang, "names")}</h1>
        <input className="grow slim" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "search")} />
      </header>
      <div className="columns">
        <div className="name-grid">
          {list.map((row) => (
            <button key={row.i} className={row.i === open ? "name on" : "name"} onClick={() => setOpen(row.i)}>
              <small>{row.i + 1}</small>
              <span className="arabic">{row.ar}</span>
              <em>{row.tr}</em>
            </button>
          ))}
        </div>
        {current && (
          <article className="card name-detail">
            <p className="arabic title">{current[0]}</p>
            <h2>{current[1]}</h2>
            <p className="kicker">{t(lang, "meaning")}</p>
            <p className="lede">{current[2]}</p>
            <Star
              on={m.hasFav(`n-${open + 1}`)}
              onClick={() => m.toggleFav({ id: `n-${open + 1}`, kind: "name", title: current[1], text: current[0], sub: current[2] })}
            />
          </article>
        )}
      </div>
    </section>
  );
}

function Duas(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const tags = ["all", "food", "home", "mosque", "day", "night", "prayer", "travel", "forgiveness"] as const;
  const [tag, setTag] = useState<(typeof tags)[number]>("all");
  const rows = DUAS.filter((d) => tag === "all" || d.tag === tag);
  return (
    <section>
      <header className="top">
        <h1>{t(lang, "duas")}</h1>
      </header>
      <div className="chips">
        {tags.map((id) => (
          <button key={id} className={tag === id ? "chip on" : "chip"} onClick={() => setTag(id)}>
            {t(lang, id)}
          </button>
        ))}
      </div>
      <div className="dua-list">
        {rows.map((d) => (
          <article key={d.id} className="card dua">
            <div className="verse-tools">
              <h2>{d.title}</h2>
              <Star on={m.hasFav(`d-${d.id}`)} onClick={() => m.toggleFav({ id: `d-${d.id}`, kind: "dua", title: d.title, text: d.ar, sub: d.en })} />
            </div>
            <p className="arabic">{d.ar}</p>
            <p>{d.en}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Favorites(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  return (
    <section>
      <header className="top">
        <h1>{t(lang, "favorites")}</h1>
      </header>
      {m.favs.length === 0 && <p className="empty">{t(lang, "noFavorites")}</p>}
      <div className="dua-list">
        {m.favs.map((f) => (
          <article key={f.id} className="card dua">
            <div className="verse-tools">
              <h2>{f.title}</h2>
              <button className="text" onClick={() => m.toggleFav(f)}>{t(lang, "remove")}</button>
            </div>
            <p className="arabic">{f.text}</p>
            {f.sub && <p>{f.sub}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsView(m: Model) {
  ModelCtx.current = m;
  const lang = m.settings.lang;
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const s = m.settings;

  function patch(partial: Partial<Settings>) {
    m.setSettings({ ...s, ...partial });
  }

  return (
    <section>
      <header className="top">
        <h1>{t(lang, "settings")}</h1>
      </header>
      <div className="settings">
        <article className="card">
          <h2>{t(lang, "location")}</h2>
          {m.place && <p className="lede">{m.place.label}</p>}
          <CitySearch onPick={m.setPlace} />
        </article>
        <article className="card">
          <h2>{t(lang, "calculation")}</h2>
          <label>
            {t(lang, "calculationMethod")}
            <select value={s.method} onChange={(e) => patch({ method: e.target.value as Settings["method"] })}>
              {METHODS.map((method) => (
                <option key={method.key} value={method.key}>{method[lang]}</option>
              ))}
            </select>
          </label>
          <label>
            {t(lang, "asrMadhab")}
            <select value={s.madhab} onChange={(e) => patch({ madhab: e.target.value as Settings["madhab"] })}>
              <option value="shafi">{t(lang, "shafi")}</option>
              <option value="hanafi">{t(lang, "hanafi")}</option>
            </select>
          </label>
          <label>
            {t(lang, "highLatitude")}
            <select value={s.highLat} onChange={(e) => patch({ highLat: e.target.value as Settings["highLat"] })}>
              <option value="middleofthenight">{t(lang, "middleNight")}</option>
              <option value="seventhofthenight">{t(lang, "seventhNight")}</option>
              <option value="twilightangle">{t(lang, "twilight")}</option>
            </select>
          </label>
          <h3>{t(lang, "minuteAdjust")}</h3>
          <div className="offsets">
            {(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as Slot[]).map((slot) => (
              <label key={slot}>
                {t(lang, slot)}
                <input
                  type="number"
                  value={s.offsets[slot]}
                  onChange={(e) => patch({ offsets: { ...s.offsets, [slot]: Number(e.target.value) || 0 } })}
                />
              </label>
            ))}
          </div>
        </article>
        <article className="card">
          <h2>{t(lang, "theme")}</h2>
          <div className="seg">
            {(["system", "light", "dark"] as const).map((id) => (
              <button key={id} className={s.theme === id ? "on" : ""} onClick={() => patch({ theme: id })}>{t(lang, id)}</button>
            ))}
          </div>
          <h2>{t(lang, "language")}</h2>
          <div className="seg">
            <button className={s.lang === "en" ? "on" : ""} onClick={() => patch({ lang: "en" })}>{t(lang, "english")}</button>
            <button className={s.lang === "ar" ? "on" : ""} onClick={() => patch({ lang: "ar" })}>{t(lang, "arabic")}</button>
            <button className={s.lang === "fr" ? "on" : ""} onClick={() => patch({ lang: "fr" })}>{t(lang, "french")}</button>
          </div>
        </article>
        <article className="card">
          <h2>{t(lang, "reminders")}</h2>
          <label className="toggle">
            <input type="checkbox" checked={s.chime} onChange={(e) => patch({ chime: e.target.checked })} />
            {t(lang, "reminderChime")}
          </label>
          <p className="fine">{t(lang, "adhanNote")}</p>
          <div className="seg">
            <button type="button" onClick={() => playAdhan("fajr")}>{t(lang, "playFajrAdhan")}</button>
            <button type="button" onClick={() => playAdhan("dhuhr")}>{t(lang, "playRegularAdhan")}</button>
            <button
              type="button"
              onClick={() => {
                if (adhanPlayer) {
                  adhanPlayer.pause();
                  adhanPlayer.currentTime = 0;
                }
              }}
            >
              {t(lang, "stopAdhan")}
            </button>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={s.notify}
              onChange={async (e) => {
                if (e.target.checked && "Notification" in window && Notification.permission !== "granted") {
                  const result = await Notification.requestPermission();
                  patch({ notify: result === "granted" });
                  return;
                }
                patch({ notify: e.target.checked });
              }}
            />
            {t(lang, "notifications")}
          </label>
        </article>
        <article className="card">
          <h2>{t(lang, "content")}</h2>
          <button
            className="primary"
            disabled={progress != null && progress < 114}
            onClick={() => {
              setDone(false);
              setProgress(0);
              void saveQuran(translationEdition(s.lang), (n) => setProgress(n)).then(() => setDone(true));
            }}
          >
            {t(lang, "offlineQuran")}
          </button>
          {progress != null && (
            <p className="muted">{done ? t(lang, "downloaded") : `${t(lang, "downloading")} ${progress}/114`}</p>
          )}
          <p className="fine">{t(lang, "attribution")}</p>
        </article>
      </div>
    </section>
  );
}

function NeedPlace({ m }: { m: Model }) {
  ModelCtx.current = m;
  return (
    <section>
      <h1>{t(m.settings.lang, "setLocation")}</h1>
      <p className="lede">{t(m.settings.lang, "locationHelp")}</p>
      <CitySearch onPick={m.setPlace} />
    </section>
  );
}

function Star({ on, onClick }: { on: boolean; onClick: () => void }) {
  const { settings } = useModel();
  return (
    <button className={on ? "star on" : "star"} aria-pressed={on} aria-label={t(settings.lang, on ? "saved" : "save")} onClick={onClick}>
      ★
    </button>
  );
}

export default App;
