"use client";

import { useRef } from "react";
import type { GlobalSettings, SceneState, Wave } from "./types";
import { DEFAULTS, DEFAULT_WAVES } from "./defaults";
import { useCanvas } from "./useCanvas";
import { host, canvas as canvasClass } from "./VectorField.css";

interface VectorFieldProps {
  /** One-time overrides applied to DEFAULTS. */
  settings?: Partial<GlobalSettings>;
  /** One-time overrides applied to DEFAULT_WAVES. */
  waves?: Wave[];
}

export function VectorField({ settings, waves }: VectorFieldProps = {}) {
  // Scene captured once on first render. Prop changes are intentionally
  // ignored — remount the component to apply a fresh scene.
  const sceneRef = useRef<SceneState>({
    G: { ...DEFAULTS, ...settings },
    waves: waves ?? DEFAULT_WAVES,
  });
  const { hostRef, canvasRef } = useCanvas(sceneRef);

  return (
    <div ref={hostRef} className={host} aria-hidden>
      <canvas ref={canvasRef} className={canvasClass} />
    </div>
  );
}

export type { GlobalSettings, SceneState, Wave } from "./types";
