import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};

export default config;
