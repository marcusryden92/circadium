// Shared code runs on web (Node/Next) AND a future Expo/Hermes runtime, where
// `process` may not exist. Guard the lookup so a direct `process.env.NODE_ENV`
// read can never throw a ReferenceError off-web; it only gates debug logging.
export function isDevEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production"
  );
}
