import type { GlobalSettings, Wave } from "./types";

export const FIELD_SIZE = 1350;

export const DEFAULTS: GlobalSettings = {
  strength: 1.5,
  speed: 1.2,
  density: 1.6,
  tilt: 10,
  rot: 133,
  fov: 25,
  zoom: 0.7,
  height: 0.3,
  bend: 60,
  tamp: 76,
  twx: 1.6,
  twy: 1.6,
  showStrands: true,
  showDots: false,
  showNet: false,
  bgHueShift: true,
  dotSize: 1.4,
  // strandColor: "#c3bae6",
  strandColor: "#ffffff",
  //bgColor: "#0b0f41",+
  bgColor: "#16142a",
  strandWidth: 1,
  hueShift: 15,
  noise: 80,
  mforce: 0.8,
  minner: 100,
  mouter: 200,
  mling: 0.3,
  mattract: true,
};

export const DEFAULT_WAVES: Wave[] = [
  {
    angle: 160,
    wavelength: 3.8,
    phase: 0.0,
    speed: 1,
    amp: 0.1,
    noiseMult: 1,
    enabled: true,
  },
  {
    angle: 90,
    wavelength: 3,
    phase: 1.3,
    speed: 1.2,
    amp: 0.1,
    noiseMult: 1,
    enabled: true,
  },
];
