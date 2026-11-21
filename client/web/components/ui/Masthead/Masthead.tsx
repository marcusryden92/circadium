import { forwardRef, type HTMLAttributes } from "react";
import { masthead } from "./Masthead.css";

type Props = HTMLAttributes<HTMLDivElement>;

export const Masthead = forwardRef<HTMLDivElement, Props>(function Masthead(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={className ? `${masthead} ${className}` : masthead}
      {...rest}
    />
  );
});
