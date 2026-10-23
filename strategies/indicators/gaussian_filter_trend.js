/**
 * Gaussian Filter Trend [QuantAlgo]
 *
 * Implements QuantAlgo's Gaussian Filter Trend:
 * - Multi-pole Gaussian filter (1 to 4 cascaded poles) for ultra-smooth lag-reduced noise filtering
 * - Adaptive ATR Deadband dynamically scaled by Kaufman's Efficiency Ratio (Kaufman ER + EMA smoothing)
 * - Trailing stepping trendline that filters chop and locks onto directional swings
 * - Presets: Default, Fast Response, Smooth Trend
 * - Green bullish / golden-yellow bearish lines, distinct from HalfTrend's blue/red palette
 * - Medium triangles outside candles and a slightly thicker trend line
 * - Fast Response defaults, with balanced and smooth presets available
 * - Alert triggers without decorative overlays or dashboard tables
 * - Memory & CPU optimized (single-pass arrays, fast math, zero memory leaks)
 *
 * Author: QuantAlgo / Adapted for OpenAlgo Charting Terminal
 */

export default function ({
  registerIndicator,
  sourceValues,
}) {
  const bullColor = '#22c55e'
  const bearColor = '#facc15'

  // True Range calculation on bars
  function calcTR(bars) {
    const n = bars.length
    const tr = new Array(n).fill(0)
    if (n === 0) return tr
    tr[0] = bars[0].high - bars[0].low
    for (let i = 1; i < n; i++) {
      const h = bars[i].high
      const l = bars[i].low
      const pc = bars[i - 1].close
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    }
    return tr
  }

  // Pine Script ta.atr (Wilder's RMA of TR)
  function calcATR(bars, period) {
    const n = bars.length
    const tr = calcTR(bars)
    const atr = new Array(n).fill(null)
    if (n === 0 || period <= 0) return atr

    let sum = 0
    const alpha = 1 / period
    for (let i = 0; i < n; i++) {
      if (i < period) {
        sum += tr[i]
        if (i === period - 1) {
          atr[i] = sum / period
        }
      } else {
        atr[i] = alpha * tr[i] + (1 - alpha) * atr[i - 1]
      }
    }
    return atr
  }

  // Pine Script ta.ema
  function calcEMA(values, length) {
    const n = values.length
    const ema = new Array(n).fill(null)
    if (n === 0 || length <= 0) return ema

    const alpha = 2 / (length + 1)
    let sum = 0
    let count = 0

    for (let i = 0; i < n; i++) {
      const v = values[i]
      if (v === null || !Number.isFinite(v)) continue

      if (count < length) {
        sum += v
        count++
        if (count === length) {
          ema[i] = sum / length
        }
      } else {
        ema[i] = alpha * v + (1 - alpha) * ema[i - 1]
      }
    }
    return ema
  }

  // Multi-pole Gaussian Filter
  function calcGaussianFilter(src, length, poleCount) {
    const n = src.length
    const out = new Array(n).fill(null)
    if (n === 0) return out

    const safeLen = Math.max(2, length)
    const safePoles = Math.min(4, Math.max(1, poleCount))

    // beta = (1 - cos(2*pi/len)) / (1.414^(2/poles) - 1)
    const beta = (1 - Math.cos((2 * Math.PI) / safeLen)) / (Math.pow(1.414, 2.0 / safePoles) - 1)
    const alpha = -beta + Math.sqrt(beta * beta + 2 * beta)

    let stage1 = src[0]
    let stage2 = src[0]
    let stage3 = src[0]
    let stage4 = src[0]

    for (let i = 0; i < n; i++) {
      const val = src[i]
      stage1 = alpha * val + (1 - alpha) * stage1
      stage2 = alpha * stage1 + (1 - alpha) * stage2
      stage3 = alpha * stage2 + (1 - alpha) * stage3
      stage4 = alpha * stage3 + (1 - alpha) * stage4

      if (safePoles <= 1) {
        out[i] = stage1
      } else if (safePoles === 2) {
        out[i] = stage2
      } else if (safePoles === 3) {
        out[i] = stage3
      } else {
        out[i] = stage4
      }
    }

    return out
  }

  registerIndicator({
    id: 'oa-gaussian-filter-trend',
    name: 'Gaussian Filter Trend [QuantAlgo]',
    category: 'Trend',
    placement: 'onchart',

    inputs: [
      // 1. Preset Configuration
      {
        key: 'preset',
        type: 'select',
        label: 'Preset Configuration',
        default: 'Fast Response',
        options: [
          { label: 'Responsive', value: 'Default' },
          { label: 'Balanced (14/4)', value: 'Balanced' },
          { label: 'Fast Response (Intraday 8/2)', value: 'Fast Response' },
          { label: 'Smooth Trend (Position 21/4)', value: 'Smooth Trend' },
        ],
        group: '1. Preset & Filter',
      },
      {
        key: 'source',
        type: 'source',
        label: 'Price Source',
        default: 'close',
        group: '1. Preset & Filter',
      },
      {
        key: 'length',
        type: 'number',
        label: 'Gaussian Length',
        default: 14,
        min: 2,
        max: 500,
        step: 1,
        group: '1. Preset & Filter',
      },
      {
        key: 'poles',
        type: 'number',
        label: 'Poles (1 to 4)',
        default: 4,
        min: 1,
        max: 4,
        step: 1,
        group: '1. Preset & Filter',
      },

      // 2. Trend Width Settings
      {
        key: 'atrLength',
        type: 'number',
        label: 'ATR Length',
        default: 14,
        min: 1,
        max: 200,
        step: 1,
        group: '2. Trend Width',
      },
      {
        key: 'fixedMultiplier',
        type: 'number',
        label: 'Fixed Width Multiplier',
        default: 1.5,
        min: 0.1,
        max: 20,
        step: 0.1,
        group: '2. Trend Width',
      },
      {
        key: 'adaptiveWidth',
        type: 'boolean',
        label: 'Adaptive Width',
        default: true,
        group: '2. Trend Width',
      },
      {
        key: 'efficiencyLength',
        type: 'number',
        label: 'Efficiency Length',
        default: 10,
        min: 2,
        max: 100,
        step: 1,
        group: '2. Trend Width',
      },
      {
        key: 'trendMultiplier',
        type: 'number',
        label: 'Adaptive Trend Multiplier',
        default: 0.8,
        min: 0.1,
        max: 20,
        step: 0.1,
        group: '2. Trend Width',
      },
      {
        key: 'chopMultiplier',
        type: 'number',
        label: 'Adaptive Chop Multiplier',
        default: 2.5,
        min: 0.1,
        max: 20,
        step: 0.1,
        group: '2. Trend Width',
      },
      {
        key: 'efficiencySmooth',
        type: 'number',
        label: 'Efficiency Smoothing',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
        group: '2. Trend Width',
      },

      // 3. Visual & Style Settings
      {
        key: 'showTrend',
        type: 'boolean',
        label: 'Show Trend Line',
        default: true,
        group: '3. Visual Settings',
      },
      {
        key: 'showSignals',
        type: 'boolean',
        label: 'Show Trend Change Triangles',
        default: true,
        group: '3. Visual Settings',
      },

    ],

    plots: [
      {
        key: 'trendLineBull',
        type: 'line',
        title: 'Gaussian Trend Bull',
        style: { color: bullColor, lineWidth: 4 },
      },
      {
        key: 'trendLineBear',
        type: 'line',
        title: 'Gaussian Trend Bear',
        style: { color: bearColor, lineWidth: 4 },
      },
    ],

    calc(bars, inputs) {
      const n = bars.length
      const outTrendLineBull = new Array(n).fill(null)
      const outTrendLineBear = new Array(n).fill(null)

      const trendSeries = new Array(n).fill(0)
      const signalsSeries = new Array(n).fill(0)
      const trendLineArr = new Array(n).fill(null)
      const erArr = new Array(n).fill(0)

      if (n === 0) {
        return {
          trendLineBull: outTrendLineBull,
          trendLineBear: outTrendLineBear,
          trend: trendSeries,
          signals: signalsSeries,
          trendLine: trendLineArr,
          efficiency: erArr,
        }
      }

      // Handle Preset Overrides
      const preset = String(inputs.preset || 'Fast Response')
      let gLen = Number(inputs.length ?? 14)
      let gPoles = Number(inputs.poles ?? 4)
      let atrLen = Number(inputs.atrLength ?? 14)
      let fixedMult = Number(inputs.fixedMultiplier ?? 1.5)
      let effLen = Number(inputs.efficiencyLength ?? 10)
      let trendMult = Number(inputs.trendMultiplier ?? 0.8)
      let chopMult = Number(inputs.chopMultiplier ?? 2.5)
      let effSmooth = Number(inputs.efficiencySmooth ?? 5)

      if (preset === 'Fast Response' || preset === 'Default') {
        gLen = 8
        gPoles = 2
        atrLen = 10
        fixedMult = 1.2
        effLen = 7
        trendMult = 0.6
        chopMult = 1.8
        effSmooth = 3
      } else if (preset === 'Smooth Trend') {
        gLen = 21
        gPoles = 4
        atrLen = 21
        fixedMult = 2.0
        effLen = 18
        trendMult = 1.0
        chopMult = 3.2
        effSmooth = 8
      }

      const adaptiveWidth = Boolean(inputs.adaptiveWidth ?? true)
      const showTrend = Boolean(inputs.showTrend ?? true)

      // Price Source
      const srcKey = inputs.source || 'close'
      const src = sourceValues ? sourceValues(bars, srcKey) : bars.map((b) => b[srcKey] ?? b.close)

      // 1. Gaussian Filter
      const filteredPrice = calcGaussianFilter(src, gLen, gPoles)

      // 2. Efficiency Ratio
      // net_move = abs(src - src[effLen])
      // path_length = sum(abs(change(src)), effLen)
      const rawER = new Array(n).fill(0)
      const absChanges = new Array(n).fill(0)
      for (let i = 1; i < n; i++) {
        absChanges[i] = Math.abs(src[i] - src[i - 1])
      }

      let runningPath = 0
      for (let i = 0; i < n; i++) {
        runningPath += absChanges[i]
        if (i >= effLen) {
          runningPath -= absChanges[i - effLen]
        }
        if (i >= effLen) {
          const netMove = Math.abs(src[i] - src[i - effLen])
          rawER[i] = runningPath > 0 ? netMove / runningPath : 0
        } else {
          rawER[i] = 0
        }
      }

      // Smoothed Efficiency Ratio (EMA)
      const smoothedER = calcEMA(rawER, effSmooth)

      // 3. Trend Width (ATR * Multiplier)
      const atrSeries = calcATR(bars, atrLen)

      // 4. Stepping Trend Line State Machine
      let trendLine = filteredPrice[0] ?? src[0]
      let trendDir = 0

      for (let i = 0; i < n; i++) {
        const curFiltered = filteredPrice[i]
        const curATR = atrSeries[i] ?? (bars[i].high - bars[i].low)
        const curEff = smoothedER[i] ?? 0
        erArr[i] = curEff

        const widthMult = adaptiveWidth
          ? chopMult + (trendMult - chopMult) * curEff
          : fixedMult

        const trendWidth = curATR * widthMult
        const upperBand = curFiltered + trendWidth
        const lowerBand = curFiltered - trendWidth

        const prevTrendLine = trendLine
        const prevTrendDir = trendDir

        if (upperBand < trendLine) {
          trendLine = upperBand
        }
        if (lowerBand > trendLine) {
          trendLine = lowerBand
        }

        const steppedUp = trendLine > prevTrendLine
        const steppedDown = trendLine < prevTrendLine

        if (steppedUp) {
          trendDir = 1
        } else if (steppedDown) {
          trendDir = -1
        }

        trendSeries[i] = trendDir
        trendLineArr[i] = trendLine

        // Join colour segments at a reversal so the line stays continuous.
        if (showTrend && i > 0 && trendDir !== prevTrendDir) {
          if (trendDir === 1) outTrendLineBull[i - 1] = prevTrendLine
          else if (trendDir === -1) outTrendLineBear[i - 1] = prevTrendLine
        }

        // Trend line output
        if (showTrend) {
          if (trendDir === 1) {
            outTrendLineBull[i] = trendLine
          } else if (trendDir === -1) {
            outTrendLineBear[i] = trendLine
          }
        }

        // Detect Trend Flips for Triangle Markers & Alerts
        if (trendDir === 1 && prevTrendDir !== 1) {
          signalsSeries[i] = 1 // Bullish Flip
        } else if (trendDir === -1 && prevTrendDir !== -1) {
          signalsSeries[i] = -1 // Bearish Flip
        }
      }

      return {
        trendLineBull: outTrendLineBull,
        trendLineBear: outTrendLineBear,
        trend: trendSeries,
        signals: signalsSeries,
        trendLine: trendLineArr,
        efficiency: erArr,
      }
    },

    markers({ bars, values, settings }) {
      if (settings.showSignals === false || !values.signals) return []
      const out = []
      const n = bars.length

      for (let i = 0; i < n; i++) {
        const sig = values.signals[i]
        if (!sig) continue

        const bar = bars[i]
        // Use candle prices explicitly: aboveBar/belowBar otherwise anchor to
        // this study's own plot, where HalfTrend's line and labels also sit.
        const gap = Math.max((bar.high - bar.low) * 0.3, Math.abs(bar.close) * 0.0001)

        if (sig === 1) {
          // A clear, medium green triangle below the trend-change candle.
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.low - gap,
            shape: 'triangleUp',
            size: 'medium',
            color: bullColor,
          })
        } else if (sig === -1) {
          // A clear, medium yellow triangle above the trend-change candle.
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.high + gap,
            shape: 'triangleDown',
            size: 'medium',
            color: bearColor,
          })
        }
      }
      return out
    },

    alerts: [
      {
        id: 'gaussian-filter-bullish-trend',
        title: 'Gaussian Filter Bullish Trend [BUY]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Gaussian Filter Trend: BULLISH trend confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === 1,
      },
      {
        id: 'gaussian-filter-bearish-trend',
        title: 'Gaussian Filter Bearish Trend [SELL]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Gaussian Filter Trend: BEARISH trend confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === -1,
      },
      {
        id: 'gaussian-filter-state-change',
        title: 'Gaussian Filter Any Trend Change',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Gaussian Filter Trend: Trend state changed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === 1 || values.signals?.[index] === -1,
      },
    ],
  })
}
