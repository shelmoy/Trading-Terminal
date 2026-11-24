// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, you can obtain one at https://mozilla.org/MPL/2.0/.
// Original Pine Script © BackQuant. Adapted for OpenAlgo Charts.

export default function ({ registerIndicator, sourceValues, withAlpha }) {
  const calcGroup = 'RMS True Range'
  const trendGroup = 'Trend Settings'
  const plotGroup = 'Plotting and Coloring'
  const bullish = '#00ff00'
  const bearish = '#ff0000'
  const tickers = new WeakMap()
  const color = ({ values, index, settings }) =>
    values.trendState[index] === 1 ? settings.longCol : settings.shortCol
  const transparentColor = (context, transparency) => withAlpha(color(context), 1 - transparency / 100)
  const gradFractions = [0.15, 0.35, 0.60, 0.82, 1]
  const gradColumns = ['plottedTrail', 'grad1', 'grad2', 'grad3', 'grad4', 'priceRef']
  const topTransparency = [82, 90, 94, 97, 99]
  const bottomTransparency = [52, 68, 79, 88, 95]
  const hiddenStyle = { visible: false, color: 'transparent', priceLineVisible: false, lastValueVisible: false }

  function priceGradient(band) {
    return {
      between: [gradColumns[band], gradColumns[band + 1]],
      opacity: 1,
      gradientBy(context) {
        const { a, b, values, index } = context
        if (a == null || b == null || a === b) return undefined
        const lowerTransparency = band === 0
          ? Math.max(25, 52 - values.strengthBoost[index])
          : bottomTransparency[band]
        return {
          topValue: Math.max(a, b),
          bottomValue: Math.min(a, b),
          topColor: transparentColor(context, topTransparency[band]),
          bottomColor: transparentColor(context, lowerTransparency),
        }
      },
    }
  }

  function alert(id, title, message, matches) {
    return {
      id,
      title,
      message: ({ bars }) => message.replace('{{ticker}}', tickers.get(bars) ?? '{{ticker}}'),
      when: ({ values, index }) => matches(values.flip[index]),
    }
  }

  registerIndicator({
    id: 'oa-rms-true-range-trend',
    name: 'RMS True Range Trend [BackQuant]',
    category: 'Trend',
    placement: 'onchart',
    inputs: [
      { key: 'src', type: 'source', label: 'Trend Source', default: 'hl2', group: calcGroup },
      { key: 'rmsLen', type: 'number', label: 'RMS Length', default: 14, min: 2, step: 1, group: calcGroup, inline: 'RMS' },
      { key: 'factor', type: 'number', label: 'Multiplier', default: 2, min: 0.1, step: 0.05, group: calcGroup, inline: 'RMS' },
      { key: 'breakOnFlip', type: 'boolean', label: 'Break Trail On Flips', default: true, group: trendGroup },
      { key: 'showGradient', type: 'boolean', label: 'Price Gradient', default: true, group: plotGroup },
      { key: 'showGlow', type: 'boolean', label: 'Trail Glow', default: true, group: plotGroup },
      { key: 'paintCandles', type: 'boolean', label: 'Color Candles', default: true, group: plotGroup },
      { key: 'plottedTrail:width', type: 'number', label: 'Line Width', default: 3, min: 1, max: 6, step: 1, group: plotGroup },
      { key: 'longCol', type: 'color', label: 'Bullish', default: bullish, group: plotGroup, inline: 'COL' },
      { key: 'shortCol', type: 'color', label: 'Bearish', default: bearish, group: plotGroup, inline: 'COL' },
    ],
    plots: [
      { key: 'plottedTrail', type: 'line', title: 'RMS True Range Trend', colorBy: color, style: { lineWidth: 3, color: bullish } },
      { key: 'tr', type: 'line', title: 'True Range', style: hiddenStyle },
      { key: 'rmsTR', type: 'line', title: 'RMS True Range', style: hiddenStyle },
      { key: 'rangeWidth', type: 'line', title: 'RMS Range Width', style: hiddenStyle },
      { key: 'upperBand', type: 'line', title: 'Upper Band', style: hiddenStyle },
      { key: 'lowerBand', type: 'line', title: 'Lower Band', style: hiddenStyle },
    ],
    fills: [
      ...gradFractions.map((_, band) => priceGradient(band)),
      {
        between: ['outerLower', 'outerUpper'],
        opacity: 1,
        colorBy: (context) => transparentColor(context, 96),
      },
      {
        between: ['glowLower', 'glowUpper'],
        opacity: 1,
        colorBy: (context) => transparentColor(
          context, Math.max(60, 84 - context.values.strengthBoost[context.index])
        ),
      },
    ],
    calc(bars, settings, _store, context) {
      if (context?.symbol) tickers.set(bars, context.symbol)
      const src = sourceValues(bars, settings.src, context)
      const length = settings.rmsLen
      const {
        tr, rmsTR, rangeWidth, upperBand, lowerBand, trendState, flip, plottedTrail,
        grad1, grad2, grad3, grad4, priceRef, strengthBoost,
        glowLower, glowUpper, outerLower, outerUpper,
      } = Object.fromEntries([
        'tr', 'rmsTR', 'rangeWidth', 'upperBand', 'lowerBand', 'trendState', 'flip', 'plottedTrail',
        'grad1', 'grad2', 'grad3', 'grad4', 'priceRef', 'strengthBoost',
        'glowLower', 'glowUpper', 'outerLower', 'outerUpper',
      ].map((key) => [key, new Array(bars.length).fill(null)]))
      const gradientColumns = [grad1, grad2, grad3, grad4, priceRef]
      const squares = new Array(bars.length)
      let squareSum = 0
      let rmsSum = 0

      for (let i = 0; i < bars.length; i++) {
        const { high, low, close } = bars[i]
        const priorClose = bars[i - 1]?.close
        tr[i] = priorClose === undefined
          ? high - low
          : Math.max(high - low, Math.abs(high - priorClose), Math.abs(low - priorClose))
        squares[i] = tr[i] * tr[i]
        squareSum += squares[i] - (squares[i - length] ?? 0)
        const rms = i >= length - 1 ? Math.sqrt(Math.max(0, squareSum) / length) : null
        rmsTR[i] = rms

        const prevTrend = trendState[i - 1]
        if (rmsTR[i - 1] == null) trendState[i] = src[i] != null && close >= src[i] ? 1 : -1

        const width = rms == null ? null : rms * settings.factor
        rangeWidth[i] = width
        const rawUpper = src[i] == null || width == null ? null : src[i] + width
        const rawLower = src[i] == null || width == null ? null : src[i] - width
        const prevUpper = upperBand[i - 1] ?? rawUpper
        const prevLower = lowerBand[i - 1] ?? rawLower
        upperBand[i] = prevUpper != null && (
          (rawUpper != null && rawUpper < prevUpper) || priorClose > prevUpper
        ) ? rawUpper : prevUpper
        lowerBand[i] = prevLower != null && (
          (rawLower != null && rawLower > prevLower) || priorClose < prevLower
        ) ? rawLower : prevLower

        if (rmsTR[i - 1] != null) {
          trendState[i] = prevTrend === -1
            ? (upperBand[i] != null && close > upperBand[i] ? 1 : -1)
            : (lowerBand[i] != null && close < lowerBand[i] ? -1 : 1)
        }
        flip[i] = prevTrend != null && trendState[i] !== prevTrend ? trendState[i] : 0
        const trail = trendState[i] === 1 ? lowerBand[i] : upperBand[i]
        plottedTrail[i] = settings.breakOnFlip && flip[i] ? null : trail

        rmsSum += (rms ?? 0) - (rmsTR[i - length] ?? 0)
        if (trail == null || rms == null) continue
        const baseline = i >= 2 * length - 2 ? rmsSum / length : 0
        const distanceStrength = width > 0 ? Math.min(Math.abs(close - trail) / width, 1) : 0
        const volatilityStrength = baseline > 0 ? Math.min(rms / (baseline * 1.5), 1) : 0
        const strength = Math.min(distanceStrength * 0.65 + volatilityStrength * 0.35, 1)
        strengthBoost[i] = Math.round(strength * 18)

        if (settings.showGradient && plottedTrail[i] != null) {
          for (let band = 0; band < 4; band++) {
            gradientColumns[band][i] = trail + (close - trail) * gradFractions[band]
          }
          priceRef[i] = close
        }
        if (settings.showGlow) {
          const glow = rms * (0.045 + strength * 0.025)
          glowLower[i] = trail - glow
          glowUpper[i] = trail + glow
          outerLower[i] = trail - glow * 2.25
          outerUpper[i] = trail + glow * 2.25
        }
      }

      return {
        tr, rmsTR, rangeWidth, upperBand, lowerBand, trendState, flip, plottedTrail,
        grad1, grad2, grad3, grad4, priceRef, strengthBoost,
        glowLower, glowUpper, outerLower, outerUpper,
      }
    },
    barColors({ values, settings }) {
      return settings.paintCandles
        ? values.trendState.map((state) => state === 1 ? settings.longCol : settings.shortCol)
        : []
    },
    alerts: [
      alert('bullish', 'RMS TR Bullish', 'RMS True Range Trend turned bullish on {{ticker}}', (flip) => flip === 1),
      alert('bearish', 'RMS TR Bearish', 'RMS True Range Trend turned bearish on {{ticker}}', (flip) => flip === -1),
      alert('flip', 'RMS TR Flip', 'RMS True Range Trend changed direction on {{ticker}}', (flip) => flip === 1 || flip === -1),
    ],
  })
}
