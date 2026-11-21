"use client";

import { useReducer, useState } from "react";
import { RefreshCw, Table2 } from "lucide-react";
import {
  Button,
  ConfirmModal,
  Loader,
  PageHeader,
  ResponsiveSegmentedControl,
} from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { TransportMode } from "@/generated/client";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import { LocationsRail } from "./_components/LocationsRail";
import { TravelMatrixPane } from "./_components/TravelMatrixPane";
import { TravelMatrixModal } from "./_components/TravelMatrixModal";
import { AddLocationModal } from "./_components/AddLocationModal";
import { EditTravelTimeModal } from "./_components/EditTravelTimeModal";
import { EditLocationModal } from "./_components/EditLocationModal";
import { useLocationsPageState } from "./_hooks/useLocationsPageState";
import { TRANSPORT_MODE_OPTIONS } from "./_constants";
import {
  page,
  loadingWrap,
  headActions,
  successBanner,
  errorBanner,
  mainGrid,
  matrixLauncher,
  matrixLauncherTitle,
  matrixLauncherNote,
  matrixLauncherButton,
} from "./page.css";

type ModalState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; location: SerializedLocation }
  | { kind: "travel"; from: string; to: string }
  | { kind: "confirmDelete"; locationId: string }
  | { kind: "confirmClearAll" };

type ModalAction =
  | { type: "OPEN_ADD" }
  | { type: "OPEN_EDIT"; location: SerializedLocation }
  | { type: "OPEN_TRAVEL_EDIT"; from: string; to: string }
  | { type: "CONFIRM_DELETE"; locationId: string }
  | { type: "CONFIRM_CLEAR_ALL" }
  | { type: "CLOSE_ALL" };

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN_ADD":
      return { kind: "add" };
    case "OPEN_EDIT":
      return { kind: "edit", location: action.location };
    case "OPEN_TRAVEL_EDIT":
      return { kind: "travel", from: action.from, to: action.to };
    case "CONFIRM_DELETE":
      return { kind: "confirmDelete", locationId: action.locationId };
    case "CONFIRM_CLEAR_ALL":
      return { kind: "confirmClearAll" };
    case "CLOSE_ALL":
      return { kind: "none" };
  }
}

export default function LocationsPage() {
  const {
    locations,
    travelTimes,
    transportMode,
    isLoaded,
    working,
    success,
    combinedError,
    changeTransportMode,
    addLocation,
    saveLocationEdit,
    deleteLocation,
    fetchMissingTravelTimes,
    saveTravelTimeOverrides,
    clearAllOverrides,
  } = useLocationsPageState();

  const isMobile = useIsMobile();
  const [modal, modalDispatch] = useReducer(modalReducer, { kind: "none" });
  // Separate from the reducer: the travel editor and the clear-all confirm
  // open ON TOP of the matrix modal, which must stay open underneath.
  const [matrixOpen, setMatrixOpen] = useState(false);

  const closeModals = () => modalDispatch({ type: "CLOSE_ALL" });

  const editingLocation = modal.kind === "edit" ? modal.location : null;
  const editPair =
    modal.kind === "travel" ? { from: modal.from, to: modal.to } : null;
  const deletingId = modal.kind === "confirmDelete" ? modal.locationId : null;
  const confirmClearAll = modal.kind === "confirmClearAll";

  const selectedTravelTime = editPair
    ? (travelTimes.find(
        (tt) =>
          tt.fromLocationId === editPair.from &&
          tt.toLocationId === editPair.to,
      ) ?? null)
    : null;
  const editFromLocation = editPair
    ? (locations.find((l) => l.id === editPair.from) ?? null)
    : null;
  const editToLocation = editPair
    ? (locations.find((l) => l.id === editPair.to) ?? null)
    : null;

  const statusBanners = (
    <>
      {combinedError && <div className={errorBanner}>{combinedError}</div>}
      {success && !combinedError && (
        <div className={successBanner}>{success}</div>
      )}
    </>
  );

  if (!isLoaded) {
    return (
      <div className={page}>
        <PageHeader title="Locations" />
        <div className={loadingWrap}>
          <Loader size="md" label="Loading locations" />
        </div>
      </div>
    );
  }

  return (
    <div className={page}>
      <PageHeader title="Locations">
        {statusBanners}
        {!isMobile && (
          <div className={headActions}>
            <ResponsiveSegmentedControl<TransportMode>
              value={transportMode}
              onChange={changeTransportMode}
              options={TRANSPORT_MODE_OPTIONS}
              ariaLabel="Travel mode"
            />
            <Button
              variant="glass"
              size="sm"
              onClick={fetchMissingTravelTimes}
              disabled={working || locations.length < 2}
            >
              <RefreshCw size={12} strokeWidth={2.2} />
              Fetch missing
            </Button>
          </div>
        )}
      </PageHeader>

      <div className={mainGrid}>
        {/* Launcher sits ABOVE the rail: the mobile page scrolls as one
            column, so below a long location list it would be off-viewport. */}
        {isMobile && (
          <section className={matrixLauncher}>
            <div className={matrixLauncherTitle}>Travel matrix</div>
            <span className={matrixLauncherNote}>
              {locations.length < 2
                ? "Add at least 2 locations to build the travel matrix."
                : `${locations.length} locations · ${transportMode.toLowerCase()}`}
            </span>
            <Button
              variant="solid"
              size="sm"
              className={matrixLauncherButton}
              onClick={() => setMatrixOpen(true)}
              disabled={locations.length < 2}
            >
              <Table2 size={13} strokeWidth={2.2} />
              Open travel matrix
            </Button>
          </section>
        )}

        <LocationsRail
          locations={locations}
          onEditLocation={(location) =>
            modalDispatch({ type: "OPEN_EDIT", location })
          }
          onAddLocation={() => modalDispatch({ type: "OPEN_ADD" })}
        />

        {!isMobile && (
          <TravelMatrixPane
            locations={locations}
            travelTimes={travelTimes}
            transportMode={transportMode}
            working={working}
            onFetchMissing={fetchMissingTravelTimes}
            onEditPair={(from, to) =>
              modalDispatch({ type: "OPEN_TRAVEL_EDIT", from, to })
            }
            onRequestClearAll={() =>
              modalDispatch({ type: "CONFIRM_CLEAR_ALL" })
            }
          />
        )}
      </div>

      <TravelMatrixModal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        locations={locations}
        travelTimes={travelTimes}
        transportMode={transportMode}
        working={working}
        onTransportChange={changeTransportMode}
        onFetchMissing={fetchMissingTravelTimes}
        onEditPair={(from, to) =>
          modalDispatch({ type: "OPEN_TRAVEL_EDIT", from, to })
        }
        onRequestClearAll={() => modalDispatch({ type: "CONFIRM_CLEAR_ALL" })}
        statusSlot={statusBanners}
      />

      <AddLocationModal
        open={modal.kind === "add"}
        onClose={closeModals}
        onAdd={async (name, placeId, sessionToken) => {
          await addLocation(name, placeId, sessionToken);
          closeModals();
        }}
      />

      <EditLocationModal
        open={modal.kind === "edit"}
        location={editingLocation}
        onClose={closeModals}
        onSave={async (draft) => {
          if (!editingLocation) return;
          closeModals();
          await saveLocationEdit(editingLocation, draft);
        }}
        onRequestDelete={() => {
          if (editingLocation)
            modalDispatch({
              type: "CONFIRM_DELETE",
              locationId: editingLocation.id,
            });
        }}
      />

      <EditTravelTimeModal
        open={modal.kind === "travel"}
        travelTime={selectedTravelTime}
        fromLocation={editFromLocation}
        toLocation={editToLocation}
        transportMode={transportMode}
        onClose={closeModals}
        onSave={saveTravelTimeOverrides}
      />

      <ConfirmModal
        open={!!deletingId}
        title="Delete location?"
        tone="danger"
        confirmLabel="Delete"
        body={
          <p style={{ margin: 0 }}>
            Delete &ldquo;
            {locations.find((l) => l.id === deletingId)?.name ??
              "this location"}
            &rdquo;? This will also remove all travel times to and from it.
            Items and categories that point at it will fall back to
            &ldquo;Anywhere&rdquo;.
          </p>
        }
        onCancel={closeModals}
        onConfirm={() => {
          if (deletingId) deleteLocation(deletingId);
          closeModals();
        }}
      />

      <ConfirmModal
        open={confirmClearAll}
        title="Clear all overrides?"
        tone="danger"
        confirmLabel="Clear all"
        body={
          <p style={{ margin: 0 }}>
            Remove every custom travel-time override and revert to Google&apos;s
            values? You can re-customize individual cells afterwards.
          </p>
        }
        onCancel={closeModals}
        onConfirm={() => {
          closeModals();
          clearAllOverrides();
        }}
      />
    </div>
  );
}
