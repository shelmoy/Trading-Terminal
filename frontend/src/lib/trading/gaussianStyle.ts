const STYLE_VERSION_KEY = '__oaGaussianStyleVersion'
const STYLE_VERSION = 3

/** Restore only Gaussian colours once; preserve every other saved style/input. */
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
    'trendLineBull:color': '#448aff',
    'trendLineBear:color': '#c94f70',
  }
}
