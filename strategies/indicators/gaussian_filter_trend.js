/**
 * Gaussian Filter Trend [QuantAlgo]
 *
 * Implements QuantAlgo's Gaussian Filter Trend:
 * - Multi-pole Gaussian filter (1 to 4 cascaded poles) for ultra-smooth lag-reduced noise filtering
 * - Adaptive ATR Deadband dynamically scaled by Kaufman's Efficiency Ratio (Kaufman ER + EMA smoothing)
 * - Trailing stepping trendline that filters chop and locks onto directional swings
 * - Presets: Default, Fast Response, Smooth Trend
 * - Color Presets: Custom, Classic, Aqua, Cosmic, Cyber, Neon
 * - Orbiting star field visualization (inner & outer orbiting harmonics)
 * - Modern, uncluttered little arrow markers (arrowUp / arrowDown) at trend flips
 * - Live telemetry dashboard table and alert triggers
 * - Memory & CPU optimized (single-pass arrays, fast math, zero memory leaks)
 *
 * Author: QuantAlgo / Adapted for OpenAlgo Charting Terminal
 */

export default function ({
  registerIndicator,
  sourceValues,
}) {
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

  // Pine Script ta.sma
  function calcSMA(values, length) {
    const n = values.length
    const out = new Array(n).fill(null)
    if (n === 0 || length <= 0) return out

    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += values[i]
      if (i >= length) {
        sum -= values[i - length]
      }
      if (i >= length - 1) {
        out[i] = sum / length
      }
    }
    return out
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
        default: 'Default',
        options: [
          { label: 'Default (Balanced 14/4)', value: 'Default' },
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
        key: 'colorPreset',
        type: 'select',
        label: 'Color Preset',
        default: 'Custom',
        options: [
          { label: 'Custom', value: 'Custom' },
          { label: 'Classic (Green/Red)', value: 'Classic' },
          { label: 'Aqua (Cyan/Orange)', value: 'Aqua' },
          { label: 'Cosmic (Teal/Purple)', value: 'Cosmic' },
          { label: 'Cyber (Cyan/Orange)', value: 'Cyber' },
          { label: 'Neon (Yellow/Magenta)', value: 'Neon' },
        ],
        group: '3. Visual Settings',
      },
      {
        key: 'bullishColor',
        type: 'color',
        label: 'Bullish Color',
        default: '#00ffaa',
        group: '3. Visual Settings',
      },
      {
        key: 'bearishColor',
        type: 'color',
        label: 'Bearish Color',
        default: '#ff3344',
        group: '3. Visual Settings',
      },
      {
        key: 'showTrend',
        type: 'boolean',
        label: 'Show Trend Line',
        default: true,
        group: '3. Visual Settings',
      },
      {
        key: 'showStars',
        type: 'boolean',
        label: 'Show Orbiting Stars',
        default: true,
        group: '3. Visual Settings',
      },
      {
        key: 'showSignals',
        type: 'boolean',
        label: 'Show Buy/Sell Arrow Markers',
        default: true,
        group: '3. Visual Settings',
      },

      // 4. Dashboard
      {
        key: 'showDash',
        type: 'boolean',
        label: 'Show Dashboard Table',
        default: true,
        group: '4. Dashboard',
      },
      {
        key: 'dashLoc',
        type: 'select',
        label: 'Location',
        default: 'Top Right',
        options: [
          { label: 'Top Right', value: 'Top Right' },
          { label: 'Bottom Right', value: 'Bottom Right' },
          { label: 'Bottom Left', value: 'Bottom Left' },
        ],
        group: '4. Dashboard',
      },
    ],

    plots: [
      {
        key: 'trendLineBull',
        type: 'line',
        title: 'Gaussian Trend Bull',
        colorKey: 'bullishColor',
        style: { lineWidth: 3 },
      },
      {
        key: 'trendLineBear',
        type: 'line',
        title: 'Gaussian Trend Bear',
        colorKey: 'bearishColor',
        style: { lineWidth: 3 },
      },
      {
        key: 'innerStarA',
        type: 'line',
        title: 'Inner Star A',
        colorKey: 'bullishColor',
        style: { lineWidth: 2, lineStyle: 'dotted' },
      },
      {
        key: 'innerStarB',
        type: 'line',
        title: 'Inner Star B',
        colorKey: 'bearishColor',
        style: { lineWidth: 2, lineStyle: 'dotted' },
      },
      {
        key: 'outerStarA',
        type: 'line',
        title: 'Outer Star A',
        colorKey: 'bullishColor',
        style: { lineWidth: 1, lineStyle: 'dashed' },
      },
      {
        key: 'outerStarB',
        type: 'line',
        title: 'Outer Star B',
        colorKey: 'bearishColor',
        style: { lineWidth: 1, lineStyle: 'dashed' },
      },
    ],

    calc(bars, inputs) {
      const n = bars.length
      const outTrendLineBull = new Array(n).fill(null)
      const outTrendLineBear = new Array(n).fill(null)
      const outInnerStarA = new Array(n).fill(null)
      const outInnerStarB = new Array(n).fill(null)
      const outOuterStarA = new Array(n).fill(null)
      const outOuterStarB = new Array(n).fill(null)

      const trendSeries = new Array(n).fill(0)
      const signalsSeries = new Array(n).fill(0)
      const trendLineArr = new Array(n).fill(null)
      const erArr = new Array(n).fill(0)

      if (n === 0) {
        return {
          trendLineBull: outTrendLineBull,
          trendLineBear: outTrendLineBear,
          innerStarA: outInnerStarA,
          innerStarB: outInnerStarB,
          outerStarA: outOuterStarA,
          outerStarB: outOuterStarB,
          trend: trendSeries,
          signals: signalsSeries,
          trendLine: trendLineArr,
          efficiency: erArr,
        }
      }

      // Handle Preset Overrides
      const preset = String(inputs.preset || 'Default')
      let gLen = Number(inputs.length ?? 14)
      let gPoles = Number(inputs.poles ?? 4)
      let atrLen = Number(inputs.atrLength ?? 14)
      let fixedMult = Number(inputs.fixedMultiplier ?? 1.5)
      let effLen = Number(inputs.efficiencyLength ?? 10)
      let trendMult = Number(inputs.trendMultiplier ?? 0.8)
      let chopMult = Number(inputs.chopMultiplier ?? 2.5)
      let effSmooth = Number(inputs.efficiencySmooth ?? 5)

      if (preset === 'Fast Response') {
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
      const showStars = Boolean(inputs.showStars ?? true)

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

      // Visual Span for Orbiting Stars (SMA(high - low, 14))
      const barSpans = new Array(n)
      for (let i = 0; i < n; i++) {
        barSpans[i] = bars[i].high - bars[i].low
      }
      const visualSpan = calcSMA(barSpans, 14)

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

        // Trend line output
        if (showTrend) {
          if (trendDir === 1) {
            outTrendLineBull[i] = trendLine
          } else if (trendDir === -1) {
            outTrendLineBear[i] = trendLine
          }
        }

        // Orbiting Stars Calculation
        if (showStars) {
          const vSpan = visualSpan[i] ?? (bars[i].high - bars[i].low)
          const theta = i * 0.52
          const innerOrbit = vSpan * 0.85
          const outerOrbit = vSpan * 1.75

          outInnerStarA[i] = trendLine + Math.sin(theta) * innerOrbit
          outInnerStarB[i] = trendLine + Math.sin(theta + Math.PI) * innerOrbit
          outOuterStarA[i] = trendLine + Math.cos(theta * 0.71 + 1.1) * outerOrbit
          outOuterStarB[i] = trendLine + Math.cos(theta * 0.71 + 1.1 + Math.PI) * outerOrbit
        }

        // Detect Trend Flips for Arrow Markers & Alerts
        if (trendDir === 1 && prevTrendDir !== 1) {
          signalsSeries[i] = 1 // Bullish Flip
        } else if (trendDir === -1 && prevTrendDir !== -1) {
          signalsSeries[i] = -1 // Bearish Flip
        }
      }

      return {
        trendLineBull: outTrendLineBull,
        trendLineBear: outTrendLineBear,
        innerStarA: outInnerStarA,
        innerStarB: outInnerStarB,
        outerStarA: outOuterStarA,
        outerStarB: outOuterStarB,
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

      // Resolved Colors based on Color Preset
      const cp = settings.colorPreset || 'Custom'
      let bullColor = settings.bullishColor || '#00ffaa'
      let bearColor = settings.bearishColor || '#ff3344'

      if (cp === 'Classic') {
        bullColor = '#00ff00'
        bearColor = '#ff0000'
      } else if (cp === 'Aqua') {
        bullColor = '#00d4ff'
        bearColor = '#ff8c00'
      } else if (cp === 'Cosmic') {
        bullColor = '#49ffce'
        bearColor = '#9932cc'
      } else if (cp === 'Cyber') {
        bullColor = '#00cccc'
        bearColor = '#ff6600'
      } else if (cp === 'Neon') {
        bullColor = '#ffff00'
        bearColor = '#ff00ff'
      }

      for (let i = 0; i < n; i++) {
        const sig = values.signals[i]
        if (!sig) continue

        const bar = bars[i]
        const barSpan = Math.max((bar.high - bar.low) * 0.15, (bar.close || 1) * 0.0008)

        if (sig === 1) {
          // Modern, uncluttered little green arrow up
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.low - barSpan,
            shape: 'arrowUp',
            size: 'small',
            color: bullColor,
          })
        } else if (sig === -1) {
          // Modern, uncluttered little red arrow down
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.high + barSpan,
            shape: 'arrowDown',
            size: 'small',
            color: bearColor,
          })
        }
      }
      return out
    },

    table({ bars, values, settings }) {
      if (settings.showDash === false || bars.length === 0) return null
      const lastIdx = bars.length - 1
      const trend = values.trend?.[lastIdx] ?? 0
      const tLine = values.trendLine?.[lastIdx]
      const eff = values.efficiency?.[lastIdx] ?? 0
      const preset = String(settings.preset || 'Default')

      const trendText = trend === 1 ? '▲ BULLISH' : trend === -1 ? '▼ BEARISH' : '● NEUTRAL'
      const trendColor = trend === 1 ? '#10b981' : trend === -1 ? '#f43f5e' : '#94a3b8'
      const trendCellBg = trend === 1 ? 'rgba(16, 185, 129, 0.16)' : trend === -1 ? 'rgba(244, 63, 94, 0.16)' : 'rgba(255, 255, 255, 0.05)'

      let pos = 'top-right'
      if (settings.dashLoc === 'Bottom Left') pos = 'bottom-left'
      else if (settings.dashLoc === 'Bottom Right') pos = 'bottom-right'

      const headerTitleBg = 'rgba(15, 23, 42, 0.94)'
      const headerBadgeBg = 'rgba(30, 41, 59, 0.94)'
      const rowLabelBg = 'rgba(15, 23, 42, 0.88)'
      const rowValueBg = 'rgba(15, 23, 42, 0.82)'
      const labelColor = '#94a3b8'
      const valueColor = '#f8fafc'

      const rows = [
        [
          { text: '  Gaussian Filter Trend', bgColor: headerTitleBg, textColor: '#f8fafc', bold: true, align: 'left', fontSize: 11 },
          { text: `${preset} `, bgColor: headerBadgeBg, textColor: '#34d399', bold: true, align: 'right', fontSize: 11 },
        ],
        [
          { text: '  Trend Direction', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
          { text: `${trendText} `, bgColor: trendCellBg, textColor: trendColor, bold: true, align: 'right', fontSize: 11 },
        ],
      ]

      if (tLine !== null && tLine !== undefined) {
        rows.push([
          { text: '  Trend Level', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
          { text: `${Number(tLine).toFixed(2)} `, bgColor: rowValueBg, textColor: valueColor, bold: true, align: 'right', fontSize: 11 },
        ])
      }

      const effColor = eff > 0.5 ? '#10b981' : '#f59e0b'
      const effBg = eff > 0.5 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)'

      rows.push([
        { text: '  Efficiency Ratio', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
        { text: `${(eff * 100).toFixed(1)}% `, bgColor: effBg, textColor: effColor, bold: true, align: 'right', fontSize: 11 },
      ])

      return {
        rows,
        options: {
          position: pos,
          cellWidth: 'auto',
          cellHeight: 22,
          margin: 12,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          frameColor: 'rgba(52, 211, 153, 0.35)',
          frameWidth: 1,
          background: 'rgba(15, 23, 42, 0.90)',
        },
      }
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
