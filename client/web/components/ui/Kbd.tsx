import {
  forwardRef,
  Fragment,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import * as styles from "./Kbd.css";

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  // A single key, or several keys joined by `separator`.
  keys: ReactNode | ReactNode[];
  // Short descriptor that follows the keys (e.g. "capture", "zoom").
  instruction?: ReactNode;
  separator?: string;
};

export const Kbd = forwardRef<HTMLSpanElement, Props>(function Kbd(
  { keys, instruction, separator = "+", className, ...rest },
  ref,
) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  return (
    <span
      ref={ref}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...rest}
    >
      {keyList.map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles.separator}>{separator}</span>}
          <kbd className={styles.key}>{k}</kbd>
        </Fragment>
      ))}
      {instruction != null && (
        <span className={styles.instruction}>{instruction}</span>
      )}
    </span>
  );
});
