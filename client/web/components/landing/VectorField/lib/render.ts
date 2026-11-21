import type { SceneState } from "../types";
import { FIELD_SIZE } from "../defaults";
import { projectionParams, project3D, screenToGround } from "./projection";
import { simplex2 } from "./noise";

export interface MouseState {
  sx: number;
  sy: number;
  active: boolean;
}

// Quantization for bucket batching. Color quantized to 5 bits/channel; alpha
// and line-width quantized to coarser buckets. Trade-off is invisible banding
// for ~10k strands collapsing into ~hundreds of draw calls per frame.
const ALPHA_BUCKETS = 16;
const WIDTH_BUCKETS = 8;
const WIDTH_STEP = 0.5;
const ALPHA_MAX = ALPHA_BUCKETS - 1;
const WIDTH_MAX = WIDTH_BUCKETS - 1;
const TWO_PI = Math.PI * 2;

export interface RenderState {
  displacement: Float32Array;
  colorCache: Uint8Array;
  lineBuckets: Map<number, number[]>;
  dotBuckets: Map<number, number[]>;
  netBuckets: Map<number, number[]>;
  tipXY: Float32Array;
  tipValid: Uint8Array;
  bgGradientCanvas: HTMLCanvasElement | null;
  bgGradientCtx: CanvasRenderingContext2D | null;
  bgImageData: ImageData | null;
  cacheSteps: number;
  cacheKey: string;
  t: number;
  lastFrameTime: number;
}

export function createRenderState(): RenderState {
  return {
    displacement: new Float32Array(0),
    colorCache: new Uint8Array(0),
    lineBuckets: new Map(),
    dotBuckets: new Map(),
    netBuckets: new Map(),
    tipXY: new Float32Array(0),
    tipValid: new Uint8Array(0),
    bgGradientCanvas: null,
    bgGradientCtx: null,
    bgImageData: null,
    cacheSteps: 0,
    cacheKey: "",
    t: 0,
    lastFrameTime:
      typeof performance !== "undefined" ? performance.now() : 0,
  };
}

let colorParserCtx: CanvasRenderingContext2D | null = null;
const COLOR_FALLBACK: [number, number, number] = [180, 210, 245];

function parseCssColor(str: string): [number, number, number] {
  if (!colorParserCtx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    colorParserCtx = c.getContext("2d");
  }
  if (!colorParserCtx) return COLOR_FALLBACK;
  colorParserCtx.fillStyle = "#000";
  colorParserCtx.fillStyle = str;
  const v = colorParserCtx.fillStyle;
  if (v.charCodeAt(0) === 35 && v.length === 7) {
    const n = parseInt(v.slice(1), 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return COLOR_FALLBACK;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = (gN - bN) / d + (gN < bN ? 6 : 0);
    else if (max === gN) h = (bN - rN) / d + 2;
    else h = (rN - gN) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lN - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function fillColorField(
  out: Uint8Array | Uint8ClampedArray,
  stride: number,
  steps: number,
  spacing: number,
  baseColor: string,
  hueShift: number,
): void {
  const [sr, sg, sb] = parseCssColor(baseColor);
  const [baseH, baseS, baseL] = rgbToHsl(sr, sg, sb);

  for (let j = 0; j < steps; j++) {
    const Y = j * spacing;
    const sinY1 = Math.sin(Y * 0.004);
    const sinY2 = Math.sin(Y * 0.0058 + 1.3);
    const sinY3 = Math.sin(Y * 0.0046 + 0.9);
    for (let i = 0; i < steps; i++) {
      const X = i * spacing;
      const hueOffset = (Math.sin(X * 0.005) + sinY1) * 0.5 * hueShift;
      const satOffset =
        (Math.sin(X * 0.0042 + 2.1) + sinY2) * 0.5 * hueShift * 0.6;
      const lightOffset =
        (Math.sin(X * 0.0057 + 3.7) + sinY3) * 0.5 * hueShift * 0.15;
      const sOut = Math.max(0, Math.min(100, baseS + satOffset));
      const lOut = Math.max(5, Math.min(95, baseL + lightOffset));
      const [r, g, b] = hslToRgb(baseH + hueOffset, sOut, lOut);
      const idx = (j * steps + i) * stride;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      if (stride === 4) out[idx + 3] = 255;
    }
  }
}

function ensureCaches(
  rs: RenderState,
  steps: number,
  spacing: number,
  strandColor: string,
  hueShift: number,
): void {
  const key = `${steps}|${spacing.toFixed(4)}|${strandColor}|${hueShift}`;
  if (rs.cacheKey === key) return;

  const cells = steps * steps;
  if (rs.cacheSteps !== steps) {
    rs.displacement = new Float32Array(cells * 2);
    rs.tipXY = new Float32Array(cells * 2);
    rs.tipValid = new Uint8Array(cells);
  } else {
    rs.displacement.fill(0);
  }
  if (rs.colorCache.length !== cells * 3) {
    rs.colorCache = new Uint8Array(cells * 3);
  }

  fillColorField(rs.colorCache, 3, steps, spacing, strandColor, hueShift);

  rs.cacheSteps = steps;
  rs.cacheKey = key;
}

function ensureBgGradientResources(
  rs: RenderState,
  steps: number,
): Uint8ClampedArray | null {
  if (!rs.bgGradientCanvas)
    rs.bgGradientCanvas = document.createElement("canvas");
  const off = rs.bgGradientCanvas;
  if (off.width !== steps || off.height !== steps) {
    off.width = steps;
    off.height = steps;
    rs.bgGradientCtx = null;
    rs.bgImageData = null;
  }
  if (!rs.bgGradientCtx) rs.bgGradientCtx = off.getContext("2d");
  if (!rs.bgGradientCtx) return null;
  if (!rs.bgImageData)
    rs.bgImageData = rs.bgGradientCtx.createImageData(steps, steps);
  return rs.bgImageData.data;
}

function packKey(
  r: number,
  g: number,
  b: number,
  aBucket: number,
  wBucket: number,
): number {
  const rQ = r >> 3;
  const gQ = g >> 3;
  const bQ = b >> 3;
  return (
    ((rQ * 32 + gQ) * 32 + bQ) * (ALPHA_BUCKETS * WIDTH_BUCKETS) +
    aBucket * WIDTH_BUCKETS +
    wBucket
  );
}

function unpackR(key: number): number {
  const cQ = (key / (ALPHA_BUCKETS * WIDTH_BUCKETS)) | 0;
  const rQ = (cQ >> 10) & 31;
  return (rQ << 3) | 4;
}
function unpackG(key: number): number {
  const cQ = (key / (ALPHA_BUCKETS * WIDTH_BUCKETS)) | 0;
  const gQ = (cQ >> 5) & 31;
  return (gQ << 3) | 4;
}
function unpackB(key: number): number {
  const cQ = (key / (ALPHA_BUCKETS * WIDTH_BUCKETS)) | 0;
  const bQ = cQ & 31;
  return (bQ << 3) | 4;
}
function unpackAlpha(key: number): number {
  return ((key / WIDTH_BUCKETS) | 0) % ALPHA_BUCKETS;
}
function unpackWidth(key: number): number {
  return key % WIDTH_BUCKETS;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: SceneState,
  mouse: MouseState,
  rs: RenderState,
): void {
  const { G, waves } = scene;
  const now = performance.now();
  const dt = Math.min(0.05, (now - rs.lastFrameTime) / 1000);
  rs.lastFrameTime = now;

  const spacing = 22 / G.density;
  const params = projectionParams(G, H);
  const stalkHeight = 35 * G.height;
  const maxBend = (G.bend * Math.PI) / 180;
  const steps = Math.ceil(FIELD_SIZE / spacing) + 1;

  ensureCaches(rs, steps, spacing, G.strandColor, G.hueShift);

  const useBgGradient = G.bgHueShift && G.hueShift > 0;
  let bgPixels: Uint8ClampedArray | null = null;
  let bgBaseH = 0;
  let bgBaseS = 0;
  let bgBaseL = 0;
  if (useBgGradient) {
    bgPixels = ensureBgGradientResources(rs, steps);
    if (bgPixels) {
      const [br, bgg, bb] = parseCssColor(G.bgColor);
      [bgBaseH, bgBaseS, bgBaseL] = rgbToHsl(br, bgg, bb);
    }
  }
  if (!bgPixels) {
    ctx.fillStyle = G.bgColor;
    ctx.fillRect(0, 0, W, H);
  }

  let mwx = 0;
  let mwy = 0;
  let mwvalid = false;
  if (mouse.active) {
    const m = screenToGround(mouse.sx, mouse.sy, params, W, H);
    mwx = m.wx;
    mwy = m.wy;
    mwvalid = m.valid;
  }

  const disp = rs.displacement;
  const decay = G.mling > 0.001 ? Math.exp((-dt * Math.LN2) / G.mling) : 0;
  if (decay === 0) {
    disp.fill(0);
  } else if (decay < 0.9999) {
    for (let k = 0; k < disp.length; k++) disp[k] *= decay;
  }

  for (const arr of rs.lineBuckets.values()) arr.length = 0;
  for (const arr of rs.dotBuckets.values()) arr.length = 0;
  for (const arr of rs.netBuckets.values()) arr.length = 0;
  if (G.showNet) rs.tipValid.fill(0);

  const tkx = (2 * Math.PI) / (300 * G.twx);
  const tky = (2 * Math.PI) / (300 * G.twy);
  const tHalf = G.tamp * 0.5;
  const terrainXs = new Float32Array(steps);
  const terrainYs = new Float32Array(steps);
  for (let i = 0; i < steps; i++) terrainXs[i] = Math.sin(i * spacing * tkx);
  for (let j = 0; j < steps; j++) terrainYs[j] = Math.sin(j * spacing * tky);

  const wCount = waves.length;
  const wEnabled: boolean[] = new Array<boolean>(wCount);
  const wDx = new Float32Array(wCount);
  const wDy = new Float32Array(wCount);
  const wAmp = new Float32Array(wCount);
  const wDxk = new Float32Array(wCount);
  const wDyk = new Float32Array(wCount);
  const wWarpAmp = new Float32Array(wCount);
  const wColConst: Float32Array[] = new Array<Float32Array>(wCount);
  const wRowConst: Float32Array[] = new Array<Float32Array>(wCount);
  let totalAmp = 0;
  let anyWarp = false;
  for (let wi = 0; wi < wCount; wi++) {
    const w = waves[wi];
    wEnabled[wi] = w.enabled;
    if (!w.enabled) {
      wColConst[wi] = wRowConst[wi] = terrainXs;
      continue;
    }
    const ang = (w.angle * Math.PI) / 180;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const k = (2 * Math.PI) / (180 * w.wavelength);
    const tConst = w.phase + rs.t * w.speed * G.speed * 1.5;
    const colArr = new Float32Array(steps);
    const rowArr = new Float32Array(steps);
    const dxk = dx * k;
    const dyk = dy * k;
    for (let i = 0; i < steps; i++) colArr[i] = i * spacing * dxk;
    for (let j = 0; j < steps; j++) rowArr[j] = j * spacing * dyk + tConst;
    wDx[wi] = dx;
    wDy[wi] = dy;
    wAmp[wi] = w.amp;
    wDxk[wi] = dxk;
    wDyk[wi] = dyk;
    wWarpAmp[wi] = G.noise * w.noiseMult;
    if (wWarpAmp[wi] > 0) anyWarp = true;
    wColConst[wi] = colArr;
    wRowConst[wi] = rowArr;
    totalAmp += w.amp;
  }
  const invAmp = totalAmp > 0 ? 1 / totalAmp : 0;
  const NOISE_FREQ = 1 / 280;

  const outer = G.mouter;
  const inner = G.minner;
  const outer2 = outer * outer;
  const outerMinusInner = outer - inner;
  const softR = Math.max(8, inner);
  const sign = G.mattract ? -1 : 1;
  const pushScale = G.mforce * dt * 6;
  const focalInv = 600 / params.focal;
  const strength = G.strength;
  const showStrands = G.showStrands;
  const showDots = G.showDots;
  const showNet = G.showNet;
  const strandWidth = G.strandWidth;
  const dotSize = G.dotSize;
  const colorCache = rs.colorCache;
  const lineBuckets = rs.lineBuckets;
  const dotBuckets = rs.dotBuckets;
  const netBuckets = rs.netBuckets;
  const tipXY = rs.tipXY;
  const tipValid = rs.tipValid;
  const hueShiftAmt = G.hueShift;
  const bgAdvect = 70;

  const rowConsts = new Float32Array(wCount);

  for (let j = steps - 1; j >= 0; j--) {
    const Y = j * spacing;
    const terrainYj = terrainYs[j];
    for (let wi = 0; wi < wCount; wi++) {
      rowConsts[wi] = wEnabled[wi] ? wRowConst[wi][j] : 0;
    }

    for (let i = 0; i < steps; i++) {
      const X = i * spacing;
      const cellIdx = j * steps + i;

      let nx = 0;
      let ny = 0;
      if (anyWarp) {
        const nxIn = X * NOISE_FREQ;
        const nyIn = Y * NOISE_FREQ;
        nx = simplex2(nxIn, nyIn);
        ny = simplex2(nxIn + 100, nyIn + 200);
      }

      let vx = 0;
      let vy = 0;
      for (let wi = 0; wi < wCount; wi++) {
        if (!wEnabled[wi]) continue;
        const warpPhase =
          wWarpAmp[wi] > 0
            ? (nx * wDxk[wi] + ny * wDyk[wi]) * wWarpAmp[wi]
            : 0;
        const s = Math.sin(wColConst[wi][i] + rowConsts[wi] + warpPhase);
        const a = wAmp[wi] * s;
        vx += wDx[wi] * a;
        vy += wDy[wi] * a;
      }
      if (invAmp > 0) {
        vx *= invAmp;
        vy *= invAmp;
      }

      if (bgPixels) {
        const bX = X + vx * bgAdvect;
        const bY = Y + vy * bgAdvect;
        const bD1 = bX + bY;
        const bD2 = bX - bY;
        const hueOffset =
          (Math.sin(bX * 0.005) +
            Math.sin(bY * 0.004) +
            Math.sin(bD1 * 0.0031) +
            Math.sin(bD2 * 0.0037 + 1.7)) *
          0.25 *
          hueShiftAmt;
        const satOffset =
          (Math.sin(bX * 0.0042 + 2.1) +
            Math.sin(bY * 0.0058 + 1.3) +
            Math.sin(bD1 * 0.0036 + 0.4) +
            Math.sin(bD2 * 0.0029 + 2.9)) *
          0.25 *
          hueShiftAmt *
          0.6;
        const lightOffset =
          (Math.sin(bX * 0.0057 + 3.7) +
            Math.sin(bY * 0.0046 + 0.9) +
            Math.sin(bD1 * 0.0033 + 2.2) +
            Math.sin(bD2 * 0.0041 + 0.6)) *
          0.25 *
          hueShiftAmt *
          0.15;
        const bgS = Math.max(0, Math.min(100, bgBaseS + satOffset));
        const bgL = Math.max(5, Math.min(95, bgBaseL + lightOffset));
        const [br, bgg, bb] = hslToRgb(bgBaseH + hueOffset, bgS, bgL);
        const px = cellIdx * 4;
        bgPixels[px] = br;
        bgPixels[px + 1] = bgg;
        bgPixels[px + 2] = bb;
        bgPixels[px + 3] = 255;
      }

      const dispIdx = cellIdx * 2;
      if (mwvalid) {
        const ddx = X - mwx;
        const ddy = Y - mwy;
        const dist2 = ddx * ddx + ddy * ddy;
        if (dist2 < outer2) {
          const dist = Math.sqrt(dist2) + 1e-3;
          let falloff: number;
          if (dist <= inner) {
            falloff = 1;
          } else {
            const u = (dist - inner) / outerMinusInner;
            falloff = 1 - u * u * (3 - 2 * u);
          }
          const ds = dist < softR ? dist / softR : 1;
          const dirScale = ds * ds * ds * (ds * (ds * 6 - 15) + 10);
          const push = falloff * dirScale * pushScale;
          const invDist = 1 / dist;
          disp[dispIdx] += sign * ddx * invDist * push;
          disp[dispIdx + 1] += sign * ddy * invDist * push;
        }
      }

      vx += disp[dispIdx];
      vy += disp[dispIdx + 1];

      const mag2 = vx * vx + vy * vy;
      const mag = Math.sqrt(mag2);
      const bendAngle = mag * strength * maxBend;
      const clampedBend = bendAngle < maxBend ? bendAngle : maxBend;
      const invMag = mag > 1e-6 ? 1 / mag : 0;
      const ux = vx * invMag;
      const uy = vy * invMag;

      const sinB = Math.sin(clampedBend);
      const cosB = Math.cos(clampedBend);
      const rootZ = tHalf * (terrainXs[i] + terrainYj);
      const stalk = sinB * stalkHeight;
      const tipX = X + ux * stalk;
      const tipY = Y + uy * stalk;
      const tipZ = rootZ + cosB * stalkHeight;

      const p0 = project3D(X, Y, rootZ, params, W, H);
      if (!p0.valid) continue;
      if (p0.sy < -50 || p0.sy > H + 50) continue;
      if (p0.sx < -50 || p0.sx > W + 50) continue;
      const p1 = project3D(tipX, tipY, tipZ, params, W, H);
      if (!p1.valid) continue;

      const fade = p0.scale * focalInv < 1 ? p0.scale * focalInv : 1;
      const alpha = (0.7 + sinB * 0.4) * fade;
      const lineWidth = fade * strandWidth > 0.4 ? fade * strandWidth : 0.4;

      const colorIdx = cellIdx * 3;
      const r = colorCache[colorIdx];
      const g = colorCache[colorIdx + 1];
      const b = colorCache[colorIdx + 2];

      let aBucket = (alpha * ALPHA_BUCKETS) | 0;
      if (aBucket < 0) aBucket = 0;
      else if (aBucket > ALPHA_MAX) aBucket = ALPHA_MAX;

      let wBucket = (lineWidth / WIDTH_STEP) | 0;
      if (wBucket < 0) wBucket = 0;
      else if (wBucket > WIDTH_MAX) wBucket = WIDTH_MAX;

      if (showStrands) {
        const key = packKey(r, g, b, aBucket, wBucket);
        let arr = lineBuckets.get(key);
        if (!arr) {
          arr = [];
          lineBuckets.set(key, arr);
        }
        arr.push(p0.sx, p0.sy, p1.sx, p1.sy);
      }
      if (showDots) {
        const r2 = dotSize * p1.scale > 0.4 ? dotSize * p1.scale : 0.4;
        let rBucket = (r2 / WIDTH_STEP) | 0;
        if (rBucket < 0) rBucket = 0;
        else if (rBucket > WIDTH_MAX) rBucket = WIDTH_MAX;
        const key = packKey(r, g, b, aBucket, rBucket);
        let arr = dotBuckets.get(key);
        if (!arr) {
          arr = [];
          dotBuckets.set(key, arr);
        }
        arr.push(p1.sx, p1.sy);
      }
      if (showNet) {
        const tipIdx = cellIdx * 2;
        tipXY[tipIdx] = p1.sx;
        tipXY[tipIdx + 1] = p1.sy;
        tipValid[cellIdx] = 1;

        let netA = (fade * ALPHA_BUCKETS) | 0;
        if (netA < 0) netA = 0;
        else if (netA > ALPHA_MAX) netA = ALPHA_MAX;
        const netKey = packKey(r, g, b, netA, wBucket);
        let netArr = netBuckets.get(netKey);
        if (!netArr) {
          netArr = [];
          netBuckets.set(netKey, netArr);
        }
        if (j < steps - 1) {
          const upIdx = cellIdx + steps;
          if (tipValid[upIdx]) {
            const u2 = upIdx * 2;
            netArr.push(p1.sx, p1.sy, tipXY[u2], tipXY[u2 + 1]);
          }
        }
        if (i > 0) {
          const leftIdx = cellIdx - 1;
          if (tipValid[leftIdx]) {
            const l2 = leftIdx * 2;
            netArr.push(p1.sx, p1.sy, tipXY[l2], tipXY[l2 + 1]);
          }
        }
      }
    }
  }

  if (bgPixels && rs.bgGradientCtx && rs.bgImageData && rs.bgGradientCanvas) {
    rs.bgGradientCtx.putImageData(rs.bgImageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(rs.bgGradientCanvas, 0, 0, W, H);
  }

  ctx.lineCap = "round";
  if (showNet) {
    for (const [key, arr] of netBuckets) {
      const len = arr.length;
      if (len === 0) continue;
      const r = unpackR(key);
      const g = unpackG(key);
      const b = unpackB(key);
      const a = (unpackAlpha(key) + 0.5) / ALPHA_BUCKETS;
      const w = (unpackWidth(key) + 0.5) * WIDTH_STEP;
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let q = 0; q < len; q += 4) {
        ctx.moveTo(arr[q], arr[q + 1]);
        ctx.lineTo(arr[q + 2], arr[q + 3]);
      }
      ctx.stroke();
    }
  }
  if (showStrands) {
    for (const [key, arr] of lineBuckets) {
      const len = arr.length;
      if (len === 0) continue;
      const r = unpackR(key);
      const g = unpackG(key);
      const b = unpackB(key);
      const a = (unpackAlpha(key) + 0.5) / ALPHA_BUCKETS;
      const w = (unpackWidth(key) + 0.5) * WIDTH_STEP;
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let q = 0; q < len; q += 4) {
        ctx.moveTo(arr[q], arr[q + 1]);
        ctx.lineTo(arr[q + 2], arr[q + 3]);
      }
      ctx.stroke();
    }
  }
  if (showDots) {
    for (const [key, arr] of dotBuckets) {
      const len = arr.length;
      if (len === 0) continue;
      const r = unpackR(key);
      const g = unpackG(key);
      const b = unpackB(key);
      const a = (unpackAlpha(key) + 0.5) / ALPHA_BUCKETS;
      const w = (unpackWidth(key) + 0.5) * WIDTH_STEP;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      for (let q = 0; q < len; q += 2) {
        const cx = arr[q];
        const cy = arr[q + 1];
        ctx.moveTo(cx + w, cy);
        ctx.arc(cx, cy, w, 0, TWO_PI);
      }
      ctx.fill();
    }
  }

  rs.t += 0.016;
}
