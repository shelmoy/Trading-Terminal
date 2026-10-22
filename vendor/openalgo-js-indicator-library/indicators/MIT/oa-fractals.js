/**
 * Williams Fractals - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/fractals.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Marks the classic five-bar reversal: a bar whose high tops the two bars on
 * each side of it (resistance), or whose low undercuts them (support). The
 * pattern is only known two bars later, so the marker sits on the middle bar.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-fractals',
    name: 'Williams Fractals',
    category: 'Reversals',
    placement: 'onchart',

    inputs: [
      {
        key: 'showUp',
        type: 'boolean',
        label: 'Show Up Fractals',
        default: true,
        tooltip: 'Display bearish fractals (resistance).',
      },
      {
        key: 'showDown',
        type: 'boolean',
        label: 'Show Down Fractals',
        default: true,
        tooltip: 'Display bullish fractals (support).',
      },
    ],

    // The source draws nothing but plotshape markers. These two columns carry
    // the fractal prices the markers read; they are hidden because a visible
    // line through isolated points would connect bars that have no relation.
    plots: [
      { key: 'upFractal', type: 'line', title: 'Up Fractal', style: { color: '#ff5252', visible: false } },
      { key: 'downFractal', type: 'line', title: 'Down Fractal', style: { color: '#4caf50', visible: false } },
    ],

    calc(bars) {
      const up = new Array(bars.length).fill(NaN)
      const down = new Array(bars.length).fill(NaN)

      // Pine tests high[2] against high[0..4] on bar b and then draws with
      // offset=-2, which places the shape on bar b-2. Indexing the middle bar
      // directly as j = b - 2 is the same picture with no future reference.
      for (let j = 2; j < bars.length - 2; j++) {
        const h = bars[j].high
        const h2 = bars[j - 2].high
        const h1 = bars[j - 1].high
        const h3 = bars[j + 1].high
        const h4 = bars[j + 2].high
        if (
          Number.isFinite(h) &&
          Number.isFinite(h1) &&
          Number.isFinite(h2) &&
          Number.isFinite(h3) &&
          Number.isFinite(h4) &&
          h > h2 &&
          h > h1 &&
          h > h3 &&
          h > h4
        ) {
          up[j] = h
        }

        const l = bars[j].low
        const l2 = bars[j - 2].low
        const l1 = bars[j - 1].low
        const l3 = bars[j + 1].low
        const l4 = bars[j + 2].low
        if (
          Number.isFinite(l) &&
          Number.isFinite(l1) &&
          Number.isFinite(l2) &&
          Number.isFinite(l3) &&
          Number.isFinite(l4) &&
          l < l2 &&
          l < l1 &&
          l < l3 &&
          l < l4
        ) {
          down[j] = l
        }
      }

      return { upFractal: nulls(up), downFractal: nulls(down) }
    },

    markers({ bars, values, settings }) {
      const showUp = settings.showUp !== false
      const showDown = settings.showDown !== false
      const out = []

      for (let i = 0; i < bars.length; i++) {
        if (showUp) {
          const price = values.upFractal?.[i]
          if (Number.isFinite(price)) {
            // location.absolute in Pine: the shape sits exactly on the price,
            // so anchor with atPrice rather than aboveBar, which would resolve
            // against this indicator's own (hidden) series.
            out.push({
              time: bars[i].time,
              position: 'atPrice',
              price,
              shape: 'triangleDown',
              size: 'small',
              // Pine's color.red, the default of the i_color_up input.
              color: '#ff5252',
            })
          }
        }
        if (showDown) {
          const price = values.downFractal?.[i]
          if (Number.isFinite(price)) {
            out.push({
              time: bars[i].time,
              position: 'atPrice',
              price,
              shape: 'triangleUp',
              size: 'small',
              // Pine's color.green, the default of the i_color_down input.
              color: '#4caf50',
            })
          }
        }
      }

      return out
    },
  })
}
