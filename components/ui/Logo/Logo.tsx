import type { CSSProperties, ElementType } from "react";
import { assignInlineVars } from "@vanilla-extract/dynamic";
import { vars } from "@/lib/theme";
import {
  root,
  mark,
  text as textStyle,
  textCollapsed,
  logoHeightVar,
  fontSizeVar,
  gapVar,
  toneVar,
  weightVar,
} from "./Logo.css";

// The mark is minimal enough that one asset serves every size (no simple variant).

// Canonical lockup proportions. Text and gap derive from the logo height so
// every Circadium wordmark shares one ratio regardless of size. Refined ~1.15x
// (logo sits just proud of the cap height).
const TEXT_RATIO = 0.86;
const GAP_RATIO = 0.3;

type LogoProps = {
  // Logo height: a px number, or any CSS length (e.g. a clamp() for responsive
  // lockups). Text size and gap scale from it.
  size?: number | string;
  // Tint for both the mark and the wordmark; defaults to ink.
  tone?: string;
  weight?: number;
  wordmark?: boolean;
  // Element for the wordmark text (e.g. "h1" on the auth card); defaults to span.
  textAs?: ElementType;
  // Folds the wordmark away while keeping the mark (Sidebar collapse).
  collapsed?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function Logo({
  size = 30,
  tone = vars.ink,
  weight = 400,
  wordmark = true,
  textAs: TextTag = "span",
  collapsed = false,
  title,
  className,
  style,
}: LogoProps) {
  const height = typeof size === "number" ? `${size}px` : size;
  const cssVars = assignInlineVars({
    [logoHeightVar]: height,
    [fontSizeVar]: `calc(${height} * ${TEXT_RATIO})`,
    [gapVar]: `calc(${height} * ${GAP_RATIO})`,
    [toneVar]: tone,
    [weightVar]: String(weight),
  });

  return (
    <div
      className={className ? `${root} ${className}` : root}
      style={{ ...cssVars, ...style }}
      title={title}
      aria-label={wordmark ? undefined : (title ?? "Circadium")}
    >
      <span className={mark} aria-hidden />
      {wordmark && (
        <TextTag
          className={collapsed ? `${textStyle} ${textCollapsed}` : textStyle}
        >
          Circadium
        </TextTag>
      )}
    </div>
  );
}
