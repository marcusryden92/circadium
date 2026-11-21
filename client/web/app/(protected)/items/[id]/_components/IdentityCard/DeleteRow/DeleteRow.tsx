"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { space, vars } from "@/lib/theme";
import { useItem } from "../../ItemContext";

export function DeleteRow() {
  const { requestDelete } = useItem();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginTop: space["5"],
        paddingTop: space["4"],
        borderTop: `1px solid ${vars.rule}`,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={requestDelete}
        aria-label="Delete item"
        style={{ marginLeft: `-${space["3.5"]}` }}
      >
        <Trash2 size={12} strokeWidth={2.2} />
        Delete item
      </Button>
    </div>
  );
}
