import * as dotenv from "dotenv";
dotenv.config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";

// Wipes every row from every application table while leaving the schema and
// the _prisma_migrations history untouched, so migrations are NOT re-run.
// TRUNCATE ... CASCADE handles foreign-key order for us, and RESTART IDENTITY
// resets any serial counters. Deriving the table list from the catalog (rather
// than a hand-maintained delete list like seed.ts uses) means it can never
// drift out of sync with the schema.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    console.log("No application tables found — nothing to clear.");
    return;
  }

  const list = tables
    .map((t) => `"public"."${t.tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );

  console.log(`Cleared ${tables.length} tables (schema + migrations intact).`);
}

main()
  .catch((error) => {
    console.error("Clear failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
