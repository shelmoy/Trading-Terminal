/**
 * Supertrend MTF Heikin Ashi
 *
 * Implements LonesomeTheBlue's "Supertrend MTF Heikin Ashi":
 * - Converts raw OHLC series into Heikin-Ashi candlestick series (haOpen, haHigh, haLow, haClose)
 * - Computes Wilder's RMA ATR directly on the Heikin-Ashi bars
 * - Trailing Supertrend calculation on current timeframe using Heikin-Ashi (h + l) / 2 +/- Mult * Atr
 * - Higher Time Frame (HTF) calculation with Auto resolution or User-Defined resolution
 * - HTF Supertrend disabled by default (showHtf: false)
 * - Modern, clean, uncluttered little arrow markers (arrowUp / arrowDown) at trend flips
 * - Live telemetry dashboard table and alert triggers
 *
 * Author: LonesomeTheBlue / Adapted for OpenAlgo Charting Terminal
 */

export default function ({
  registerIndicator,
  nulls,
}) {
  // Wilder's RMA of True Range (standard ta.atr in Pine Script)
  function calcHAATR(haBars, period) {
    const n = haBars.length
    const tr = new Array(n).fill(0)
    const atr = new Array(n).fill(null)
    if (n === 0 || period <= 0) return atr

    tr[0] = haBars[0].high - haBars[0].low
    for (let i = 1; i < n; i++) {
      const h = haBars[i].high
      const l = haBars[i].low
      const pc = haBars[i - 1].close
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    }

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

  // Build Heikin-Ashi candlestick bars from standard OHLC bars
  function buildHeikinAshi(bars) {
    const n = bars.length
    const haBars = new Array(n)
    if (n === 0) return haBars

    let prevHaOpen = (bars[0].open + bars[0].close) / 2
    let prevHaClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4

    haBars[0] = {
      open: prevHaOpen,
      high: Math.max(bars[0].high, prevHaOpen, prevHaClose),
      low: Math.min(bars[0].low, prevHaOpen, prevHaClose),
      close: prevHaClose,
      time: bars[0].time,
    }

    for (let i = 1; i < n; i++) {
      const b = bars[i]
      const haClose = (b.open + b.high + b.low + b.close) / 4
      const haOpen = (prevHaOpen + prevHaClose) / 2
      const haHigh = Math.max(b.high, haOpen, haClose)
      const haLow = Math.min(b.low, haOpen, haClose)

      haBars[i] = {
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        time: b.time,
      }

      prevHaOpen = haOpen
      prevHaClose = haClose
    }

    return haBars
  }

  // Parse time interval string to minutes
  function parseIntervalMinutes(tf) {
    if (!tf) return 5
    const s = String(tf).trim().toUpperCase()
    if (s === 'D' || s === '1D') return 1440
    if (s === 'W' || s === '1W') return 10080
    if (s === 'M' || s === '1M') return 43200
    const m = s.match(/^(\d+)([MHDW]?)$/)
    if (!m) return 5
    const val = parseInt(m[1], 10)
    const unit = m[2]
    if (unit === 'H') return val * 60
    if (unit === 'D') return val * 1440
    if (unit === 'W') return val * 10080
    return val // default is minutes
  }

  // Determine Auto HTF in minutes based on current chart timeframe
  function getAutoHTFMinutes(currentMinutes) {
    if (currentMinutes <= 1) return 5
    if (currentMinutes <= 3) return 15
    if (currentMinutes <= 5) return 15
    if (currentMinutes <= 15) return 60
    if (currentMinutes <= 30) return 120
    if (currentMinutes <= 45) return 120
    if (currentMinutes <= 60) return 240
    if (currentMinutes <= 120) return 240
    if (currentMinutes <= 180) return 240
    if (currentMinutes <= 240) return 1440 // 1D
    if (currentMinutes <= 1440) return 10080 // 1W
    return 10080 * 5 // 5W
  }

  // Aggregate raw bars into higher timeframe bars
  function aggregateBars(bars, targetMinutes) {
    const n = bars.length
    if (n === 0) return []
    const spanSec = targetMinutes * 60
    const htfBars = []
    let currentBucket = null

    for (let i = 0; i < n; i++) {
      const b = bars[i]
      const t = b.time
      const bucketTime = Math.floor(t / spanSec) * spanSec

      if (!currentBucket || currentBucket.time !== bucketTime) {
        if (currentBucket) {
          htfBars.push(currentBucket)
        }
        currentBucket = {
          time: bucketTime,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume || 0,
        }
      } else {
        currentBucket.high = Math.max(currentBucket.high, b.high)
        currentBucket.low = Math.min(currentBucket.low, b.low)
        currentBucket.close = b.close
        currentBucket.volume += b.volume || 0
      }
    }
    if (currentBucket) {
      htfBars.push(currentBucket)
    }
    return htfBars
  }

  registerIndicator({
    id: 'oa-supertrend-mtf-ha',
    name: 'Supertrend MTF Heikin Ashi [LonesomeTheBlue]',
    category: 'Trend',
    placement: 'onchart',

    inputs: [
      // Current Supertrend Parameters
      {
        key: 'mult',
        type: 'number',
        label: 'ATR Factor',
        default: 2.0,
        min: 0.1,
        max: 100,
        step: 0.1,
        group: '1. Parameters',
      },
      {
        key: 'period',
        type: 'number',
        label: 'ATR Period',
        default: 7,
        min: 1,
        max: 100,
        step: 1,
        group: '1. Parameters',
      },

      // Higher Time Frame Parameters
      {
        key: 'showHtf',
        type: 'boolean',
        label: 'Show HTF Supertrend',
        default: false,
        group: '2. Higher Time Frame',
      },
      {
        key: 'htfMode',
        type: 'select',
        label: 'HTF Method',
        default: 'Auto',
        options: [
          { label: 'Auto (Recommended)', value: 'Auto' },
          { label: 'User Defined', value: 'User Defined' },
        ],
        group: '2. Higher Time Frame',
      },
      {
        key: 'htfTimeframe',
        type: 'select',
        label: 'Time Frame (if User Defined)',
        default: '15',
        options: [
          { label: '5m', value: '5' },
          { label: '15m', value: '15' },
          { label: '30m', value: '30' },
          { label: '1 Hour', value: '60' },
          { label: '2 Hours', value: '120' },
          { label: '4 Hours', value: '240' },
          { label: '1 Day', value: 'D' },
          { label: '1 Week', value: 'W' },
        ],
        group: '2. Higher Time Frame',
      },

      // Styles
      {
        key: 'bullColor',
        type: 'color',
        label: 'SuperTrend Bull Color',
        default: '#00e676',
        group: '3. Style',
      },
      {
        key: 'bearColor',
        type: 'color',
        label: 'SuperTrend Bear Color',
        default: '#ff5252',
        group: '3. Style',
      },
      {
        key: 'htfBullColor',
        type: 'color',
        label: 'HTF Bull Color',
        default: '#2979ff',
        group: '3. Style',
      },
      {
        key: 'htfBearColor',
        type: 'color',
        label: 'HTF Bear Color',
        default: '#ff9100',
        group: '3. Style',
      },
      {
        key: 'showSignals',
        type: 'boolean',
        label: 'Show Arrow Markers',
        default: true,
        group: '3. Style',
      },

      // Dashboard
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
        key: 'supertrendBull',
        type: 'line',
        title: 'SuperTrend Bull',
        colorKey: 'bullColor',
        style: { lineWidth: 2 },
      },
      {
        key: 'supertrendBear',
        type: 'line',
        title: 'SuperTrend Bear',
        colorKey: 'bearColor',
        style: { lineWidth: 2 },
      },
      {
        key: 'htfSupertrendBull',
        type: 'line',
        title: 'HTF SuperTrend Bull',
        colorKey: 'htfBullColor',
        style: { lineWidth: 2, lineStyle: 'dashed' },
      },
      {
        key: 'htfSupertrendBear',
        type: 'line',
        title: 'HTF SuperTrend Bear',
        colorKey: 'htfBearColor',
        style: { lineWidth: 2, lineStyle: 'dashed' },
      },
    ],

    calc(bars, inputs, ctx) {
      const n = bars.length
      const outSupertrendBull = new Array(n).fill(null)
      const outSupertrendBear = new Array(n).fill(null)
      const outHtfSupertrendBull = new Array(n).fill(null)
      const outHtfSupertrendBear = new Array(n).fill(null)

      const trendSeries = new Array(n).fill(0)
      const signalsSeries = new Array(n).fill(0)
      const supertrendSeries = new Array(n).fill(null)
      const htfTrendSeries = new Array(n).fill(0)

      if (n === 0) {
        return {
          supertrendBull: outSupertrendBull,
          supertrendBear: outSupertrendBear,
          htfSupertrendBull: outHtfSupertrendBull,
          htfSupertrendBear: outHtfSupertrendBear,
          trend: trendSeries,
          signals: signalsSeries,
          supertrend: supertrendSeries,
          htfTrend: htfTrendSeries,
        }
      }

      const mult = Number(inputs.mult ?? 2.0)
      const period = Math.max(1, Math.floor(Number(inputs.period ?? 7)))
      const showHtf = Boolean(inputs.showHtf ?? false)

      // 1. Build Heikin-Ashi bars for current timeframe
      const haBars = buildHeikinAshi(bars)
      const haAtr = calcHAATR(haBars, period)

      // 2. Calculate Current Timeframe SuperTrend on Heikin-Ashi
      let tUp = null
      let tDown = null
      let trend = 0

      for (let i = 0; i < n; i++) {
        const curATR = haAtr[i]
        if (curATR === null) {
          trendSeries[i] = trend
          continue
        }

        const haH = haBars[i].high
        const haL = haBars[i].low
        const haC = haBars[i].close

        const up = (haH + haL) / 2 - (mult * curATR)
        const dn = (haH + haL) / 2 + (mult * curATR)

        const prevHaC = i > 0 ? haBars[i - 1].close : haC
        const prevTUp = tUp !== null ? tUp : up
        const prevTDown = tDown !== null ? tDown : dn
        const prevTrend = trend

        // Pine: TUp := c[1] > TUp[1] ? max(Up, TUp[1]) : Up
        if (i === 0 || tUp === null) {
          tUp = up
        } else {
          tUp = prevHaC > prevTUp ? Math.max(up, prevTUp) : up
        }

        // Pine: TDown := c[1] < TDown[1] ? min(Dn, TDown[1]) : Dn
        if (i === 0 || tDown === null) {
          tDown = dn
        } else {
          tDown = prevHaC < prevTDown ? Math.min(dn, prevTDown) : dn
        }

        // Pine: Trend := c > TDown[1] ? 1 : c < TUp[1] ? -1 : nz(Trend[1], 1)
        if (haC > prevTDown) {
          trend = 1
        } else if (haC < prevTUp) {
          trend = -1
        } else {
          trend = prevTrend !== 0 ? prevTrend : 1
        }

        const trailingSL = trend === 1 ? tUp : tDown
        supertrendSeries[i] = trailingSL
        trendSeries[i] = trend

        // Only plot continuous line when trend confirms previous bar (same as Pine: Trend == 1 and nz(Trend[1]) == 1)
        if (trend === 1 && prevTrend === 1) {
          outSupertrendBull[i] = trailingSL
        } else if (trend === -1 && prevTrend === -1) {
          outSupertrendBear[i] = trailingSL
        }

        // Detect Trend Flips for Arrow Markers & Alerts
        if (trend === 1 && prevTrend === -1) {
          signalsSeries[i] = 1 // Bullish flip (Buy)
        } else if (trend === -1 && prevTrend === 1) {
          signalsSeries[i] = -1 // Bearish flip (Sell)
        }
      }

      // 3. Higher Time Frame (HTF) calculation if enabled
      if (showHtf) {
        // Determine HTF minutes
        let htfMinutes = 15
        if (inputs.htfMode === 'User Defined') {
          htfMinutes = parseIntervalMinutes(inputs.htfTimeframe || '15')
        } else {
          // Auto Mode: Infer chart interval from ctx or sample bar difference
          let chartIntervalMin = 5
          if (ctx?.interval) {
            chartIntervalMin = parseIntervalMinutes(ctx.interval)
          } else if (n >= 2) {
            const diffSec = bars[1].time - bars[0].time
            chartIntervalMin = Math.max(1, Math.round(diffSec / 60))
          }
          htfMinutes = getAutoHTFMinutes(chartIntervalMin)
        }

        // Aggregate bars to HTF
        const htfAggBars = aggregateBars(bars, htfMinutes)
        const m = htfAggBars.length

        if (m > 0) {
          const htfHaBars = buildHeikinAshi(htfAggBars)
          const htfHaAtr = calcHAATR(htfHaBars, period)

          let htfTUp = null
          let htfTDown = null
          let htfTrend = 0
          const htfResults = new Array(m)

          // Run Supertrend on HTF series
          for (let j = 0; j < m; j++) {
            const hAtr = htfHaAtr[j]
            if (hAtr === null) {
              htfResults[j] = { trend: 0, trailingSL: null, time: htfAggBars[j].time }
              continue
            }

            const hH = htfHaBars[j].high
            const hL = htfHaBars[j].low
            const hC = htfHaBars[j].close

            const upHtf = (hH + hL) / 2 - (mult * hAtr)
            const dnHtf = (hH + hL) / 2 + (mult * hAtr)

            const prevHC = j > 0 ? htfHaBars[j - 1].close : hC
            const prevHTUp = htfTUp !== null ? htfTUp : upHtf
            const prevHTDown = htfTDown !== null ? htfTDown : dnHtf
            const prevHTrend = htfTrend

            if (j === 0 || htfTUp === null) {
              htfTUp = upHtf
            } else {
              htfTUp = prevHC > prevHTUp ? Math.max(upHtf, prevHTUp) : upHtf
            }

            if (j === 0 || htfTDown === null) {
              htfTDown = dnHtf
            } else {
              htfTDown = prevHC < prevHTDown ? Math.min(dnHtf, prevHTDown) : dnHtf
            }

            if (hC > prevHTDown) {
              htfTrend = 1
            } else if (hC < prevHTUp) {
              htfTrend = -1
            } else {
              htfTrend = prevHTrend !== 0 ? prevHTrend : 1
            }

            const trailHtf = htfTrend === 1 ? htfTUp : htfTDown
            htfResults[j] = {
              trend: htfTrend,
              trailingSL: trailHtf,
              time: htfAggBars[j].time,
            }
          }

          // Step map HTF bars onto base chart bars using step lookup (lookahead-safe: completed HTF bar [1])
          let htfIdx = 0
          for (let i = 0; i < n; i++) {
            const barTime = bars[i].time
            while (htfIdx < m - 1 && htfAggBars[htfIdx + 1].time <= barTime) {
              htfIdx++
            }
            // Use previous closed HTF bar (matching Pine Script highhtf = security(..., high[1]))
            const closedHtfIdx = htfIdx > 0 ? htfIdx - 1 : 0
            const activeHtf = htfResults[closedHtfIdx]

            if (activeHtf && activeHtf.trailingSL !== null) {
              htfTrendSeries[i] = activeHtf.trend
              if (activeHtf.trend === 1) {
                outHtfSupertrendBull[i] = activeHtf.trailingSL
              } else if (activeHtf.trend === -1) {
                outHtfSupertrendBear[i] = activeHtf.trailingSL
              }
            }
          }
        }
      }

      return {
        supertrendBull: outSupertrendBull,
        supertrendBear: outSupertrendBear,
        htfSupertrendBull: outHtfSupertrendBull,
        htfSupertrendBear: outHtfSupertrendBear,
        trend: trendSeries,
        signals: signalsSeries,
        supertrend: supertrendSeries,
        htfTrend: htfTrendSeries,
      }
    },

    markers({ bars, values, settings }) {
      if (settings.showSignals === false || !values.signals) return []
      const out = []
      const n = bars.length
      const bullColor = settings.bullColor || '#00e676'
      const bearColor = settings.bearColor || '#ff5252'

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
      const stVal = values.supertrend?.[lastIdx]
      const htfTrend = values.htfTrend?.[lastIdx] ?? 0
      const showHtf = Boolean(settings.showHtf ?? false)

      const trendText = trend === 1 ? '▲ BULLISH' : trend === -1 ? '▼ BEARISH' : '● NEUTRAL'
      const trendColor = trend === 1 ? '#10b981' : trend === -1 ? '#f43f5e' : '#94a3b8'
      const trendCellBg = trend === 1 ? 'rgba(16, 185, 129, 0.16)' : trend === -1 ? 'rgba(244, 63, 94, 0.16)' : 'rgba(255, 255, 255, 0.05)'

      const htfText = htfTrend === 1 ? '▲ BULLISH' : htfTrend === -1 ? '▼ BEARISH' : '● OFF'
      const htfColor = htfTrend === 1 ? '#0ea5e9' : htfTrend === -1 ? '#f59e0b' : '#64748b'
      const htfCellBg = htfTrend === 1 ? 'rgba(14, 165, 233, 0.16)' : htfTrend === -1 ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.05)'

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
          { text: '  Supertrend MTF HA', bgColor: headerTitleBg, textColor: '#f8fafc', bold: true, align: 'left', fontSize: 11 },
          { text: `ATR (${settings.period || 7}, ${settings.mult || 2.0}) `, bgColor: headerBadgeBg, textColor: '#38bdf8', bold: true, align: 'right', fontSize: 11 },
        ],
        [
          { text: '  Current Trend', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
          { text: `${trendText} `, bgColor: trendCellBg, textColor: trendColor, bold: true, align: 'right', fontSize: 11 },
        ],
      ]

      if (stVal !== null && stVal !== undefined) {
        rows.push([
          { text: '  Stop Trailing', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
          { text: `${Number(stVal).toFixed(2)} `, bgColor: rowValueBg, textColor: valueColor, bold: true, align: 'right', fontSize: 11 },
        ])
      }

      if (showHtf) {
        rows.push([
          { text: '  HTF Trend', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
          { text: `${htfText} `, bgColor: htfCellBg, textColor: htfColor, bold: true, align: 'right', fontSize: 11 },
        ])
      }

      return {
        rows,
        options: {
          position: pos,
          cellWidth: 'auto',
          cellHeight: 22,
          margin: 12,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          frameColor: 'rgba(56, 189, 248, 0.35)',
          frameWidth: 1,
          background: 'rgba(15, 23, 42, 0.90)',
        },
      }
    },

    alerts: [
      {
        id: 'supertrend-mtf-ha-buy',
        title: 'Supertrend MTF HA Bullish Flip [BUY]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Supertrend MTF HA: Bullish Flip (BUY) Confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === 1,
      },
      {
        id: 'supertrend-mtf-ha-sell',
        title: 'Supertrend MTF HA Bearish Flip [SELL]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Supertrend MTF HA: Bearish Flip (SELL) Confirmed at ${price}`
        },
        when: ({ values, index }) => values.signals?.[index] === -1,
      },
    ],
  })
}
