// One engine representation for both user-facing precedence concepts.
// `source` says which surface authored the edge; `queueId` is set only for
// queue edges so violation messages can name the pipe. `internal` edges are
// validation-only: consecutive-pair edges over a goal's sortOrder-DFS bottom
// layer, emitted so node-level dependency cycles that thread through a goal's
// internal step order are caught at authoring time.
export type PrecedenceSource = "queue" | "dependency" | "internal";

export type PrecedenceEdge = {
  fromId: string;
  toId: string;
  source: PrecedenceSource;
  queueId?: string;
  // Set when an endpoint was expanded to a subtree boundary leaf: the
  // authored endpoint (node or root) the edge belongs to, for display.
  fromNodeId?: string;
  toNodeId?: string;
};
