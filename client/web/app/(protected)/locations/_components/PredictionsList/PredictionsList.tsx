"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useListKeyboardNav } from "@/hooks/useListKeyboardNav";
import useClickOutside from "@/hooks/useClickOutside";
import type { Prediction } from "../../_hooks/usePlaceSearch";
import {
  predictions,
  predictionRow,
  predictionRowActive,
  predictionMain,
  predictionSub,
} from "./PredictionsList.css";

interface PredictionsListHandle {
  visible: boolean;
  onInputKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  node: ReactNode;
}

// The list lives next to its trigger input. The hook bundles keyboard nav
// (ArrowUp/Down/Enter) with the rendered overlay so the caller only wires
// onInputKeyDown to the input and drops `node` next to it. The parent modal
// must use `overflow: visible` for the absolute list to escape its box, and
// the caller must attach `containerRef` to a wrapper that contains both the
// input and `node` so click-outside detection can ignore clicks within it.
export function usePredictionsList(
  items: Prediction[],
  onSelect: (p: Prediction) => void,
): PredictionsListHandle {
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fresh search results re-open the dropdown after a manual dismiss so the
  // user doesn't have to refocus to see them.
  useEffect(() => {
    setDismissed(false);
  }, [items]);

  const visible = items.length > 0 && !dismissed;

  // ignoreRadixPortals is off because the surrounding modal IS a Radix portal;
  // clicks inside it (footer buttons, other fields) should still dismiss the
  // dropdown without closing the modal.
  useClickOutside({
    ref: containerRef,
    onClickOutside: () => setDismissed(true),
    isActive: visible,
    ignoreRadixPortals: false,
  });

  const keyboardNav = useListKeyboardNav<Prediction>(
    visible ? items : [],
    onSelect,
  );

  const node: ReactNode = visible ? (
    <div className={predictions} ref={keyboardNav.containerRef}>
      {items.map((p, i) => (
        <button
          key={p.placeId}
          type="button"
          data-knav-index={i}
          className={`${predictionRow} ${
            keyboardNav.activeIndex === i ? predictionRowActive : ""
          }`}
          onMouseEnter={() => keyboardNav.setActiveIndex(i)}
          onClick={() => onSelect(p)}
        >
          <span className={predictionMain}>{p.mainText}</span>
          <span className={predictionSub}>{p.secondaryText}</span>
        </button>
      ))}
    </div>
  ) : null;

  return {
    visible,
    onInputKeyDown: keyboardNav.onKeyDown,
    containerRef,
    node,
  };
}
