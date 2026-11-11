import type { ChartSettingsField, ChartSettingsRequest } from './terminal'
import {
  type RenkoV2Mode,
  type RenkoV2Options,
  RENKO_V2_DEFAULTS,
} from './renkoV2Transform'

export {
  type RenkoV2Mode,
  type RenkoV2Options,
  RENKO_V2_DEFAULTS,
}

type Values = Record<string, string | number | boolean>

export const renkoV2Fields: ChartSettingsField[] = [
  {
    key: 'renkov2.mode',
    type: 'select',
    label: 'Brick Sizing Mode',
    group: 'Renko Version 2 Settings',
    options: [
      { value: 'percent', label: 'Percentage (%)' },
      { value: 'points', label: 'Points / Ticks' },
      { value: 'atr', label: 'ATR (Average True Range)' },
    ],
  },
  {
    key: 'renkov2.percent',
    type: 'number',
    label: 'Brick Size (% of price)',
    group: 'Renko Version 2 Settings',
    min: 0.001,
    max: 100,
    step: 0.01,
  },
  {
    key: 'renkov2.points',
    type: 'number',
    label: 'Brick Size (Points)',
    group: 'Renko Version 2 Settings',
    min: 0.01,
    max: 100000,
    step: 0.5,
  },
  {
    key: 'renkov2.atrPeriod',
    type: 'number',
    label: 'ATR Period',
    group: 'Renko Version 2 Settings',
    min: 1,
    max: 500,
    step: 1,
  },
  {
    key: 'renkov2.atrMultiplier',
    type: 'number',
    label: 'ATR Multiplier',
    group: 'Renko Version 2 Settings',
    min: 0.1,
    max: 20,
    step: 0.1,
  },
  {
    key: 'renkov2.priceSource',
    type: 'select',
    label: 'Calculation Source',
    group: 'Renko Version 2 Settings',
    options: [
      { value: 'close', label: 'Close (Pure Movement)' },
      { value: 'high_low', label: 'High / Low Wicks' },
    ],
  },
]

export function renkoV2Values(saved: Values): Values {
  const values: Values = { ...RENKO_V2_DEFAULTS }
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

export function renkoV2Options(saved: Values, tickSize?: number): RenkoV2Options {
  const vals = renkoV2Values(saved)
  return {
    mode: vals['renkov2.mode'] as RenkoV2Mode,
    percent: Number(vals['renkov2.percent']) || 0.04,
    points: Number(vals['renkov2.points']) || 10.0,
    atrPeriod: Number(vals['renkov2.atrPeriod']) || 14,
    atrMultiplier: Number(vals['renkov2.atrMultiplier']) || 1.0,
    priceSource: vals['renkov2.priceSource'] as 'close' | 'high_low',
    tickSize,
  }
}

/**
 * Injects Renko V2 settings into the Price tab when chartType === 'renko-v2'.
 */
export function renkoV2SettingsView(
  request: ChartSettingsRequest,
  chartType: string,
  saved: Values
): ChartSettingsRequest {
  if (chartType !== 'renko-v2') return request

  const tabs = request.tabs.map((tab) =>
    tab.id === 'price'
      ? {
          ...tab,
          description:
            'Renko Version 2: True movement-based Renko with 2-brick reversal rule and zero repainting.',
          inputs: [
            ...renkoV2Fields,
            ...tab.inputs,
          ],
        }
      : tab
  )

  return {
    tabs,
    values: { ...request.values, ...renkoV2Values(saved) },
    defaults: { ...request.defaults, ...RENKO_V2_DEFAULTS },
  }
}
