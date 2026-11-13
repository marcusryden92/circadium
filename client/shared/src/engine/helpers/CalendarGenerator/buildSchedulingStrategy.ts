/**
 * Scheduling Strategy Builder
 *
 * Builds the composite scheduling strategy with configured weights
 */

import {
  CompositeStrategy,
  SchedulingStrategy,
} from "../../strategies/SchedulingStrategy";
import { EarliestSlotStrategy } from "../../strategies/EarliestSlotStrategy";
import { LocationGroupingStrategy } from "../../strategies/LocationGroupingStrategy";
import { FitTightnessStrategy } from "../../strategies/FitTightnessStrategy";
import { DEFAULT_STRATEGY_WEIGHTS } from "../../strategies/defaultStrategy";
import { StrategyConfig } from "../../models/SchedulingModels";

export function buildSchedulingStrategy(
  config?: StrategyConfig,
): CompositeStrategy {
  const strategies: Array<{ strategy: SchedulingStrategy; weight: number }> = [
    {
      strategy: new EarliestSlotStrategy(),
      weight:
        config?.strategyWeights?.earliestSlot ??
        DEFAULT_STRATEGY_WEIGHTS.earliestSlot,
    },
    {
      strategy: new FitTightnessStrategy(),
      weight:
        config?.strategyWeights?.fitTightness ??
        DEFAULT_STRATEGY_WEIGHTS.fitTightness,
    },
  ];

  // Add location grouping strategy if travel time matrix is provided
  if (config?.travelTimeMatrix && config.travelTimeMatrix.size > 0) {
    strategies.push({
      strategy: new LocationGroupingStrategy(
        config.travelTimeMatrix,
        config.locationGroupingScores,
        config.locationGroupingPenalties,
      ),
      weight:
        config?.strategyWeights?.locationGrouping ??
        DEFAULT_STRATEGY_WEIGHTS.locationGrouping,
    });
  }

  return new CompositeStrategy(strategies);
}
