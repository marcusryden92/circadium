import type { ReactNode } from "react";
import { notFound } from "next/navigation";

/** Design and layout scratch pages: served by `pnpm dev` only, a 404 in production builds. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
