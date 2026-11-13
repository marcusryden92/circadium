import { generateCalendar } from "./calendarGeneration";
import type {
  EngineWorkerRequest,
  EngineRunResult,
} from "./engineWorkerClient";

// Typed view of the dedicated-worker global scope — the DOM lib types `self`
// as Window, whose postMessage has a different signature.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
  postMessage: (message: EngineRunResult) => void;
};

scope.onmessage = (event) => {
  const { userId, weekStartDay, template, planner, prevCalendar, options } =
    event.data;
  scope.postMessage(
    generateCalendar(
      userId,
      weekStartDay,
      template,
      planner,
      prevCalendar,
      options,
    ),
  );
};
