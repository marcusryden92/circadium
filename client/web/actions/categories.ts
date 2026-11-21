"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PlannerType } from "@/types/prisma";
import type { Category } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// ============================================================================
// Category CRUD Operations
// ============================================================================

type RawTimeWindowRow = { day: number; [k: string]: unknown };

function narrowTimeSlots<T extends RawTimeWindowRow>(
  slots: T[],
): (Omit<T, "day"> & { day: WeekDayIntegers })[] {
  return slots.map((ts) => ({
    ...ts,
    day: ts.day as WeekDayIntegers,
  }));
}

export async function fetchCategories(): Promise<Category[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const rows = await db.category.findMany({
    where: { userId: session.user.id },
    include: { timeSlots: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    timeSlots: narrowTimeSlots(row.timeSlots),
  }));
}

export async function fetchCategoryTree(): Promise<
  (Category & { children: Category[] })[]
> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const rows = await db.category.findMany({
    where: {
      userId: session.user.id,
      parentId: null,
    },
    include: {
      timeSlots: true,
      children: {
        include: { timeSlots: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    timeSlots: narrowTimeSlots(row.timeSlots),
    children: row.children.map((c) => ({
      ...c,
      timeSlots: narrowTimeSlots(c.timeSlots),
    })),
  }));
}

export async function fetchCategory(
  categoryId: string,
): Promise<Category | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const row = await db.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
    include: { timeSlots: true },
  });
  if (!row) return null;
  return { ...row, timeSlots: narrowTimeSlots(row.timeSlots) };
}

export async function fetchCategoryWithChildren(
  categoryId: string,
): Promise<(Category & { children: Category[] }) | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const row = await db.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
    include: {
      timeSlots: true,
      children: {
        include: { timeSlots: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!row) return null;
  return {
    ...row,
    timeSlots: narrowTimeSlots(row.timeSlots),
    children: row.children.map((c) => ({
      ...c,
      timeSlots: narrowTimeSlots(c.timeSlots),
    })),
  };
}

export async function createCategory(data: {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
  isStrict?: boolean;
  useTimeWindows?: boolean;
  locationId?: string | null;
}): Promise<Category> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (data.parentId) {
    const parent = await db.category.findFirst({
      where: { id: data.parentId, userId: session.user.id },
    });
    if (!parent) throw new Error("Parent category not found");
  }

  if (data.locationId) {
    const location = await db.location.findFirst({
      where: { id: data.locationId, userId: session.user.id },
    });
    if (!location) throw new Error("Location not found");
  }

  const maxSortOrder = await db.category.aggregate({
    where: {
      userId: session.user.id,
      parentId: data.parentId ?? null,
    },
    _max: { sortOrder: true },
  });

  const now = new Date().toISOString();

  const row = await db.category.create({
    data: {
      name: data.name,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId,
      isStrict: data.isStrict ?? false,
      useTimeWindows: data.useTimeWindows ?? false,
      locationId: data.locationId ?? null,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      userId: session.user.id,
      createdAt: now,
      updatedAt: now,
    },
    include: { timeSlots: true },
  });
  return { ...row, timeSlots: narrowTimeSlots(row.timeSlots) };
}

export async function updateCategory(
  categoryId: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    isStrict?: boolean;
    useTimeWindows?: boolean;
    locationId?: string | null;
  },
): Promise<Category> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const category = await db.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });

  if (!category) throw new Error("Category not found");

  if (data.locationId !== undefined && data.locationId !== null) {
    const location = await db.location.findFirst({
      where: { id: data.locationId, userId: session.user.id },
    });
    if (!location) throw new Error("Location not found");
  }

  const row = await db.category.update({
    where: { id: categoryId },
    data: {
      name: data.name,
      icon: data.icon,
      color: data.color,
      isStrict: data.isStrict,
      useTimeWindows: data.useTimeWindows,
      locationId: data.locationId,
      updatedAt: new Date().toISOString(),
    },
    include: { timeSlots: true },
  });
  return { ...row, timeSlots: narrowTimeSlots(row.timeSlots) };
}

export async function deleteCategory(
  categoryId: string,
  reassignToId?: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const category = await db.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });

  if (!category) throw new Error("Category not found");

  if (reassignToId) {
    const target = await db.category.findFirst({
      where: { id: reassignToId, userId: session.user.id },
    });
    if (!target) throw new Error("Target category not found");
  }

  await db.planner.updateMany({
    where: { categoryId, userId: session.user.id },
    data: { categoryId: reassignToId ?? null },
  });

  const childIds = await db.category.findMany({
    where: { parentId: categoryId, userId: session.user.id },
    select: { id: true },
  });

  if (childIds.length > 0) {
    await db.planner.updateMany({
      where: {
        categoryId: { in: childIds.map((c) => c.id) },
        userId: session.user.id,
      },
      data: { categoryId: reassignToId ?? null },
    });
  }

  await db.category.delete({ where: { id: categoryId } });
}

export async function moveCategory(
  categoryId: string,
  newParentId: string | null,
): Promise<Category> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const category = await db.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });

  if (!category) throw new Error("Category not found");

  if (newParentId === categoryId) throw new Error("Cannot move category to itself");

  if (newParentId) {
    const newParent = await db.category.findFirst({
      where: { id: newParentId, userId: session.user.id },
    });
    if (!newParent) throw new Error("Target parent category not found");

    let current = newParent;
    while (current.parentId) {
      if (current.parentId === categoryId) {
        throw new Error("Cannot move category to its own descendant");
      }
      const parent = await db.category.findFirst({
        where: { id: current.parentId, userId: session.user.id },
      });
      if (!parent) break;
      current = parent;
    }
  }

  const maxSortOrder = await db.category.aggregate({
    where: { userId: session.user.id, parentId: newParentId },
    _max: { sortOrder: true },
  });

  const row = await db.category.update({
    where: { id: categoryId },
    data: {
      parentId: newParentId,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      updatedAt: new Date().toISOString(),
    },
    include: { timeSlots: true },
  });
  return { ...row, timeSlots: narrowTimeSlots(row.timeSlots) };
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const now = new Date().toISOString();
  await Promise.all(
    orderedIds.map((id, index) =>
      db.category.updateMany({
        where: { id, userId: session.user.id },
        data: { sortOrder: index, updatedAt: now },
      }),
    ),
  );
}

// ============================================================================
// Planner Category Assignment
// ============================================================================

export async function assignCategoryToPlanner(
  plannerId: string,
  categoryId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const planner = await db.planner.findFirst({
    where: { id: plannerId, userId: session.user.id },
  });

  if (!planner) throw new Error("Planner item not found");

  if (categoryId) {
    const category = await db.category.findFirst({
      where: { id: categoryId, userId: session.user.id },
    });
    if (!category) throw new Error("Category not found");
  }

  const categoryHasLocation = categoryId
    ? !!(
        await db.category.findUnique({
          where: { id: categoryId },
          select: { locationId: true },
        })
      )?.locationId
    : false;

  const shouldInheritLocation = categoryHasLocation && !planner.locationId;

  await db.planner.update({
    where: { id: plannerId },
    data: {
      categoryId,
      ...(shouldInheritLocation && { useParentLocation: true }),
    },
  });

  if (planner.plannerType === PlannerType.goal && categoryHasLocation) {
    const allPlanners = await db.planner.findMany({
      where: { userId: session.user.id },
    });

    const { getTaskTreeIds } = await import("@/utils/goalPageHandlers");
    const descendantIds = getTaskTreeIds(allPlanners, plannerId);

    if (descendantIds.length > 0) {
      await db.planner.updateMany({
        where: { id: { in: descendantIds }, locationId: null },
        data: { useParentLocation: true },
      });
    }
  }
}

export async function assignCategoryToMultiplePlanners(
  plannerIds: string[],
  categoryId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (categoryId) {
    const category = await db.category.findFirst({
      where: { id: categoryId, userId: session.user.id },
    });
    if (!category) throw new Error("Category not found");
  }

  await db.planner.updateMany({
    where: { id: { in: plannerIds }, userId: session.user.id },
    data: { categoryId },
  });
}

// ============================================================================
// Category Stats
// ============================================================================

export async function fetchCategoryStats(): Promise<
  Map<string, { total: number; goals: number; tasks: number; plans: number }>
> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const stats = await db.planner.groupBy({
    by: ["categoryId", "plannerType"],
    where: { userId: session.user.id },
    _count: true,
  });

  const result = new Map<
    string,
    { total: number; goals: number; tasks: number; plans: number }
  >();

  for (const stat of stats) {
    const id = stat.categoryId ?? "uncategorized";
    const current = result.get(id) ?? { total: 0, goals: 0, tasks: 0, plans: 0 };
    current.total += stat._count;
    if (stat.plannerType === PlannerType.goal) current.goals += stat._count;
    if (stat.plannerType === PlannerType.task) current.tasks += stat._count;
    if (stat.plannerType === PlannerType.plan) current.plans += stat._count;
    result.set(id, current);
  }

  return result;
}

export async function fetchCategoriesWithCounts(): Promise<
  (Category & { _count: { planners: number } })[]
> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const rows = await db.category.findMany({
    where: { userId: session.user.id },
    include: {
      timeSlots: true,
      _count: { select: { planners: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    timeSlots: narrowTimeSlots(row.timeSlots),
  }));
}
