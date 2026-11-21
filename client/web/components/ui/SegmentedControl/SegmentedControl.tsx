"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  segmentedControl,
  segmentedThumb,
  segmentedButton,
} from "./SegmentedControl.css";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type SegmentedOption<T extends string> = {
  key: T;
  label: ReactNode;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  const n = options.length;
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(
    null,
  );
  const [animate, setAnimate] = useState(false);

  // The thumb hugs the active segment's real width, so each label keeps the
  // same padding instead of every segment being forced to an equal half.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const buttons =
        root.querySelectorAll<HTMLButtonElement>("[data-seg-btn]");
      const btn = buttons[activeIdx];
      if (!btn) return;
      const border = parseFloat(getComputedStyle(root).borderLeftWidth) || 0;
      setThumb({ left: btn.offsetLeft - border, width: btn.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root
      .querySelectorAll<HTMLButtonElement>("[data-seg-btn]")
      .forEach((b) => observer.observe(b));
    return () => observer.disconnect();
  }, [activeIdx, n]);

  // Skip the transition on the first positioning so the thumb appears in place
  // instead of sliding in from the left edge on mount.
  useEffect(() => {
    if (!thumb || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [thumb, animate]);

  return (
    <div
      ref={rootRef}
      className={segmentedControl}
      style={{ gridTemplateColumns: `repeat(${n}, auto)` }}
    >
      <span
        className={segmentedThumb}
        aria-hidden
        style={
          thumb
            ? {
                width: thumb.width,
                transform: `translateX(${thumb.left}px)`,
                transition: animate ? undefined : "none",
              }
            : { opacity: 0 }
        }
      />
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          data-seg-btn
          className={segmentedButton}
          data-active={o.key === value}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
