"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { space } from "@/lib/theme";
import { useItem } from "../ItemContext";

// Border, background, and stickiness live on the host's dock element — this
// is just the button row.
export function DeleteRow() {
  const { requestDelete } = useItem();

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={requestDelete}
        aria-label="Delete item"
        style={{ marginLeft: `-${space["3.5"]}`, minHeight: 37 }}
      >
        <Trash2 size={12} strokeWidth={2.2} />
        Delete item
      </Button>
    </div>
  );
}
