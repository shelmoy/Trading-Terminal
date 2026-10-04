import type { ChartSettingsField, ChartSettingsRequest } from './terminal'
import {
  type RenkoV3Mode,
  type RenkoV3Options,
  RENKO_V3_DEFAULTS,
} from './renkoV3Transform'

export {
  type RenkoV3Mode,
  type RenkoV3Options,
  RENKO_V3_DEFAULTS,
}

type Values = Record<string, string | number | boolean>

export const renkoV3Fields: ChartSettingsField[] = [
  {
    key: 'renkov3.mode',
    type: 'select',
    label: 'Brick Sizing Mode',
    group: 'Renko Version 3 Settings',
    options: [
      { value: 'percent', label: 'Percentage (%)' },
      { value: 'points', label: 'Points / Ticks' },
      { value: 'atr', label: 'ATR (Average True Range)' },
    ],
  },
  {
    key: 'renkov3.percent',
    type: 'number',
    label: 'Brick Size (% of price)',
    group: 'Renko Version 3 Settings',
    min: 0.001,
    max: 100,
    step: 0.01,
  },
  {
    key: 'renkov3.points',
    type: 'number',
    label: 'Brick Size (Points)',
    group: 'Renko Version 3 Settings',
    min: 0.01,
    max: 100000,
    step: 0.5,
  },
  {
    key: 'renkov3.atrPeriod',
    type: 'number',
    label: 'ATR Period',
    group: 'Renko Version 3 Settings',
    min: 1,
    max: 500,
    step: 1,
  },
  {
    key: 'renkov3.atrMultiplier',
    type: 'number',
    label: 'ATR Multiplier',
    group: 'Renko Version 3 Settings',
    min: 0.1,
    max: 20,
    step: 0.1,
  },
  {
    key: 'renkov3.priceSource',
    type: 'select',
    label: 'Historical Seed Source',
    group: 'Renko Version 3 Settings',
    options: [
      { value: 'high_low', label: 'High / Low Wicks (Recommended)' },
      { value: 'close', label: 'Close (Pure Movement)' },
    ],
  },
]

export function renkoV3Values(saved: Values): Values {
  const values: Values = { ...RENKO_V3_DEFAULTS }
  for (const key of Object.keys(values)) {
    const value = saved[key]
    if (value === undefined || value === null) continue
    if (typeof value !== typeof values[key]) continue
    if (typeof value === 'number') {
      if (Number.isFinite(value) && value > 0) values[key] = value
    } else {
      values[key] = value
    }
  }
  return values
}

export function renkoV3Options(saved: Values, tickSize?: number): RenkoV3Options {
  const vals = renkoV3Values(saved)
  return {
    mode: vals['renkov3.mode'] as RenkoV3Mode,
    percent: Number(vals['renkov3.percent']) || 0.04,
    points: Number(vals['renkov3.points']) || 10.0,
    atrPeriod: Number(vals['renkov3.atrPeriod']) || 14,
    atrMultiplier: Number(vals['renkov3.atrMultiplier']) || 1.0,
    priceSource: vals['renkov3.priceSource'] as 'close' | 'high_low',
    tickSize,
  }
}

/**
 * Injects Renko V3 settings into the Price tab when chartType === 'renko-v3'.
 */
export function renkoV3SettingsView(
  request: ChartSettingsRequest,
  chartType: string,
  saved: Values
): ChartSettingsRequest {
  if (chartType !== 'renko-v3') return request

  const tabs = request.tabs.map((tab) =>
    tab.id === 'price'
      ? {
          ...tab,
          description:
            'Renko Version 3: 100% tick-by-tick time-independent live brick locking with 2-brick reversal rule.',
          inputs: [
            ...renkoV3Fields,
            ...tab.inputs,
          ],
        }
      : tab
  )

  return {
    tabs,
    values: { ...request.values, ...renkoV3Values(saved) },
    defaults: { ...request.defaults, ...RENKO_V3_DEFAULTS },
  }
}
