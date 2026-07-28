"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useCalendarProvider } from "@/context/CalendarProvider";
import {
  setBufferTimeMinutes as setBufferTimeMinutesAction,
  setLocationGroupingPenalties,
  setStrategyWeights,
} from "@/redux/slices/schedulingSettingsSlice";
import { DEFAULT_LOCATION_GROUPING_PENALTIES } from "@/utils/calendar-generation/strategies/defaultStrategy";
import { updateUserSchedulingPreferences } from "@/actions/scheduling";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  engineControls,
  engineControlsTitle,
  controlRow,
  controlHead,
  controlLabel,
  controlValue,
  controlSlider,
} from "../page.css";

const BUFFER_MIN = 0;
const BUFFER_MAX = 30;
const BUFFER_STEP = 1;
const REFRESH_DEBOUNCE_MS = 200;
const SLIDER_DEBOUNCE_MS = 200;
const PERSIST_DEBOUNCE_MS = 400;

export function EngineControls() {
  const dispatch = useDispatch<AppDispatch>();
  const { manuallyRefreshCalendar } = useCalendarProvider();
  const reduxBuffer = useSelector(
    (state: RootState) => state.schedulingSettings.bufferTimeMinutes,
  );
  const weights = useSelector(
    (state: RootState) =>
      state.schedulingSettings.debugStrategyConfig.weights,
  );
  const penalties = useSelector(
    (state: RootState) =>
      state.schedulingSettings.debugStrategyConfig.locationGrouping.penalties,
  );
  // Travel sensitivity is a single multiplier over the proportional penalty
  // scales; the stored scales are the source of truth, so derive the slider
  // position from the single-travel scale's ratio to its default.
  const travelSensitivity =
    penalties.singleTravelPenaltyScale /
    DEFAULT_LOCATION_GROUPING_PENALTIES.singleTravelPenaltyScale;

  const [bufferDraft, setBufferDraft] = useState<string>(String(reduxBuffer));
  useEffect(() => {
    setBufferDraft(String(reduxBuffer));
  }, [reduxBuffer]);

  // Debounce calendar refresh + DB persistence so a sliding/typing burst
  // doesn't fire a regeneration per tick.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(
      manuallyRefreshCalendar,
      REFRESH_DEBOUNCE_MS,
    );
  }, [manuallyRefreshCalendar]);

  const bufferPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBufferCommit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setBufferDraft(String(reduxBuffer));
      return;
    }
    const clamped = Math.max(BUFFER_MIN, Math.min(BUFFER_MAX, parsed));
    setBufferDraft(String(clamped));
    if (clamped === reduxBuffer) return;
    dispatch(setBufferTimeMinutesAction(clamped));
    if (bufferPersistRef.current) clearTimeout(bufferPersistRef.current);
    bufferPersistRef.current = setTimeout(() => {
      updateUserSchedulingPreferences({ bufferTimeMinutes: clamped }).catch(
        (err) => {
          console.error("Failed to persist buffer time:", err);
        },
      );
    }, PERSIST_DEBOUNCE_MS);
  };

  // Earliest slot stays a fixed 1.0 anchor: the composite is a weighted
  // mean, so with the anchor pinned each remaining slider is a real degree
  // of freedom (two sliders over two weights were one).
  const handleWeightChange = (
    key: "locationGrouping" | "fitTightness",
    value: number,
  ) => {
    dispatch(setStrategyWeights({ [key]: value }));
    scheduleRefresh();
  };

  const handleTravelSensitivityChange = (value: number) => {
    dispatch(
      setLocationGroupingPenalties({
        singleTravelPenaltyScale:
          DEFAULT_LOCATION_GROUPING_PENALTIES.singleTravelPenaltyScale * value,
        doubleTravelPenaltyScale:
          DEFAULT_LOCATION_GROUPING_PENALTIES.doubleTravelPenaltyScale * value,
      }),
    );
    scheduleRefresh();
  };

  // Slider fires onChange per drag tick. Commit immediately to local draft so
  // the readout follows the thumb, but debounce the Redux dispatch (which
  // triggers a full calendar regen via CalendarProvider) until the user pauses.
  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBufferSlide = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    setBufferDraft(String(parsed));
    if (sliderDebounceRef.current) clearTimeout(sliderDebounceRef.current);
    sliderDebounceRef.current = setTimeout(() => {
      handleBufferCommit(String(parsed));
    }, SLIDER_DEBOUNCE_MS);
  };

  return (
    <div className={engineControls}>
      <span className={engineControlsTitle}>Tuning</span>

      <div className={controlRow}>
        <div className={controlHead}>
          <span className={controlLabel}>Buffer between items</span>
          <span className={controlValue}>
            {parseInt(bufferDraft, 10) || 0} min
          </span>
        </div>
        <input
          type="range"
          min={BUFFER_MIN}
          max={BUFFER_MAX}
          step={BUFFER_STEP}
          value={parseInt(bufferDraft, 10) || 0}
          onChange={(e) => handleBufferSlide(e.target.value)}
          className={controlSlider}
        />
      </div>

      <div className={controlRow}>
        <div className={controlHead}>
          <span className={controlLabel}>Location grouping</span>
          <span className={controlValue}>
            {weights.locationGrouping.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={weights.locationGrouping}
          onChange={(e) =>
            handleWeightChange("locationGrouping", parseFloat(e.target.value))
          }
          className={controlSlider}
        />
      </div>

      <div className={controlRow}>
        <div className={controlHead}>
          <span className={controlLabel}>Fit tightness</span>
          <span className={controlValue}>
            {weights.fitTightness.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={weights.fitTightness}
          onChange={(e) =>
            handleWeightChange("fitTightness", parseFloat(e.target.value))
          }
          className={controlSlider}
        />
      </div>

      <div className={controlRow}>
        <div className={controlHead}>
          <span className={controlLabel}>Travel sensitivity</span>
          <span className={controlValue}>
            {travelSensitivity.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={travelSensitivity}
          onChange={(e) =>
            handleTravelSensitivityChange(parseFloat(e.target.value))
          }
          className={controlSlider}
        />
      </div>
    </div>
  );
}
