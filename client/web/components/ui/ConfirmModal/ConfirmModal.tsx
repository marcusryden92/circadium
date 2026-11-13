"use client";

import type { ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/Button";
import {
  overlay,
  modal,
  modalTitle,
  modalBody,
  modalActions,
  modalCancel,
} from "./ConfirmModal.css";

type ConfirmTone = "default" | "danger";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  extraActions?: ReactNode;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  confirmDisabled = false,
  onCancel,
  onConfirm,
  extraActions,
}: ConfirmModalProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content className={modal}>
          <AlertDialog.Title className={modalTitle}>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className={modalBody}>{body}</div>
          </AlertDialog.Description>
          <div className={modalActions}>
            {extraActions}
            <AlertDialog.Cancel asChild>
              <Button
                variant="glass"
                size="sm"
                className={modalCancel}
                onClick={onCancel}
              >
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={tone === "danger" ? "danger" : "glassInk"}
                size="sm"
                onClick={(e) => {
                  if (confirmDisabled) {
                    e.preventDefault();
                    return;
                  }
                  onConfirm();
                }}
                disabled={confirmDisabled}
                data-danger={tone === "danger" ? "true" : undefined}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
