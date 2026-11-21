"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { formInput, type FormInputVariants } from "@/lib/theme";
import { toggle, withToggle, wrapper } from "./PasswordInput.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> &
  FormInputVariants;

/**
 * A password field whose button shows what was typed, so a long password can
 * be checked before it is sent. Paste and password managers work as in any
 * field. While shown, spellcheck stays off: some browsers send checked text
 * to a cloud service.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ variant, scale, className, disabled, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const inputClass = [formInput({ variant, scale }), withToggle, className]
      .filter(Boolean)
      .join(" ");

    return (
      <span className={wrapper}>
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={inputClass}
          disabled={disabled}
          {...rest}
        />
        <button
          type="button"
          className={toggle}
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    );
  },
);
