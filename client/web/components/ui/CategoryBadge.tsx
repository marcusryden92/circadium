import { forwardRef, type HTMLAttributes } from "react";
import { badge, colorMixAlpha, type BadgeVariants } from "@/lib/theme";

type Props = HTMLAttributes<HTMLSpanElement> &
  Omit<BadgeVariants, "tone"> & {
    color: string;
  };

export const CategoryBadge = forwardRef<HTMLSpanElement, Props>(
  function CategoryBadge(
    { color, size, className, style, children, ...rest },
    ref,
  ) {
    const cls = badge({ size });
    return (
      <span
        ref={ref}
        className={className ? `${cls} ${className}` : cls}
        // Outlined: the category color drives the border + text; the fill is
        // a thin tint of the same color so the pill still reads as belonging
        // to that category at a glance.
        style={{
          background: `color-mix(in srgb, ${color} ${colorMixAlpha.lightFill}%, transparent)`,
          color,
          border: `1px solid ${color}`,
          // Cap at 110 but never exceed the container, so a narrow field (the
          // item-detail Area cell) truncates the label instead of clipping the
          // pill's border.
          maxWidth: "min(110px, 100%)",
          minWidth: 0,
          ...style,
        }}
        {...rest}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            minWidth: 0,
          }}
        >
          {children}
        </span>
      </span>
    );
  },
);
