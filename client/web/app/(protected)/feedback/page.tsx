"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { SupportCard } from "./_components/SupportCard";
import { SuggestionWall } from "./_components/SuggestionWall";
import { page, mainGrid, adminLink } from "./page.css";

export default function FeedbackPage() {
  const isAdmin = useCurrentRole() === "ADMIN";

  return (
    <div className={page}>
      <PageHeader
        title="Feedback"
        summary="Report a problem or shape what gets built next"
      >
        {isAdmin && (
          <Link className={adminLink} href="/admin/feedback">
            Admin view
          </Link>
        )}
      </PageHeader>

      <div className={mainGrid}>
        <SupportCard />
        <SuggestionWall />
      </div>
    </div>
  );
}
