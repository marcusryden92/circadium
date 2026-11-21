import { forwardRef, type HTMLAttributes } from "react";
import { vars } from "@/lib/theme";
import { loaderTrack, loaderPill } from "./Loader.css";

type Props = HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "md" | "lg";
  color?: string;
  label?: string;
};

export const Loader = forwardRef<HTMLDivElement, Props>(function Loader(
  { size = "md", color, label = "Loading", className, ...rest },
  ref,
) {
  const cls = loaderTrack({ size });
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-busy="true"
      aria-label={label}
      className={className ? `${cls} ${className}` : cls}
      {...rest}
    >
      <div
        className={loaderPill}
        style={{ background: color ?? vars.ink }}
      />
    </div>
  );
});
