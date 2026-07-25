"use client";

import { type ReactNode } from "react";
import { GripVertical, X } from "lucide-react";
import { header, dragHandle, headerBadges, closeBtn } from "./PopoverHeader.css";

interface PopoverHeaderProps {
  onStartDrag: (e: React.MouseEvent) => void;
  isDragging: boolean;
  /** TypeBadge + CategoryBadge, or a status-tagged badge cluster (Travel). */
  badges: ReactNode;
  onClose: () => void;
}

export function PopoverHeader({
  onStartDrag,
  isDragging,
  badges,
  onClose,
}: PopoverHeaderProps) {
  return (
    <div className={header} data-dragging={isDragging}>
      <button
        type="button"
        className={dragHandle}
        onMouseDown={onStartDrag}
        aria-label="Drag to move"
        title="Drag to move"
      >
        <GripVertical size={16} strokeWidth={2} />
      </button>
      <div className={headerBadges}>{badges}</div>
      <button
        type="button"
        className={closeBtn}
        onClick={onClose}
        aria-label="Close"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
