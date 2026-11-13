"use client";

import { RefreshCw } from "lucide-react";
import { Button, Loader } from "@/components/ui";
import type { TransportMode } from "@/generated/client";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import { hasCustomOverride, isTimeVarying } from "@/utils/locations";
import { TravelMatrix } from "../TravelMatrix";
import {
  paneCard,
  paneFill,
  paneHead,
  paneTitle,
  paneSubtitle,
  paneLegend,
  legendDot,
  legendDotRush,
  legendDotRegular,
  legendDotNight,
  paneEmpty,
  paneFooter,
  paneFooterSpacer,
  amberKeyword,
  paneFooterAction,
} from "./TravelMatrixPane.css";

interface TravelMatrixPaneProps {
  locations: SerializedLocation[];
  travelTimes: SerializedTravelTime[];
  transportMode: TransportMode;
  working: boolean;
  onFetchMissing: () => void;
  onEditPair: (fromId: string, toId: string) => void;
  onRequestClearAll: () => void;
  // "card" is the bordered pane in the desktop grid; "fill" stretches into
  // the fullscreen mobile modal.
  variant?: "card" | "fill";
}

export function TravelMatrixPane({
  locations,
  travelTimes,
  transportMode,
  working,
  onFetchMissing,
  onEditPair,
  onRequestClearAll,
  variant = "card",
}: TravelMatrixPaneProps) {
  const timeVarying = isTimeVarying(transportMode);
  const anyCustomOverride = travelTimes.some(hasCustomOverride);

  return (
    <section className={variant === "card" ? paneCard : paneFill}>
      <div className={paneHead}>
        <h2 className={paneTitle}>Travel matrix</h2>
        <span className={paneSubtitle}>
          {timeVarying
            ? "from row · to column · 3 time-of-day values"
            : "from row · to column · minutes (constant)"}
        </span>
        {timeVarying && (
          <span className={paneLegend}>
            <span>
              <span className={`${legendDot} ${legendDotRegular}`} />
              regular
            </span>
            <span>
              <span className={`${legendDot} ${legendDotRush}`} />
              rush
            </span>
            <span>
              <span className={`${legendDot} ${legendDotNight}`} />
              night
            </span>
          </span>
        )}
      </div>

      {locations.length < 2 ? (
        <div className={paneEmpty}>
          <div>Add at least 2 locations to see the travel matrix.</div>
        </div>
      ) : working ? (
        <div className={paneEmpty}>
          <Loader size="md" label="Refreshing travel times" />
        </div>
      ) : travelTimes.length === 0 ? (
        <div className={paneEmpty}>
          <div>No travel times yet for {transportMode.toLowerCase()}.</div>
          <Button
            variant="solid"
            size="sm"
            onClick={onFetchMissing}
            disabled={working}
          >
            <RefreshCw size={12} strokeWidth={2.2} />
            Fetch travel times
          </Button>
        </div>
      ) : (
        <>
          <TravelMatrix
            locations={locations}
            travelTimes={travelTimes}
            transportMode={transportMode}
            onEditPair={onEditPair}
            onFetchMissing={onFetchMissing}
          />
          <div className={paneFooter}>
            <span>
              Cells tinted <span className={amberKeyword}>amber</span> are
              custom overrides; click any cell to edit all three periods.
            </span>
            <span className={paneFooterSpacer} />
            <Button
              variant="ghost"
              size="sm"
              className={paneFooterAction}
              disabled={!anyCustomOverride || working}
              onClick={onRequestClearAll}
            >
              Clear all overrides
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
