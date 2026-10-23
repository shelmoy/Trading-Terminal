const STYLE_VERSION_KEY = '__oaGaussianStyleVersion'
const STYLE_VERSION = 2

/** Upgrade each saved Gaussian copy once; subsequent user style edits stay saved. */
export function gaussianStyleUpgrade(
  indicatorId: string,
  settings: Record<string, unknown>
): Record<string, unknown> | null {
  if (
    indicatorId !== 'oa-gaussian-filter-trend' ||
    settings[STYLE_VERSION_KEY] === STYLE_VERSION
  ) {
    return null
  }

  return {
    [STYLE_VERSION_KEY]: STYLE_VERSION,
    'trendLineBull:color': '#22c55e',
    'trendLineBear:color': '#facc15',
    'trendLineBull:width': 4,
    'trendLineBear:width': 4,
    'trendLineBull:lineStyle': 'dashed',
    'trendLineBear:lineStyle': 'dashed',
    'trendLineBull:opacity': 100,
    'trendLineBear:opacity': 100,
    'trendLineBull:type': 'line',
    'trendLineBear:type': 'line',
  }
}
