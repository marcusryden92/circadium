"use client";

import { useCallback, useState } from "react";
import {
  Bike,
  Car,
  Footprints,
  RefreshCw,
  Train,
  type LucideIcon,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import * as locationActions from "@/actions/locations";
import { updateDefaultTransportMode } from "@/actions/locations";
import { updateSchedulingPreferences } from "@/lib/api/scheduling";
import {
  setAllTravelTimes,
  setDefaultTransportMode,
  setEnableTravelEvents,
  setWeekStartDay,
} from "@/redux/slices/schedulingSettingsSlice";
import type { AppDispatch, RootState } from "@/redux/store";
import type { TransportMode } from "@/generated/client";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { serializeTravelTime } from "@/utils/locations";
import { useServerAction } from "@/hooks/useServerAction";
import { Button, ConfirmModal, SegmentedControl } from "@/components/ui";
import { StatusLine } from "../StatusLine";
import {
  card,
  cardTitle,
  fieldNote,
  rowSplit,
  rowGrow,
  toggleRow,
  toggleMain,
  toggleHead,
  toggleBody,
  toggleSwitch,
  toggleSwitchOn,
  toggleKnob,
  toggleKnobOn,
  transportRow,
  transportBtn,
  transportBtnActive,
  footerRow,
} from "../../page.css";

const MODES: { value: TransportMode; label: string; Icon: LucideIcon }[] = [
  { value: "DRIVING", label: "Driving", Icon: Car },
  { value: "TRANSIT", label: "Transit", Icon: Train },
  { value: "BICYCLING", label: "Cycling", Icon: Bike },
  { value: "WALKING", label: "Walking", Icon: Footprints },
];

type WeekStartKey = "1" | "6" | "0";

const WEEK_START_OPTIONS: { key: WeekStartKey; label: string }[] = [
  { key: "1", label: "Monday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
];

export function SchedulingSection() {
  const dispatch = useDispatch<AppDispatch>();
  const transportMode = useSelector(
    (state: RootState) => state.schedulingSettings.defaultTransportMode,
  );
  const enableTravelEvents = useSelector(
    (state: RootState) => state.schedulingSettings.enableTravelEvents,
  );
  const bufferTimeMinutes = useSelector(
    (state: RootState) => state.schedulingSettings.bufferTimeMinutes,
  );
  const { weekStartDay, locations, markSynced } = useCalendarProvider();

  const saveMode = useCallback(async (mode: TransportMode) => {
    await updateDefaultTransportMode(mode);
    return mode;
  }, []);

  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(saveMode);

  const setMode = async (mode: TransportMode) => {
    if (mode === transportMode) return;
    dispatch(setDefaultTransportMode(mode));
    clear();
    const result = await run(mode);
    if (result === undefined) {
      setError("Failed to save transport mode.");
      return;
    }
    setSuccess("Transport mode updated.");
  };

  const saveWeekStart = useCallback(async (day: WeekDayIntegers) => {
    await updateSchedulingPreferences({ weekStartDay: day });
    return day;
  }, []);

  const weekStartAction = useServerAction(saveWeekStart);

  const setWeekStart = async (key: WeekStartKey) => {
    const day = Number(key) as WeekDayIntegers;
    if (day === weekStartDay) return;
    dispatch(setWeekStartDay(day));
    weekStartAction.clear();
    const result = await weekStartAction.run(day);
    if (result === undefined) {
      weekStartAction.setError("Failed to save week start day.");
      return;
    }
    weekStartAction.setSuccess("Week start day updated.");
  };

  const toggleTravelEvents = () => {
    dispatch(setEnableTravelEvents(!enableTravelEvents));
  };

  const refreshAction = useServerAction(locationActions.refreshAllTravelTimes);
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  const handleRefreshAll = async () => {
    setConfirmRefresh(false);
    refreshAction.clear();
    const result = await refreshAction.run(transportMode);
    if (!result) return;
    const fresh = await locationActions.fetchTravelTimes();
    const serialized = fresh.map(serializeTravelTime);
    dispatch(setAllTravelTimes(serialized));
    markSynced("travelTimes", serialized);
    refreshAction.setSuccess(
      result.failed > 0
        ? `Refreshed ${result.updated} travel times. ${result.failed} pair${result.failed > 1 ? "s" : ""} couldn't be routed.`
        : `Refreshed ${result.updated} travel times.`,
    );
  };

  return (
    <>
      <div className={card}>
        <span className={cardTitle}>Default transport mode</span>
        <span className={fieldNote}>
          Used as the baseline mode when calculating travel times between
          locations.
        </span>
        <div className={transportRow}>
          {MODES.map(({ value, label, Icon }) => {
            const active = value === transportMode;
            return (
              <button
                key={value}
                type="button"
                className={`${transportBtn} ${active ? transportBtnActive : ""}`}
                onClick={() => setMode(value)}
                disabled={isPending}
              >
                <Icon size={16} strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
        <div className={footerRow}>
          <StatusLine status={status} />
        </div>
      </div>

      <div className={card}>
        <span className={cardTitle}>Week starts on</span>
        <span className={fieldNote}>
          The first day of the week on the calendar and everywhere days are
          listed.
        </span>
        <SegmentedControl
          options={WEEK_START_OPTIONS}
          value={String(weekStartDay) as WeekStartKey}
          onChange={setWeekStart}
        />
        <div className={footerRow}>
          <StatusLine status={weekStartAction.status} />
        </div>
      </div>

      <div className={card}>
        <span className={cardTitle}>Travel events on the calendar</span>
        <div className={toggleRow}>
          <div className={toggleMain}>
            <div className={toggleHead}>Show travel as its own block</div>
            <div className={toggleBody}>
              When on, travel time between two locations appears as a separate
              event on the calendar. When off, it&apos;s absorbed into the
              surrounding events.
            </div>
          </div>
          <button
            type="button"
            className={`${toggleSwitch} ${enableTravelEvents ? toggleSwitchOn : ""}`}
            onClick={toggleTravelEvents}
            aria-pressed={enableTravelEvents}
            aria-label="Toggle travel events"
          >
            <span
              className={`${toggleKnob} ${enableTravelEvents ? toggleKnobOn : ""}`}
            />
          </button>
        </div>
      </div>

      <div className={card}>
        <span className={cardTitle}>Travel times</span>
        <span className={fieldNote}>
          Re-fetches every location pair for the current transport mode from
          Google. Day to day you shouldn&apos;t need this — new pairs are picked
          up with &ldquo;Fetch missing&rdquo; on the Locations page. Custom
          overrides are kept.
        </span>
        <div className={rowSplit}>
          <Button
            variant="glass"
            size="sm"
            onClick={() => setConfirmRefresh(true)}
            disabled={refreshAction.isPending || locations.length < 2}
          >
            <RefreshCw size={12} strokeWidth={2.2} />
            {refreshAction.isPending ? "Refreshing…" : "Refresh all travel times"}
          </Button>
        </div>
        <div className={footerRow}>
          <StatusLine status={refreshAction.status} />
        </div>
        <ConfirmModal
          open={confirmRefresh}
          title="Refresh all travel times?"
          confirmLabel="Refresh all"
          body={
            <p style={{ margin: 0 }}>
              This re-fetches every pair between your {locations.length}{" "}
              locations from Google in one go. If you just added or changed a
              location, &ldquo;Fetch missing&rdquo; on the Locations page covers
              it without re-fetching everything.
            </p>
          }
          onCancel={() => setConfirmRefresh(false)}
          onConfirm={handleRefreshAll}
        />
      </div>

      <div className={card}>
        <span className={cardTitle}>Tuning</span>
        <div className={rowSplit}>
          <div className={rowGrow}>
            <div className={toggleHead}>
              Buffer between items · {bufferTimeMinutes} min
            </div>
            <div className={toggleBody}>
              Engine weights and the buffer slider live in the engine drawer on
              the Calendar — open it from the cog in the top-right.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
