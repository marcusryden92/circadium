"use client";

import { MapPin } from "lucide-react";
import { Button, Switch, Combobox, TimePicker } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { orderedWeekDays } from "@/utils/calendarUtils";
import { StepFrame } from "../_components/StepFrame";
import {
  ALL_WEEK_DAYS,
  expandDailyRange,
  type WeekUIState,
} from "../_lib/weekTemplates";
import {
  fieldStack,
  fieldLabel,
  fieldHelp,
  timeRow,
  timeDash,
  dayToggles,
  dayToggle,
  dayToggleOn,
  sectionToggleRow,
  previewNote,
  locationOption,
  footerActions,
} from "../onboarding.css";

export type { WeekUIState } from "../_lib/weekTemplates";

// Indexed by day integer (0=Sunday .. 6=Saturday); button order follows the
// user's week-start preference.
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

type WeekStepProps = {
  stepIndex: number;
  totalSteps: number;
  value: WeekUIState;
  onChange: (next: WeekUIState) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  continueDisabled?: boolean;
};

export function WeekStep({
  stepIndex,
  totalSteps,
  value,
  onChange,
  onBack,
  onContinue,
  onSkip,
  continueDisabled = false,
}: WeekStepProps) {
  const { locations, weekStartDay } = useCalendarProvider();
  const dayButtons = orderedWeekDays(weekStartDay).map((day) => ({
    day,
    label: DAY_LETTERS[day],
  }));
  const patch = (next: Partial<WeekUIState>) => onChange({ ...value, ...next });

  const toggleDayIn = (
    key: "workDays" | "exerciseDays",
    day: WeekDayIntegers,
  ) => {
    const current = value[key];
    patch({
      [key]: current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    });
  };

  type TimeKey =
    | "sleepStart"
    | "sleepEnd"
    | "workStart"
    | "workEnd"
    | "exerciseStart"
    | "exerciseEnd"
    | "morningStart"
    | "morningEnd"
    | "eveningStart"
    | "eveningEnd";

  const timeRange = (startKey: TimeKey, endKey: TimeKey, label: string) => (
    <div className={timeRow}>
      <TimePicker
        value={value[startKey]}
        onChange={(v) => patch({ [startKey]: v })}
        ariaLabel={`${label} start`}
      />
      <span className={timeDash}>to</span>
      <TimePicker
        value={value[endKey]}
        onChange={(v) => patch({ [endKey]: v })}
        ariaLabel={`${label} end`}
      />
    </div>
  );

  const sleepBlocks = value.sleepEnabled
    ? expandDailyRange(ALL_WEEK_DAYS, value.sleepStart, value.sleepEnd).length
    : 0;
  const workBlocks = value.workEnabled
    ? expandDailyRange(value.workDays, value.workStart, value.workEnd).length
    : 0;
  const exerciseBlocks = value.exerciseEnabled
    ? expandDailyRange(
        value.exerciseDays,
        value.exerciseStart,
        value.exerciseEnd,
        false,
      ).length
    : 0;
  const morningBlocks = value.morningEnabled
    ? expandDailyRange(
        ALL_WEEK_DAYS,
        value.morningStart,
        value.morningEnd,
        false,
      ).length
    : 0;
  const eveningBlocks = value.eveningEnabled
    ? expandDailyRange(
        ALL_WEEK_DAYS,
        value.eveningStart,
        value.eveningEnd,
        false,
      ).length
    : 0;
  const totalBlocks =
    sleepBlocks + workBlocks + exerciseBlocks + morningBlocks + eveningBlocks;

  return (
    <StepFrame
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Sketch your week"
      subtitle="A few anchors so the first generated week looks like your life. Refine the full grid anytime in Calendar."
      onSkip={onSkip}
      footer={
        <>
          <Button variant="glass" onClick={onBack}>
            Back
          </Button>
          <div className={footerActions}>
            <Button
              variant="glassInk"
              onClick={onContinue}
              disabled={continueDisabled}
            >
              Continue
            </Button>
          </div>
        </>
      }
    >
      <div className={fieldStack}>
        <div className={sectionToggleRow}>
          <span className={fieldLabel}>When do you usually sleep?</span>
          <Switch
            checked={value.sleepEnabled}
            onCheckedChange={(checked) => patch({ sleepEnabled: checked })}
          />
        </div>
        {value.sleepEnabled && timeRange("sleepStart", "sleepEnd", "Sleep")}
      </div>

      <div className={fieldStack}>
        <div className={sectionToggleRow}>
          <span className={fieldLabel}>Do you have regular working hours?</span>
          <Switch
            checked={value.workEnabled}
            onCheckedChange={(checked) => patch({ workEnabled: checked })}
          />
        </div>
        {value.workEnabled && (
          <>
            {timeRange("workStart", "workEnd", "Work")}
            <div className={dayToggles}>
              {dayButtons.map(({ day, label }) => {
                const on = value.workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`${dayToggle} ${on ? dayToggleOn : ""}`}
                    onClick={() => toggleDayIn("workDays", day)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {locations.length > 0 ? (
              <Combobox<string | null>
                value={value.workLocationId}
                onChange={(v) => patch({ workLocationId: v })}
                options={[
                  { value: null, label: "Anywhere" },
                  ...locations.map((loc) => ({
                    value: loc.id,
                    label: loc.name,
                  })),
                ]}
                renderValue={(opt) =>
                  opt && opt.value ? (
                    <span className={locationOption}>
                      <MapPin size={12} strokeWidth={2} />
                      {opt.label}
                    </span>
                  ) : (
                    "Anywhere"
                  )
                }
                ariaLabel="Work location"
                width={240}
              />
            ) : (
              <span className={fieldHelp}>
                Add a location on the previous step to attach one to these
                blocks.
              </span>
            )}
          </>
        )}
      </div>

      <div className={fieldStack}>
        <div className={sectionToggleRow}>
          <span className={fieldLabel}>Do you exercise on set days?</span>
          <Switch
            checked={value.exerciseEnabled}
            onCheckedChange={(checked) => patch({ exerciseEnabled: checked })}
          />
        </div>
        {value.exerciseEnabled && (
          <>
            {timeRange("exerciseStart", "exerciseEnd", "Exercise")}
            <div className={dayToggles}>
              {dayButtons.map(({ day, label }) => {
                const on = value.exerciseDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`${dayToggle} ${on ? dayToggleOn : ""}`}
                    onClick={() => toggleDayIn("exerciseDays", day)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className={fieldStack}>
        <div className={sectionToggleRow}>
          <span className={fieldLabel}>A morning routine?</span>
          <Switch
            checked={value.morningEnabled}
            onCheckedChange={(checked) => patch({ morningEnabled: checked })}
          />
        </div>
        {value.morningEnabled &&
          timeRange("morningStart", "morningEnd", "Morning routine")}
      </div>

      <div className={fieldStack}>
        <div className={sectionToggleRow}>
          <span className={fieldLabel}>An evening routine?</span>
          <Switch
            checked={value.eveningEnabled}
            onCheckedChange={(checked) => patch({ eveningEnabled: checked })}
          />
        </div>
        {value.eveningEnabled &&
          timeRange("eveningStart", "eveningEnd", "Evening routine")}
      </div>

      {totalBlocks > 0 && (
        <span className={previewNote}>
          This adds {totalBlocks} weekly block{totalBlocks === 1 ? "" : "s"} —
          refine anytime in Calendar.
        </span>
      )}
    </StepFrame>
  );
}
