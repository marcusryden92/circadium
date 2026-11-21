"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { Social } from "./Social";
import {
  card,
  brandRow,
  title as titleStyle,
  subtitle as subtitleStyle,
  body,
  divider,
  dividerLine,
  dividerLabel,
  altRow,
  altLink,
} from "./AuthCard.css";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showSocial?: boolean;
  altAction?: { prompt: string; label: string; href: string };
}

export const AuthCard = ({
  title,
  subtitle,
  children,
  showSocial,
  altAction,
}: AuthCardProps) => {
  return (
    <div className={card}>
      <div className={brandRow}>
        <Logo size={21} textAs="h1" />
        <h2 className={titleStyle}>{title}</h2>
        {subtitle && <span className={subtitleStyle}>{subtitle}</span>}
      </div>

      <div className={body}>{children}</div>

      {showSocial && (
        <>
          <div className={divider} aria-hidden>
            <span className={dividerLine} />
            <span className={dividerLabel}>or</span>
            <span className={dividerLine} />
          </div>
          <Social />
        </>
      )}

      {altAction && (
        <div className={altRow}>
          {altAction.prompt}
          <Link href={altAction.href} className={altLink}>
            {altAction.label}
          </Link>
        </div>
      )}
    </div>
  );
};
