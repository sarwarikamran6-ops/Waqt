const memory = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  if (memory.has(url)) return memory.get(url) as T;
  try {
    if ("caches" in window) {
      const cache = await caches.open("waqt-content-v1");
      const hit = await cache.match(url);
      if (hit) {
        const data = (await hit.json()) as T;
        memory.set(url, data);
        return data;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      await cache.put(url, res.clone());
      const data = (await res.json()) as T;
      memory.set(url, data);
      return data;
    }
  } catch (err) {
    if (memory.has(url)) return memory.get(url) as T;
    if (!(err instanceof Error) || !err.message.match(/^\d+$/)) {
      /* fall through to a plain fetch when Cache API is blocked */
    } else {
      throw err;
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as T;
  memory.set(url, data);
  return data;
}

export type Verse = { chapter: number; verse: number; text: string };
export type HadithRow = { n: number; ar: string; en: string };

const QURAN = "https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions";
const HADITH = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

export function translationEdition(lang: string): string | null {
  if (lang === "fr") return "fra-muhammadhamidul";
  if (lang === "ar") return null;
  return "eng-mohammedmarmadu";
}

export async function loadVerses(edition: string, chapter: number): Promise<Verse[]> {
  const data = await getJson<{ chapter: Verse[] }>(`${QURAN}/${edition}/${chapter}.json`);
  return data.chapter;
}

export async function saveQuran(translation: string | null, onProgress: (n: number) => void): Promise<void> {
  for (let n = 1; n <= 114; n++) {
    await loadVerses("ara-quranuthmanihaf", n);
    if (translation) await loadVerses(translation, n);
    onProgress(n);
  }
}

type RawHadith = { hadithnumber: number; text: string };

export async function loadHadith(book: string, section: string): Promise<HadithRow[]> {
  const [en, ar] = await Promise.all([
    getJson<{ hadiths: RawHadith[] }>(`${HADITH}/eng-${book}/${section}.min.json`),
    getJson<{ hadiths: RawHadith[] }>(`${HADITH}/ara-${book}/${section}.min.json`).catch(() => ({ hadiths: [] as RawHadith[] })),
  ]);
  const arabic = new Map(ar.hadiths.map((h) => [h.hadithnumber, h.text]));
  return en.hadiths
    .filter((h) => h.text && h.text.trim())
    .map((h) => ({ n: h.hadithnumber, en: h.text, ar: arabic.get(h.hadithnumber) ?? "" }));
}

export type GeoHit = {
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

export async function searchCities(query: string, signal: AbortSignal): Promise<GeoHit[]> {
  // Photon supports full street addresses and place names.
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as {
    features?: {
      geometry: { coordinates: [number, number] };
      properties: {
        name?: string;
        street?: string;
        housenumber?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        country?: string;
        postcode?: string;
        timezone?: string;
      };
    }[];
  };
  return (data.features ?? []).map((f) => {
    const p = f.properties;
    const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ").trim();
    const place = p.city || p.town || p.village || p.name;
    const label = [line1 && line1 !== place ? line1 : null, place, p.state, p.country, p.postcode]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(", ");
    return {
      label: label || `${f.geometry.coordinates[1].toFixed(4)}, ${f.geometry.coordinates[0].toFixed(4)}`,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      timeZone: p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  });
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&limit=1`,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        features?: { properties: Record<string, string | undefined> }[];
      };
      const p = data.features?.[0]?.properties;
      if (p) {
        const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ").trim();
        const place = p.city || p.town || p.village || p.name;
        const label = [line1 && line1 !== place ? line1 : null, place, p.state, p.country]
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .join(", ");
        if (label) return label;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
        countryName?: string;
      };
      const label = [data.locality || data.city, data.principalSubdivision, data.countryName]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(", ");
      if (label) return label;
    }
  } catch {
    /* coordinates are enough */
  }
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
