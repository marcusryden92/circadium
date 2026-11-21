"use client";

import type { ServerActionStatus } from "@/hooks/useServerAction";
import {
  footerMessage,
  footerMessageSuccess,
  footerMessageError,
} from "../../page.css";

export function StatusLine({ status }: { status: ServerActionStatus }) {
  if (!status) return null;
  return (
    <span
      className={`${footerMessage} ${
        status.tone === "success" ? footerMessageSuccess : footerMessageError
      }`}
    >
      {status.text}
    </span>
  );
}
