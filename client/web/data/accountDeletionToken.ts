import { db } from "@/lib/db";

export const getAccountDeletionTokenByToken = async (token: string) => {
  try {
    return await db.accountDeletionToken.findUnique({ where: { token } });
  } catch {
    return null;
  }
};

export const getAccountDeletionTokenByUserId = async (userId: string) => {
  try {
    return await db.accountDeletionToken.findUnique({ where: { userId } });
  } catch {
    return null;
  }
};
