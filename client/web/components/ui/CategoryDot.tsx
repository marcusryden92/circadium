import { forwardRef, type HTMLAttributes } from "react";
import { radii, categoryGlow } from "@/lib/theme";

type Props = HTMLAttributes<HTMLSpanElement> & {
  color: string;
  size?: number;
  glow?: boolean;
};

export const CategoryDot = forwardRef<HTMLSpanElement, Props>(
  function CategoryDot(
    { color, size = 9, glow = true, style, ...rest },
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
          background: color,
          boxShadow: glow ? categoryGlow(color) : undefined,
          flexShrink: 0,
          ...style,
        }}
        {...rest}
      />
    );
  },
);
