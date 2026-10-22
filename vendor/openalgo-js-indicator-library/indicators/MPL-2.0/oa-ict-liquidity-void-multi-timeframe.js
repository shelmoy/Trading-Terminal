/**
 * ICT Liquidity Void Multi-timeframe - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Liquidity Void/ICT Liquidity Void Multi-timeframe.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks the price gaps a displacement leaves behind on a chosen timeframe: a
 * box spanning the untraded range and a line at its chosen level, both running
 * forward until price returns into them.
 */

const BEAR_COLOR = '#f7525f'
const BULL_COLOR = '#22ab94'
// Pine draws both the border and the background with transparency 75.
const BOX_OPACITY = 0.25
const LINE_WIDTH = 2
const LINE_STYLE = 'solid'

export default function ({
  registerIndicator,
  atr,
  nulls,
  withAlpha,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
  DEFAULT_TIMEZONE,
}) {
  // Pine timeframe codes: a bare number is minutes, 'S' seconds, lowercase 'm'
  // minutes, 'h' hours, 'D' days, 'W' weeks, uppercase 'M' months. An empty
  // string means the chart's own timeframe, which is one bucket per bar.
  const parseTimeframe = (raw) => {
    const code = String(raw == null ? '' : raw).trim()
    if (!code) return { unit: 'bar', mult: 1 }
    const parsed = code.match(/^(\d*)\s*([A-Za-z]*)$/)
    if (!parsed) return { unit: 'bar', mult: 1 }
    const mult = Math.max(1, Math.floor(Number(parsed[1]) || 1))
    const suffix = parsed[2]
    if (suffix === '') return { unit: 'sec', mult: mult * 60 }
    if (suffix === 'M') return { unit: 'month', mult }
    const lower = suffix.toLowerCase()
    if (lower === 's') return { unit: 'sec', mult }
    if (lower === 'm' || lower === 'min') return { unit: 'sec', mult: mult * 60 }
    if (lower === 'h') return { unit: 'sec', mult: mult * 3600 }
    if (lower === 'd') return { unit: 'day', mult }
    if (lower === 'w') return { unit: 'week', mult }
    return { unit: 'bar', mult: 1 }
  }

  // request.security is not available here, so the chart's own bars are folded
  // up to the requested timeframe instead. That also removes the source's
  // lookahead_on, which on the forming higher-timeframe bar would otherwise
  // hand back that whole bar's high and low before it existed.
  const buildHtf = (bars, tfRaw) => {
    const tf = parseTimeframe(tfRaw)
    const zone = DEFAULT_TIMEZONE
    const keyOf = (t, i) => {
      if (tf.unit === 'bar') return i
      if (!Number.isFinite(t)) return i
      if (tf.unit === 'sec') return Math.floor(t / tf.mult)
      if (tf.unit === 'day') return Math.floor(zonedDayIndex(t, zone) / tf.mult)
      if (tf.unit === 'week') return Math.floor(zonedWeekIndex(t, zone) / tf.mult)
      const parts = utcSecondsToZonedParts(t, zone)
      return Math.floor((parts.year * 12 + parts.month) / tf.mult)
    }

    const open = []
    const high = []
    const low = []
    const close = []
    const time = []
    const bucketOfBar = new Array(bars.length).fill(-1)
    let key = null

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      const t = Number(b.time)
      const k = keyOf(t, i)
      if (key === null || k !== key) {
        key = k
        open.push(Number(b.open))
        high.push(Number(b.high))
        low.push(Number(b.low))
        close.push(Number(b.close))
        time.push(t)
      } else {
        const j = time.length - 1
        const h = Number(b.high)
        const l = Number(b.low)
        const c = Number(b.close)
        if (Number.isFinite(h)) high[j] = Number.isFinite(high[j]) ? Math.max(high[j], h) : h
        if (Number.isFinite(l)) low[j] = Number.isFinite(low[j]) ? Math.min(low[j], l) : l
        if (Number.isFinite(c)) close[j] = c
      }
      bucketOfBar[i] = time.length - 1
    }

    return { open, high, low, close, time, bucketOfBar }
  }

  // A cleared field arrives as '', and Number('') is 0, which is a legal value
  // for two of these inputs. Fall back to the default rather than to zero.
  const coerce = (raw, fallback, min, integer) => {
    const value = Number(raw)
    if (raw === '' || raw == null || !Number.isFinite(value)) return fallback
    const floored = integer ? Math.floor(value) : value
    return Math.max(min, floored)
  }

  registerIndicator({
    id: 'oa-ict-liquidity-void-multi-timeframe',
    name: 'ICT Liquidity Void Multi-timeframe',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'timeframe',
        type: 'text',
        label: 'Timeframe',
        default: '',
        group: 'Liquidity Void',
        tooltip: 'Timeframe the voids are measured on. Leave empty for the chart timeframe. Accepts 15, 60, 1h, D, W or M.',
      },
      { key: 'showLast', type: 'number', label: 'Show Last', default: 2, min: 0, max: 500, step: 1, group: 'Liquidity Void' },
      {
        key: 'lineMode',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: 'Liquidity Void',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'OTE 0.79%', value: 'OTE 0.79%' },
          { label: '50%', value: '50%' },
        ],
      },
      { key: 'showBearish', type: 'boolean', label: 'Bearish', default: true, group: 'Liquidity Void' },
      { key: 'showBullish', type: 'boolean', label: 'Bullish', default: true, group: 'Liquidity Void' },
      { key: 'hideCrossed', type: 'boolean', label: 'Hide Crossed', default: false, group: 'Liquidity Void' },
      {
        key: 'filterMode',
        type: 'select',
        label: 'Filter Using',
        default: 'ATR',
        group: 'Void Height Filter',
        options: [
          { label: 'ATR', value: 'ATR' },
          { label: 'Percentage', value: 'Percentage' },
        ],
        tooltip: 'Filters remove narrow liquidity voids. ATR filtering adjusts automatically when the timeframe changes, while the percentage filter stays constant across timeframes. For no filtering at all, choose Percentage and set it to 0.',
      },
      {
        key: 'atrLength',
        type: 'number',
        label: 'ATR Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        group: 'Void Height Filter',
        tooltip: 'Applies only when Filter Using is ATR.',
      },
      {
        key: 'atrMultiplier',
        type: 'number',
        label: 'ATR Multiplier',
        default: 4,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Void Height Filter',
        tooltip: 'The higher the number, the taller a void has to be to survive the filter.',
      },
      {
        key: 'percentage',
        type: 'number',
        label: 'Percentage Above',
        default: 2.5,
        min: 0,
        max: 100,
        step: 0.1,
        group: 'Void Height Filter',
        tooltip: 'Keeps only liquidity voids taller than this percentage of the anchor price.',
      },
    ],

    // The source draws nothing as a series. This hidden column carries the
    // higher-timeframe ATR the filter reads, so the legend and any consumer can
    // see what the filter is working from.
    plots: [
      { key: 'atrHtf', type: 'line', title: 'HTF ATR', style: { color: '#8892a6', lineWidth: 1, visible: false } },
    ],

    calc(bars, settings) {
      const n = bars.length
      const column = new Array(n).fill(NaN)
      if (n === 0) return { atrHtf: column }

      const htf = buildHtf(bars, settings.timeframe)
      const atrLength = coerce(settings.atrLength, 14, 1, true)
      const atrSeries = atr(htf.high, htf.low, htf.close, atrLength)

      for (let i = 0; i < n; i++) {
        const k = htf.bucketOfBar[i]
        if (k >= 0 && Number.isFinite(atrSeries[k])) column[i] = atrSeries[k]
      }
      return { atrHtf: nulls(column) }
    },

    draws({ bars, settings }) {
      if (!bars || bars.length === 0) return []

      const htf = buildHtf(bars, settings.timeframe)
      const count = htf.time.length
      if (count === 0) return []

      const atrLength = coerce(settings.atrLength, 14, 1, true)
      const atrSeries = atr(htf.high, htf.low, htf.close, atrLength)
      const atrMultiplier = coerce(settings.atrMultiplier, 4, 1, false)
      const percentage = coerce(settings.percentage, 2.5, 0, false)
      const showLast = coerce(settings.showLast, 2, 0, true)
      const filterMode = settings.filterMode === 'Percentage' ? 'Percentage' : 'ATR'
      const lineMode = settings.lineMode === 'OTE 0.79%' || settings.lineMode === '50%'
        ? settings.lineMode
        : 'High/Low'
      const hideCrossed = settings.hideCrossed === true

      // Every comparison in the source runs against a value that starts as na,
      // and na comparisons are false in Pine. In JavaScript they are not, so
      // the anchor has to be checked explicitly or a void fires on bar one.
      const passesFilter = (anchor, other, atrValue) => {
        if (!Number.isFinite(anchor) || !Number.isFinite(other)) return false
        if (filterMode === 'ATR') {
          if (!Number.isFinite(atrValue)) return false
          return Math.abs(anchor - other) > atrValue * atrMultiplier
        }
        if (anchor === 0) return false
        return Math.abs(((anchor - other) / anchor) * 100) > percentage
      }

      // The source tests 'OTE 0.79%' twice, so its third branch is unreachable
      // and only the first two forms plus the midpoint are ever produced.
      const priceSourceOf = (anchor, other) => {
        if (lineMode === 'High/Low') return anchor
        if (lineMode === 'OTE 0.79%') return other + (anchor - other) * 0.79
        return (anchor + other) / 2
      }

      const newSide = (color, up) => ({
        color,
        up,
        anchorPrice: NaN,
        anchorTime: NaN,
        allLines: [],
        allBoxes: [],
        keepLines: new Set(),
        keepBoxes: new Set(),
      })

      const sides = []
      if (settings.showBearish !== false) sides.push(newSide(BEAR_COLOR, true))
      if (settings.showBullish !== false) sides.push(newSide(BULL_COLOR, false))
      if (sides.length === 0) return []

      for (let k = 0; k < count; k++) {
        const openHtf = htf.open[k]
        const highHtf = htf.high[k]
        const lowHtf = htf.low[k]
        const closeHtf = htf.close[k]
        const timeHtf = htf.time[k]
        const atrHtf = atrSeries[k]
        // barstate.isconfirmed on the higher timeframe: the last bucket is
        // still forming, so it updates and cleans but creates nothing.
        const confirmed = k < count - 1

        const broke = (price) => Number.isFinite(price)
          && Number.isFinite(highHtf)
          && Number.isFinite(lowHtf)
          && highHtf >= price
          && lowHtf <= price

        for (const side of sides) {
          const trending = Number.isFinite(closeHtf) && Number.isFinite(openHtf)
            && (side.up ? closeHtf > openHtf : closeHtf < openHtf)

          if (confirmed && trending) {
            const other = side.up ? highHtf : lowHtf
            const nextAnchor = side.up ? lowHtf : highHtf
            const gapped = !Number.isFinite(side.anchorPrice)
              || (side.up ? other <= side.anchorPrice : other >= side.anchorPrice)
            const linePrice = priceSourceOf(side.anchorPrice, other)

            if (gapped
              && passesFilter(side.anchorPrice, other, atrHtf)
              && Number.isFinite(side.anchorTime)
              && Number.isFinite(linePrice)) {
              const line = { x1: side.anchorTime, y1: linePrice, x2: timeHtf, alive: true }
              const box = { left: side.anchorTime, top: other, bottom: side.anchorPrice, right: timeHtf, alive: true }
              side.allLines.push(line)
              side.allBoxes.push(box)
              // clean_arrays keeps only the newest Show Last of each. With
              // Show Last at 0 the shift happens straight after the push, so
              // nothing is ever shown.
              if (side.allLines.length > showLast) {
                const removed = side.allLines.shift()
                side.keepLines.delete(removed)
                removed.alive = false
              }
              if (side.allBoxes.length > showLast) {
                const removed = side.allBoxes.shift()
                side.keepBoxes.delete(removed)
                removed.alive = false
              }
            }

            side.anchorPrice = nextAnchor
            side.anchorTime = timeHtf
          }

          // A line keeps extending right until this bar's range contains it,
          // after which it is frozen where price reached it.
          for (const line of side.allLines) {
            if (side.keepLines.has(line)) continue
            line.x2 = timeHtf
            if (broke(line.y1)) side.keepLines.add(line)
          }
          for (const box of side.allBoxes) {
            if (side.keepBoxes.has(box)) continue
            box.right = timeHtf
            if (broke(box.top)) side.keepBoxes.add(box)
          }

          if (hideCrossed) {
            for (const line of side.keepLines) {
              if (!line.alive || !broke(line.y1)) continue
              line.alive = false
              const at = side.allLines.indexOf(line)
              if (at >= 0) side.allLines.splice(at, 1)
            }
            for (const box of side.keepBoxes) {
              if (!box.alive || !broke(box.bottom)) continue
              box.alive = false
              const at = side.allBoxes.indexOf(box)
              if (at >= 0) side.allBoxes.splice(at, 1)
            }
          }
        }
      }

      const out = []
      // Boxes first so the level line sits on top of its own shading.
      for (const side of sides) {
        for (const box of side.allBoxes) {
          if (!box.alive) continue
          if (!Number.isFinite(box.top) || !Number.isFinite(box.bottom)) continue
          if (!Number.isFinite(box.left) || !Number.isFinite(box.right)) continue
          out.push({
            kind: 'box',
            from: { time: box.left, price: Math.max(box.top, box.bottom) },
            to: { time: box.right, price: Math.min(box.top, box.bottom) },
            color: withAlpha(side.color, BOX_OPACITY),
            fillColor: side.color,
            opacity: BOX_OPACITY,
          })
        }
      }
      for (const side of sides) {
        for (const line of side.allLines) {
          if (!line.alive) continue
          if (!Number.isFinite(line.y1) || !Number.isFinite(line.x1) || !Number.isFinite(line.x2)) continue
          out.push({
            kind: 'line',
            from: { time: line.x1, price: line.y1 },
            to: { time: line.x2, price: line.y1 },
            color: side.color,
            lineWidth: LINE_WIDTH,
            lineStyle: LINE_STYLE,
          })
        }
      }
      return out
    },
  })
}
