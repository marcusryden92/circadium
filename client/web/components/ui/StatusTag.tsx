import { forwardRef, type HTMLAttributes } from "react";
import { statusTag } from "@/lib/theme";
import { vars } from "@/lib/theme";

type Tone = "late" | "overdue" | "fail" | "ok" | "info";

const toneColor: Record<Tone, string> = {
  late: vars.status.warning,
  overdue: vars.status.error,
  fail: vars.status.error,
  ok: vars.status.success,
  info: vars.status.info,
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone: Tone;
};

export const StatusTag = forwardRef<HTMLSpanElement, Props>(function StatusTag(
  { tone, className, style, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={className ? `${statusTag} ${className}` : statusTag}
      style={{ color: toneColor[tone], ...style }}
      {...rest}
    />
  );
});
