"use client";

import { type ReactNode, type RefObject } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui";
import {
  titleRow,
  titleEditable,
  titleReadonly,
  routeHeading,
  leadingIcon as leadingIconClass,
  titleInput,
  renamePencil,
} from "./PopoverTitleRow.css";

interface TitleEditor {
  isEditing: boolean;
  value: string;
  inputRef: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onStartEditing: () => void;
}

interface PopoverTitleRowProps {
  /** Inline-edit wiring (Event, Template). Omit for a read-only title. */
  editor?: TitleEditor;
  /** Read-only title node (External text; Travel's "From → To" route). */
  staticContent?: ReactNode;
  /** Leading icon rendered inside a read-only route heading (Travel's Car). */
  leadingIcon?: ReactNode;
  /** Trailing slot — the color picker, always in the same place. */
  trailing?: ReactNode;
  /** hover tooltip on the title. */
  titleAttr?: string;
}

export function PopoverTitleRow({
  editor,
  staticContent,
  leadingIcon,
  trailing,
  titleAttr,
}: PopoverTitleRowProps) {
  return (
    <div className={titleRow}>
      {editor ? (
        editor.isEditing ? (
          <Input
            ref={editor.inputRef}
            variant="titleInline"
            type="text"
            value={editor.value}
            onChange={(e) => editor.onChange(e.target.value)}
            onBlur={editor.onBlur}
            onKeyDown={editor.onKeyDown}
            className={titleInput}
          />
        ) : (
          <>
            <h3
              className={titleEditable}
              onClick={editor.onStartEditing}
              title="Click to rename"
            >
              {editor.value}
            </h3>
            <button
              type="button"
              className={renamePencil}
              onClick={editor.onStartEditing}
              aria-label="Rename"
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          </>
        )
      ) : (
        <h3
          className={leadingIcon ? routeHeading : titleReadonly}
          title={titleAttr}
        >
          {leadingIcon && <span className={leadingIconClass}>{leadingIcon}</span>}
          {staticContent}
        </h3>
      )}
      {trailing}
    </div>
  );
}
