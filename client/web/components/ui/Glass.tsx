import { forwardRef, type HTMLAttributes } from "react";
import { glass, type GlassVariants } from "@/lib/theme";

type Props = HTMLAttributes<HTMLDivElement> & GlassVariants;

export const Glass = forwardRef<HTMLDivElement, Props>(function Glass(
  { fill, radius, shadow, className, ...rest },
  ref,
) {
  const cls = glass({ fill, radius, shadow });
  return (
    <div
      ref={ref}
      className={className ? `${cls} ${className}` : cls}
      {...rest}
    />
  );
});
