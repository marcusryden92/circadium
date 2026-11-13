import type { ReactNode } from "react";
import { root, title as titleClass, body as bodyClass } from "./StubPage.css";

type Props = {
  title: string;
  children: ReactNode;
};

export function StubPage({ title, children }: Props) {
  return (
    <div className={root}>
      <h2 className={titleClass}>{title}</h2>
      <p className={bodyClass}>{children}</p>
    </div>
  );
}
