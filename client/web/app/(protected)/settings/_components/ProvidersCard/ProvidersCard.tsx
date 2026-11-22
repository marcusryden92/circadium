"use client";

import {
  PROVIDER_NAMES,
  SIGN_IN_PROVIDERS,
} from "@/lib/session/oauthSignIn";
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
  user: { email?: string; signInProviders?: string[] };
}

export function ProvidersCard({ user }: ProvidersCardProps) {
  const linked = new Set(user.signInProviders ?? []);
  return (
    <div className={card}>
      <span className={cardTitle}>Linked sign-ins</span>
      {SIGN_IN_PROVIDERS.map((provider) => (
        <div key={provider} className={providerRow}>
          <span className={providerIcon}>{PROVIDER_NAMES[provider][0]}</span>
          <div className={providerMain}>
            <div className={providerName}>{PROVIDER_NAMES[provider]}</div>
            <div className={providerStatus}>
              {linked.has(provider) ? `linked · ${user.email}` : "not connected"}
            </div>
          </div>
        </div>
      ))}
      <span className={fieldNote}>
        Linking another sign-in to an existing account is on the roadmap.
      </span>
    </div>
  );
}
