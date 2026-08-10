import type Anthropic from "@anthropic-ai/sdk";
import type { TurnState } from "../turnState";
import { handleGetGoalTrees, handleSearchItems } from "./reading";
import {
  handleAddItems,
  handleDeleteItems,
  handleMoveItem,
  handleUpdateItems,
} from "./items";
import {
  handleAddTemplates,
  handleDeleteTemplates,
  handleUpdateTemplates,
} from "./templates";
import {
  handleAddCategories,
  handleAddTimeWindows,
  handleDeleteCategories,
  handleDeleteTimeWindows,
  handleUpdateCategories,
  handleUpdateTimeWindows,
} from "./categories";
import {
  handleAddDependencies,
  handleAddQueueMembers,
  handleAddQueues,
  handleDeleteQueues,
  handleMoveQueueMember,
  handleRemoveDependencies,
  handleRemoveQueueMembers,
  handleUpdateQueues,
} from "./precedence";
import {
  handleAddHabitBuckets,
  handleAddHabitItems,
  handleAddHabits,
  handleDeleteHabitBuckets,
  handleDeleteHabits,
  handleRemoveHabitItems,
  handleUpdateHabitBuckets,
  handleUpdateHabits,
} from "./habits";
import { handleProposeGoals } from "./goals";
import {
  handleDemoteItem,
  handlePromoteItem,
  handleTriageItems,
  handleUpdateSchedulingSettings,
} from "./structure";

// Route one tool call to its handler and return the tool_result content. The
// handler mutates the shared turn state and mirrors changes to the caller via
// state.send; show_goals does its work during streaming (content_block_stop),
// so it falls through to the default here.
export function executeTool(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  switch (tu.name) {
    case "get_goal_trees":
      return handleGetGoalTrees(state, tu);
    case "search_items":
      return handleSearchItems(state, tu);
    case "update_items":
      return handleUpdateItems(state, tu);
    case "move_item":
      return handleMoveItem(state, tu);
    case "add_items":
      return handleAddItems(state, tu);
    case "delete_items":
      return handleDeleteItems(state, tu);
    case "add_templates":
      return handleAddTemplates(state, tu);
    case "update_templates":
      return handleUpdateTemplates(state, tu);
    case "delete_templates":
      return handleDeleteTemplates(state, tu);
    case "add_time_windows":
      return handleAddTimeWindows(state, tu);
    case "update_time_windows":
      return handleUpdateTimeWindows(state, tu);
    case "delete_time_windows":
      return handleDeleteTimeWindows(state, tu);
    case "add_categories":
      return handleAddCategories(state, tu);
    case "update_categories":
      return handleUpdateCategories(state, tu);
    case "delete_categories":
      return handleDeleteCategories(state, tu);
    case "add_queues":
      return handleAddQueues(state, tu);
    case "update_queues":
      return handleUpdateQueues(state, tu);
    case "delete_queues":
      return handleDeleteQueues(state, tu);
    case "add_queue_members":
      return handleAddQueueMembers(state, tu);
    case "move_queue_member":
      return handleMoveQueueMember(state, tu);
    case "remove_queue_members":
      return handleRemoveQueueMembers(state, tu);
    case "add_dependencies":
      return handleAddDependencies(state, tu);
    case "remove_dependencies":
      return handleRemoveDependencies(state, tu);
    case "add_habit_buckets":
      return handleAddHabitBuckets(state, tu);
    case "update_habit_buckets":
      return handleUpdateHabitBuckets(state, tu);
    case "delete_habit_buckets":
      return handleDeleteHabitBuckets(state, tu);
    case "add_habits":
      return handleAddHabits(state, tu);
    case "update_habits":
      return handleUpdateHabits(state, tu);
    case "delete_habits":
      return handleDeleteHabits(state, tu);
    case "add_habit_items":
      return handleAddHabitItems(state, tu);
    case "remove_habit_items":
      return handleRemoveHabitItems(state, tu);
    case "propose_goals":
      return handleProposeGoals(state, tu);
    case "promote_item":
      return handlePromoteItem(state, tu);
    case "demote_item":
      return handleDemoteItem(state, tu);
    case "triage_items":
      return handleTriageItems(state, tu);
    case "update_scheduling_settings":
      return handleUpdateSchedulingSettings(state, tu);
    default:
      return "Goals displayed.";
  }
}
