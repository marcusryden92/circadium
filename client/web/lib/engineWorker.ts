import { configureEngineClient } from "@circadium/shared/engine/engineWorkerClient";

// Web worker construction lives here, not in the shared engine client: webpack
// resolves `new URL(..., import.meta.url)` at build time and emits
// engine.worker.ts as its own chunk. Imported once at app bootstrap so the
// engine runs off the main thread; without it the client falls back to inline.
configureEngineClient(() => {
  try {
    return new Worker(new URL("./engine.worker.ts", import.meta.url));
  } catch {
    return null;
  }
});
