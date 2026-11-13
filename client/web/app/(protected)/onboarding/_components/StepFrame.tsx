"use client";

import type { ReactNode } from "react";
import {
  frameWrap,
  card,
  cardWide,
  topRow,
  progress,
  segment,
  segmentFilled,
  skipLink,
  title as titleCls,
  subtitle as subtitleCls,
  body,
  footer,
} from "../onboarding.css";

type StepFrameProps = {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onSkip?: () => void;
  skipDisabled?: boolean;
  // Breaks out of the narrow form width — used by the embedded AI step's
  // split-pane workspace.
  wide?: boolean;
};

export function StepFrame({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  children,
  footer: footerNode,
  onSkip,
  skipDisabled = false,
  wide = false,
}: StepFrameProps) {
  return (
    <div className={frameWrap}>
      <div className={wide ? `${card} ${cardWide}` : card}>
        <div className={topRow}>
          <div className={progress}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`${segment} ${i <= stepIndex ? segmentFilled : ""}`}
              />
            ))}
          </div>
          {onSkip && (
            <button
              type="button"
              className={skipLink}
              onClick={onSkip}
              disabled={skipDisabled}
            >
              Skip
            </button>
          )}
        </div>

        <div>
          <h1 className={titleCls}>{title}</h1>
          {subtitle && <p className={subtitleCls}>{subtitle}</p>}
        </div>

        <div className={body}>{children}</div>

        <div className={footer}>{footerNode}</div>
      </div>
    </div>
  );
}
