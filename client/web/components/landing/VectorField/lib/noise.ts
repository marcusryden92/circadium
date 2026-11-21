// 2D simplex noise. Returns ~[-1, 1].
// Standard Gustavson reference impl, with a deterministic permutation table
// so output is stable across reloads.

const SQRT3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT3 - 1);
const G2 = (3 - SQRT3) / 6;

const PERM = (() => {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let seed = 1337;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) | 0;
    const j = (seed >>> 0) % (i + 1);
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
})();

// 8 unit-ish gradients (the classic small set; works fine for 2D).
const GRAD = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1,
]);

export function simplex2(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  let i1: number, j1: number;
  if (x0 > y0) {
    i1 = 1;
    j1 = 0;
  } else {
    i1 = 0;
    j1 = 1;
  }
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = (PERM[ii + PERM[jj]] & 7) * 2;
  const gi1 = (PERM[ii + i1 + PERM[jj + j1]] & 7) * 2;
  const gi2 = (PERM[ii + 1 + PERM[jj + 1]] & 7) * 2;

  let n0 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    n0 = t0 * t0 * (GRAD[gi0] * x0 + GRAD[gi0 + 1] * y0);
  }
  let n1 = 0;
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    n1 = t1 * t1 * (GRAD[gi1] * x1 + GRAD[gi1 + 1] * y1);
  }
  let n2 = 0;
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    n2 = t2 * t2 * (GRAD[gi2] * x2 + GRAD[gi2 + 1] * y2);
  }

  return 70 * (n0 + n1 + n2);
}
