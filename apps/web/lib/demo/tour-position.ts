import type { TourPlacement } from "./tours";

/**
 * Pure tooltip positioning for the guided-tour overlay. Given the spotlighted element's box, the
 * tooltip's measured size, and the viewport, it picks a side (flipping the preferred side when it
 * would overflow) and returns a viewport-clamped position. Kept DOM-free so the placement logic is
 * unit-testable; the component measures the rects and feeds them in.
 */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Positioned {
  top: number;
  left: number;
  placement: TourPlacement;
}

const GAP = 12;
const ORDER: TourPlacement[] = ["bottom", "top", "right", "left"];
const OPPOSITE: Record<TourPlacement, TourPlacement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export function tooltipPosition(
  target: Box,
  tooltip: Size,
  viewport: Size,
  preferred: TourPlacement,
): Positioned {
  const placement = resolvePlacement(target, tooltip, viewport, preferred);
  const { top, left } = anchor(target, tooltip, placement);
  return {
    placement,
    top: clamp(top, GAP, viewport.height - tooltip.height - GAP),
    left: clamp(left, GAP, viewport.width - tooltip.width - GAP),
  };
}

/** Use the preferred side if it fits; otherwise its opposite; otherwise the first side that fits. */
function resolvePlacement(
  target: Box,
  tooltip: Size,
  viewport: Size,
  preferred: TourPlacement,
): TourPlacement {
  if (fits(target, tooltip, viewport, preferred)) return preferred;
  if (fits(target, tooltip, viewport, OPPOSITE[preferred])) return OPPOSITE[preferred];
  return ORDER.find((side) => fits(target, tooltip, viewport, side)) ?? preferred;
}

function fits(target: Box, tooltip: Size, viewport: Size, placement: TourPlacement): boolean {
  switch (placement) {
    case "top":
      return target.top - tooltip.height - GAP >= 0;
    case "bottom":
      return target.top + target.height + tooltip.height + GAP <= viewport.height;
    case "left":
      return target.left - tooltip.width - GAP >= 0;
    case "right":
      return target.left + target.width + tooltip.width + GAP <= viewport.width;
  }
}

function anchor(
  target: Box,
  tooltip: Size,
  placement: TourPlacement,
): { top: number; left: number } {
  const centerX = target.left + target.width / 2 - tooltip.width / 2;
  const centerY = target.top + target.height / 2 - tooltip.height / 2;
  switch (placement) {
    case "top":
      return { top: target.top - tooltip.height - GAP, left: centerX };
    case "bottom":
      return { top: target.top + target.height + GAP, left: centerX };
    case "left":
      return { top: centerY, left: target.left - tooltip.width - GAP };
    case "right":
      return { top: centerY, left: target.left + target.width + GAP };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
