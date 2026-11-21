"use client";

import { card, comingSoon, comingSoonTitle } from "../../page.css";

interface ComingSoonSectionProps {
  title: string;
  body: string;
}

export function ComingSoonSection({ title, body }: ComingSoonSectionProps) {
  return (
    <div className={card}>
      <div className={comingSoon}>
        <span className={comingSoonTitle}>{title} · coming soon</span>
        <span>{body}</span>
      </div>
    </div>
  );
}
