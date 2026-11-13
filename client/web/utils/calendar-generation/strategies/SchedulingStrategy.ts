/**
 * SchedulingStrategy
 *
 * Base interface for scheduling strategies.
 * Strategies score time slots based on different criteria.
 */

import { Planner } from "@/types/prisma";
import { PlaceableSlot } from "../models/TimeSlot";
import { SchedulingContext } from "../models/SchedulingModels";

/**
 * Base interface for all scheduling strategies
 */
export interface SchedulingStrategy {
  /**
   * Unique identifier for the strategy
   */
  readonly name: string;

  /**
   * Score a time slot for a given task
   * @param task The task to schedule
   * @param slot The potential time slot
   * @param context Additional scheduling context
   * @returns Score from 0.0 to 1.0 (higher is better)
   */
  score(task: Planner, slot: PlaceableSlot, context: SchedulingContext): number;
}

/**
 * Composite strategy that combines multiple strategies with weights
 */
export class CompositeStrategy implements SchedulingStrategy {
  readonly name = "composite";

  constructor(
    private strategies: Array<{
      strategy: SchedulingStrategy;
      weight: number;
    }>
  ) {}

  score(task: Planner, slot: PlaceableSlot, context: SchedulingContext): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const { strategy, weight } of this.strategies) {
      const strategyScore = strategy.score(task, slot, context);
      totalScore += strategyScore * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Get individual scores from each strategy (for debugging)
   */
  getDetailedScores(
    task: Planner,
    slot: PlaceableSlot,
    context: SchedulingContext
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const { strategy } of this.strategies) {
      scores[strategy.name] = strategy.score(task, slot, context);
    }

    return scores;
  }
}
