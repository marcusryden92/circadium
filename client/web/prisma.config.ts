import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "prisma/schemas",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node --project prisma/tsconfig.seed.json prisma/seed.ts",
  },
});
