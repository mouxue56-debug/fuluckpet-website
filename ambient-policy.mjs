// Poster-first behavior for costly connections; fast connections keep the approved motion.
export function ambientPolicy({ reduced = false, saveData = false, effectiveType = '', width = 1280, dpr = 1 } = {}) {
  const constrained = saveData || ['slow-2g', '2g', '3g'].includes(effectiveType);
  const compact = Number.isFinite(width) && width <= 767;
  return {
    animate: !reduced && !constrained,
    preloadNext: !compact && !constrained,
    pixelRatio: Math.min(Math.max(Number.isFinite(dpr) ? dpr : 1, 1), compact ? 1 : 1.5),
  };
}
