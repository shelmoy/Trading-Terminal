import type { ChartSettingsRequest } from './terminal'
import type { RenkoV4Options } from './renkoV4Transform'
import { intervalSeconds } from './intervals'

export const RENKO_V4_DEFAULTS = { 'renkov4.showTrend': true } as const

/** Keep the historical seed consistent regardless of the previous candle view. */
export function renkoV4HistoryInterval(intervals: readonly string[]): string | null {
  if (intervals.includes('1m')) return '1m'
  return (
    intervals
      .filter((iv) => !iv.endsWith('s') && intervalSeconds(iv) !== null)
      .sort((a, b) => intervalSeconds(a)! - intervalSeconds(b)!)[0] ?? null
  )
}

export function renkoV4Options(tickSize: number): RenkoV4Options {
  return { mode: 'percent', percent: 0.04, points: 10, reversal: 2, tickSize }
}

export function renkoV4SettingsView(
  request: ChartSettingsRequest,
  chartType: string,
  saved: Record<string, string | number | boolean>
): ChartSettingsRequest {
  if (chartType !== 'renko-v4') return request
  return {
    ...request,
    tabs: request.tabs.map((tab) =>
      tab.id === 'price'
        ? {
            ...tab,
            description:
              'Price-confirmed bricks; size stays fixed after the seed. Live ticks form bricks immediately at the price threshold. A consistent intraday interval seeds historical closes, which approximate the price path. Increasing reversal bricks filters smaller reversals. Older OHLC pages do not rewrite locked bricks; changing sizing recalculates the loaded history.',
            inputs: [
              {
                key: 'renkov4.showTrend',
                label: 'Confirmed brick trend line',
                type: 'boolean' as const,
                group: 'Renko Version 4',
              },
              ...tab.inputs,
            ],
          }
        : tab
    ),
    values: { ...request.values, 'renkov4.showTrend': saved['renkov4.showTrend'] !== false },
    defaults: { ...request.defaults, ...RENKO_V4_DEFAULTS },
  }
}
