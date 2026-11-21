"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, Input } from "@/components/ui";
import type { TransportMode } from "@/generated/client";
import type { SerializedTravelTime } from "@/redux/slices/schedulingSettingsSlice";
import { isTimeVarying } from "@/utils/locations";
import {
  overlay,
  modal,
  header,
  title,
  subtitle,
  periodList,
  periodRow,
  periodName,
  periodInput,
  googleHint,
  revertBtn,
  footer,
  footerSpacer,
} from "./EditTravelTimeModal.css";

// The modal only displays the name of each endpoint, so it accepts any shape
// that carries an id + name (full Prisma Location or the narrower Redux row).
type EndpointLocation = { id: string; name: string };

type Period = "rush" | "regular" | "night";

interface EditTravelTimeModalProps {
  open: boolean;
  travelTime: SerializedTravelTime | null;
  fromLocation: EndpointLocation | null;
  toLocation: EndpointLocation | null;
  transportMode: TransportMode;
  onClose: () => void;
  onSave: (
    travelTimeId: string,
    next: {
      customRushHourMinutes: number | null;
      customRegularMinutes: number | null;
      customNightMinutes: number | null;
    },
  ) => void | Promise<void>;
}

export function EditTravelTimeModal({
  open,
  travelTime,
  fromLocation,
  toLocation,
  transportMode,
  onClose,
  onSave,
}: EditTravelTimeModalProps) {
  // Drafts mirror the current effective values for each period. They reset
  // whenever the modal is opened on a fresh travel-time entry.
  const [rushDraft, setRushDraft] = useState("");
  const [regDraft, setRegDraft] = useState("");
  const [nightDraft, setNightDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !travelTime) return;
    setRushDraft(
      String(
        travelTime.customRushHourMinutes ?? travelTime.googleRushHourMinutes,
      ),
    );
    setRegDraft(
      String(
        travelTime.customRegularMinutes ?? travelTime.googleRegularMinutes,
      ),
    );
    setNightDraft(
      String(travelTime.customNightMinutes ?? travelTime.googleNightMinutes),
    );
  }, [open, travelTime]);

  if (!travelTime) return null;

  const timeVarying = isTimeVarying(transportMode);

  const parse = (s: string): number | null => {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // null = custom equals Google value, so we drop the override and revert to
  // Google's number. The save handler treats null as "clear override".
  const overrideFor = (
    draft: string,
    googleValue: number,
  ): number | null => {
    const n = parse(draft);
    if (n === null || n === googleValue) return null;
    return n;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (timeVarying) {
        await onSave(travelTime.id, {
          customRushHourMinutes: overrideFor(
            rushDraft,
            travelTime.googleRushHourMinutes,
          ),
          customRegularMinutes: overrideFor(
            regDraft,
            travelTime.googleRegularMinutes,
          ),
          customNightMinutes: overrideFor(
            nightDraft,
            travelTime.googleNightMinutes,
          ),
        });
      } else {
        // Single-value modes (bike, walk) — the one input drives all three
        // custom fields so the data shape stays consistent across modes.
        const n = parse(regDraft);
        const override =
          n === null || n === travelTime.googleRegularMinutes ? null : n;
        await onSave(travelTime.id, {
          customRushHourMinutes: override,
          customRegularMinutes: override,
          customNightMinutes: override,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const revertOne = (period: Period) => {
    if (period === "rush") {
      setRushDraft(String(travelTime.googleRushHourMinutes));
    } else if (period === "regular") {
      setRegDraft(String(travelTime.googleRegularMinutes));
    } else {
      setNightDraft(String(travelTime.googleNightMinutes));
    }
  };

  const periodConfig: {
    key: Period;
    label: string;
    draft: string;
    setDraft: (s: string) => void;
    googleValue: number;
    hasCustom: boolean;
  }[] = timeVarying
    ? [
        {
          key: "rush",
          label: "Rush",
          draft: rushDraft,
          setDraft: setRushDraft,
          googleValue: travelTime.googleRushHourMinutes,
          hasCustom: travelTime.customRushHourMinutes !== null,
        },
        {
          key: "regular",
          label: "Regular",
          draft: regDraft,
          setDraft: setRegDraft,
          googleValue: travelTime.googleRegularMinutes,
          hasCustom: travelTime.customRegularMinutes !== null,
        },
        {
          key: "night",
          label: "Night",
          draft: nightDraft,
          setDraft: setNightDraft,
          googleValue: travelTime.googleNightMinutes,
          hasCustom: travelTime.customNightMinutes !== null,
        },
      ]
    : [
        {
          key: "regular",
          label: "Minutes",
          draft: regDraft,
          setDraft: setRegDraft,
          googleValue: travelTime.googleRegularMinutes,
          hasCustom:
            travelTime.customRegularMinutes !== null ||
            travelTime.customRushHourMinutes !== null ||
            travelTime.customNightMinutes !== null,
        },
      ];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className={modal} aria-describedby={undefined}>
          <div className={header}>
            <Dialog.Title className={title}>
              {fromLocation?.name ?? "From"} → {toLocation?.name ?? "To"}
            </Dialog.Title>
            <span className={subtitle}>
              {timeVarying
                ? "Travel time in minutes. Override any period; clear to revert to Google's value."
                : "Travel time in minutes. This mode doesn't vary by time of day."}
            </span>
          </div>

          <div className={periodList}>
            {periodConfig.map((p) => {
              const draftNum = parse(p.draft);
              const willOverride =
                draftNum !== null && draftNum !== p.googleValue;
              const canRevert = willOverride || p.hasCustom;
              return (
                <div key={p.key} className={periodRow}>
                  <span className={periodName}>{p.label}</span>
                  <Input
                    className={periodInput}
                    type="number"
                    min={0}
                    max={999}
                    value={p.draft}
                    onChange={(e) => p.setDraft(e.target.value)}
                  />
                  <span className={googleHint}>
                    Google: {p.googleValue} min
                  </span>
                  <button
                    type="button"
                    className={revertBtn}
                    onClick={() => revertOne(p.key)}
                    disabled={!canRevert}
                    aria-label={`Revert ${p.label.toLowerCase()} to Google value`}
                    title="Revert to Google value"
                  >
                    <RotateCcw size={12} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className={footer}>
            <span className={footerSpacer} />
            <Button variant="glass" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="glassInk"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
