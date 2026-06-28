"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { type Box, type Positioned, tooltipPosition } from "@/lib/demo/tour-position";
import type { Tour } from "@/lib/demo/tours";

/**
 * The guided-tour overlay: a spotlight (dimming everything but the current target) plus a tooltip
 * card with the step copy and Back/Next controls. It is the in-app implementation of the "Take a
 * Tour" experience (PLAN.md §6.4) — driven entirely by the JSON {@link Tour} definition, so steps are
 * data, not code. Read-only and login-free; it resolves targets by their `data-tour` selector.
 */
export function GuidedTour({ tour }: { tour: Tour }) {
  const [active, setActive] = useState(true);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<Positioned | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = tour.steps[index];
  const isLast = index === tour.steps.length - 1;

  const reposition = useCallback(() => {
    if (!active || !step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      // Target isn't on this screen: drop the spotlight but keep the tooltip centered and
      // reachable, so the user can still navigate or skip rather than being stuck on a dimmed
      // screen with no visible controls.
      setBox(null);
      const tip = tooltipRef.current;
      const width = tip?.offsetWidth ?? 320;
      const height = tip?.offsetHeight ?? 150;
      setPos({
        placement: "bottom",
        top: Math.max(24, window.innerHeight / 2 - height / 2),
        left: Math.max(24, window.innerWidth / 2 - width / 2),
      });
      return;
    }
    const rect = el.getBoundingClientRect();
    const next: Box = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    setBox(next);
    const tip = tooltipRef.current;
    const size = tip
      ? { width: tip.offsetWidth, height: tip.offsetHeight }
      : { width: 300, height: 150 };
    setPos(
      tooltipPosition(
        next,
        size,
        { width: window.innerWidth, height: window.innerHeight },
        step.placement ?? "bottom",
      ),
    );
  }, [active, step]);

  // Scroll the target into view when the step changes, then measure.
  useEffect(() => {
    if (!active || !step) return;
    document.querySelector(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, step]);

  useLayoutEffect(reposition, [reposition]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, reposition]);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => {
          setIndex(0);
          setActive(true);
        }}
        className={buttonClasses("primary", "fixed bottom-6 right-6 z-50 shadow-card")}
      >
        Replay tour
      </button>
    );
  }

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-40" aria-hidden={false}>
      {/* Click-blocker so the demo screen behind the tour stays inert. */}
      <div className="absolute inset-0" />

      {/* Spotlight: a transparent window with a huge box-shadow that dims everything else. */}
      {box && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-brand-400 transition-all duration-200"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={step.title}
        className="absolute z-50 w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-card border border-gray-200 bg-white p-5 shadow-card"
        style={pos ? { top: pos.top, left: pos.left } : { top: 24, left: 24, visibility: "hidden" }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-700">
            {tour.name}
          </span>
          <button
            type="button"
            onClick={() => setActive(false)}
            className="text-sm text-gray-400 hover:text-gray-700"
            aria-label="End tour"
          >
            Skip
          </button>
        </div>
        <h2 className="text-base font-semibold text-gray-900">{step.title}</h2>
        <p className="mt-1.5 text-sm text-gray-600">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {index + 1} of {tour.steps.length}
          </span>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className={buttonClasses("secondary", "px-4 py-2")}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? setActive(false) : setIndex((i) => i + 1))}
              className={buttonClasses("primary", "px-4 py-2")}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
