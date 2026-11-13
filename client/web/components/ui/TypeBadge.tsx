import { forwardRef, type HTMLAttributes } from "react";
import { badge, type BadgeVariants } from "@/lib/theme";

type Props = HTMLAttributes<HTMLSpanElement> &
  Omit<BadgeVariants, "tone"> & {
    tone?: BadgeVariants["tone"];
  };

export const TypeBadge = forwardRef<HTMLSpanElement, Props>(function TypeBadge(
  { tone = "type", size, className, ...rest },
  ref,
) {
  const cls = badge({ tone, size });
  return (
    <span
      ref={ref}
      className={className ? `${cls} ${className}` : cls}
      {...rest}
    />
  );
});
