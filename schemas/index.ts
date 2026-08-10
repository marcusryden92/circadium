import * as z from "zod";
import { UserRole } from "@/generated/client";

export const SettingsSchema = z
  .object({
    name: z.optional(z.string()),
    isTwoFactorEnabled: z.optional(z.boolean()),
    role: z.enum([UserRole.ADMIN, UserRole.USER]),
    email: z.optional(z.string().email()),
    password: z.optional(z.string().min(6)),
    newPassword: z.optional(z.string().min(6)),
    confirmNewPassword: z.optional(z.string().min(6)),
  })
  .refine(
    (data) => {
      if (data.password && !data.newPassword) {
        return false;
      }

      return true;
    },
    { message: "New password is required!", path: ["newPassword"] }
  )
  .refine(
    (data) => {
      if (data.newPassword && !data.password) {
        return false;
      }

      return true;
    },
    { message: "Password is required!", path: ["password"] }
  )
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match!",
    path: ["confirmNewPassword"],
  });

export const LoginSchema = z.object({
  email: z.string().email({ message: "Email invalid." }),
  password: z.string().min(1, {
    message: "Password required.",
  }),
  code: z.optional(z.string()),
});

export const ResetSchema = z.object({
  email: z.string().email({ message: "Email is required." }),
});

export const NewPasswordSchema = z
  .object({
    password: z.string().min(6, {
      message: "Minimum 6 characters required",
    }),
    confirmPassword: z.string().min(6, {
      message: "Minimum 6 characters required",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const RegisterSchema = z
  .object({
    email: z.string().email({ message: "Email invalid." }),
    password: z.string().min(6, {
      message: "Minimum 6 characters required.",
    }),
    passwordConfirmation: z.string().min(6, {
      message: "Password confirmation must be at least 6 characters.",
    }),
    name: z.string().min(1, { message: "Name is required." }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords don't match!",
    path: ["passwordConfirmation"], // Show error under password confirmation field
  });

export const FeedbackMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, { message: "Tell us a bit more — at least 10 characters." })
    .max(5000, { message: "Maximum 5000 characters." }),
  includeSnapshot: z.boolean(),
});

export const SuggestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: "Give the suggestion a short title." })
    .max(120, { message: "Maximum 120 characters." }),
  body: z
    .string()
    .trim()
    .max(2000, { message: "Maximum 2000 characters." })
    .optional(),
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
