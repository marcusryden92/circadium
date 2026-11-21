"use client";

import { useEffect, useState } from "react";
import type { Score } from "@zxcvbn-ts/core";

import { loadPasswordCheck, type PasswordCheck } from "@/lib/passwordStrength";
import { MIN_PASSWORD_LENGTH, passwordLength } from "@/schemas";
import { bar, bars, caption, filled, meter } from "./PasswordStrength.css";

type Level = keyof typeof filled;

const LEVELS: Record<Score, { level: Level; segments: number; label: string }> =
  {
    0: { level: "weak", segments: 1, label: "Weak" },
    1: { level: "weak", segments: 1, label: "Weak" },
    2: { level: "fair", segments: 2, label: "Fair" },
    3: { level: "good", segments: 3, label: "Good" },
    4: { level: "strong", segments: 4, label: "Strong" },
  };

interface PasswordStrengthProps {
  password: string;
  /** The user's own details (email, name), which make a password easy to guess. */
  userInputs?: string[];
}

/**
 * How guessable a new password is, shown under the field while it is typed.
 * Until the dictionaries load (or if they fail to) it shows the length rule
 * only, which is also the one the server enforces.
 */
export function PasswordStrength({ password, userInputs = [] }: PasswordStrengthProps) {
  const [check, setCheck] = useState<PasswordCheck | null>(null);

  useEffect(() => {
    let active = true;
    loadPasswordCheck()
      .then((loaded) => {
        if (active) setCheck(() => loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!password) return null;

  const length = passwordLength(password);
  const tooShort = length < MIN_PASSWORD_LENGTH;
  const result = check ? check(password, userInputs.filter(Boolean)) : null;
  const strength = result ? LEVELS[result.score] : null;
  const segments = tooShort ? Math.min(strength?.segments ?? 1, 1) : (strength?.segments ?? 0);
  const level: Level = tooShort ? "weak" : (strength?.level ?? "weak");

  let text: string;
  if (tooShort) {
    text = `${length} of ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (!strength) {
    text = "Long enough.";
  } else {
    text = `Strength: ${strength.label}.`;
  }
  const warning = result && result.score < 3 ? result.feedback.warning : null;

  return (
    <div className={meter}>
      <div className={bars} aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={index < segments ? `${bar} ${filled[level]}` : bar}
          />
        ))}
      </div>
      <span className={caption} role="status" aria-live="polite">
        {warning ? `${text} ${warning}` : text}
      </span>
    </div>
  );
}
