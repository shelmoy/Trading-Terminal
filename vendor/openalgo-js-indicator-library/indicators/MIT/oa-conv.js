/**
 * Convolution Moving Average (CONV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/conv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response filter: the last N closes are weighted by an
 * arbitrary kernel and normalised by the weights actually used, so any shape of
 * smoother, differentiator or band-pass can be written as a list of numbers.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The Pine source hard-codes array.from(1.0, 2.5, -3.14, 0.0, 1.0). Here the
  // same numbers are the default of a text input, so the kernel stays editable
  // without a rebuild. Element 0 is the current bar, element 1 the bar before.
  const DEFAULT_KERNEL = [1.0, 2.5, -3.14, 0.0, 1.0]

  const parseKernel = (raw) => {
    if (typeof raw !== 'string') return DEFAULT_KERNEL
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    if (parts.length === 0) return DEFAULT_KERNEL
    const out = []
    for (const p of parts) {
      const v = Number(p)
      if (!Number.isFinite(v)) return DEFAULT_KERNEL
      out.push(v)
    }
    return out
  }

  registerIndicator({
    id: 'oa-conv',
    name: 'Convolution Moving Average (CONV)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'kernel',
        type: 'text',
        label: 'Kernel Weights',
        default: '1, 2.5, -3.14, 0, 1',
        tooltip: 'Comma separated weights, newest bar first. Anything unparsable falls back to the default kernel.',
      },
    ],

    plots: [{ key: 'conv', type: 'line', title: 'CONV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const kernel = parseKernel(settings.kernel)

      // Pine normalises the kernel by its own sum once, then normalises again
      // per bar by the weights that landed on real data. The first pass only
      // matters when the kernel sum is non-zero.
      let kernelSum = 0
      for (let i = 0; i < kernel.length; i++) kernelSum += kernel[i]
      const normKernel =
        kernelSum !== 0 ? kernel.map((w) => w * (1.0 / kernelSum)) : kernel.slice()

      const n = bars.length
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine uses math.min(bar_index + 1, kernel_size): a partial window on
        // the opening bars rather than a warmup gap.
        const p = Math.min(i + 1, normKernel.length)
        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          const w = normKernel[k]
          sum += price * w
          weightSum += w
        }
        // nz(sum / weight_sum, source): a kernel whose used weights cancel out
        // falls back to the raw source value for that bar.
        const value = weightSum !== 0 ? sum / weightSum : NaN
        out[i] = Number.isFinite(value) ? value : src[i]
      }

      return { conv: nulls(out) }
    },
  })
}
