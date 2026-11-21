"use client";

import { useState } from "react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import type {
  MindmapLayoutKind,
  MindmapLayoutOptions,
} from "../../_lib/mindmapModel";
import {
  panel,
  header,
  title,
  collapse,
  body,
  field,
  fieldRow,
  label as labelClass,
  value as valueClass,
  sliderTrack,
  sliderBar,
  sliderFill,
  slider,
} from "./MindmapControls.css";

// Must match SLIDER_THUMB in MindmapControls.css.ts: nudges the fill's right
// edge so it stays centred under the thumb across the whole track.
const SLIDER_THUMB_PX = 13;

const LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<MindmapLayoutKind>> = [
  { key: "radial", label: "Radial" },
  { key: "horizontal", label: "Horizontal" },
];

type SliderKey = Exclude<keyof MindmapLayoutOptions, "layout">;

type SliderDef = {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  decimals: number;
  radialOnly?: boolean;
};

const SLIDERS: ReadonlyArray<SliderDef> = [
  { key: "levelDistance", label: "Level distance", min: 70, max: 320, decimals: 0 },
  { key: "siblingSpacing", label: "Sibling spacing", min: 4, max: 46, decimals: 0 },
  { key: "armClearance", label: "Arm clearance", min: 0, max: 1.5, decimals: 2, radialOnly: true },
  { key: "branchSpread", label: "Branch spread", min: 0.3, max: 1, decimals: 2, radialOnly: true },
  { key: "branchCurve", label: "Branch curve", min: 0, max: 0.85, decimals: 2 },
  { key: "leafSpread", label: "Bubble size", min: 0, max: 1, decimals: 2, radialOnly: true },
  { key: "leafWrap", label: "Wrap angle", min: 0, max: 1, decimals: 2, radialOnly: true },
];

type MindmapControlsProps = {
  options: MindmapLayoutOptions;
  onChange: (patch: Partial<MindmapLayoutOptions>) => void;
};

// The layout-mode toggle + tuning sliders, hosted in both the desktop floating
// panel and the mobile settings BottomSheet so there is one source of truth.
export function MindmapControlsBody({ options, onChange }: MindmapControlsProps) {
  return (
    <div className={body}>
      <SegmentedControl<MindmapLayoutKind>
        options={LAYOUT_OPTIONS}
        value={options.layout}
        onChange={(layout) => onChange({ layout })}
      />

      {SLIDERS.map((def) => {
        const disabled = def.radialOnly && options.layout !== "radial";
        const current = options[def.key];
        const pct =
          def.max > def.min
            ? ((current - def.min) / (def.max - def.min)) * 100
            : 0;
        return (
          <div key={def.key} className={field} data-disabled={disabled || undefined}>
            <div className={fieldRow}>
              <span className={labelClass}>{def.label}</span>
              <span className={valueClass}>{current.toFixed(def.decimals)}</span>
            </div>
            <div className={sliderTrack}>
              <div className={sliderBar} />
              <div
                className={sliderFill}
                style={{
                  width: `calc(${pct}% + ${(SLIDER_THUMB_PX * (50 - pct)) / 100}px)`,
                }}
              />
              <input
                type="range"
                className={slider}
                min={def.min}
                max={def.max}
                step="any"
                value={current}
                disabled={disabled}
                onChange={(e) => onChange({ [def.key]: Number(e.target.value) })}
                aria-label={def.label}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MindmapControls({ options, onChange }: MindmapControlsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={panel} data-open={open}>
      <div className={header}>
        <button
          type="button"
          className={collapse}
          data-open={open}
          aria-expanded={open}
          aria-label={open ? "Collapse settings" : "Open settings"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "−" : "+"}
        </button>
        <button
          type="button"
          className={title}
          data-open={open}
          onClick={() => setOpen((o) => !o)}
        >
          Settings
        </button>
      </div>

      {open && <MindmapControlsBody options={options} onChange={onChange} />}
    </div>
  );
}
