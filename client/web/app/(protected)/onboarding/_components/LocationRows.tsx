"use client";

import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { MapPin, Loader2 } from "lucide-react";
import {
  usePlaceSearch,
  type Prediction,
} from "../../locations/_hooks/usePlaceSearch";
import { usePredictionsList } from "../../locations/_components/PredictionsList";
import { Input } from "@/components/ui";
import {
  locationRows,
  locationRow,
  addressCell,
  addressWrap,
  addressIcon,
  addressInput,
  addressSelected,
  addressSpinner,
} from "../onboarding.css";

export type LocationRow = {
  key: string;
  name: string;
  query: string;
  selected: Prediction | null;
  // Set once the row has been created as a real Location (fresh this session or
  // prefilled from an existing one). A created row is read-only here.
  createdId: string | null;
  // One Places autocomplete session per row: rides every search from this row
  // and is redeemed by the Place Details call when the row is created.
  sessionToken?: string | null;
};

export function makeEmptyRow(name = ""): LocationRow {
  return {
    key: uuidv4(),
    name,
    query: "",
    selected: null,
    createdId: null,
    sessionToken: uuidv4(),
  };
}

const isRowFilled = (row: LocationRow) =>
  row.name.trim().length > 0 && (row.selected !== null || row.createdId !== null);

type LocationRowsProps = {
  rows: LocationRow[];
  onChange: (rows: LocationRow[]) => void;
};

export function LocationRows({ rows, onChange }: LocationRowsProps) {
  // Keep exactly one trailing empty row: as soon as every visible row is
  // filled, append a fresh blank one so the user can add more. Rows restored
  // from stored progress may predate per-row session tokens — backfill them.
  useEffect(() => {
    if (rows.some((r) => !r.sessionToken)) {
      onChange(
        rows.map((r) => (r.sessionToken ? r : { ...r, sessionToken: uuidv4() })),
      );
      return;
    }
    if (rows.length > 0 && rows.every(isRowFilled)) {
      onChange([...rows, makeEmptyRow()]);
    }
  }, [rows, onChange]);

  const patchRow = (key: string, patch: Partial<LocationRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className={locationRows}>
      {rows.map((row) => (
        <LocationRowItem
          key={row.key}
          row={row}
          onPatch={(patch) => patchRow(row.key, patch)}
        />
      ))}
    </div>
  );
}

function LocationRowItem({
  row,
  onPatch,
}: {
  row: LocationRow;
  onPatch: (patch: Partial<LocationRow>) => void;
}) {
  const created = row.createdId !== null;

  const { predictions, searching } = usePlaceSearch({
    query: row.query,
    sessionToken: row.sessionToken ?? null,
    skip: row.selected !== null || created,
  });

  const list = usePredictionsList(row.selected ? [] : predictions, (p) =>
    onPatch({ selected: p, query: p.description }),
  );

  return (
    <div className={locationRow}>
      <Input
        scale="lg"
        value={row.name}
        placeholder="Name"
        maxLength={40}
        autoComplete="off"
        disabled={created}
        onChange={(e) => onPatch({ name: e.target.value })}
      />
      <div className={addressCell}>
        <div className={addressWrap} ref={list.containerRef}>
          <span className={addressIcon}>
            <MapPin size={13} strokeWidth={2.2} />
          </span>
          <Input
            scale="lg"
            className={`${addressInput} ${row.selected || created ? addressSelected : ""}`}
            placeholder="Search address…"
            value={row.query}
            autoComplete="off"
            disabled={created}
            onChange={(e) => {
              const next = e.target.value;
              onPatch({
                query: next,
                ...(row.selected && next !== row.selected.description
                  ? { selected: null }
                  : {}),
              });
            }}
            onKeyDown={list.onInputKeyDown}
          />
          {searching && (
            <span className={addressSpinner}>
              <Loader2 size={13} strokeWidth={2.2} />
            </span>
          )}
          {list.node}
        </div>
      </div>
    </div>
  );
}
