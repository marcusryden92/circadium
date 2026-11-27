import type { Config } from "jest";

// The wall-clock DST tests need a zone that observes DST; CI runners sit in
// UTC, where no day is ever 23 or 25 hours. Node reads TZ at first date use,
// so pinning it here makes the suite deterministic on every machine.
process.env.TZ = "Europe/Stockholm";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  testPathIgnorePatterns: ["/node_modules/", "generateFixtures\\.ts$"],
};

export default config;
