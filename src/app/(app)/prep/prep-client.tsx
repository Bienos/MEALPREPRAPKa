"use client";

import { CookingMode } from "@/components/prep/cooking-mode";
import { DayPicker } from "@/components/prep/day-picker";
import { PrepComplete, type CreatedPortion } from "@/components/prep/prep-complete";
import { PrepResult } from "@/components/prep/prep-result";
import type { CookingStep } from "@/lib/meals/cooking-steps";
import type { DayType, PrepDayView, PrepItemView } from "@/lib/meals/prep-view-types";
import {
  alternativesAction,
  buildPrepAction,
  discardPrepAction,
  finishPrepAction,
  setCookingStepAction,
  startCookingAction,
  swapDishAction,
} from "./actions";

export type PrepStage =
  | { kind: "start"; days: PrepDayView[] }
  | {
      kind: "result";
      days: number;
      items: PrepItemView[];
      estimatedMinutes: number;
      fromFridge: number;
      shoppingCount: number;
      short: boolean;
    }
  | { kind: "cooking"; steps: CookingStep[]; currentStep: number }
  | { kind: "complete"; portions: CreatedPortion[] };

export function PrepClient({ stage }: { stage: PrepStage }) {
  if (stage.kind === "start") {
    return (
      <DayPicker
        initialDays={stage.days}
        onBuild={(days: { date: string; day_type: DayType }[]) => buildPrepAction(days)}
      />
    );
  }

  if (stage.kind === "result") {
    return (
      <PrepResult
        days={stage.days}
        items={stage.items}
        estimatedMinutes={stage.estimatedMinutes}
        fromFridge={stage.fromFridge}
        shoppingCount={stage.shoppingCount}
        short={stage.short}
        onStart={startCookingAction}
        onAlternatives={alternativesAction}
        onSwap={swapDishAction}
        onDiscard={discardPrepAction}
      />
    );
  }

  if (stage.kind === "cooking") {
    return (
      <CookingMode
        steps={stage.steps}
        initialStep={stage.currentStep}
        onStepChange={setCookingStepAction}
        onFinish={finishPrepAction}
      />
    );
  }

  return <PrepComplete portions={stage.portions} />;
}
