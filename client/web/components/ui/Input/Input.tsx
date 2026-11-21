"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { formInput, type FormInputVariants } from "@/lib/theme";

type Props = InputHTMLAttributes<HTMLInputElement> & FormInputVariants;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { variant, scale, className, ...rest },
  ref,
) {
  const cls = formInput({ variant, scale });
  return (
    <input
      ref={ref}
      className={className ? `${cls} ${className}` : cls}
      {...rest}
    />
  );
});
