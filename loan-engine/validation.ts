export function withinTolerance(actual: number | undefined, expected: number, absolute = 5, relative = 0.0005) {
  if (actual === undefined || !Number.isFinite(actual)) return null;
  return Math.abs(actual - expected) <= Math.max(absolute, Math.abs(expected) * relative);
}
