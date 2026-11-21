"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function completeOnboarding(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.user.update({
    where: { id: session.user.id },
    data: { onboardedAt: new Date() },
  });
}
