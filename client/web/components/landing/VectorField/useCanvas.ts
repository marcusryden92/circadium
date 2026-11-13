import { useEffect, useRef, type RefObject } from "react";
import type { SceneState } from "./types";
import { createRenderState, renderFrame, type MouseState } from "./lib/render";

// Owns the rAF loop. Reads live scene from a ref so prop changes never
// restart the loop. The canvas sizes to its host element via ResizeObserver.
export function useCanvas(sceneRef: RefObject<SceneState>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const mouse: MouseState = { sx: -9999, sy: -9999, active: false };
    const rs = createRenderState();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.sx = e.clientX - rect.left;
      mouse.sy = e.clientY - rect.top;
      mouse.active =
        mouse.sx >= 0 &&
        mouse.sy >= 0 &&
        mouse.sx <= rect.width &&
        mouse.sy <= rect.height;
    };
    const onLeave = () => {
      mouse.active = false;
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    let raf = 0;
    let firstFrame = true;
    const tick = () => {
      const scene = sceneRef.current;
      if (scene) renderFrame(ctx, W, H, scene, mouse, rs);
      if (firstFrame) {
        firstFrame = false;
        canvas.style.opacity = "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [sceneRef]);

  return { hostRef, canvasRef };
}
