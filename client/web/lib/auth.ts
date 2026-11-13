import { auth } from "@/auth";
import { UserRole } from "@/generated/client";

export const currentUser = async () => {
  const session = await auth();

  return session?.user;
};

export const currentRole = async () => {
  const session = await auth();

  return session?.user?.role as UserRole;
};
