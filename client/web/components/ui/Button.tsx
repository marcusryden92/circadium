import { forwardRef, type ButtonHTMLAttributes } from "react";
import { pillBtn, type PillBtnVariants } from "@/lib/theme";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & PillBtnVariants;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size, className, type = "button", ...rest },
  ref,
) {
  const cls = pillBtn({ variant, size });
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `${cls} ${className}` : cls}
      {...rest}
    />
  );
});
