"use client";

import {
  useRef,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { space } from "@/lib/theme";
import {
  sheetOverlay,
  sheet,
  sheetFlush,
  sheetHandle,
  sheetTitle,
  sheetBody,
} from "./BottomSheet.css";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Keep the title for screen readers only; the content draws its own header. */
  hideTitle?: boolean;
  /** Drop the sheet's horizontal padding for edge-to-edge rows. */
  flush?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  // For sheets whose page owns sibling-portaled dialogs (confirm modals):
  // Radix counts taps on those as "outside", so hosts prevent dismissal there.
  onPointerDownOutside?: ComponentProps<
    typeof Dialog.Content
  >["onPointerDownOutside"];
  onInteractOutside?: ComponentProps<
    typeof Dialog.Content
  >["onInteractOutside"];
  children: ReactNode;
};

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: `-${space["px"]}`,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const DRAG_ACTIVATE_PX = 12;
const DISMISS_DISTANCE_PX = 140;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  offset: number;
  active: boolean;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  flush,
  onOpenAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  children,
}: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const insideScrolledContainer = (target: EventTarget | null): boolean => {
    let node = target instanceof HTMLElement ? target : null;
    while (node && node !== contentRef.current) {
      if (node.scrollTop > 0) return true;
      node = node.parentElement;
    }
    return false;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (insideScrolledContainer(e.target)) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      offset: 0,
      active: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const content = contentRef.current;
    if (!drag || !content || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      const dx = e.clientX - drag.startX;
      if (dy < DRAG_ACTIVATE_PX || Math.abs(dx) > dy) return;
      drag.active = true;
      content.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    drag.offset = Math.max(0, dy);
    content.style.transition = "none";
    content.style.transform = `translateY(${drag.offset}px)`;
  };

  const settleBack = (content: HTMLDivElement, offset: number) => {
    // A lingering transform would become the containing block for any
    // position:fixed descendant, so it always gets cleared, not zeroed.
    if (offset < 1) {
      content.style.transition = "";
      content.style.transform = "";
      return;
    }
    content.style.transition = "transform 0.2s ease";
    content.style.transform = "translateY(0)";
    const clear = () => {
      content.style.transition = "";
      content.style.transform = "";
      content.removeEventListener("transitionend", clear);
    };
    content.addEventListener("transitionend", clear);
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const content = contentRef.current;
    dragRef.current = null;
    if (!drag?.active || !content) return;
    suppressClickRef.current = true;
    const height = content.getBoundingClientRect().height;
    const pastDistance =
      drag.offset > Math.min(DISMISS_DISTANCE_PX, height * 0.4);
    const flung =
      drag.offset > 24 && drag.velocity > DISMISS_VELOCITY_PX_PER_MS;
    if (e.type !== "pointercancel" && (pastDistance || flung)) {
      // The inline transform stays put: the close keyframe only declares a
      // destination, so the exit animates from where the finger let go.
      onOpenChange(false);
    } else {
      settleBack(content, drag.offset);
    }
  };

  const handleClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={sheetOverlay} />
        <Dialog.Content
          ref={contentRef}
          className={`${sheet} ${flush ? sheetFlush : ""}`}
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onInteractOutside={onInteractOutside}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClickCapture={handleClickCapture}
        >
          <span className={sheetHandle} aria-hidden />
          <Dialog.Title
            className={hideTitle ? undefined : sheetTitle}
            style={hideTitle ? srOnly : undefined}
          >
            {title}
          </Dialog.Title>
          <div className={sheetBody}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
