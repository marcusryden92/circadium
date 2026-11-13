"use client";

import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { vars, colorMixAlpha } from "@/lib/theme";
import {
  TRESPASS_BORDER_COLOR,
  TRESPASS_BORDER_WIDTH,
} from "../trespassBorderStyles";
import { wrapper, stripeSvg } from "./CategoryWrapperEvent.css";

interface CategoryWrapperEventProps {
  categoryId: string;
  categoryName: string;
  categoryColor?: string | null;
  isStrict: boolean;
  start: Date;
  end: Date;
  wrapperId: string;
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
}

export function CategoryWrapperEvent({
  categoryId: _categoryId,
  categoryName,
  categoryColor,
  isStrict,
  start: _start,
  end: _end,
  wrapperId: _wrapperId,
  trespassingStart = false,
  trespassingEnd = false,
}: CategoryWrapperEventProps) {
  const accent = categoryColor || vars.accent.primary;
  const stripeColor = `color-mix(in srgb, ${accent} ${colorMixAlpha.selectedFill}%, transparent)`;
  const fillTint = `color-mix(in srgb, ${accent} 12%, transparent)`;
  const trespassPx = `${TRESPASS_BORDER_WIDTH}px`;

  // SVG pattern instead of repeating-linear-gradient: gradients render the
  // stripe alpha at sub-pixel offsets along the 45° axis, which beats the
  // pattern up visually. patternTransform rotates a clean vertical stripe and
  // tiles it across the rect — perpendicular spacing is exact.
  const patternId = useId();
  const period = isStrict ? 6 : 8;
  const stripeWidth = 2;

  // Shift the pattern by the tile's document-relative position so adjacent
  // tiles for the same category share an origin in document coords — stripes
  // line up across day boundaries instead of restarting per element.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [docOffset, setDocOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const measure = () => {
      const node = wrapperRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setDocOffset({
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const patternTransform = docOffset
    ? `translate(${-docOffset.x}, ${-docOffset.y}) rotate(135)`
    : "rotate(135)";

  return (
    <div
      ref={wrapperRef}
      className={wrapper}
      // Read by the calendar's cursor hit-test (page.tsx) so the header chip
      // reflects this window even when a foreground tile is painted over it.
      data-hover-window=""
      data-hover-name={categoryName}
      data-hover-color={categoryColor ?? ""}
      style={{
        background: fillTint,
        ...(trespassingStart && {
          borderTop: `${trespassPx} solid ${TRESPASS_BORDER_COLOR}`,
        }),
        ...(trespassingEnd && {
          borderBottom: `${trespassPx} solid ${TRESPASS_BORDER_COLOR}`,
        }),
      }}
    >
      <svg aria-hidden className={stripeSvg}>
        <defs>
          <pattern
            id={patternId}
            width={period}
            height={period}
            patternUnits="userSpaceOnUse"
            patternTransform={patternTransform}
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={period}
              stroke={stripeColor}
              strokeWidth={stripeWidth}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
