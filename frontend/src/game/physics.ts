import { WeaponType } from "../contracts/artillery";

export const MAP_WIDTH = 32;
export const WORLD_WIDTH = 3200; // 32 columns * 100 units
export const WORLD_HEIGHT = 450;
const SCALE = 10_000;
const GRAVITY = 980;

const SIN5_TABLE = [
  0, 872, 1736, 2588, 3420, 4226, 5000, 5736, 6428, 7071, 7660, 8192, 8660, 9063, 9397, 9659, 9848,
  9962, 10000,
];

function sin5(step: number): number {
  if (step <= 0) return 0;
  if (step >= 18) return 10000;
  return SIN5_TABLE[step];
}

export function snapAngle(angle: number): number {
  const clamped = Math.max(0, Math.min(180, Math.floor(angle)));
  return Math.floor(clamped / 5) * 5;
}

export function trig(angle: number): { cosVal: number; sinVal: number } {
  const snapped = snapAngle(angle);
  if (snapped <= 90) {
    const idx = snapped / 5;
    return {
      sinVal: sin5(idx),
      cosVal: sin5(18 - idx),
    };
  } else {
    const idx = (180 - snapped) / 5;
    return {
      sinVal: sin5(idx),
      cosVal: -sin5(18 - idx),
    };
  }
}

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export interface SimulationOutcome {
  points: TrajectoryPoint[];
  hitMap: boolean;
  impactX: number;
  impactY: number;
}

/**
 * Mirrors ArtilleryMath.simulateShot 1:1 using integer truncation
 * so frontend previews and animations match on-chain outcomes identically.
 */
export function simulateShotPreview(
  terrain: number[],
  startX: number,
  angle: number,
  power: number,
  wind: number,
  weapon: WeaponType,
): SimulationOutcome {
  const { cosVal, sinVal } = trig(angle);

  const speed = weapon === WeaponType.Mortar ? power * 11 : power * 13;

  let x = startX * 100 + 50;
  let y = (terrain[startX] ?? 200) + 15;

  let vx = Math.trunc((speed * cosVal) / SCALE);
  let vy = Math.trunc((speed * sinVal) / SCALE);

  const points: TrajectoryPoint[] = [{ x, y }];

  for (let step = 0; step < 60; step++) {
    x += Math.trunc(vx / 5);
    y += Math.trunc(vy / 5);

    vx += wind * 2;
    vy -= Math.trunc(GRAVITY / 50);

    points.push({ x, y });

    if (x < 0 || x >= WORLD_WIDTH) {
      return { points, hitMap: false, impactX: 0, impactY: 0 };
    }

    if (y <= 0) {
      const colOut = Math.floor(x / 100);
      return { points, hitMap: true, impactX: colOut, impactY: 0 };
    }

    const col = Math.floor(x / 100);
    if (y <= (terrain[col] ?? 0)) {
      return { points, hitMap: true, impactX: col, impactY: y };
    }
  }

  return { points, hitMap: false, impactX: 0, impactY: 0 };
}
