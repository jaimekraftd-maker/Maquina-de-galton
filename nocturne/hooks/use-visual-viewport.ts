"use client";

import { useEffect } from "react";

/**
 * Exposes the visible viewport height as --app-height. On iOS Safari the
 * on-screen keyboard doesn't resize the layout, so without this a full-height
 * chat would hide its composer behind the keyboard.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      // iOS pans the page to reveal the focused input; undo it since the shell already fits.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
    };
  }, []);
}
