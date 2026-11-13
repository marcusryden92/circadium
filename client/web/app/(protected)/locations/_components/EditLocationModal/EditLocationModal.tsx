"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Trash2, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, FieldStack, Input } from "@/components/ui";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import { useLocationModalState } from "../../_hooks/useLocationModalState";
import { usePlaceSearch, type Prediction } from "../../_hooks/usePlaceSearch";
import { usePredictionsList } from "../PredictionsList";
import {
  overlay,
  modal,
  header,
  title,
  subtitle,
  searchWrap,
  searchIcon,
  searchSpinner,
  textInput,
  selectedHint,
  cascadeNote,
  placeMessageSlot,
  errorSlot,
  errorBlock,
  footer,
  dangerSlot,
  spinning,
} from "./EditLocationModal.css";

export interface EditLocationDraft {
  name: string;
  placeId?: string;
  sessionToken?: string;
}

interface EditLocationModalProps {
  open: boolean;
  location: SerializedLocation | null;
  onClose: () => void;
  onSave: (draft: EditLocationDraft) => Promise<void>;
  onRequestDelete: () => void;
}

export function EditLocationModal({
  open,
  location,
  onClose,
  onSave,
  onRequestDelete,
}: EditLocationModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Prediction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the address shown when the modal opened. Any edit that ends
  // up matching this string is treated as "no change" and the search stays
  // quiet.
  const originalAddressRef = useRef("");

  const { sessionToken, resetSignal } = useLocationModalState({
    open,
    resetKey: location?.id ?? null,
  });

  useEffect(() => {
    if (!open || !location) return;
    const addr = location.address || "";
    setName(location.name);
    setQuery(addr);
    originalAddressRef.current = addr;
    setSelectedPlace(null);
    setError(null);
    setSaving(false);
  }, [open, location, resetSignal]);

  const { predictions, searching } = usePlaceSearch({
    query,
    sessionToken,
    skip: !!selectedPlace || query === originalAddressRef.current,
  });

  const handleSelect = (p: Prediction) => {
    setSelectedPlace(p);
    setQuery(p.description);
  };

  const predictionsList = usePredictionsList(
    selectedPlace ? [] : predictions,
    handleSelect,
  );

  if (!location) return null;

  const nameChanged = name.trim() !== "" && name.trim() !== location.name;
  // Picking the prediction for the same place (e.g. typing the original
  // address back into autocomplete) isn't a real change. Compare against the
  // current placeId so re-confirming doesn't trigger a cascade.
  const placeChanged =
    !!selectedPlace && selectedPlace.placeId !== location.placeId;
  const canSave = nameChanged || placeChanged;

  const handleSubmit = async () => {
    if (!canSave) {
      onClose();
      return;
    }
    if (!name.trim()) {
      setError("Give this location a name.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave({
        name: name.trim(),
        placeId: placeChanged ? selectedPlace?.placeId : undefined,
        sessionToken: placeChanged ? sessionToken ?? undefined : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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
            <Dialog.Title className={title}>Edit location</Dialog.Title>
            <span className={subtitle}>
              Rename it or point it at a different address. Changing the address
              drops the travel times to and from this location so they get
              re-fetched.
            </span>
          </div>

          <FieldStack size="sm" label="Name">
            <Input
              placeholder="e.g. Home, Office, Gym"
              value={name}
              maxLength={50}
              autoComplete="off"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </FieldStack>

          <FieldStack size="sm" label="Address">
            <div className={searchWrap} ref={predictionsList.containerRef}>
              <span className={searchIcon}>
                <MapPin size={13} strokeWidth={2} />
              </span>
              <Input
                className={textInput}
                placeholder="Search for an address…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (
                    selectedPlace &&
                    e.target.value !== selectedPlace.description
                  ) {
                    setSelectedPlace(null);
                  }
                }}
                onKeyDown={predictionsList.onInputKeyDown}
              />
              {searching && (
                <span className={`${searchSpinner} ${spinning}`}>
                  <Loader2 size={14} strokeWidth={2.2} />
                </span>
              )}
              {predictionsList.node}
            </div>
            <div className={placeMessageSlot}>
              {placeChanged && (
                <>
                  <span className={selectedHint}>
                    <MapPin size={11} strokeWidth={2.2} />
                    New place selected
                  </span>
                  <div className={cascadeNote}>
                    <AlertTriangle size={12} strokeWidth={2.2} />
                    Saving will drop every travel time touching this location.
                    You can refetch from the matrix.
                  </div>
                </>
              )}
            </div>
          </FieldStack>

          <div className={errorSlot}>
            {error && <div className={errorBlock}>{error}</div>}
          </div>

          <div className={footer}>
            <span className={dangerSlot}>
              <Button variant="glass" size="sm" onClick={onRequestDelete}>
                <Trash2 size={12} strokeWidth={2.2} />
                Delete
              </Button>
            </span>
            <Button variant="glass" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="glassInk"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !canSave}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
