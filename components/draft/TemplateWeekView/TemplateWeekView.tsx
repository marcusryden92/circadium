"use client";

import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import {
  groupTemplatesByDay,
  type DiffTemplate,
} from "@/utils/draft/diffDraftTemplates";
import {
  row,
  statusBadge,
  changedFields as changedFieldsStyle,
} from "@/components/draft/JsonTreeView/JsonTreeView.css";
import {
  wrap,
  empty,
  dayGroup,
  dayLabel,
  colorDot,
  timeRange,
  overnightMarker,
  templateTitle,
  templateTitleDeleted,
  metaCluster,
  metaText,
  metaSep,
} from "./TemplateWeekView.css";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface TemplateWeekViewProps {
  templates: DiffTemplate[];
  locations: { id: string; name: string }[];
}

export function TemplateWeekView({
  templates,
  locations,
}: TemplateWeekViewProps) {
  const weekStartDay = useSelector(
    (state: RootState) => state.schedulingSettings.weekStartDay,
  );

  if (templates.length === 0) {
    return (
      <div className={wrap}>
        <div className={empty}>
          No weekly templates yet — ask the assistant to block out your week.
        </div>
      </div>
    );
  }

  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
  const groups = groupTemplatesByDay(templates, weekStartDay);

  return (
    <div className={wrap}>
      {groups.map((group) => (
        <div key={group.day} className={dayGroup}>
          <div className={dayLabel}>{DAY_LABELS[group.day]}</div>
          {group.rows.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              locationName={
                template.locationId
                  ? locationNameById.get(template.locationId) ??
                    template.locationId
                  : "Anywhere"
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TemplateRow({
  template,
  locationName,
}: {
  template: DiffTemplate;
  locationName: string;
}) {
  const { end, crossesMidnight } = endOf(template);
  return (
    <div className={row[template.status]}>
      <span
        className={colorDot}
        style={{ background: template.color ?? undefined }}
        data-empty={template.color ? undefined : "true"}
      />
      <span className={timeRange}>
        {template.startTime}–{end}
        {crossesMidnight && <span className={overnightMarker}>+1d</span>}
      </span>
      <span
        className={
          template.status === "deleted" ? templateTitleDeleted : templateTitle
        }
      >
        {template.title}
      </span>
      <span className={metaCluster}>
        {template.status === "modified" &&
          template.changedFields.length > 0 && (
            <span className={changedFieldsStyle}>
              {formatChangedFields(template.changedFields)}
            </span>
          )}
        {template.status !== "unchanged" && (
          <span className={statusBadge[template.status]}>
            {statusLabel(template.status)}
          </span>
        )}
        <span className={metaText}>{locationName}</span>
        <span className={metaSep}>·</span>
        <span className={metaText}>{formatDuration(template.duration)}</span>
      </span>
    </div>
  );
}

function endOf(template: DiffTemplate): {
  end: string;
  crossesMidnight: boolean;
} {
  const [h, m] = template.startTime.split(":").map(Number);
  const total = h * 60 + m + template.duration;
  const end = total % (24 * 60);
  const hh = String(Math.floor(end / 60)).padStart(2, "0");
  const mm = String(end % 60).padStart(2, "0");
  return { end: `${hh}:${mm}`, crossesMidnight: total >= 24 * 60 };
}

function statusLabel(status: DiffTemplate["status"]): string {
  if (status === "added") return "new";
  if (status === "modified") return "edit";
  return "gone";
}

const FIELD_LABELS: Record<string, string> = {
  startDay: "day",
  startTime: "start",
  duration: "length",
  locationId: "location",
  exceptions: "one-off occurrences",
};

function formatChangedFields(fields: string[]): string {
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
