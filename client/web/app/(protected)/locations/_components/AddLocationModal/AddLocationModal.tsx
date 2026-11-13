"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, FieldStack, Input } from "@/components/ui";
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
  fieldHelp,
  placeMessageSlot,
  errorSlot,
  errorBlock,
  footer,
  spinning,
} from "./AddLocationModal.css";

interface AddLocationModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, placeId: string, sessionToken?: string) => Promise<void>;
}

export function AddLocationModal({ open, onClose, onAdd }: AddLocationModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Prediction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sessionToken, resetSignal } = useLocationModalState({ open });

  // Reset draft state on every (re)open. resetSignal increments on each open,
  // so the same modal re-mounted for a new add starts clean.
  useEffect(() => {
    if (!open) return;
    setName("");
    setQuery("");
    setSelected(null);
    setError(null);
    setSaving(false);
  }, [open, resetSignal]);

  const { predictions, searching } = usePlaceSearch({
    query,
    sessionToken,
    skip: !!selected,
  });

  const handleSelect = (p: Prediction) => {
    setSelected(p);
    setQuery(p.description);
    if (!name) setName(p.mainText);
  };

  const predictionsList = usePredictionsList(
    selected ? [] : predictions,
    handleSelect,
  );

  const handleSubmit = async () => {
    if (!selected) {
      setError("Pick a place from the search results.");
      return;
    }
    if (!name.trim()) {
      setError("Give this location a name.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onAdd(name.trim(), selected.placeId, sessionToken ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add location");
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
            <Dialog.Title className={title}>Add location</Dialog.Title>
            <span className={subtitle}>
              Give it a friendly name like &ldquo;Home&rdquo; or &ldquo;Office&rdquo;
              and pick an address.
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
            <span className={fieldHelp}>
              A short label you&apos;ll recognize when picking it on tasks and
              categories.
            </span>
          </FieldStack>

          <FieldStack size="sm" label="Address">
            <div className={searchWrap} ref={predictionsList.containerRef}>
              <span className={searchIcon}>
                <Search size={13} strokeWidth={2.2} />
              </span>
              <Input
                className={textInput}
                placeholder="Start typing an address…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (selected && e.target.value !== selected.description) {
                    setSelected(null);
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
              {selected && (
                <span className={selectedHint}>
                  <MapPin size={11} strokeWidth={2.2} />
                  Place selected
                </span>
              )}
            </div>
          </FieldStack>

          <div className={errorSlot}>
            {error && <div className={errorBlock}>{error}</div>}
          </div>

          <div className={footer}>
            <Button variant="glass" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="glassInk"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !selected || !name.trim()}
            >
              {saving ? "Adding…" : "Add location"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
