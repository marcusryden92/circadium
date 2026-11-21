import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  shortcuts: Record<string, () => void>;
  isActive?: boolean;
}

const useKeyboardShortcuts = ({
  shortcuts,
  isActive = true,
}: UseKeyboardShortcutsOptions) => {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const handler = shortcuts[e.key];
      if (handler) {
        handler();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, isActive]);
};

export default useKeyboardShortcuts;
