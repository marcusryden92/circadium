export interface Wave {
  angle: number;
  wavelength: number;
  phase: number;
  speed: number;
  amp: number;
  noiseMult: number;
  enabled: boolean;
}

export interface GlobalSettings {
  strength: number;
  speed: number;
  density: number;
  tilt: number;
  rot: number;
  fov: number;
  zoom: number;
  height: number;
  bend: number;
  tamp: number;
  twx: number;
  twy: number;
  showStrands: boolean;
  showDots: boolean;
  showNet: boolean;
  bgHueShift: boolean;
  dotSize: number;
  bgColor: string;
  strandColor: string;
  strandWidth: number;
  hueShift: number;
  noise: number;
  mforce: number;
  minner: number;
  mouter: number;
  mling: number;
  mattract: boolean;
}

export interface SceneState {
  G: GlobalSettings;
  waves: Wave[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ProjectionParams {
  focal: number;
  camPos: Vec3;
  f: Vec3;
  r: Vec3;
  u: Vec3;
}
