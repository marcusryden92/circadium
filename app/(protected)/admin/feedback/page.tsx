"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eraser, Eye, Trash2 } from "lucide-react";
import { Button, ConfirmModal, Loader, PageHeader } from "@/components/ui";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { startInspection } from "@/utils/inspection";
import {
  clearFeedbackSnapshot,
  deleteFeedbackReport,
  getFeedbackReportSnapshot,
  listFeedbackReports,
  type FeedbackReportSummary,
} from "@/actions/adminFeedback";
import { SnapshotInspector } from "./_components/SnapshotInspector";
import {
  page,
  mainGrid,
  rail,
  railHead,
  railBody,
  reportRow,
  reportRowTitle,
  snapshotDot,
  reportRowExcerpt,
  reportRowMeta,
  mainCard,
  mainScroll,
  reportHeader,
  reportHeaderRow,
  reportSender,
  reportDate,
  headerActions,
  reportMessage,
  emptyMain,
  noSnapshotNote,
  loadingWrap,
} from "./page.css";

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminFeedbackPage() {
  const role = useCurrentRole();
  const [reports, setReports] = useState<FeedbackReportSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<
    Record<string, Record<string, unknown> | null>
  >({});
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [confirming, setConfirming] = useState<
    { kind: "delete" | "clear"; id: string } | null
  >(null);

  const isAdmin = role === "ADMIN";

  const reload = useCallback(async () => {
    setReports(await listFeedbackReports());
  }, []);

  useEffect(() => {
    if (isAdmin) void reload();
  }, [isAdmin, reload]);

  const selected =
    reports?.find((r) => r.id === selectedId) ??
    (reports && reports.length > 0 ? reports[0] : null);

  useEffect(() => {
    if (!selected?.hasSnapshot) return;
    if (snapshots[selected.id] !== undefined) return;
    let cancelled = false;
    setSnapshotLoading(true);
    getFeedbackReportSnapshot(selected.id)
      .then((data) => {
        if (cancelled) return;
        setSnapshots((prev) => ({ ...prev, [selected.id]: data }));
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshots((prev) => ({ ...prev, [selected.id]: null }));
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, snapshots]);

  const handleDownload = () => {
    if (!selected) return;
    const data = snapshots[selected.id];
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `circadium-report-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!confirming) return;
    const { kind, id } = confirming;
    setConfirming(null);
    if (kind === "delete") {
      await deleteFeedbackReport(id).catch(() => undefined);
      if (selectedId === id) setSelectedId(null);
    } else {
      await clearFeedbackSnapshot(id).catch(() => undefined);
      setSnapshots((prev) => ({ ...prev, [id]: null }));
    }
    await reload();
  };

  if (role !== undefined && !isAdmin) {
    return (
      <div className={page}>
        <PageHeader title="Feedback reports" />
        <div className={emptyMain}>Not authorized.</div>
      </div>
    );
  }

  const selectedSnapshot = selected ? snapshots[selected.id] : undefined;

  return (
    <div className={page}>
      <PageHeader
        title="Feedback reports"
        summary={
          reports
            ? `${reports.length} report${reports.length === 1 ? "" : "s"}`
            : undefined
        }
      />

      <div className={mainGrid}>
        <aside className={rail}>
          <div className={railHead}>Reports</div>
          <div className={railBody}>
            {reports === null ? (
              <div className={loadingWrap}>
                <Loader size="md" label="Loading reports" />
              </div>
            ) : reports.length === 0 ? (
              <div className={noSnapshotNote}>No feedback reports yet.</div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={reportRow}
                  data-selected={report.id === selected?.id}
                  onClick={() => setSelectedId(report.id)}
                >
                  <span className={reportRowTitle}>
                    {report.hasSnapshot && <span className={snapshotDot} />}
                    {report.userName ?? report.userEmail ?? "Unknown user"}
                  </span>
                  <span className={reportRowExcerpt}>{report.message}</span>
                  <span className={reportRowMeta}>
                    {formatDateTime(report.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={mainCard}>
          {!selected ? (
            <div className={emptyMain}>
              Select a report to read it — reports with a blue dot carry a data
              snapshot.
            </div>
          ) : (
            <>
              <div className={reportHeader}>
                <div className={reportHeaderRow}>
                  <span className={reportSender}>
                    {selected.userName ?? "Unnamed"} ·{" "}
                    {selected.userEmail ?? "no email"}
                  </span>
                  <span className={reportDate}>
                    {formatDateTime(selected.createdAt)}
                  </span>
                  <div className={headerActions}>
                    {selected.hasSnapshot && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            startInspection({
                              reportId: selected.id,
                              label:
                                selected.userEmail ??
                                selected.userName ??
                                "user",
                            })
                          }
                        >
                          <Eye size={14} strokeWidth={2} />
                          Impersonate
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDownload}
                          disabled={!selectedSnapshot}
                        >
                          <Download size={14} strokeWidth={2} />
                          Download JSON
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirming({ kind: "clear", id: selected.id })
                          }
                        >
                          <Eraser size={14} strokeWidth={2} />
                          Clear snapshot
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfirming({ kind: "delete", id: selected.id })
                      }
                      aria-label="Delete report"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </Button>
                  </div>
                </div>
                <p className={reportMessage}>{selected.message}</p>
              </div>
              <div className={mainScroll}>
                {!selected.hasSnapshot ? (
                  <div className={noSnapshotNote}>
                    No data snapshot on this report.
                  </div>
                ) : snapshotLoading && selectedSnapshot === undefined ? (
                  <div className={loadingWrap}>
                    <Loader size="md" label="Loading snapshot" />
                  </div>
                ) : selectedSnapshot ? (
                  <SnapshotInspector data={selectedSnapshot} />
                ) : (
                  <div className={noSnapshotNote}>
                    Could not load this snapshot.
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmModal
        open={!!confirming}
        title={
          confirming?.kind === "delete" ? "Delete report?" : "Clear snapshot?"
        }
        tone="danger"
        confirmLabel={confirming?.kind === "delete" ? "Delete" : "Clear"}
        body={
          <p style={{ margin: 0 }}>
            {confirming?.kind === "delete"
              ? "Delete this report and its data snapshot permanently?"
              : "Remove the data snapshot from this report? The message is kept."}
          </p>
        }
        onCancel={() => setConfirming(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
