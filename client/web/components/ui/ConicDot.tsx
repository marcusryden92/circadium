import { forwardRef, type HTMLAttributes } from "react";
import { radii, vars } from "@/lib/theme";

type Props = HTMLAttributes<HTMLSpanElement> & {
  size?: number;
};

export const ConicDot = forwardRef<HTMLSpanElement, Props>(function ConicDot(
  { size = 12, style, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: radii["pill"],
        background: `conic-gradient(from 210deg, ${vars.accent.primary}, ${vars.accent.now}, ${vars.accent.done}, ${vars.accent.primary})`,
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    />
  );
});
