import { magvar } from "magvar";

export function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export type HeadingEvent = {
  webkitCompassHeading?: number | null;
  webkitCompassAccuracy?: number | null;
  alpha?: number | null;
  absolute?: boolean;
};

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

export function compassPoint(degrees: number): (typeof POINTS)[number] {
  return POINTS[Math.round(norm360(degrees) / 22.5) % 16];
}

// iOS webkitCompassHeading is the portrait top of the device, not the top of
// the screen. window.orientation is 0 in portrait and ±90 in landscape, including
// on iPad. Android absolute alpha uses the screen angle instead.
export function magneticHeading(event: HeadingEvent, screenAngle = 0, windowOrientation = 0): number | null {
  const ios = event.webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) {
    if (typeof event.webkitCompassAccuracy === "number" && event.webkitCompassAccuracy < 0) return null;
    return norm360(ios - windowOrientation);
  }
  if (event.absolute === true && typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return norm360(360 - event.alpha + screenAngle);
  }
  return null;
}

export function declination(latitude: number, longitude: number, when = new Date()): number {
  const value = magvar(latitude, longitude, 0, when);
  return Number.isFinite(value) ? value : 0;
}

export function trueHeading(magnetic: number, variation: number): number {
  return norm360(magnetic + variation);
}

export function arrowDegrees(qibla: number, headingTrue: number | null): number {
  if (headingTrue == null) return norm360(qibla);
  return norm360(qibla - headingTrue);
}

export function turnDelta(qibla: number, headingTrue: number): number {
  return ((qibla - headingTrue + 540) % 360) - 180;
}
