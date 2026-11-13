import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";

export const grain = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  opacity: vars.noise.opacity,
  mixBlendMode: vars.noise.blend as unknown as "overlay",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
});
