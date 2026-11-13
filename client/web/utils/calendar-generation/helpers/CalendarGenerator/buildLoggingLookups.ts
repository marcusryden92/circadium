import { Category, SimpleEvent } from "@/types/prisma";
import type { RecorderLookups } from "../../utils/RecorderBase";

export function buildLoggingLookups(
  categories: Category[],
  events: SimpleEvent[],
): RecorderLookups {
  return {
    categoryById: new Map(categories.map((c) => [c.id, c])),
    eventTitleById: new Map(events.map((e) => [e.id, e.title])),
  };
}
