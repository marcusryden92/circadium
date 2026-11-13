import { forwardRef, type HTMLAttributes } from "react";
import { radii, progressTrack, categoryGradient, progressTransition } from "@/lib/theme";

type Props = HTMLAttributes<HTMLDivElement> & {
  value: number;
  max?: number;
  color: string;
  size?: "sm" | "md" | "lg";
  ticks?: number[];
};

export const ProgressBar = forwardRef<HTMLDivElement, Props>(
  function ProgressBar(
    {
      value,
      max = 100,
      color,
      size = "md",
      ticks,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const cls = progressTrack({ size });
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={className ? `${cls} ${className}` : cls}
        style={style}
        {...rest}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: categoryGradient(color),
            borderRadius: radii["pill"],
            transition: progressTransition,
          }}
        />
        {ticks?.map((t) => {
          const pos = Math.max(0, Math.min(100, (t / max) * 100));
          return (
            <span
              key={t}
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${pos}%`,
                width: 1,
                background: "rgba(255,255,255,0.8)",
              }}
            />
          );
        })}
      </div>
    );
  },
);
