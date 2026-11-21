"use client";

import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, ConfirmModal, useAiAccess } from "@/components/ui";
import { AiMode } from "@/generated/client";
import { AIDraftModal } from "@/components/draft/AIDraftModal";
import { AssistantGate } from "@/components/draft/AssistantGate";
import { StepFrame } from "../_components/StepFrame";
import { aiWorkspace, footerActions } from "../onboarding.css";

type AssistantState = {
  hasChanges: boolean;
  isStreaming: boolean;
  save: () => void;
};

// Embedded mode never closes through onClose (it finishes via onSaved / goes
// Back via the footer), but the modal folds onClose into handleSave's deps —
// an inline arrow here would churn handleSave every render and loop the
// onStateChange effect. A stable reference keeps that report loop-free.
const noopClose = () => {};

type OnboardingAIStepProps = {
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
  finishing: boolean;
  // The persisted conversation id from a previous visit to this step, so a
  // refresh mid-interview resumes the same chat; null starts fresh. Reported
  // back (or cleared on an explicit discard) via onConversationIdChange.
  resumeConversationId: string | null;
  onConversationIdChange: (id: string | null) => void;
};

export function OnboardingAIStep({
  stepIndex,
  totalSteps,
  onBack,
  onFinish,
  onSkip,
  finishing,
  resumeConversationId,
  onConversationIdChange,
}: OnboardingAIStepProps) {
  const { status: aiStatus, mode: aiModeValue, setMode } = useAiAccess();
  const [assistant, setAssistant] = useState<AssistantState>({
    hasChanges: false,
    isStreaming: false,
    save: () => {},
  });
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // BYOK opt-in gate: until this device is ready (opted in + key stored),
  // the step shows the key-entry panel instead of mounting the assistant —
  // which also keeps the auto-kickoff from firing before the user decides.
  const gated = aiStatus !== "ready";

  // Leaving AI off is a recorded decision, not a lingering null — the
  // assistant entry points then gate with "add a key any time" copy.
  const recordOptOut = useCallback(() => {
    if (aiModeValue !== AiMode.OFF) {
      // Fire-and-forget: a failed write must not trap the user in setup.
      void setMode(AiMode.OFF).catch(() => {});
    }
  }, [aiModeValue, setMode]);

  const handleOptOut = useCallback(() => {
    recordOptOut();
    onFinish();
  }, [recordOptOut, onFinish]);

  const handleSkip = useCallback(() => {
    if (aiStatus === "off") recordOptOut();
    onSkip();
  }, [aiStatus, recordOptOut, onSkip]);

  // Save & continue applies the assistant's proposals (which calls onSaved =
  // onFinish); with nothing proposed it just finishes.
  const handleContinue = () => {
    if (assistant.hasChanges) {
      assistant.save();
      return;
    }
    if (aiStatus === "off") recordOptOut();
    onFinish();
  };

  // Leaving this step unmounts the assistant, which discards unsaved
  // proposals and the conversation — confirm instead of losing them silently.
  const handleBack = () => {
    if (assistant.hasChanges) setShowBackConfirm(true);
    else onBack();
  };

  return (
    <StepFrame
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      wide
      title="Plan your first goals with AI"
      subtitle="Chat to draft goals across your roles, then Save & continue to keep them. Nothing is added until you do."
      onSkip={handleSkip}
      skipDisabled={finishing}
      footer={
        <>
          <Button
            variant="glass"
            onClick={handleBack}
            disabled={finishing || assistant.isStreaming}
          >
            Back
          </Button>
          <div className={footerActions}>
            <Button
              variant="glassInk"
              onClick={handleContinue}
              disabled={finishing || assistant.isStreaming}
            >
              <Sparkles size={15} strokeWidth={2.2} />
              {assistant.hasChanges ? "Save & continue" : "Finish"}
            </Button>
          </div>
        </>
      }
    >
      <div className={aiWorkspace}>
        {gated ? (
          <AssistantGate onOptOut={handleOptOut} optOutLabel="Skip AI for now" />
        ) : (
          <AIDraftModal
            embedded
            open
            onClose={noopClose}
            focus={null}
            intent="onboarding"
            onSaved={onFinish}
            onStateChange={setAssistant}
            resumeConversationId={resumeConversationId}
            onConversationIdChange={onConversationIdChange}
          />
        )}
      </div>

      <ConfirmModal
        open={showBackConfirm}
        title="Discard the draft?"
        body="Going back closes the assistant and discards its unsaved proposals and this conversation."
        confirmLabel="Discard and go back"
        cancelLabel="Stay here"
        tone="danger"
        onCancel={() => setShowBackConfirm(false)}
        onConfirm={() => {
          setShowBackConfirm(false);
          // The dialog promises the conversation is discarded — drop the
          // stored id so returning to this step starts a fresh interview.
          onConversationIdChange(null);
          onBack();
        }}
      />
    </StepFrame>
  );
}
