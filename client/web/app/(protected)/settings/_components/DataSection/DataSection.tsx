"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Shield, Upload } from "lucide-react";
import { Button, SegmentedControl, ConfirmModal } from "@/components/ui";
import { exportUserData } from "@/actions/dataExport";
import { importUserData, type ImportMode } from "@/actions/dataImport";
import { card, cardTitle, fieldNote } from "../../page.css";
import {
  actions,
  importControls,
  statusText,
  privacyRow,
  privacyLink,
} from "./DataSection.css";

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const IMPORT_MODES: { key: ImportMode; label: string }[] = [
  { key: "replace", label: "Replace everything" },
  { key: "add", label: "Add a copy" },
];

export function DataSection() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [importMode, setImportMode] = useState<ImportMode>("replace");
  const [importStatus, setImportStatus] = useState<Status>({ kind: "idle" });
  const [pendingFile, setPendingFile] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setStatus({ kind: "working" });
    const result = await exportUserData();
    if (!result.success) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    const json = JSON.stringify(result.data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `circadium-data-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus({ kind: "done" });
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportStatus({ kind: "idle" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportStatus({
        kind: "error",
        message: "That file isn't valid JSON.",
      });
      return;
    }
    if (importMode === "replace") {
      setPendingFile(parsed);
    } else {
      void runImport(parsed, "add");
    }
  }

  async function runImport(parsed: unknown, mode: ImportMode) {
    setPendingFile(null);
    setImportStatus({ kind: "working" });
    const result = await importUserData(parsed, mode);
    if (!result.success) {
      setImportStatus({ kind: "error", message: result.error });
      return;
    }
    setImportStatus({ kind: "done" });
    // The write bypassed the diff sync, so reload to reseed from the DB.
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <>
      <div className={card}>
        <span className={cardTitle}>Export your data</span>
        <span className={fieldNote}>
          Download a copy of everything Circadium stores about you — your tasks,
          goals, categories, weekly templates, locations, preferences, connected
          calendars, and AI assistant conversations — as a single JSON file.
          Passwords and access tokens are never included.
        </span>
        <div className={actions}>
          <Button
            variant="glass"
            size="sm"
            onClick={() => void handleExport()}
            disabled={status.kind === "working"}
          >
            <Download size={12} strokeWidth={2.2} />
            {status.kind === "working" ? "Preparing…" : "Download my data"}
          </Button>
          {status.kind === "done" && (
            <span className={statusText}>Download started.</span>
          )}
          {status.kind === "error" && (
            <span className={statusText}>{status.message}</span>
          )}
        </div>
      </div>

      <div className={card}>
        <span className={cardTitle}>Import data</span>
        <span className={fieldNote}>
          Load a Circadium export file (.json). Choose whether to{" "}
          <strong>replace everything</strong> in this account (a full restore)
          or <strong>add a copy</strong> of the file&apos;s items alongside what
          you already have.
        </span>
        <div className={importControls}>
          <SegmentedControl
            options={IMPORT_MODES}
            value={importMode}
            onChange={(key) => setImportMode(key)}
          />
          <Button
            variant="glass"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importStatus.kind === "working"}
          >
            <Upload size={12} strokeWidth={2.2} />
            {importStatus.kind === "working" ? "Importing…" : "Choose file…"}
          </Button>
          {importStatus.kind === "done" && (
            <span className={statusText}>Imported — reloading…</span>
          )}
          {importStatus.kind === "error" && (
            <span className={statusText}>{importStatus.message}</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onFilePicked(e)}
        />
        <span className={fieldNote}>
          Engine-generated calendar placements rebuild automatically after
          import. If you had a Google account connected, reconnect it under
          Integrations.
        </span>
      </div>

      <div className={card}>
        <span className={cardTitle}>Privacy & your rights</span>
        <span className={fieldNote}>
          You can access, correct, or export your data at any time here, and
          permanently delete your account from the Danger zone. If you connected
          a Google account, you can disconnect it under Integrations, which
          revokes Circadium&apos;s access and removes the imported events.
        </span>
        <div className={privacyRow}>
          <Shield size={13} strokeWidth={2} aria-hidden />
          <Link href="/privacy" className={privacyLink} target="_blank">
            Read the privacy policy
          </Link>
        </div>
      </div>

      <ConfirmModal
        open={pendingFile !== null}
        tone="danger"
        title="Replace all your data?"
        confirmLabel="Replace everything"
        body={
          <p style={{ margin: 0 }}>
            This permanently deletes everything currently in your account —
            tasks, goals, categories, templates, locations, and settings — and
            replaces it with the contents of the file. This can&apos;t be
            undone.
          </p>
        }
        onCancel={() => setPendingFile(null)}
        onConfirm={() => void runImport(pendingFile, "replace")}
      />
    </>
  );
}
