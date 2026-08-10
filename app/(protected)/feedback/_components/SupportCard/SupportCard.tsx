"use client";

import { useId, useState } from "react";
import { Button, Switch, vars } from "@/components/ui";
import { useServerAction } from "@/hooks/useServerAction";
import { sendSupportMessage } from "@/actions/feedback";
import {
  card,
  cardHead,
  cardBody,
  intro,
  mailLink,
  messageArea,
  snapshotBlock,
  snapshotTopRow,
  snapshotLabel,
  snapshotHint,
  footer,
  statusText,
} from "./SupportCard.css";

const MIN_MESSAGE_CHARS = 10;

export function SupportCard() {
  const [message, setMessage] = useState("");
  const [includeSnapshot, setIncludeSnapshot] = useState(false);
  const switchId = useId();
  const { run, status, isPending, setSuccess, clear } =
    useServerAction(sendSupportMessage);

  const handleSend = async () => {
    clear();
    const result = await run({ message, includeSnapshot });
    if (result) {
      setMessage("");
      setIncludeSnapshot(false);
      setSuccess("Sent — thanks! Replies go to your account email.");
    }
  };

  return (
    <section className={card}>
      <div className={cardHead}>Contact support</div>
      <div className={cardBody}>
        <p className={intro}>
          Found a bug, or something not working the way you expect? Describe it
          here — or email{" "}
          <a className={mailLink} href="mailto:feedback@circadium.app">
            feedback@circadium.app
          </a>{" "}
          directly.
        </p>
        <textarea
          className={messageArea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, and what did you expect instead?"
          disabled={isPending}
          aria-label="Support message"
        />
        <div className={snapshotBlock}>
          <div className={snapshotTopRow}>
            <label className={snapshotLabel} htmlFor={switchId}>
              Include a snapshot of my data for debugging
            </label>
            <Switch
              id={switchId}
              checked={includeSnapshot}
              onCheckedChange={setIncludeSnapshot}
              disabled={isPending}
            />
          </div>
          <p className={snapshotHint}>
            Attaches a copy of your current goals, calendar, and settings to
            this report so the problem can be reproduced. Stored privately and
            deleted once the issue is resolved.
          </p>
        </div>
        <div className={footer}>
          <Button
            onClick={handleSend}
            disabled={isPending || message.trim().length < MIN_MESSAGE_CHARS}
          >
            {isPending ? "Sending…" : "Send message"}
          </Button>
          {status && (
            <span
              className={statusText}
              style={{
                color:
                  status.tone === "error"
                    ? vars.status.error
                    : vars.status.success,
              }}
            >
              {status.text}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
