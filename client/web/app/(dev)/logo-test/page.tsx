import { space } from "@/lib/theme";
import { brand, brandLogo, brandText } from "./page.css";

const LogoTest = () => {
  return (
    <div style={{ padding: space["20"] }}>
      <div className={brand} title="Circadium">
        <span className={brandLogo} aria-hidden />
        <span className={brandText}>Circadium</span>
      </div>
    </div>
  );
};

export default LogoTest;
