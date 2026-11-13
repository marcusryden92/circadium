// RE-EXPORT SHIM over @circadium/shared/sync/compareCalendarData (plan item
// 0.8). The diff + the injectable SyncTransport live in client/shared now; this
// keeps the ~16 @/utils/server-handlers/compareCalendarData import sites (the
// sync handlers, syncCalendarData, the conformance asserts) untouched. Edit the
// shared source, not this file.
export * from "@circadium/shared/sync/compareCalendarData";
