import { useEffect, RefObject } from "react";

interface UseClickOutsideOptions {
  ref: RefObject<HTMLElement | null>;
  onClickOutside: () => void;
  isActive?: boolean;
  /** Ignore clicks on Radix UI portal content (e.g., Select dropdowns) */
  ignoreRadixPortals?: boolean;
}

/**
 * Check if an element is inside a Radix UI portal (Select, Dialog, etc.)
 */
function isInsideRadixPortal(element: Element | null): boolean {
  let current = element;
  while (current) {
    // Radix portals have data-radix-popper-content-wrapper or similar attributes
    if (
      current.hasAttribute?.("data-radix-popper-content-wrapper") ||
      current.hasAttribute?.("data-radix-select-content") ||
      current.hasAttribute?.("data-radix-menu-content") ||
      current.hasAttribute?.("data-radix-dialog-content") ||
      current.getAttribute?.("role") === "listbox" ||
      current.getAttribute?.("data-state") === "open"
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

const useClickOutside = ({
  ref,
  onClickOutside,
  isActive = true,
  ignoreRadixPortals = true,
}: UseClickOutsideOptions) => {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside the ref element
      if (ref.current && ref.current.contains(target)) {
        return;
      }

      // Check if click is inside a Radix portal (Select dropdown, etc.)
      if (ignoreRadixPortals && isInsideRadixPortal(target as Element)) {
        return;
      }

      onClickOutside();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, onClickOutside, isActive, ignoreRadixPortals]);
};

export default useClickOutside;
