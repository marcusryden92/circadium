import { SimpleEvent } from "@/types/prisma";
import { PerTemplateMask } from "../../models/TemplateModels";
import {
  CalendarGenerationInput,
  SchedulingFailure,
  SchedulingMetrics,
} from "../../models/SchedulingModels";
import { SchedulingStrategy } from "../../strategies/SchedulingStrategy";
import { TravelManager } from "../../core/TravelManager";
import { logCalendarDebugInfo } from "../../utils/loggingUtils";
import type { TravelPassRecorder } from "../TravelManager/TravelPassRecorder";
import type { SchedulerRecorder } from "../Scheduler/SchedulerRecorder";

export interface EmitDebugLogParams {
  allEvents: SimpleEvent[];
  recurringTemplateEvents: SimpleEvent[];
  perTemplateMasks: PerTemplateMask[];
  largestTemplateGap: number;
  plannerLocationMap: Map<string, string | null>;
  strategy: SchedulingStrategy;
  schedulingResult: {
    success: boolean;
    newEvents: SimpleEvent[];
    failures: SchedulingFailure[];
  };
  metrics: SchedulingMetrics;
  travelPassRecorder: TravelPassRecorder | null;
  schedulerRecorder: SchedulerRecorder | null;
}

export function emitDebugLog(
  input: CalendarGenerationInput,
  travelManager: TravelManager,
  params: EmitDebugLogParams,
): void {
  const travelEvents = travelManager.generateTravelEvents(input.userId);
  logCalendarDebugInfo(input, {
    allEvents: params.allEvents,
    travelEvents,
    recurringTemplateEvents: params.recurringTemplateEvents,
    perTemplateMasks: params.perTemplateMasks,
    largestTemplateGap: params.largestTemplateGap,
    plannerLocationMap: params.plannerLocationMap,
    strategies: [{ strategy: params.strategy, weight: 1.0 }],
    schedulingResult: params.schedulingResult,
    metrics: params.metrics,
    travelPassRecorder: params.travelPassRecorder,
    schedulerRecorder: params.schedulerRecorder,
  });
}
