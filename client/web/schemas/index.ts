import * as z from "zod";

// The same limits the Java API enforces, checked here first so a mistake is
// shown next to its field instead of as a rejected request.
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
// bcrypt reads only the first 72 bytes, so longer passwords would silently
// share a hash. Bytes, not characters: accents and emoji take several.
const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Characters (not UTF-16 units), with each run of spaces counted once, as the
 * Java API counts them: padding a short password with spaces does not make it
 * long.
 */
export function passwordLength(value: string): number {
  return [...value.replace(/ {2,}/g, " ")].length;
}

/** For setting a password. Signing in accepts older, shorter ones. */
const newPassword = z
  .string()
  .refine((value) => passwordLength(value) >= MIN_PASSWORD_LENGTH, {
    message: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  .refine(
    (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
    {
      message:
        "Too long: at most 72 characters, fewer with accents or emoji.",
    },
  );

const email = z
  .string()
  .trim()
  .email({ message: "Email invalid." })
  .max(MAX_EMAIL_LENGTH, { message: "Email too long." });

/**
 * The profile fields the web still writes itself. Email and two-factor
 * changes need the current password and go through the Java API.
 */
export const EmailChangeSchema = z.object({
  currentPassword: z
    .string()
    .min(1, { message: "Enter your current password." })
    .max(256, { message: "Current password too long." }),
  newEmail: email,
});

/** The current password may be an older, shorter one. */
export const PasswordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: "Enter your current password." })
      .max(256, { message: "Current password too long." }),
    newPassword,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords don't match.",
    path: ["confirmNewPassword"],
  });

export const LoginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { message: "Password required." })
    .max(256, { message: "Password too long." }),
  code: z.optional(z.string()),
});

/** The emailed sign-in code. */
export const TwoFactorCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { message: "Enter the 6-digit code from the email." });

export const ResetSchema = z.object({
  email,
});

export const NewPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const RegisterSchema = z
  .object({
    email,
    password: newPassword,
    passwordConfirmation: z.string(),
    name: z
      .string()
      .trim()
      .min(1, { message: "Name is required." })
      .max(MAX_NAME_LENGTH, { message: "At most 100 characters." }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords do not match.",
    path: ["passwordConfirmation"],
  });

// Schemas for creating tasks:

export const TaskListSchema = z.object({
  title: z
    .string()
    .min(1, {
      message: "Input required.",
    })
    .max(200, {
      message: "Maximum 200 characters.",
    }),
});
