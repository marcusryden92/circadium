import { pinstripeLight, pinstripeDark } from "./Backdrop.css";

type Variant = "pinstripe" | "none";

type Props = {
  variant?: Variant;
};

export function Backdrop({ variant = "pinstripe" }: Props) {
  if (variant === "none") return null;
  return (
    <>
      <div aria-hidden className={pinstripeLight} />
      <div aria-hidden className={pinstripeDark} />
    </>
  );
}
