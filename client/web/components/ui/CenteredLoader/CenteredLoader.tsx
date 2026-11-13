import { Loader } from "@/components/ui/Loader";
import { wrap } from "./CenteredLoader.css";

type Props = {
  label?: string;
  size?: "sm" | "md" | "lg";
};

export function CenteredLoader({ label, size = "md" }: Props) {
  return (
    <div className={wrap}>
      <Loader size={size} label={label} />
    </div>
  );
}
