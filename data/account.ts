import { db } from "@/lib/db";
import { retry } from "@/lib/retry";

export const getAccountByUserId = async (userId: string) => {
  try {
    return await retry(() =>
      db.account.findFirst({
        where: {
          userId,
        },
      }),
    );
  } catch {
    return null;
  }
};
