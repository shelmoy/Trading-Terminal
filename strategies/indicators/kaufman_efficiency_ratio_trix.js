// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, you can obtain one at https://mozilla.org/MPL/2.0/.
// Original Pine Script © NJ_Algo. Adapted for OpenAlgo Charts.

export default function ({ registerIndicator, withAlpha }) {
  const display = '\u2727 DISPLAY \u2727'
  const calculation = '\u2727 CALCULATION \u2727'
  const colored = { long: '#008864', short: '#780020' }
  const neutral = { long: '#b3b3b3', short: '#3c3c3c' }
  const palette = (settings) => settings.colorMode === 'Neutral' ? neutral : colored
  const signalColor = (state, colors) => state === 1 ? colors.long : colors.short
  const opacity = (transparency) => 1 - Math.min(100, Math.max(0, transparency)) / 100
  const hidden = { visible: false, color: 'transparent', priceLineVisible: false, lastValueVisible: false }

  registerIndicator({
    id: 'oa-kert',
    name: 'KERT',
    category: 'Momentum',
    placement: 'pane',
    inputs: [
      {
        key: 'colorMode', type: 'select', label: 'Color mode', default: 'Colored',
        options: [{ label: 'Colored', value: 'Colored' }, { label: 'Neutral', value: 'Neutral' }],
        group: display,
      },
      { key: 'dispCandles', type: 'boolean', label: 'Color candles', default: true, group: display },
      { key: 'erTransp', type: 'number', label: 'ER transparency', default: 40, step: 1, group: display },
      { key: 'trixLen', type: 'number', label: 'TRIX length', default: 10, step: 1, group: calculation },
      { key: 'erLen', type: 'number', label: 'ER length', default: 15, step: 1, group: calculation },
      { key: 'erThr', type: 'number', label: 'ER threshold', default: 0.35, step: 0.05, group: calculation },
    ],
    plots: [
      {
        key: 'trix', type: 'line', title: 'TRIX', style: { color: colored.long, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => signalColor(values.state[index], palette(settings)),
      },
      {
        key: 'er', type: 'line', title: 'ER', style: { color: colored.long, lineWidth: 1 },
        colorBy: ({ value, settings }) => {
          const { long, short } = palette(settings)
          return withAlpha(value > settings.erThr ? long : short, opacity(settings.erTransp))
        },
      },
      { key: 'upperGlow', type: 'line', title: 'Upper glow', style: hidden },
      { key: 'lowerGlow', type: 'line', title: 'Lower glow', style: hidden },
    ],
    fills: [{
      between: ['upperGlow', 'lowerGlow'],
      opacity: 1,
      gradientBy({ a, b, index, values, settings }) {
        if (a == null || b == null || a === b) return undefined
        const { long, short } = palette(settings)
        const bullish = values.state[index] === 1
        // Keep the Pine stop order even when the latched state and TRIX sign differ.
        return {
          topValue: a,
          bottomValue: b,
          topColor: bullish ? 'rgba(0,0,0,0)' : withAlpha(short, 0.6),
          bottomColor: bullish ? withAlpha(long, 0.6) : 'rgba(0,0,0,0)',
        }
      },
    }],
    levels({ settings }) {
      const { long } = palette(settings)
      return [
        { price: 0, title: 'TRIX threshold', color: long, lineStyle: 'solid' },
        { price: settings.erThr, title: 'ER threshold', color: withAlpha(long, opacity(settings.erTransp)), lineStyle: 'solid' },
      ]
    },
    calc(bars, settings) {
      const { trixLen, erLen, erThr } = settings
      if (!Number.isInteger(trixLen) || trixLen <= 0 || !Number.isInteger(erLen) || erLen <= 0) {
        throw new RangeError('TRIX length and ER length must be positive integers')
      }
      const trix = new Array(bars.length).fill(null)
      const er = new Array(bars.length).fill(0)
      const state = new Array(bars.length).fill(0)
      const upperGlow = new Array(bars.length).fill(null)
      const lowerGlow = new Array(bars.length).fill(null)
      if (bars.length === 0) return { trix, er, state, upperGlow, lowerGlow }

      const alpha = 2 / (trixLen + 1)
      const decay = 1 - alpha
      let e1 = bars[0].close
      let e2 = e1
      let e3 = e1
      let movement = 0
      let signal = 0
      lowerGlow[0] = 0
      for (let i = 1; i < bars.length; i++) {
        const close = bars[i].close
        const priorE3 = e3
        e1 = alpha * close + decay * e1
        e2 = alpha * e1 + decay * e2
        e3 = alpha * e2 + decay * e3
        trix[i] = priorE3 === 0 ? null : 100 * (e3 - priorE3) / priorE3
        movement += Math.abs(close - bars[i - 1].close)
        if (i > erLen) {
          movement -= Math.abs(bars[i - erLen].close - bars[i - erLen - 1].close)
        }
        if (i >= erLen && movement > 0) {
          er[i] = Math.abs(close - bars[i - erLen].close) / movement
        }
        if (er[i] > erThr) {
          if (trix[i] > 0) signal = 1
          else if (trix[i] < 0) signal = -1
        }
        state[i] = signal
        upperGlow[i] = signal === 1 ? 0 : trix[i]
        lowerGlow[i] = signal === 1 ? trix[i] : 0
      }
      return { trix, er, state, upperGlow, lowerGlow }
    },
    barColors({ values, settings }) {
      const colors = palette(settings)
      return settings.dispCandles ? values.state.map((state) => signalColor(state, colors)) : []
    },
    alerts: [
      {
        id: 'bullish', title: 'Bullish condition',
        message: 'Kaufman Efficiency Ratio TRIX [NJ]: bullish condition',
        when: ({ values, index }) => index > 0 && values.state[index] === 1 && values.state[index - 1] !== 1,
      },
      {
        id: 'bearish', title: 'Bearish condition',
        message: 'Kaufman Efficiency Ratio TRIX [NJ]: bearish condition',
        when: ({ values, index }) => index > 0 && values.state[index] === -1 && values.state[index - 1] !== -1,
      },
    ],
  })
}
