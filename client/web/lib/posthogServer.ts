const POSTHOG_API_HOST = "https://eu.posthog.com";

/**
 * Best-effort GDPR erasure of a user's PostHog person (and their events) by
 * distinct_id. No-op unless POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID
 * are set; never throws — analytics cleanup must not block account deletion.
 */
export async function deletePosthogPerson(distinctId: string): Promise<void> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return;

  const headers = { Authorization: `Bearer ${apiKey}` };
  try {
    const lookup = await fetch(
      `${POSTHOG_API_HOST}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`,
      { headers },
    );
    if (!lookup.ok) return;
    const data = (await lookup.json()) as { results?: Array<{ id: string }> };
    for (const person of data.results ?? []) {
      await fetch(
        `${POSTHOG_API_HOST}/api/projects/${projectId}/persons/${person.id}/?delete_events=true`,
        { method: "DELETE", headers },
      );
    }
  } catch (err) {
    console.error("PostHog person deletion failed:", err);
  }
}
