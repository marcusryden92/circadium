import {
  ExternalCalendarMode,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "../../contracts";
import { parseModeExceptions } from "./modeExceptions";

// True busy-ness for a single event, shared by the renderer (tile + popover
// toggle state) and anything else that needs the resolved value outside the
// engine, so a tile always agrees with what the scheduler actually blocked on.
export function isExternalEventBusy(
  source: Pick<ExternalCalendarSource, "enabled" | "mode" | "modeExceptions">,
  event: Pick<ExternalEvent, "uid" | "allDay">,
): boolean {
  if (!source.enabled || event.allDay) return false;
  const excepted = parseModeExceptions(source.modeExceptions).includes(
    event.uid,
  );
  return (source.mode === ExternalCalendarMode.BUSY) !== excepted;
}
