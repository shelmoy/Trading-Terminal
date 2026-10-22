/**
 * Ehlers Leading Indicator (ELI) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_leading_indicator.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A two stage recursive filter: the first stage adds a lead term built from the
 * change in price, the second stage smooths it, so the line turns ahead of an
 * ordinary exponential average of the same source.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ehlers-leading-indicator',
    name: 'Ehlers Leading Indicator (ELI)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'alpha1', type: 'number', label: 'Alpha 1', default: 0.25, min: 0.01, max: 1, step: 0.1 },
      { key: 'alpha2', type: 'number', label: 'Alpha 2', default: 0.33, min: 0.01, max: 1, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [
      { key: 'eli', type: 'line', title: 'ELI', style: { color: '#741b47', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const alpha1 = Math.min(1, Math.max(0.01, Number(settings.alpha1) || 0.25))
      const alpha2 = Math.min(1, Math.max(0.01, Number(settings.alpha2) || 0.33))
      const src = sourceValues(bars, settings.source ?? 'hl2')

      const eli = new Array(bars.length).fill(NaN)

      // Both series are var-carried and seeded through nz(), so Pine emits a
      // value from the very first bar; the first few are a warmup transient.
      let lead = 0
      let leading = 0

      for (let i = 0; i < bars.length; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : 0
        const sPrev = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0

        lead = 2 * s + (alpha1 - 2) * sPrev + (1 - alpha1) * lead
        leading = alpha2 * lead + (1 - alpha2) * leading
        eli[i] = leading
      }

      return { eli: nulls(eli) }
    },
  })
}
