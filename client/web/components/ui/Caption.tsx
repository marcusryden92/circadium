import { forwardRef, type HTMLAttributes } from "react";
import { caption } from "@/lib/theme";

type Props = HTMLAttributes<HTMLSpanElement>;

export const Caption = forwardRef<HTMLSpanElement, Props>(function Caption(
  { className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={className ? `${caption} ${className}` : caption}
      {...rest}
    />
  );
});
