"use client";

import {
  card,
  cardTitle,
  fieldNote,
  providerRow,
  providerIcon,
  providerMain,
  providerName,
  providerStatus,
} from "../../page.css";

interface ProvidersCardProps {
  user: { email?: string; isOAuth?: boolean };
}

export function ProvidersCard({ user }: ProvidersCardProps) {
  return (
    <div className={card}>
      <span className={cardTitle}>Linked sign-ins</span>
      <div className={providerRow}>
        <span className={providerIcon}>G</span>
        <div className={providerMain}>
          <div className={providerName}>Google</div>
          <div className={providerStatus}>
            {user.isOAuth ? `linked · ${user.email}` : "not connected"}
          </div>
        </div>
      </div>
      <div className={providerRow}>
        <span className={providerIcon}>⌥</span>
        <div className={providerMain}>
          <div className={providerName}>GitHub</div>
          <div className={providerStatus}>not connected</div>
        </div>
      </div>
      <span className={fieldNote}>
        Connecting additional providers is on the roadmap.
      </span>
    </div>
  );
}
