"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RefreshCw, X } from "lucide-react";
import {
  Button,
  Grain,
  ResponsiveSegmentedControl,
  useShellOverlay,
} from "@/components/ui";
import type { TransportMode } from "@/generated/client";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import { TravelMatrixPane } from "../TravelMatrixPane";
import { TRANSPORT_MODE_OPTIONS } from "../../_constants";
import {
  overlay,
  modal,
  banner,
  bannerTitle,
  bannerSpacer,
  closeButton,
  controlsRow,
} from "./TravelMatrixModal.css";

interface TravelMatrixModalProps {
  open: boolean;
  onClose: () => void;
  locations: SerializedLocation[];
  travelTimes: SerializedTravelTime[];
  transportMode: TransportMode;
  working: boolean;
  onTransportChange: (mode: TransportMode) => void;
  onFetchMissing: () => void;
  onEditPair: (fromId: string, toId: string) => void;
  onRequestClearAll: () => void;
  // Success/error pills owned by the page, so the fetch feedback shows here
  // while the modal covers the page header.
  statusSlot?: ReactNode;
}

export function TravelMatrixModal({
  open,
  onClose,
  locations,
  travelTimes,
  transportMode,
  working,
  onTransportChange,
  onFetchMissing,
  onEditPair,
  onRequestClearAll,
  statusSlot,
}: TravelMatrixModalProps) {
  useShellOverlay(open);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={modal}
          aria-describedby={undefined}
          // The travel-time editor and confirm dialogs portal as siblings, so
          // their pointer events count as "outside" this dialog — dismissal on
          // those would close the matrix underneath them.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Grain />
          <div className={banner}>
            <Dialog.Title className={bannerTitle}>Travel matrix</Dialog.Title>
            <span className={bannerSpacer} />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className={closeButton}
            >
              <X size={14} strokeWidth={2.2} />
              Close
            </Button>
          </div>
          <div className={controlsRow}>
            <ResponsiveSegmentedControl<TransportMode>
              value={transportMode}
              onChange={onTransportChange}
              options={TRANSPORT_MODE_OPTIONS}
              ariaLabel="Travel mode"
            />
            <Button
              variant="glass"
              size="sm"
              onClick={onFetchMissing}
              disabled={working || locations.length < 2}
            >
              <RefreshCw size={12} strokeWidth={2.2} />
              Fetch missing
            </Button>
            {statusSlot}
          </div>
          <TravelMatrixPane
            variant="fill"
            locations={locations}
            travelTimes={travelTimes}
            transportMode={transportMode}
            working={working}
            onFetchMissing={onFetchMissing}
            onEditPair={onEditPair}
            onRequestClearAll={onRequestClearAll}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
