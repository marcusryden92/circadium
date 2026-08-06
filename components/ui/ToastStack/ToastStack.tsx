"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { removeToast, type Toast } from "@/redux/slices/toastSlice";
import { useShellPortalTarget } from "@/components/ui/shell/ShellPortalContext";
import { stack, toastItem } from "./ToastStack.css";

// Must match the toastLife animation duration in ToastStack.css.ts.
const TOAST_DURATION_MS = 4000;

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    const timer = window.setTimeout(
      () => dispatch(removeToast(toast.id)),
      TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dispatch, toast.id]);

  return <div className={toastItem}>{toast.text}</div>;
}

// Bottom-right transient message stack: a new toast spawns at the bottom and
// pushes the previous ones up; each fades out on its own timer. Non-blocking
// (pointer-events: none) — purely informational. Portals into the shell
// canvas so its offsets measure from the same frame as the sidebar's padding
// (a viewport-fixed layer would sit bezel-width closer to the screen edge).
export function ToastStack() {
  const items = useSelector((state: RootState) => state.toasts.items);
  const target = useShellPortalTarget();
  if (items.length === 0 || !target) return null;
  return createPortal(
    <div className={stack} role="status" aria-live="polite">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    target,
  );
}
