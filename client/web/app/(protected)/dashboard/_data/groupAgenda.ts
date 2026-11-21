import type { AgendaItem, AgendaRow } from "./types";

// Collapses consecutive agenda items that share the same (kind, categoryId)
// pair under a single divider header. Runs of size 1 still get a header,
// just without an "N items" suffix when rendered.
export function groupAgenda(agenda: AgendaItem[]): AgendaRow[] {
  const out: AgendaRow[] = [];

  type Bucket = {
    kind: AgendaItem["kind"];
    categoryId: string | null;
    items: AgendaItem[];
  };
  let bucket: Bucket | null = null;

  const keyFor = (kind: AgendaItem["kind"], categoryId: string | null) =>
    `${kind}|${categoryId ?? ""}`;

  const flush = () => {
    if (!bucket) return;
    const lead = bucket.items[0];
    out.push({
      header: {
        kind: bucket.kind,
        categoryId: bucket.categoryId,
        categoryName: lead.categoryName,
        categoryColor: lead.categoryColor,
      },
      items: bucket.items,
    });
    bucket = null;
  };

  for (const item of agenda) {
    const categoryId = item.categoryId ?? null;
    const key = keyFor(item.kind, categoryId);
    const currentKey = bucket ? keyFor(bucket.kind, bucket.categoryId) : null;
    if (bucket && currentKey === key) {
      bucket.items.push(item);
    } else {
      flush();
      bucket = { kind: item.kind, categoryId, items: [item] };
    }
  }
  flush();
  return out;
}
