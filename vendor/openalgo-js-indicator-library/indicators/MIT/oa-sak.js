/**
 * SAK: Swiss Army Knife Indicator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/sak.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * John Ehlers' unified second-order IIR filter framework (TASC January 2006):
 * one recursion, Filt = c0 * (b0*P + b1*P[1] + b2*P[2]) + a1*Filt[1] + a2*Filt[2],
 * whose coefficient set selects EMA, SMA, Gaussian, Butterworth, Smoother,
 * highpass, 2-pole highpass, bandpass or bandstop behaviour.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-sak',
    name: 'SAK: Swiss Army Knife Indicator',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'filterType',
        type: 'select',
        label: 'Filter Type',
        default: 'BP',
        options: [
          { label: 'EMA', value: 'EMA' },
          { label: 'SMA', value: 'SMA' },
          { label: 'Gauss', value: 'Gauss' },
          { label: 'Butter', value: 'Butter' },
          { label: 'Smooth', value: 'Smooth' },
          { label: 'HP', value: 'HP' },
          { label: '2PHP', value: '2PHP' },
          { label: 'BP', value: 'BP' },
          { label: 'BS', value: 'BS' },
        ],
      },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
      {
        key: 'n',
        type: 'number',
        label: 'SMA Length (N)',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Only used for SMA mode',
      },
      {
        key: 'delta',
        type: 'number',
        label: 'Delta (BW)',
        default: 0.1,
        min: 0.01,
        max: 10,
        step: 0.01,
        tooltip: 'Bandwidth for BP/BS modes',
      },
    ],

    plots: [{ key: 'sak', type: 'line', title: 'SAK', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const n = Math.max(1, Math.floor(Number(settings.n) || 10))
      const delta = Math.max(0.01, Number(settings.delta) || 0.1)
      const allowed = ['EMA', 'SMA', 'Gauss', 'Butter', 'Smooth', 'HP', '2PHP', 'BP', 'BS']
      const filterType = allowed.includes(settings.filterType) ? settings.filterType : 'BP'

      const out = new Array(bars.length).fill(NaN)
      // Pine's sak() filters close, not an input source.
      const src = bars.map((b) => b.close)

      const TWO_PI = 2 * Math.PI
      const safeDiv = (a, b) => (Number.isFinite(b) && Math.abs(b) > 1e-12 ? a / b : NaN)

      // Compute alpha, beta and gamma from the period and the filter mode.
      let alpha = 0
      let beta1 = 0
      let gamma1 = 0
      if (filterType === 'BP' || filterType === 'BS') {
        gamma1 = safeDiv(1, Math.cos((TWO_PI * delta) / period))
        beta1 = Math.cos(TWO_PI / period)
        alpha = gamma1 - Math.sqrt(Math.max(0, gamma1 * gamma1 - 1))
      } else if (filterType === 'Gauss' || filterType === 'Butter' || filterType === '2PHP') {
        beta1 = 2.415 * (1 - Math.cos(TWO_PI / period))
        alpha = -beta1 + Math.sqrt(Math.max(0, beta1 * beta1 + 2 * beta1))
      } else {
        // EMA, HP, SMA, Smooth
        const cosW = Math.cos(TWO_PI / period)
        alpha = safeDiv(cosW + Math.sin(TWO_PI / period) - 1, cosW)
      }

      // Unified coefficients.
      let c0 = 1
      let c1 = 0
      let b0 = 1
      let b1 = 0
      let b2 = 0
      let a1 = 0
      let a2 = 0

      if (filterType === 'EMA') {
        c0 = 1; b0 = alpha; b1 = 0; b2 = 0; a1 = 1 - alpha; a2 = 0
      } else if (filterType === 'SMA') {
        c0 = 1; c1 = 1 / n; b0 = 1 / n; b1 = 0; b2 = 0; a1 = 1; a2 = 0
      } else if (filterType === 'Gauss') {
        c0 = alpha * alpha; b0 = 1; b1 = 0; b2 = 0
        a1 = 2 * (1 - alpha); a2 = -(1 - alpha) * (1 - alpha)
      } else if (filterType === 'Butter') {
        c0 = (alpha * alpha) / 4; b0 = 1; b1 = 2; b2 = 1
        a1 = 2 * (1 - alpha); a2 = -(1 - alpha) * (1 - alpha)
      } else if (filterType === 'Smooth') {
        c0 = (alpha * alpha) / 4; b0 = 1; b1 = 2; b2 = 1; a1 = 0; a2 = 0
      } else if (filterType === 'HP') {
        c0 = 1 - alpha / 2; b0 = 1; b1 = -1; b2 = 0; a1 = 1 - alpha; a2 = 0
      } else if (filterType === '2PHP') {
        c0 = (1 - alpha / 2) * (1 - alpha / 2); b0 = 1; b1 = -2; b2 = 1
        a1 = 2 * (1 - alpha); a2 = -(1 - alpha) * (1 - alpha)
      } else if (filterType === 'BP') {
        c0 = (1 - alpha) / 2; b0 = 1; b1 = 0; b2 = -1
        a1 = beta1 * (1 + alpha); a2 = -alpha
      } else if (filterType === 'BS') {
        c0 = (1 + alpha) / 2; b0 = 1; b1 = -2 * beta1; b2 = 1
        a1 = beta1 * (1 + alpha); a2 = -alpha
      }

      // A degenerate period (cos crossing zero) leaves the coefficients undefined;
      // Pine would propagate na, so the whole column stays blank.
      const coeffs = [c0, c1, b0, b1, b2, a1, a2]
      if (coeffs.some((v) => !Number.isFinite(v))) return { sak: nulls(out) }

      // Pine wraps every history read in nz(), so a missing bar reads as 0 and the
      // recursion emits from the first bar rather than after a warmup gap.
      const nz = (v) => (Number.isFinite(v) ? v : 0)
      const res = new Array(bars.length).fill(0)

      for (let i = 0; i < bars.length; i++) {
        const s0 = nz(src[i])
        const r1 = i >= 1 ? res[i - 1] : 0
        if (filterType === 'SMA') {
          // result := c1*src + a1*result[1] - c1*src[n]
          const sN = i >= n ? nz(src[i - n]) : 0
          res[i] = c1 * s0 + a1 * r1 - c1 * sN
        } else {
          const s1 = i >= 1 ? nz(src[i - 1]) : 0
          const s2 = i >= 2 ? nz(src[i - 2]) : 0
          const r2 = i >= 2 ? res[i - 2] : 0
          res[i] = c0 * (b0 * s0 + b1 * s1 + b2 * s2) + a1 * r1 + a2 * r2
        }
        out[i] = Number.isFinite(res[i]) ? res[i] : NaN
        if (!Number.isFinite(res[i])) res[i] = 0
      }

      return { sak: nulls(out) }
    },
  })
}
