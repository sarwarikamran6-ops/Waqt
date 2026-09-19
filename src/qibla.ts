import { magvar } from "magvar";

export function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export type HeadingEvent = {
  webkitCompassHeading?: number | null;
  alpha?: number | null;
  absolute?: boolean;
};

// iOS reports the screen-top heading. Android's absolute alpha is the device
// frame, so the screen rotation is added only on that path.
export function magneticHeading(event: HeadingEvent, screenAngle = 0): number | null {
  const ios = event.webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) return norm360(ios);
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
