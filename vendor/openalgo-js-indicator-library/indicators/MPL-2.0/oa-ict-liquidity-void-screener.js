/**
 * ICT Liquidity Void Screener - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Liquidity Void/ICT Liquidity Void Screener.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A liquidity void is the empty range left when one candle opens clear of the
 * previous same-direction candle. Each void is drawn as a shaded box with a
 * level inside it, both stretching right until price trades back through them,
 * and a label marks the bar where price crosses a level again.
 */

const BEAR_COLOR = '#F7525F'
const BULL_COLOR = '#22AB94'
// Pine's box transparency of 75 is an opacity of 0.25 here.
const BOX_OPACITY = 0.25
const LINE_WIDTH = 2

export default function ({ registerIndicator, atr, nulls }) {
  // A cleared number field arrives as '', and Number('') is 0, which would read
  // as a deliberate zero here. Fall back to the default instead.
  const numInput = (raw, def, min, max) => {
    const v = Number(raw)
    if (raw === '' || raw == null || !Number.isFinite(v)) return def
    return Math.min(max, Math.max(min, v))
  }
  const intInput = (raw, def, min, max) => Math.floor(numInput(raw, def, min, max))

  registerIndicator({
    id: 'oa-ict-liquidity-void-screener',
    name: 'ICT Liquidity Void Screener',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'showLast',
        type: 'number',
        label: 'Show Last',
        default: 2,
        min: 0,
        max: 500,
        step: 1,
        group: 'Liquidity Void',
        tooltip: 'How many of the most recent voids of each side stay on the chart.',
      },
      {
        key: 'lineSource',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'OTE 0.79%', value: 'OTE 0.79%' },
          { label: '50%', value: '50%' },
        ],
        group: 'Liquidity Void',
        tooltip: 'Where inside the void the level sits: the far edge, the 0.79 retracement, or the midpoint.',
      },
      { key: 'showBear', type: 'boolean', label: 'Bearish', default: true, group: 'Liquidity Void' },
      { key: 'showBull', type: 'boolean', label: 'Bullish', default: true, group: 'Liquidity Void' },
      {
        key: 'hideCrossed',
        type: 'boolean',
        label: 'Hide Crossed',
        default: false,
        group: 'Liquidity Void',
        tooltip: 'Remove a void once price has traded all the way back through it.',
      },
      {
        key: 'filterUsing',
        type: 'select',
        label: 'Filter Using',
        default: 'ATR',
        options: [
          { label: 'ATR', value: 'ATR' },
          { label: 'Percentage', value: 'Percentage' },
        ],
        group: 'Void Height Filter',
        tooltip:
          'Filters remove narrow liquidity voids. ATR filtering adjusts automatically when the timeframe changes, a percentage filter stays constant across timeframes. For no filtering choose Percentage and set it to 0.',
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
        tooltip: 'Applicable only if Filter Using is ATR.',
      },
      {
        key: 'atrMulti',
        type: 'number',
        label: 'ATR Multiplier',
        default: 4,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Void Height Filter',
        tooltip: 'Higher the number, filters higher void height.',
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
        tooltip: 'Filters liquidity void above the given percentage.',
      },
      {
        key: 'direction',
        type: 'select',
        label: 'Direction',
        default: 'Both',
        options: [
          { label: 'Both', value: 'Both' },
          { label: 'Bullish', value: 'Bullish' },
          { label: 'Bearish', value: 'Bearish' },
        ],
        group: 'Signals',
      },
      { key: 'onlyBullish', type: 'boolean', label: 'Only Bullish', default: true, group: 'Signals' },
      { key: 'onlyBearish', type: 'boolean', label: 'Only Bearish', default: true, group: 'Signals' },
    ],

    // The source plots nothing: it draws lines and boxes, and fills a screener
    // table. The two carried void levels are exposed as hidden plots so the
    // descriptor has a series and the legend can report what a signal fired on.
    plots: [
      {
        key: 'bearLevel',
        type: 'line',
        title: 'Bearish Void Level',
        style: { color: BEAR_COLOR, lineWidth: 1, visible: false },
      },
      {
        key: 'bullLevel',
        type: 'line',
        title: 'Bullish Void Level',
        style: { color: BULL_COLOR, lineWidth: 1, visible: false },
      },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const showLast = intInput(settings.showLast, 2, 0, 500)
      const lineMode = settings.lineSource || 'High/Low'
      const showBear = settings.showBear !== false
      const showBull = settings.showBull !== false
      const hideCrossed = settings.hideCrossed === true
      const filterUsing = settings.filterUsing || 'ATR'
      const atrLength = intInput(settings.atrLength, 14, 1, 5000)
      const atrMulti = numInput(settings.atrMulti, 4, 1, 100)
      const percentage = numInput(settings.percentage, 2.5, 0, 100)
      const direction = settings.direction || 'Both'
      const onlyBullish = settings.onlyBullish !== false
      const onlyBearish = settings.onlyBearish !== false

      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      for (let i = 0; i < n; i++) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        close[i] = bars[i].close
      }
      // Pine calls ta.atr inside the conditional block, which in v5 only
      // advances that series on the bars where the branch is taken. That is a
      // Pine wart rather than the intent, so this is the ordinary continuous
      // Wilder average over every bar.
      const atrValues = atr(high, low, close, atrLength)

      const bearLevel = new Array(n).fill(NaN)
      const bullLevel = new Array(n).fill(NaN)
      const signal = new Array(n).fill(NaN)
      const lvLine = new Array(n).fill(NaN)
      const lvLineRight = new Array(n).fill(NaN)
      const lvTop = new Array(n).fill(NaN)
      const lvBot = new Array(n).fill(NaN)
      const lvBoxRight = new Array(n).fill(NaN)
      const lvAnchor = new Array(n).fill(NaN)
      const lvDir = new Array(n).fill(NaN)

      // Both filter tests read na as false in Pine, so an unfinished ATR warmup
      // or a missing previous extreme must not let a void through here either.
      const passesFilter = (prev, other, atrValue) => {
        if (!Number.isFinite(prev) || !Number.isFinite(other)) return false
        if (filterUsing === 'ATR') {
          if (!Number.isFinite(atrValue)) return false
          return Math.abs(prev - other) > atrValue * atrMulti
        }
        if (prev === 0) return false
        const pct = Math.abs(((prev - other) / prev) * 100)
        return Number.isFinite(pct) && pct > percentage
      }

      // The third branch of the Pine ternary repeats the second condition and
      // is unreachable, so the real choices are the far edge, the 0.79
      // retracement, or the midpoint.
      const priceSource = (prev, other) => {
        if (lineMode === 'High/Low') return prev
        if (lineMode === 'OTE 0.79%') return other + (prev - other) * 0.79
        return (prev + other) / 2
      }

      const voids = []
      const makeStream = (dir) => ({
        dir,
        prev: NaN,
        prevTime: NaN,
        level: NaN,
        allLines: [],
        allBoxes: [],
        keepLines: new Set(),
        keepBoxes: new Set(),
      })
      const bearStream = makeStream(-1)
      const bullStream = makeStream(1)

      const stepStream = (stream, i, show, isActive, other, nextPrev) => {
        const time = bars[i].time
        const hi = high[i]
        const lo = low[i]

        if (show && isActive) {
          const prev = stream.prev
          const filtered = passesFilter(prev, other, atrValues[i])
          const level = priceSource(prev, other)
          // The gap itself: a bearish void needs this high at or below the
          // previous low, a bullish void this low at or above the previous high.
          const gapped =
            Number.isFinite(prev) &&
            Number.isFinite(other) &&
            (stream.dir < 0 ? other <= prev : other >= prev)

          if (gapped && filtered) {
            const item = {
              dir: stream.dir,
              index: i,
              anchor: stream.prevTime,
              linePrice: level,
              top: other,
              bottom: prev,
              lineRight: time,
              boxRight: time,
              lineAlive: true,
              boxAlive: true,
            }
            voids.push(item)
            stream.allLines.push(item)
            stream.allBoxes.push(item)
            // Only the last `showLast` of each side survive; the rest are
            // dropped off the front of the arrays and deleted.
            if (stream.allLines.length > showLast) {
              const removed = stream.allLines.shift()
              stream.keepLines.delete(removed)
              removed.lineAlive = false
            }
            if (stream.allBoxes.length > showLast) {
              const removed = stream.allBoxes.shift()
              stream.keepBoxes.delete(removed)
              removed.boxAlive = false
            }
            stream.level = level
          }

          stream.prev = nextPrev
          stream.prevTime = time
        }

        // Each drawing keeps stretching right until price trades through it,
        // and is then frozen at that bar.
        for (const item of stream.allLines) {
          if (stream.keepLines.has(item)) continue
          item.lineRight = time
          if (hi >= item.linePrice && lo <= item.linePrice) stream.keepLines.add(item)
        }
        for (const item of stream.allBoxes) {
          if (stream.keepBoxes.has(item)) continue
          item.boxRight = time
          if (hi >= item.top && lo <= item.top) stream.keepBoxes.add(item)
        }

        // Hide Crossed removes a frozen drawing once price reaches it again:
        // the level itself for a line, the far edge for a box.
        if (hideCrossed) {
          for (const item of [...stream.keepLines]) {
            if (hi >= item.linePrice && lo <= item.linePrice) {
              item.lineAlive = false
              stream.keepLines.delete(item)
              const at = stream.allLines.indexOf(item)
              if (at >= 0) stream.allLines.splice(at, 1)
            }
          }
          for (const item of [...stream.keepBoxes]) {
            if (hi >= item.bottom && lo <= item.bottom) {
              item.boxAlive = false
              stream.keepBoxes.delete(item)
              const at = stream.allBoxes.indexOf(item)
              if (at >= 0) stream.allBoxes.splice(at, 1)
            }
          }
        }
      }

      // barstate.isconfirmed: every historical bar is closed, and the forming
      // bar counts only once the host says it has closed.
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      for (let i = 0; i < n; i++) {
        const confirmed = i < n - 1 || lastConfirmed
        const bullishCandle = Number.isFinite(close[i]) && close[i] > bars[i].open
        const bearishCandle = Number.isFinite(close[i]) && close[i] < bars[i].open

        stepStream(bearStream, i, showBear && confirmed, bullishCandle, high[i], low[i])
        stepStream(bullStream, i, showBull && confirmed, bearishCandle, low[i], high[i])

        bearLevel[i] = bearStream.level
        bullLevel[i] = bullStream.level

        // ta.crossunder(low, bull level) and ta.crossover(high, bear level).
        // Every leg has to be finite, or the cross fires straight through the
        // bars where the level did not exist yet.
        let bearishCross = false
        let bullishCross = false
        if (i > 0 && confirmed) {
          const bullNow = bullLevel[i]
          const bullPrev = bullLevel[i - 1]
          if (
            Number.isFinite(bullNow) &&
            Number.isFinite(bullPrev) &&
            Number.isFinite(low[i]) &&
            Number.isFinite(low[i - 1])
          ) {
            bearishCross = low[i] < bullNow && low[i - 1] >= bullPrev
          }
          const bearNow = bearLevel[i]
          const bearPrev = bearLevel[i - 1]
          if (
            Number.isFinite(bearNow) &&
            Number.isFinite(bearPrev) &&
            Number.isFinite(high[i]) &&
            Number.isFinite(high[i - 1])
          ) {
            bullishCross = high[i] > bearNow && high[i - 1] <= bearPrev
          }
        }

        const allowBear = direction !== 'Bullish'
        const allowBull = direction !== 'Bearish'
        if (confirmed) {
          if (onlyBullish && bearishCross && allowBear) signal[i] = -1
          else if (onlyBearish && bullishCross && allowBull) signal[i] = 1
        }
      }

      for (const item of voids) {
        const i = item.index
        lvDir[i] = item.dir
        lvAnchor[i] = item.anchor
        if (item.lineAlive) {
          lvLine[i] = item.linePrice
          lvLineRight[i] = item.lineRight
        }
        if (item.boxAlive) {
          lvTop[i] = item.top
          lvBot[i] = item.bottom
          lvBoxRight[i] = item.boxRight
        }
      }

      return {
        bearLevel: nulls(bearLevel),
        bullLevel: nulls(bullLevel),
        signal: nulls(signal),
        lvLine: nulls(lvLine),
        lvLineRight: nulls(lvLineRight),
        lvTop: nulls(lvTop),
        lvBot: nulls(lvBot),
        lvBoxRight: nulls(lvBoxRight),
        lvAnchor: nulls(lvAnchor),
        lvDir: nulls(lvDir),
      }
    },

    draws({ bars, values }) {
      if (bars.length === 0) return []
      const out = []
      for (let i = 0; i < bars.length; i++) {
        const dir = values.lvDir[i]
        const anchor = values.lvAnchor[i]
        if (!Number.isFinite(dir) || !Number.isFinite(anchor)) continue
        const colour = dir < 0 ? BEAR_COLOR : BULL_COLOR

        const top = values.lvTop[i]
        const bottom = values.lvBot[i]
        const boxRight = values.lvBoxRight[i]
        if (Number.isFinite(top) && Number.isFinite(bottom) && Number.isFinite(boxRight)) {
          out.push({
            kind: 'box',
            from: { time: anchor, price: top },
            to: { time: boxRight, price: bottom },
            color: colour,
            fillColor: colour,
            opacity: BOX_OPACITY,
          })
        }

        const price = values.lvLine[i]
        const lineRight = values.lvLineRight[i]
        if (Number.isFinite(price) && Number.isFinite(lineRight)) {
          out.push({
            kind: 'line',
            from: { time: anchor, price },
            to: { time: lineRight, price },
            color: colour,
            lineWidth: LINE_WIDTH,
            lineStyle: 'solid',
          })
        }
      }
      return out
    },

    markers({ bars, values }) {
      const out = []
      if (bars.length === 0) return out

      // atPrice adds no padding of its own, so it is scaled to the instrument
      // rather than fixed in points.
      let rangeSum = 0
      let rangeCount = 0
      for (let i = Math.max(0, bars.length - 50); i < bars.length; i++) {
        const span = bars[i].high - bars[i].low
        if (Number.isFinite(span)) {
          rangeSum += span
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = bars[bars.length - 1].close
      const pad = Math.max(meanRange * 0.5, Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005)

      for (let i = 0; i < bars.length; i++) {
        const value = values.signal[i]
        if (value === 1) {
          // Price has crossed back up through a bearish void, so the label
          // carries that void's colour, exactly as the source table does.
          const price = bars[i].high + pad
          if (!Number.isFinite(price)) continue
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price,
            shape: 'labelDown',
            size: 'small',
            color: BEAR_COLOR,
            text: 'H',
          })
        } else if (value === -1) {
          const price = bars[i].low - pad
          if (!Number.isFinite(price)) continue
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price,
            shape: 'labelUp',
            size: 'small',
            color: BULL_COLOR,
            text: 'L',
          })
        }
      }
      return out
    },
  })
}
