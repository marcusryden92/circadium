import "@testing-library/jest-dom";

// jsdom does not ship TextEncoder/TextDecoder; the Prisma client (imported
// transitively through @/types/prisma) needs both. Standard Next.js + jsdom +
// Prisma polyfill.
import { TextEncoder, TextDecoder } from "util";
(global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder =
  TextEncoder;
(global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder =
  TextDecoder;
