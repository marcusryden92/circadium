"use client";

import { Undo2, Redo2 } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  undoCalendarState,
  redoCalendarState,
} from "@/redux/thunks/calendarThunks";
import { usePlatform } from "@/hooks/usePlatform";
import { Button } from "@/components/ui/Button";
import { group } from "./UndoRedoControls.css";

// Undo/redo over the calendar source state (see calendarSourceSlice history).
// Self-contained on the store rather than CalendarProvider so it can mount in
// any shell surface; disabled until the initial snapshot hydrates, since the
// stacks only ever fill after that.
export function UndoRedoControls({
  className,
  buttonClassName,
}: {
  className?: string;
  buttonClassName?: string;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { modKey } = usePlatform();
  const isLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );
  const canUndo = useSelector(
    (state: RootState) => state.calendarSource.past.length > 0,
  );
  const canRedo = useSelector(
    (state: RootState) => state.calendarSource.future.length > 0,
  );

  return (
    <div className={className ? `${group} ${className}` : group}>
      <Button
        variant="glass"
        size="sm"
        className={buttonClassName}
        disabled={!isLoaded || !canUndo}
        onClick={() => void dispatch(undoCalendarState())}
        aria-label="Undo"
        title={`Undo (${modKey}+Z)`}
      >
        <Undo2 size={13} strokeWidth={2.2} />
      </Button>
      <Button
        variant="glass"
        size="sm"
        className={buttonClassName}
        disabled={!isLoaded || !canRedo}
        onClick={() => void dispatch(redoCalendarState())}
        aria-label="Redo"
        title={`Redo (${modKey}+Shift+Z)`}
      >
        <Redo2 size={13} strokeWidth={2.2} />
      </Button>
    </div>
  );
}
