import { Category, EngineMessage, Planner, Queue } from "@/types/prisma";
import {
  buildEngineMessageLookups,
  renderEngineMessage,
} from "@/utils/renderEngineMessage";
import { useMemo } from "react";
import {
  plannerIdFromPayload,
  plannerSubjectIdsFromPayload,
} from "@/utils/renderEngineMessage";
import { getRootParentId, getTaskTreeIds } from "@/utils/goalPageHandlers";
import { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";

export default function useRenderEngineMessages(
  planner: Planner[],
  locations: SerializedLocation[],
  queues: Queue[],
  categories: Category[],
  engineMessages: EngineMessage[],
  bufferMinutes: number,
  filterId?: string,
) {
  const { active, dismissed } = useMemo(() => {
    const lookups = buildEngineMessageLookups(
      planner,
      locations,
      queues,
      categories,
    );
    // renderEngineMessage returns null for payload shapes we don't recognize
    // (e.g. a persisted row from a newer client version). Drop those rather
    // than showing an undefined card — no signal is better than a crash.
    const render = (m: EngineMessage) => {
      const rendered = renderEngineMessage(m, lookups, bufferMinutes);
      if (!rendered) return [];
      // Match the calendar popover's item navigation: a root opens its item
      // page; a subtask opens its ROOT's subtasks tree with the edit drawer
      // focused on it — a leaf-only page would be uninformative, and the
      // root overview would leave the user hunting for the leaf.
      const leafId = plannerIdFromPayload(m.payload);
      const rootId = leafId
        ? (getRootParentId(planner, leafId) ?? leafId)
        : null;
      const drillHref =
        leafId && rootId
          ? rootId === leafId
            ? `/items/${rootId}`
            : `/items/${rootId}/subtasks?focus=${leafId}`
          : null;
      return [
        {
          ...rendered,
          drillHref,
          subjectIds: plannerSubjectIdsFromPayload(m.payload),
        },
      ];
    };
    // Dismissed rows stay in the array (so the engine can carry the flag
    // forward on the next regen) and render into their own list so the
    // consoles can offer a restore path.
    return {
      active: engineMessages.filter((m) => !m.dismissed).flatMap(render),
      dismissed: engineMessages.filter((m) => m.dismissed).flatMap(render),
    };
  }, [engineMessages, planner, locations, queues, categories, bufferMinutes]);

  // Item-page filter: a message belongs to the viewed item when any planner
  // it references sits in the item's subtree — a goal's alerts include every
  // leaf under it, not just rows that name the root itself.
  return useMemo(() => {
    if (!filterId) return { messages: active, dismissed };
    const treeIds = new Set(getTaskTreeIds(planner, filterId));
    const inTree = (m: { subjectIds: string[] }) =>
      m.subjectIds.some((id) => treeIds.has(id));
    return {
      messages: active.filter(inTree),
      dismissed: dismissed.filter(inTree),
    };
  }, [active, dismissed, planner, filterId]);
}
