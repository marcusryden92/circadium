"use client";

import { useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import type { TransportMode } from "@/generated/client";
import type { SerializedTravelTime } from "@/redux/slices/schedulingSettingsSlice";
import {
  getEffectiveTravelTime,
  hasCustomOverride,
  isTimeVarying,
} from "@/utils/locations";
import {
  matrixWrap,
  matrixTable,
  cornerCell,
  headerCell,
  headerCellInner,
  rowHeaderCell,
  cell,
  cellButton,
  cellSelf,
  periodRow,
  periodValue,
  periodLabel,
  missingBlock,
  missingLabel,
  missingHint,
  singleValue,
  singleValueNumber,
  singleValueUnit,
} from "./TravelMatrix.css";

// Only id + name are needed for the matrix, so the prop accepts the narrower
// SerializedLocation shape kept in Redux as well as the full Prisma Location.
type MatrixLocation = { id: string; name: string };

interface TravelMatrixProps {
  locations: MatrixLocation[];
  travelTimes: SerializedTravelTime[];
  transportMode: TransportMode;
  onEditPair: (fromId: string, toId: string) => void;
  onFetchMissing: () => void;
}

export function TravelMatrix({
  locations,
  travelTimes,
  transportMode,
  onEditPair,
  onFetchMissing,
}: TravelMatrixProps) {
  const timeVarying = isTimeVarying(transportMode);
  const lookup = new Map<string, SerializedTravelTime>();
  for (const tt of travelTimes) {
    lookup.set(`${tt.fromLocationId}->${tt.toLocationId}`, tt);
  }

  // Crosshair hover trace — tracked by array index so "to the left" and
  // "above" are well-defined relative to the rendered table order.
  const [hovered, setHovered] = useState<{
    fromIdx: number;
    toIdx: number;
  } | null>(null);

  // Cells light up at one of two intensities. The hovered cell is "active";
  // the row leading back to its row-header and the column leading up to its
  // column-header are "trail".
  const cellTrace = (
    fromIdx: number,
    toIdx: number,
  ): "active" | "trail" | undefined => {
    if (!hovered) return undefined;
    if (fromIdx === hovered.fromIdx && toIdx === hovered.toIdx) return "active";
    if (fromIdx === hovered.fromIdx && toIdx < hovered.toIdx) return "trail";
    if (toIdx === hovered.toIdx && fromIdx < hovered.fromIdx) return "trail";
    return undefined;
  };

  const colHeaderTrace = (toIdx: number): "trail" | undefined =>
    hovered?.toIdx === toIdx ? "trail" : undefined;

  const rowHeaderTrace = (fromIdx: number): "trail" | undefined =>
    hovered?.fromIdx === fromIdx ? "trail" : undefined;

  return (
    <div className={matrixWrap} onMouseLeave={() => setHovered(null)}>
      <table className={matrixTable}>
        <thead>
          <tr>
            <th className={cornerCell}>from / to</th>
            {locations.map((loc, toIdx) => (
              <th
                key={loc.id}
                className={headerCell}
                data-trace={colHeaderTrace(toIdx)}
              >
                <span className={headerCellInner}>
                  <MapPin size={11} strokeWidth={2} />
                  {loc.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {locations.map((from, fromIdx) => (
            <tr key={from.id}>
              <th
                className={rowHeaderCell}
                data-trace={rowHeaderTrace(fromIdx)}
              >
                <span className={headerCellInner}>
                  <MapPin size={11} strokeWidth={2} />
                  {from.name}
                </span>
              </th>
              {locations.map((to, toIdx) => {
                if (from.id === to.id) {
                  return (
                    <td
                      key={to.id}
                      className={cell}
                      data-trace={cellTrace(fromIdx, toIdx)}
                      onMouseEnter={() => setHovered({ fromIdx, toIdx })}
                    >
                      <div className={cellSelf}>/</div>
                    </td>
                  );
                }

                const tt = lookup.get(`${from.id}->${to.id}`);

                if (!tt) {
                  return (
                    <td
                      key={to.id}
                      className={cell}
                      data-trace={cellTrace(fromIdx, toIdx)}
                      onMouseEnter={() => setHovered({ fromIdx, toIdx })}
                    >
                      <button
                        type="button"
                        className={cellButton}
                        onClick={onFetchMissing}
                        title="Fetch this travel time"
                      >
                        <div className={missingBlock}>
                          <span className={missingLabel}>missing</span>
                          <span className={missingHint}>
                            <RefreshCw size={9} strokeWidth={2.4} />
                            fetch
                          </span>
                        </div>
                      </button>
                    </td>
                  );
                }

                if (tt.unroutable && !hasCustomOverride(tt)) {
                  return (
                    <td
                      key={to.id}
                      className={cell}
                      data-trace={cellTrace(fromIdx, toIdx)}
                      onMouseEnter={() => setHovered({ fromIdx, toIdx })}
                    >
                      <button
                        type="button"
                        className={cellButton}
                        onClick={() => onEditPair(from.id, to.id)}
                        title="Google found no route — set a custom time"
                      >
                        <div className={missingBlock}>
                          <span className={missingLabel}>no route</span>
                          <span className={missingHint}>set manually</span>
                        </div>
                      </button>
                    </td>
                  );
                }

                const rush = getEffectiveTravelTime(tt, "rush");
                const reg = getEffectiveTravelTime(tt, "regular");
                const night = getEffectiveTravelTime(tt, "night");
                const customized = hasCustomOverride(tt);

                return (
                  <td
                    key={to.id}
                    className={cell}
                    data-custom={customized ? "true" : "false"}
                    data-trace={cellTrace(fromIdx, toIdx)}
                    onMouseEnter={() => setHovered({ fromIdx, toIdx })}
                  >
                    <button
                      type="button"
                      className={cellButton}
                      onClick={() => onEditPair(from.id, to.id)}
                    >
                      {timeVarying ? (
                        <>
                          <span className={periodRow}>
                            <span className={periodValue({ tone: "regular" })}>
                              {reg}
                            </span>
                            <span className={periodLabel}>reg</span>
                          </span>
                          <span className={periodRow}>
                            <span className={periodValue({ tone: "rush" })}>
                              {rush}
                            </span>
                            <span className={periodLabel}>rush</span>
                          </span>
                          <span className={periodRow}>
                            <span className={periodValue({ tone: "night" })}>
                              {night}
                            </span>
                            <span className={periodLabel}>night</span>
                          </span>
                        </>
                      ) : (
                        <span className={singleValue}>
                          <span className={singleValueNumber}>{reg}</span>
                          <span className={singleValueUnit}>min</span>
                        </span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
