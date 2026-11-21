import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";

import { getVerificationTokenByEmail } from "@/data/verificationToken";

// userId is required for email-change verification: the token's email is the
// NEW address, which no user row has yet, so the consumer must resolve the
// user by id. Registration/login verification omits it (email matches a row).
export const generateVerificationToken = async (
  email: string,
  userId?: string,
) => {
  const token = uuidv4();
  const expires = new Date(new Date().getTime() + 3600 * 1000);

  const existingToken = await getVerificationTokenByEmail(email);

  if (existingToken) {
    await db.verificationToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  const verificationToken = await db.verificationToken.create({
    data: {
      email,
      token,
      expires,
      userId: userId ?? null,
    },
  });

  return verificationToken;
};
