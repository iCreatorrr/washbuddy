import { useEffect, useRef, useState } from "react";

/**
 * Window-scroll direction tracker. Returns the most recent direction
 * the user is scrolling and whether the viewport is at (or near) the
 * top of the page. Designed for "hide on scroll down, reveal on
 * scroll up" navigation chrome — the Pinterest / Material Design
 * pattern world-class map-based discovery apps converge on.
 *
 * The threshold (default 10px) prevents direction flips from tiny
 * touch-scroll jitters and Mac trackpad over-scroll bounce. The
 * `topThreshold` flips `isAtTop` true again as the user nears the
 * top so chrome can re-pin even before the direction reverses.
 *
 * Phase A introduces this hook for the interim floating cluster on
 * `/find-a-wash` (Checkpoint 6). Phase B's redesigned collapsed↔
 * expanded header consumes the same hook directly — no Phase A
 * waste; this lives at `hooks/` rather than inline in find-a-wash.
 */
export type ScrollDirection = "up" | "down";

interface UseScrollDirectionOptions {
  /** Pixels of movement required before a direction flip is registered. */
  threshold?: number;
  /** Pixels from the top under which `isAtTop` reads true. */
  topThreshold?: number;
}

export function useScrollDirection({
  threshold = 10,
  topThreshold = 16,
}: UseScrollDirectionOptions = {}): { direction: ScrollDirection; isAtTop: boolean } {
  const [direction, setDirection] = useState<ScrollDirection>("up");
  const [isAtTop, setIsAtTop] = useState(true);
  const lastYRef = useRef<number>(typeof window !== "undefined" ? window.scrollY : 0);
  const tickingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      const y = window.scrollY;
      const last = lastYRef.current;
      const delta = y - last;
      if (Math.abs(delta) >= threshold) {
        setDirection(delta > 0 ? "down" : "up");
        lastYRef.current = y;
      }
      setIsAtTop(y <= topThreshold);
      tickingRef.current = false;
    };

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(update);
    };

    // Initial sync — covers the case where the page mounts already
    // scrolled (e.g., back-nav restoring scroll position).
    setIsAtTop(window.scrollY <= topThreshold);
    lastYRef.current = window.scrollY;

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, topThreshold]);

  return { direction, isAtTop };
}
