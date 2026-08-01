import { db } from "@/lib/db";
import { retry } from "@/lib/retry";

export const getUserByEmail = async (email: string) => {
  try {
    return await retry(() => db.user.findUnique({ where: { email } }));
  } catch {
    return null;
  }
};

export const getUserById = async (id: string) => {
  try {
    return await retry(() => db.user.findUnique({ where: { id } }));
  } catch {
    return null;
  }
};
