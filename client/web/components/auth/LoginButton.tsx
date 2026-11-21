"use client";

import { useRouter } from "next/navigation";

interface LoginButtonProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export const LoginButton = ({ children }: LoginButtonProps) => {
  const router = useRouter();
  return (
    <span
      onClick={() => router.push("/auth/login")}
      style={{ cursor: "pointer" }}
    >
      {children}
    </span>
  );
};
