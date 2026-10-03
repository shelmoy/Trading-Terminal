/**
 * SuperTrend AI (Clustering) [LuxAlgo]
 *
 * Implements LuxAlgo's SuperTrend AI with dynamic multi-factor Supertrend calculation,
 * Performance Memory tracking, and K-Means Clustering on past performance to dynamically select
 * optimal factors (Best, Average, Worst cluster) and adaptive trailing stop AMA.
 *
 * Fully integrated for OpenAlgo Charting Terminal.
 */

export default function ({
  registerIndicator,
  nulls,
}) {
  // Linear interpolation percentile helper matching Pine Script percentile_linear_interpolation
  function percentileLinearInterpolation(arr, p) {
    if (!arr || arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const n = sorted.length
    if (n === 1) return sorted[0]
    const rank = (p / 100) * (n - 1)
    const lowerIndex = Math.floor(rank)
    const upperIndex = Math.ceil(rank)
    const weight = rank - lowerIndex
    return sorted[lowerIndex] + weight * (sorted[upperIndex] - sorted[lowerIndex])
  }

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

  // Pine Script ta.atr (RMA of TR)
  function calcATR(bars, length) {
    const n = bars.length
    const tr = calcTR(bars)
    const atr = new Array(n).fill(null)
    if (n === 0 || length <= 0) return atr

    let sum = 0
    const alpha = 1 / length
    for (let i = 0; i < n; i++) {
      if (i < length) {
        sum += tr[i]
        if (i === length - 1) {
          atr[i] = sum / length
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

  registerIndicator({
    id: 'oa-supertrend-ai',
    name: 'SuperTrend AI (Clustering) [LuxAlgo]',
    category: 'Trend',
    placement: 'onchart',

    inputs: [
      // Settings
      {
        key: 'length',
        type: 'number',
        label: 'ATR Length',
        default: 10,
        min: 1,
        max: 500,
        step: 1,
        group: '1. Settings',
      },
      {
        key: 'minMult',
        type: 'number',
        label: 'Min Factor',
        default: 1,
        min: 0,
        max: 20,
        step: 1,
        group: '1. Settings',
      },
      {
        key: 'maxMult',
        type: 'number',
        label: 'Max Factor',
        default: 5,
        min: 0,
        max: 20,
        step: 1,
        group: '1. Settings',
      },
      {
        key: 'step',
        type: 'number',
        label: 'Factor Step',
        default: 0.5,
        min: 0.1,
        max: 5,
        step: 0.1,
        group: '1. Settings',
      },
      {
        key: 'perfAlpha',
        type: 'number',
        label: 'Performance Memory',
        default: 10,
        min: 2,
        max: 100,
        step: 1,
        group: '1. Settings',
      },
      {
        key: 'fromCluster',
        type: 'select',
        label: 'From Cluster',
        default: 'Best',
        options: [
          { label: 'Best', value: 'Best' },
          { label: 'Average', value: 'Average' },
          { label: 'Worst', value: 'Worst' },
        ],
        group: '1. Settings',
      },

      // Optimization
      {
        key: 'maxIter',
        type: 'number',
        label: 'Maximum Iteration Steps',
        default: 1000,
        min: 10,
        max: 5000,
        step: 10,
        group: '2. Optimization',
      },
      {
        key: 'maxData',
        type: 'number',
        label: 'Historical Bars Calculation',
        default: 10000,
        min: 50,
        max: 50000,
        step: 100,
        group: '2. Optimization',
      },

      // Style
      {
        key: 'bullCss',
        type: 'color',
        label: 'Bullish Color',
        default: '#00897b',
        group: '3. Style',
      },
      {
        key: 'bearCss',
        type: 'color',
        label: 'Bearish Color',
        default: '#e53935',
        group: '3. Style',
      },
      {
        key: 'amaBullCss',
        type: 'color',
        label: 'AMA Bull Color',
        default: '#26a69a',
        group: '3. Style',
      },
      {
        key: 'amaBearCss',
        type: 'color',
        label: 'AMA Bear Color',
        default: '#ef5350',
        group: '3. Style',
      },
      {
        key: 'showSignals',
        type: 'boolean',
        label: 'Show Signals & Labels',
        default: true,
        group: '3. Style',
      },
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
        key: 'tsBull',
        type: 'line',
        title: 'Trailing Stop Bull',
        colorKey: 'bullCss',
        style: { lineWidth: 2 },
      },
      {
        key: 'tsBear',
        type: 'line',
        title: 'Trailing Stop Bear',
        colorKey: 'bearCss',
        style: { lineWidth: 2 },
      },
      {
        key: 'amaBull',
        type: 'line',
        title: 'Trailing Stop AMA Bull',
        colorKey: 'amaBullCss',
        style: { lineWidth: 1 },
      },
      {
        key: 'amaBear',
        type: 'line',
        title: 'Trailing Stop AMA Bear',
        colorKey: 'amaBearCss',
        style: { lineWidth: 1 },
      },
    ],

    calc(bars, settings) {
      const n = bars.length
      const tsBull = new Array(n).fill(null)
      const tsBear = new Array(n).fill(null)
      const amaBull = new Array(n).fill(null)
      const amaBear = new Array(n).fill(null)

      // Store per-bar signals & dashboard data for markers/table hooks
      const signals = new Array(n).fill(0) // 1 = Buy, -1 = Sell
      const perfIdxArr = new Array(n).fill(0)
      const targetFactorArr = new Array(n).fill(0)
      const osArr = new Array(n).fill(0)

      if (n === 0) {
        return {
          tsBull,
          tsBear,
          amaBull,
          amaBear,
          signals,
          perfIdx: perfIdxArr,
          targetFactor: targetFactorArr,
          os: osArr,
        }
      }

      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      let minMult = Number(settings.minMult) || 1
      let maxMult = Number(settings.maxMult) || 5
      if (minMult > maxMult) {
        const tmp = minMult
        minMult = maxMult
        maxMult = tmp
      }
      const step = Math.max(0.1, Number(settings.step) || 0.5)
      const perfAlpha = Math.max(2, Number(settings.perfAlpha) || 10)
      const fromCluster = String(settings.fromCluster || 'Best')
      const maxIter = Math.max(10, Math.floor(Number(settings.maxIter) || 1000))
      const maxData = Math.max(10, Math.floor(Number(settings.maxData) || 10000))

      // Generate factors
      const factors = []
      const factorStepsCount = Math.floor((maxMult - minMult) / step)
      for (let i = 0; i <= factorStepsCount; i++) {
        factors.push(minMult + i * step)
      }

      // Initialize supertrend holder
      const holder = factors.map((factor) => ({
        factor,
        upper: (bars[0].high + bars[0].low) / 2,
        lower: (bars[0].high + bars[0].low) / 2,
        output: 0,
        perf: 0,
        trend: 0,
      }))

      const atr = calcATR(bars, length)

      // Performance denominator EMA of abs(close - close[1])
      const diffClose = new Array(n).fill(0)
      for (let i = 1; i < n; i++) {
        diffClose[i] = Math.abs(bars[i].close - bars[i - 1].close)
      }
      const den = calcEMA(diffClose, Math.floor(perfAlpha))

      const fromIdx = fromCluster === 'Best' ? 2 : fromCluster === 'Average' ? 1 : 0

      let upper = (bars[0].high + bars[0].low) / 2
      let lower = (bars[0].high + bars[0].low) / 2
      let os = 0
      let prevTs = null
      let perf_ama = null

      let lastTargetFactor = (minMult + maxMult) / 2

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const hl2 = (bar.high + bar.low) / 2
        const prevClose = i > 0 ? bars[i - 1].close : bar.close
        const currAtr = atr[i] || (bar.high - bar.low)

        // 1. Compute Supertrend for all candidate factors
        for (let k = 0; k < holder.length; k++) {
          const spt = holder[k]
          const up = hl2 + currAtr * spt.factor
          const dn = hl2 - currAtr * spt.factor

          if (i > 0) {
            spt.trend = bar.close > spt.upper ? 1 : bar.close < spt.lower ? 0 : spt.trend
            spt.upper = prevClose < spt.upper ? Math.min(up, spt.upper) : up
            spt.lower = prevClose > spt.lower ? Math.max(dn, spt.lower) : dn
            const diff = spt.output !== 0 ? Math.sign(prevClose - spt.output) : 0
            spt.perf += (2 / (perfAlpha + 1)) * (diff * (bar.close - prevClose) - spt.perf)
          } else {
            spt.trend = bar.close >= bar.open ? 1 : 0
            spt.upper = up
            spt.lower = dn
            spt.perf = 0
          }
          spt.output = spt.trend === 1 ? spt.lower : spt.upper
        }

        // 2. K-means clustering (when bar is within maxData window)
        let target_factor = lastTargetFactor
        let perf_idx = 0

        const isCalcBar = n - 1 - i <= maxData
        if (isCalcBar && holder.length >= 3) {
          const data = holder.map((h) => h.perf)
          const factorArray = holder.map((h) => h.factor)

          // Initial centroids using 25%, 50%, 75% quartiles
          let centroids = [
            percentileLinearInterpolation(data, 25),
            percentileLinearInterpolation(data, 50),
            percentileLinearInterpolation(data, 75),
          ]

          let perfclusters = [[], [], []]
          let factors_clusters = [[], [], []]

          for (let iter = 0; iter < maxIter; iter++) {
            perfclusters = [[], [], []]
            factors_clusters = [[], [], []]

            for (let dIdx = 0; dIdx < data.length; dIdx++) {
              const val = data[dIdx]
              let minDist = Infinity
              let bestCentroidIdx = 0
              for (let c = 0; c < centroids.length; c++) {
                const dist = Math.abs(val - centroids[c])
                if (dist < minDist) {
                  minDist = dist
                  bestCentroidIdx = c
                }
              }
              perfclusters[bestCentroidIdx].push(val)
              factors_clusters[bestCentroidIdx].push(factorArray[dIdx])
            }

            // Update centroids
            const newCentroids = []
            for (let c = 0; c < 3; c++) {
              const clusterVals = perfclusters[c]
              if (clusterVals.length > 0) {
                const avg = clusterVals.reduce((a, b) => a + b, 0) / clusterVals.length
                newCentroids.push(avg)
              } else {
                newCentroids.push(centroids[c])
              }
            }

            if (
              newCentroids[0] === centroids[0] &&
              newCentroids[1] === centroids[1] &&
              newCentroids[2] === centroids[2]
            ) {
              break
            }
            centroids = newCentroids
          }

          // Sort clusters by centroid value so 0 = Worst, 1 = Average, 2 = Best
          const clusterIndices = [0, 1, 2].sort((a, b) => centroids[a] - centroids[b])
          const sortedFactors = clusterIndices.map((idx) => factors_clusters[idx])
          const sortedPerf = clusterIndices.map((idx) => perfclusters[idx])

          const chosenFactors = sortedFactors[fromIdx]
          if (chosenFactors && chosenFactors.length > 0) {
            target_factor = chosenFactors.reduce((a, b) => a + b, 0) / chosenFactors.length
            lastTargetFactor = target_factor
          }

          const chosenPerf = sortedPerf[fromIdx]
          if (chosenPerf && chosenPerf.length > 0) {
            const avgPerf = chosenPerf.reduce((a, b) => a + b, 0) / chosenPerf.length
            const denVal = den[i] || 1
            perf_idx = Math.max(avgPerf, 0) / (denVal > 0 ? denVal : 1)
          }
        }

        targetFactorArr[i] = target_factor
        perfIdxArr[i] = perf_idx

        // 3. New Dynamic Supertrend with target factor
        const up = hl2 + currAtr * target_factor
        const dn = hl2 - currAtr * target_factor

        if (i > 0) {
          upper = prevClose < upper ? Math.min(up, upper) : up
          lower = prevClose > lower ? Math.max(dn, lower) : dn
          os = bar.close > upper ? 1 : bar.close < lower ? 0 : os
        } else {
          upper = up
          lower = dn
          os = bar.close >= bar.open ? 1 : 0
        }

        const ts = os === 1 ? lower : upper

        // Trailing Stop Adaptive MA (perf_ama)
        if (prevTs === null) {
          perf_ama = ts
        } else {
          perf_ama += perf_idx * (ts - perf_ama)
        }
        prevTs = ts

        osArr[i] = os

        // Check for Buy/Sell signals (trend flips)
        if (i > 0) {
          const prevOs = osArr[i - 1]
          if (os > prevOs) {
            signals[i] = 1 // Buy
          } else if (os < prevOs) {
            signals[i] = -1 // Sell
          }
        }

        // Plot assignments
        if (os === 1) {
          tsBull[i] = ts
        } else {
          tsBear[i] = ts
        }

        if (bar.close > perf_ama) {
          amaBull[i] = perf_ama
        } else {
          amaBear[i] = perf_ama
        }
      }

      return {
        tsBull: nulls(tsBull),
        tsBear: nulls(tsBear),
        amaBull: nulls(amaBull),
        amaBear: nulls(amaBear),
        signals,
        perfIdx: perfIdxArr,
        targetFactor: targetFactorArr,
        os: osArr,
      }
    },

    markers({ bars, values, settings }) {
      if (settings.showSignals === false) return []
      const n = bars.length
      if (n === 0) return []

      const signals = values.signals
      const perfIdx = values.perfIdx
      const tsBull = values.tsBull
      const tsBear = values.tsBear
      const bullColor = settings.bullCss || '#00897b'
      const bearColor = settings.bearCss || '#e53935'

      const out = []
      for (let i = 1; i < n; i++) {
        const sig = signals[i]
        if (sig === 1) {
          const pIdx = Math.round((perfIdx[i] || 0) * 10)
          const price = tsBull[i] ?? bars[i].low
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price,
            shape: 'labelUp',
            size: 'small',
            color: bullColor,
            text: `${pIdx}`,
          })
        } else if (sig === -1) {
          const pIdx = Math.round((perfIdx[i] || 0) * 10)
          const price = tsBear[i] ?? bars[i].high
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price,
            shape: 'labelDown',
            size: 'small',
            color: bearColor,
            text: `${pIdx}`,
          })
        }
      }
      return out
    },

    table({ bars, values, settings }) {
      if (settings.showDash === false || bars.length === 0) return null
      const lastIdx = bars.length - 1
      const targetFactor = values.targetFactor?.[lastIdx] ?? 0
      const perfIdx = values.perfIdx?.[lastIdx] ?? 0
      const os = values.os?.[lastIdx] ?? 0
      const fromCluster = String(settings.fromCluster || 'Best')

      const trendText = os === 1 ? '▲ BULLISH' : '▼ BEARISH'
      const trendColor = os === 1 ? '#10b981' : '#f43f5e'
      const trendCellBg = os === 1 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)'

      let pos = 'top-right'
      if (settings.dashLoc === 'Bottom Left') pos = 'bottom-left'
      else if (settings.dashLoc === 'Bottom Right') pos = 'bottom-right'

      const headerTitleBg = 'rgba(15, 23, 42, 0.94)'
      const headerBadgeBg = 'rgba(30, 41, 59, 0.94)'
      const rowLabelBg = 'rgba(15, 23, 42, 0.88)'
      const rowValueBg = 'rgba(15, 23, 42, 0.82)'
      const labelColor = '#94a3b8'
      const valueColor = '#f8fafc'

      return {
        rows: [
          [
            { text: '  SuperTrend AI [LuxAlgo]', bgColor: headerTitleBg, textColor: '#f8fafc', bold: true, align: 'left', fontSize: 11 },
            { text: `${fromCluster} Cluster `, bgColor: headerBadgeBg, textColor: '#fbbf24', bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Market Regime', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${trendText} `, bgColor: trendCellBg, textColor: trendColor, bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Optimal Factor', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${targetFactor.toFixed(2)} `, bgColor: rowValueBg, textColor: valueColor, bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Performance Index', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${(perfIdx * 10).toFixed(1)} `, bgColor: 'rgba(16, 185, 129, 0.14)', textColor: '#10b981', bold: true, align: 'right', fontSize: 11 },
          ],
        ],
        options: {
          position: pos,
          cellWidth: 'auto',
          cellHeight: 22,
          margin: 12,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          frameColor: 'rgba(251, 191, 36, 0.35)',
          frameWidth: 1,
          background: 'rgba(15, 23, 42, 0.90)',
        },
      }
    },

    alerts: [
      {
        id: 'supertrend-ai-bull-flip',
        title: 'SuperTrend AI Bullish Flip [BUY]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `SuperTrend AI: Bullish Flip Confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === 1,
      },
      {
        id: 'supertrend-ai-bear-flip',
        title: 'SuperTrend AI Bearish Flip [SELL]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `SuperTrend AI: Bearish Flip Confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === -1,
      },
    ],
  })
}
