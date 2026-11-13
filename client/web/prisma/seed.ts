import * as dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/client";

import { generateTemplates } from "./seed-helpers/generateTemplates";
import { generatePlanners } from "./seed-helpers/generatePlanners";
import { generatePlans } from "./seed-helpers/generatePlans";
import {
  generateLocations,
  generateTravelTimes,
} from "./seed-helpers/generateLocations";
import { generateCategories } from "./seed-helpers/generateCategories";

// Prisma 7 requires a driver adapter at construction time. Matches the
// pattern used by lib/db.ts so the seed talks to the DB the same way the app
// does. DIRECT_URL is preferred (bypasses pooling for bulk writes), falling
// back to DATABASE_URL.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Flip to true to seed ONLY the admin account: the demo dataset (and the
// clearing that precedes it) is skipped, leaving existing data untouched.
const SEED_USER_ONLY = false;

async function main() {
  const userId = "1";

  // Basic admin account so the app has a predictable login during development.
  const passwordHash = await bcrypt.hash("password", 10);

  // The demo dataset assumes a populated account, so skip first-run onboarding
  // and land straight on the dashboard. Set to null to exercise onboarding.
  const onboardedAt = new Date();

  await prisma.user.upsert({
    where: { email: "admin@circadium.app" },
    update: {
      name: "Jane Smith",
      // Demo data is seeded below, so skip first-run onboarding (which assumes
      // a blank calendar) and land straight on the dashboard with the dataset.
      onboardedAt: onboardedAt,
    },
    create: {
      id: userId,
      email: "admin@circadium.app",
      name: "Jane Smith",
      emailVerified: new Date(),
      password: passwordHash,
      role: UserRole.ADMIN,
      onboardedAt: onboardedAt,
    },
  });

  if (SEED_USER_ONLY) {
    console.log("Seeding completed: admin account only (SEED_USER_ONLY set).");
    console.log(
      `  - User: admin@circadium.app${onboardedAt !== null ? " (onboarded)" : ""}`,
    );
    return;
  }

  // Clear any existing calendar data so the reseed is a clean wholesale
  // replace. The admin is upserted rather than deleted, so every per-user
  // table the app reads (see fetchCalendarData) must be cleared explicitly
  // here — a table that only cascades on User delete would otherwise survive
  // the reseed. Order matters for foreign keys.
  //
  // Engine-derived output first. categoryEvents would cascade with their
  // Category but the explicit delete is cheap insurance; travelEvents would
  // otherwise be left with null location FKs when Location is dropped below
  // (onDelete: SetNull), producing orphans; simpleEvents (calendar) and
  // engineMessages only cascade on User delete.
  await prisma.categoryEvent.deleteMany({});
  await prisma.travelEvent.deleteMany({});
  await prisma.simpleEvent.deleteMany({}); // cascades EventExtendedProps
  await prisma.engineMessage.deleteMany({});
  // Precedence graph. QueueMembers and PlannerDependencies cascade from the
  // Planner delete below, but a Queue row has no Planner FK (it only cascades
  // on User delete), so stale queues would linger without this.
  await prisma.plannerDependency.deleteMany({});
  await prisma.queue.deleteMany({}); // cascades QueueMember
  // User-authored inputs.
  await prisma.planner.deleteMany({});
  await prisma.eventTemplate.deleteMany({});
  await prisma.category.deleteMany({}); // cascades CategoryTimeWindow
  await prisma.travelTime.deleteMany({});
  await prisma.location.deleteMany({});
  // AI-assistant chat history, so a reseeded account has no leftover chats.
  await prisma.draftConversation.deleteMany({});

  // Demo dataset. Order matters for foreign keys: locations before travel
  // times / categories / templates / planners that reference them, and
  // categories before the goals filed under them.
  const locations = generateLocations(userId);
  await prisma.location.createMany({ data: locations });

  const travelTimes = generateTravelTimes(userId);
  await prisma.travelTime.createMany({ data: travelTimes });

  const categories = generateCategories(userId);
  for (const category of categories) {
    await prisma.category.create({ data: category });
  }

  const templates = generateTemplates(userId);
  await prisma.eventTemplate.createMany({ data: templates });

  const planners = generatePlanners(userId);
  await prisma.planner.createMany({ data: planners });

  const plans = generatePlans(userId);
  await prisma.planner.createMany({ data: plans });

  console.log("Seeding completed: admin account + demo calendar dataset.");
  console.log(`  - User: admin@circadium.app (onboarded)`);
  console.log(
    `  - ${locations.length} locations, ${travelTimes.length} travel times, ${categories.length} categories`,
  );
  console.log(
    `  - ${templates.length} templates, ${planners.length} planner rows (goals + subtasks), ${plans.length} plans`,
  );
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
