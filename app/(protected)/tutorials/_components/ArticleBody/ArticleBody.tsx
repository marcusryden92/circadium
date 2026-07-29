import { Fragment, type ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import type { Block } from "../../_lib/tutorials";
import {
  paragraph,
  subhead,
  list,
  listOrdered,
  listItem,
  terms,
  termRow,
  termName,
  termDef,
  note,
  noteIcon,
  noteBody,
  strong,
  emphasis,
} from "./ArticleBody.css";

// Inline formatter: **bold** and *italic* spans. Bold is scanned first so an
// italic run never swallows the double markers.
function renderInline(text: string): ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className={strong}>
          {part.slice(2, -2)}
        </span>
      );
    }
    const italicParts = part.split(/(\*[^*]+\*)/g);
    return (
      <Fragment key={i}>
        {italicParts.map((seg, j) =>
          seg.startsWith("*") && seg.endsWith("*") && seg.length > 2 ? (
            <span key={j} className={emphasis}>
              {seg.slice(1, -1)}
            </span>
          ) : (
            <Fragment key={j}>{seg}</Fragment>
          ),
        )}
      </Fragment>
    );
  });
}

export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h":
            return (
              <h2 key={i} className={subhead}>
                {block.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} className={paragraph}>
                {renderInline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className={list}>
                {block.items.map((item, j) => (
                  <li key={j} className={listItem}>
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className={listOrdered}>
                {block.items.map((item, j) => (
                  <li key={j} className={listItem}>
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );
          case "terms":
            return (
              <dl key={i} className={terms}>
                {block.items.map((item, j) => (
                  <div key={j} className={termRow}>
                    <dt className={termName}>{item.term}</dt>
                    <dd className={termDef}>{renderInline(item.def)}</dd>
                  </div>
                ))}
              </dl>
            );
          case "note":
            return (
              <aside key={i} className={note}>
                <span className={noteIcon} aria-hidden>
                  <Lightbulb size={15} strokeWidth={2} />
                </span>
                <span className={noteBody}>{renderInline(block.text)}</span>
              </aside>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
