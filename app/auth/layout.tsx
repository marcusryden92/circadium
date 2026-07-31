import Link from "next/link";
import { themeLight } from "@/lib/theme";
import { Logo } from "@/components/ui";
import { VectorField } from "@/components/landing/VectorField";
import { page, fieldPanel, fieldBrand, formPanel, backLink } from "./auth.css";

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className={`${themeLight} ${page}`}>
      <div className={fieldPanel}>
        <VectorField />
        <div className={fieldBrand}>
          <Logo
            size="clamp(34px, 6vw, 100px)"
            tone="#f5f0e8"
            weight={300}
          />
        </div>
      </div>
      <div className={formPanel}>
        <Link href="/" className={backLink}>
          ← back
        </Link>
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
