import { getSeriesTransform, registerSeriesTransform } from 'openalgo-charts'
import { RenkoV4Run, currentRenkoRun, type RenkoV4Options } from './renkoV4Transform'

export function isConfirmedRenko(type: string | undefined): boolean {
  return type === 'renko-v4' || type === 'renko-v5'
}

const base = getSeriesTransform('renko-v4')

registerSeriesTransform('renko-v5', {
  ...base,
  name: 'Renko Version 5',
  inputs: [
    {
      key: 'mode', type: 'select', label: 'Brick sizing', default: 'atr',
      options: [
        { label: 'ATR (locked at seed)', value: 'atr' },
        { label: 'Percentage at seed', value: 'percent' },
        { label: 'Fixed points', value: 'points' },
      ],
    },
    { key: 'atrPeriod', type: 'number', label: 'ATR period', default: 14, min: 1, max: 500, step: 1 },
    { key: 'atrMultiplier', type: 'number', label: 'ATR multiplier', default: 1, min: 0.1, step: 0.1 },
    ...(base.inputs ?? []).filter((input) => input.key !== 'mode' && input.key !== 'boxSize'),
  ],
  create: (options) => currentRenkoRun() ?? new RenkoV4Run(
    { ...options, mode: options.mode ?? 'atr' } as RenkoV4Options, 60
  ),
})
