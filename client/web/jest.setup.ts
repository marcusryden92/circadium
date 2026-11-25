import "@testing-library/jest-dom";

// jsdom does not ship TextEncoder/TextDecoder; code under test (uuid, jose,
// streaming helpers) expects both on the global. Standard Next.js + jsdom
// polyfill.
import { TextEncoder, TextDecoder } from "util";
(global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder =
  TextEncoder;
(global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder =
  TextDecoder;
