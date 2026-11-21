import { useCalendarProvider } from "@/context/CalendarProvider";
import { handleUpdateTitle } from "@/utils/calendarEventHandlers";
import { EventImpl } from "@fullcalendar/core/internal";
import { useState, useRef, useEffect } from "react";

interface UseTitleEditorOptions {
  event: EventImpl;
}

const useTitleEditor = ({ event }: UseTitleEditorOptions) => {
  const { calendar, updateAll } = useCalendarProvider();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState<string>(event.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select text when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (handleUpdateTitle && title.trim() !== "") {
      handleUpdateTitle(title.trim(), setTitle, event.id, calendar, updateAll);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTitle(event.title); // Reset to original value
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  return {
    isEditing,
    title,
    setTitle,
    inputRef,
    startEditing,
    handleSave,
    handleCancel,
    handleKeyDown,
    handleBlur,
  };
};

export default useTitleEditor;
