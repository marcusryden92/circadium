import localFont from "next/font/local";
import { Montserrat } from "next/font/google";

export const fontLogo = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--app-font-logo",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const fontDisplay = localFont({
  src: [
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Extralight.otf",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/clash-display/ClashDisplay-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--app-font-display",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const fontUI = localFont({
  src: [
    {
      path: "../../public/fonts/hubot-sans/HubotSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/hubot-sans/HubotSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/hubot-sans/HubotSans-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/hubot-sans/HubotSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--app-font-ui",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
