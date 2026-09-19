import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Place, Settings, Slot } from "./types";
import { addDays, civilFrom, dayKey, formatClock, slotsFor } from "./prayer";
import { t } from "./i18n";

type ScheduleItem = {
  id: string;
  at: number;
  title: string;
  body: string;
  kind: "fajr" | "regular";
};

type AdhanNativePlugin = {
  isNative(): Promise<{ value: boolean }>;
  requestPermissions(): Promise<{ notifications: string }>;
  canScheduleExact(): Promise<{ value: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  schedule(options: { items: ScheduleItem[] }): Promise<{ scheduled: number }>;
  playNow(options: { kind: string; title: string; body?: string }): Promise<void>;
  stop(): Promise<void>;
  cancelAll(): Promise<void>;
  addListener?(event: string, cb: () => void): Promise<PluginListenerHandle>;
};

const AdhanNative = registerPlugin<AdhanNativePlugin>("AdhanNative");

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function ensureAdhanPermissions(): Promise<boolean> {
  if (!isAndroidNative()) return false;
  const perms = await AdhanNative.requestPermissions();
  const exact = await AdhanNative.canScheduleExact();
  if (!exact.value) {
    try {
      await AdhanNative.openExactAlarmSettings();
    } catch {
      /* user dismissed */
    }
  }
  return perms.notifications === "granted";
}

export async function syncNativeAdhanSchedule(place: Place | null, settings: Settings): Promise<void> {
  if (!isAndroidNative()) return;
  if (!place || !settings.chime) {
    await AdhanNative.setEnabled({ enabled: false });
    await AdhanNative.cancelAll();
    return;
  }
  await AdhanNative.setEnabled({ enabled: true });
  const now = Date.now();
  const today = civilFrom(new Date(now), place.timeZone);
  const items: ScheduleItem[] = [];
  for (let d = 0; d < 3; d++) {
    const day = addDays(today, d);
    for (const slot of slotsFor(place, settings, day)) {
      if (slot.slot === "sunrise") continue;
      const at = slot.time.getTime();
      if (at <= now) continue;
      items.push({
        id: `${dayKey(day)}-${slot.slot}`,
        at,
        title: t(settings.lang, slot.slot),
        body: formatClock(slot.time, place.timeZone, settings.lang),
        kind: slot.slot === "fajr" ? "fajr" : "regular",
      });
    }
  }
  await AdhanNative.schedule({ items: items.slice(0, 24) });
}

export async function playNativeAdhan(slot: Slot, title: string, body = ""): Promise<boolean> {
  if (!isAndroidNative()) return false;
  await AdhanNative.playNow({
    kind: slot === "fajr" ? "fajr" : "regular",
    title,
    body,
  });
  return true;
}

export async function stopNativeAdhan(): Promise<void> {
  if (!isAndroidNative()) return;
  await AdhanNative.stop();
}
