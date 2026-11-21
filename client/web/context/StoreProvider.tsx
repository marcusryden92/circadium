"use client";

import { ReactNode, useRef } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/redux/store";
import { deriveExternalBusyEvents } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { deriveOccurrenceCompletions } from "@/utils/deriveOccurrenceCompletions";
// Side effect: injects the web worker factory into the shared engine client so
// off-main-thread regen is available before any store-dispatched engine run.
import "@/lib/engineWorker";

export default function StoreProvider({ children }: { children: ReactNode }) {
  // One store per mount. The engine-input adapters are web-specific (the
  // external-calendar domain is web-only until Phase 2), so they are injected
  // into the shared factory here rather than imported inside shared.
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore({
      deriveExternalBusyEvents,
      deriveOccurrenceCompletions,
    });
  }
  return <Provider store={storeRef.current}>{children}</Provider>;
}
