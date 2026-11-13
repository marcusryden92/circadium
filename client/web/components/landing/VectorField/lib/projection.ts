import type { GlobalSettings, ProjectionParams } from "../types";
import { FIELD_SIZE } from "../defaults";

// Camera orbits the field center on a vertical arc.
//   tilt = 0   → overhead (top-down)
//   tilt = 90° → ground-level horizontal
// Always looks at the field center, so basis vectors auto-derive correctly.
export function projectionParams(
  G: GlobalSettings,
  height: number,
): ProjectionParams {
  const tilt = (G.tilt * Math.PI) / 180;
  const rot = (G.rot * Math.PI) / 180;
  const fov = (G.fov * Math.PI) / 180;
  const focal = (height * 0.5) / Math.tan(fov * 0.5);

  const target = { x: FIELD_SIZE * 0.5, y: FIELD_SIZE * 0.5, z: 0 };

  const R = FIELD_SIZE * 0.9 * G.zoom;

  const tiltOffsetY = -R * Math.sin(tilt);
  const tiltOffsetZ = R * Math.cos(tilt);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const offX = -tiltOffsetY * sinR;
  const offY = tiltOffsetY * cosR;

  const camPos = {
    x: target.x + offX,
    y: target.y + offY,
    z: target.z + tiltOffsetZ,
  };

  const fx = target.x - camPos.x;
  const fy = target.y - camPos.y;
  const fz = target.z - camPos.z;
  const flen = Math.hypot(fx, fy, fz);
  const f = { x: fx / flen, y: fy / flen, z: fz / flen };

  // Right = f × worldUp(0,0,1)
  const rx = f.y;
  const ry = -f.x;
  const rz = 0;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  const r = { x: rx / rlen, y: ry / rlen, z: rz / rlen };

  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };

  return { focal, camPos, f, r, u };
}

export interface Projected {
  sx: number;
  sy: number;
  scale: number;
  valid: boolean;
}

export function project3D(
  X: number,
  Y: number,
  Z: number,
  params: ProjectionParams,
  W: number,
  H: number,
): Projected {
  const { focal, camPos, f, r, u } = params;
  const dx = X - camPos.x;
  const dy = Y - camPos.y;
  const dz = Z - camPos.z;

  const depth = dx * f.x + dy * f.y + dz * f.z;
  if (depth <= 1) return { sx: 0, sy: -9999, scale: 0, valid: false };

  const horiz = dx * r.x + dy * r.y + dz * r.z;
  const vert = dx * u.x + dy * u.y + dz * u.z;

  const sx = W * 0.5 + (horiz * focal) / depth;
  const sy = H * 0.5 - (vert * focal) / depth;
  const scale = focal / depth;
  return { sx, sy, scale, valid: true };
}

// Inverse of project3D: ray from camera through screen pixel intersected with z = 0.
export function screenToGround(
  sx: number,
  sy: number,
  params: ProjectionParams,
  W: number,
  H: number,
): { wx: number; wy: number; valid: boolean } {
  const { focal, camPos, f, r, u } = params;
  const cx = (sx - W * 0.5) / focal;
  const cy = -(sy - H * 0.5) / focal;
  const rdx = r.x * cx + u.x * cy + f.x;
  const rdy = r.y * cx + u.y * cy + f.y;
  const rdz = r.z * cx + u.z * cy + f.z;
  if (Math.abs(rdz) < 1e-6) return { wx: 0, wy: 0, valid: false };
  const t = -camPos.z / rdz;
  if (t < 0) return { wx: 0, wy: 0, valid: false };
  return {
    wx: camPos.x + t * rdx,
    wy: camPos.y + t * rdy,
    valid: true,
  };
}
