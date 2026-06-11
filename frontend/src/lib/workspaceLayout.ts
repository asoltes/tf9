export function clampDiffWidth(value: number, viewportWidth: number): number {
  const viewportLimit = Math.max(280, Math.floor(viewportWidth * 0.55));
  return Math.max(220, Math.min(Math.min(900, viewportLimit), Math.round(value)));
}

export function storedDiffWidth(value: string | null, viewportWidth: number): number {
  const parsed = value === null ? 380 : Number(value);
  return clampDiffWidth(Number.isFinite(parsed) ? parsed : 380, viewportWidth);
}

export function resizedWidth(
  initialWidth: number,
  startX: number,
  currentX: number,
  direction: 1 | -1,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, initialWidth + (currentX - startX) * direction));
}
