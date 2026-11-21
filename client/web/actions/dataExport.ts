"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// GDPR Article 15 (access) + Article 20 (portability): a machine-readable copy
// of everything the user has stored in Circadium. Secrets are deliberately
// excluded — password hashes, OAuth access/refresh tokens, the Google Calendar
// refresh token, and short-lived auth tokens are credentials, not the user's
// own data.
export async function exportUserData(): Promise<
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [
      profile,
      accounts,
      planners,
      simpleEvents,
      templates,
      categories,
      categoryEvents,
      travelEvents,
      engineMessages,
      locations,
      travelTimes,
      schedulingPreferences,
      taskPreferences,
      queues,
      dependencies,
      draftConversations,
      viewState,
      externalSources,
      externalEvents,
      googleConnection,
      microsoftConnection,
      occurrenceCompletions,
      habitBuckets,
      habits,
      habitItems,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          role: true,
          isTwoFactorEnabled: true,
          onboardedAt: true,
          aiMode: true,
        },
      }),
      // Linked sign-ins: provider identity only, never the stored tokens.
      db.account.findMany({
        where: { userId },
        select: { provider: true, type: true, providerAccountId: true },
      }),
      db.planner.findMany({ where: { userId } }),
      db.simpleEvent.findMany({
        where: { userId },
        include: { extendedProps: true },
      }),
      db.eventTemplate.findMany({ where: { userId } }),
      db.category.findMany({ where: { userId }, include: { timeSlots: true } }),
      db.categoryEvent.findMany({ where: { userId } }),
      db.travelEvent.findMany({ where: { userId } }),
      db.engineMessage.findMany({ where: { userId } }),
      db.location.findMany({ where: { userId } }),
      db.travelTime.findMany({ where: { userId } }),
      db.userSchedulingPreferences.findUnique({ where: { userId } }),
      // TaskPreferences is keyed by planner, not user; reach it through the
      // owning planner.
      db.taskPreferences.findMany({ where: { planner: { userId } } }),
      db.queue.findMany({ where: { userId }, include: { members: true } }),
      db.plannerDependency.findMany({ where: { userId } }),
      db.draftConversation.findMany({ where: { userId } }),
      db.userViewState.findUnique({ where: { userId } }),
      db.externalCalendarSource.findMany({ where: { userId } }),
      db.externalEvent.findMany({ where: { userId } }),
      // Connection state without the refresh token.
      db.googleCalendarConnection.findUnique({
        where: { userId },
        select: { email: true, createdAt: true, updatedAt: true },
      }),
      db.microsoftCalendarConnection.findUnique({
        where: { userId },
        select: { email: true, createdAt: true, updatedAt: true },
      }),
      db.occurrenceCompletion.findMany({ where: { userId } }),
      db.habitBucket.findMany({ where: { userId } }),
      db.habit.findMany({ where: { userId } }),
      db.habitItem.findMany({ where: { userId } }),
    ]);

    return {
      success: true,
      data: {
        meta: {
          exportedAt: new Date().toISOString(),
          format: "circadium.data-export.v1",
          note: "Your personal data held by Circadium. Credentials (passwords, access tokens) are intentionally excluded.",
        },
        profile,
        linkedSignIns: accounts,
        planners,
        calendarEvents: simpleEvents,
        weeklyTemplates: templates,
        categories,
        categoryEvents,
        travelEvents,
        engineMessages,
        locations,
        travelTimes,
        schedulingPreferences,
        taskPreferences,
        queues,
        dependencies,
        aiConversations: draftConversations,
        viewState,
        externalCalendarSources: externalSources,
        externalCalendarEvents: externalEvents,
        googleCalendarConnection: googleConnection,
        microsoftCalendarConnection: microsoftConnection,
        occurrenceCompletions,
        habitBuckets,
        habits,
        habitItems,
      },
    };
  } catch (error) {
    console.error("Failed to export user data:", error);
    return { success: false, error: "Failed to export your data" };
  }
}
