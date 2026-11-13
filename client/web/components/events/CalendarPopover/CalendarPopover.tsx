"use client";

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import usePopoverPosition from "@/hooks/usePopoverPosition";
import { useIsMobile } from "@/hooks/useIsMobile";
import { space, popover } from "@/lib/theme";
import { BottomSheet } from "@/components/ui";
import { calendarPopover } from "./CalendarPopover.css";

interface RenderArgs {
  startDrag: (e: React.MouseEvent) => void;
  close: () => void;
  isDragging: boolean;
}

interface CalendarPopoverProps {
  anchorRect: DOMRect;
  width: number;
  height: number;
  /** Accessible label announced by screen readers when the popover opens. */
  title: string;
  onClose: () => void;
  /** Fires when the user presses Escape; falls back to onClose if omitted. */
  onEscape?: () => void;
  /** Fires when click lands outside the popover; falls back to onClose. */
  onClickOutside?: () => void;
  children: (args: RenderArgs) => ReactNode;
}

const srOnlyStyle: React.CSSProperties = {
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

export function CalendarPopover({
  anchorRect,
  width,
  height,
  title,
  onClose,
  onEscape,
  onClickOutside,
  children,
}: CalendarPopoverProps) {
  // The stylesheet already caps the rendered box at calc(100vw - 20px); the
  // position math must reason about the same clamped width or narrow
  // viewports get placements biased by a box wider than what paints.
  const effectiveWidth =
    typeof window === "undefined"
      ? width
      : Math.min(width, window.innerWidth - 20);
  const { position, isPositioned, isDragging, popoverRef, startDrag } =
    usePopoverPosition({
      eventRect: anchorRect,
      dimensions: { width: effectiveWidth, height },
      padding: space["4"],
    });
  // Mobile skips anchored positioning entirely and presents as the shared
  // bottom sheet — a floating box anchored to a tiny tile is a desktop idiom.
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <BottomSheet
        open
        onOpenChange={(next) => {
          if (!next) (onClickOutside ?? onClose)();
        }}
        title={title}
        hideTitle
        flush
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (onEscape) {
            e.preventDefault();
            onEscape();
          }
        }}
      >
        {children({ startDrag, close: onClose, isDragging: false })}
      </BottomSheet>
    );
  }

  return (
    <Dialog.Root
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          ref={popoverRef}
          className={`${popover({ size: "lg" })} ${calendarPopover}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (onEscape) {
              e.preventDefault();
              onEscape();
            }
          }}
          onPointerDownOutside={() => {
            (onClickOutside ?? onClose)();
          }}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${effectiveWidth}px`,
            visibility: isPositioned ? "visible" : "hidden",
            cursor: isDragging ? "grabbing" : "auto",
          }}
        >
          <Dialog.Title style={srOnlyStyle}>{title}</Dialog.Title>
          {children({ startDrag, close: onClose, isDragging })}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
