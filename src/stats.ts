const STATS_API = "https://shafiappco.com/api";
const VID_KEY = "shafi-vid";

function visitorId(): string {
  try {
    const existing = localStorage.getItem(VID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing;
    const id =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now()}${Math.random().toString(36).slice(2)}`) || `anon${Date.now()}`;
    localStorage.setItem(VID_KEY, id);
    return id;
  } catch {
    return `anon${Date.now()}`;
  }
}

export async function trackWaqtUse(): Promise<void> {
  try {
    await fetch(`${STATS_API}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "use", id: visitorId() }),
      keepalive: true,
    });
  } catch {
    /* offline / blocked */
  }
}

export type WaqtStats = { users: number; downloads: number };

export async function fetchWaqtStats(): Promise<WaqtStats | null> {
  try {
    const res = await fetch(`${STATS_API}/stats`);
    if (!res.ok) return null;
    const data = (await res.json()) as WaqtStats;
    return {
      users: Number(data.users) || 0,
      downloads: Number(data.downloads) || 0,
    };
  } catch {
    return null;
  }
}
