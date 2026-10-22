/**
 * ICT Market Structure Shift (MSS) - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Market Structure Shift (MSS)/ICT Market Structure Shift (MSS).txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Tracks a rolling zig zag of swing highs and lows, then calls a market
 * structure shift when price closes back through the middle swing of the last
 * three, against the direction that built them. Each shift marks the swing
 * range it broke, and a one-third retracement back into that range is flagged
 * as the follow-up entry the method looks for.
 *
 * Zig zag acknowledgement: 'Zig Zag Ratio Simplified' by RozaniGhani-RG.
 */

export default function ({ registerIndicator, nulls, withAlpha }) {
  // The source exposes these as colour inputs. The chart generates style controls
  // for plots only, and markers, bar colours and drawings are not plots, so the
  // Pine defaults travel as constants.
  const POS_COLOR = '#22AB94'
  const NEG_COLOR = '#F7525F'
  const BULL_SIGNAL_COLOR = '#70CCBD'
  const BEAR_SIGNAL_COLOR = '#FAA1A4'
  const ZZ_COLOR = '#1E53E5'

  // Pine caps the script at 500 lines and 500 boxes; the same cap keeps a long
  // history from filling the drawing layer.
  const MAX_DRAWINGS = 500

  /** A Pine float read as a boolean: na and 0 are false, anything else is true. */
  const truthy = (x) => Number.isFinite(x) && x !== 0

  registerIndicator({
    id: 'oa-ict-market-structure-shift-mss',
    name: 'ICT Market Structure Shift (MSS)',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      { key: 'bearShow', type: 'boolean', label: 'Bearish', default: true, group: 'Zig Zag' },
      { key: 'bearShiftShow', type: 'boolean', label: 'Bearish Shift', default: true, group: 'Zig Zag' },
      { key: 'bearRetShow', type: 'boolean', label: 'Bearish Retracement', default: true, group: 'Zig Zag' },
      { key: 'bullShow', type: 'boolean', label: 'Bullish', default: true, group: 'Zig Zag' },
      { key: 'bullShiftShow', type: 'boolean', label: 'Bullish Shift', default: true, group: 'Zig Zag' },
      { key: 'bullRetShow', type: 'boolean', label: 'Bullish Retracement', default: true, group: 'Zig Zag' },
      { key: 'zzPeriod', type: 'number', label: 'Zig Zag Length', default: 4, min: 2, max: 500, step: 1, group: 'Zig Zag' },
      {
        key: 'zzSource',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
        ],
        group: 'Zig Zag',
      },
      { key: 'zzShow', type: 'boolean', label: 'Show Zig Zag', default: false, group: 'Zig Zag' },
      {
        key: 'boxTransparency',
        type: 'number',
        label: 'Box Transparency',
        default: 75,
        min: 0,
        max: 100,
        step: 1,
        tooltip: 'Matches the Pine transp argument on the swing range box: 0 is solid, 100 is invisible.',
        group: 'Zig Zag',
      },
      {
        key: 'filterChoice',
        type: 'select',
        label: 'Filter Using',
        default: 'Percentage',
        options: [
          { label: 'Multiplier', value: 'Multiplier' },
          { label: 'Percentage', value: 'Percentage' },
        ],
        tooltip: 'Filters out narrow swing displacements. Multiplier rescales with the timeframe, percentage stays constant across all of them. Set Percentage to 0 for no filtering.',
        group: 'Additional Filters',
      },
      {
        key: 'multiplier',
        type: 'number',
        label: 'Multiplier',
        default: 2,
        min: 1,
        max: 100,
        step: 0.1,
        tooltip: 'A shift only counts when the new swing displacement is this many times the previous one.',
        group: 'Additional Filters',
      },
      {
        key: 'percentage',
        type: 'number',
        label: 'Percentage Above',
        default: 0.7,
        min: 0,
        max: 100,
        step: 0.1,
        tooltip: 'A shift only counts when the swing displacement exceeds this percentage of the older swing price.',
        group: 'Additional Filters',
      },
    ],

    // Nothing here is a value per bar that wants a line. Every column exists so
    // markers, draws and barColors can read it: those hooks are handed values
    // and never store.
    plots: [
      { key: 'zzPivot', type: 'line', title: 'Zig Zag', style: { visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const period = Math.max(2, Math.floor(Number(settings.zzPeriod) || 4))
      const useOpenClose = settings.zzSource === 'Open/Close'
      const filterChoice = settings.filterChoice === 'Multiplier' ? 'Multiplier' : 'Percentage'
      const multiplier = Math.max(1, Number(settings.multiplier) || 2)
      // A deliberate 0 disables the percentage filter, so a plain `|| 0.7` would
      // silently override it. Only a cleared or unreadable field falls back.
      const rawPct = Number(settings.percentage)
      const percentage =
        settings.percentage === '' || settings.percentage == null || !Number.isFinite(rawPct)
          ? 0.7
          : Math.max(0, rawPct)

      const zzPivot = new Array(n).fill(NaN)
      const zz1Col = new Array(n).fill(NaN)
      const zz2Col = new Array(n).fill(NaN)
      const zz3Col = new Array(n).fill(NaN)
      const bi1Col = new Array(n).fill(NaN)
      const bi2Col = new Array(n).fill(NaN)
      const bi3Col = new Array(n).fill(NaN)
      const bearShiftCol = new Array(n).fill(NaN)
      const bullShiftCol = new Array(n).fill(NaN)
      const bearRetCol = new Array(n).fill(NaN)
      const bullRetCol = new Array(n).fill(NaN)
      const bearRetPriceCol = new Array(n).fill(NaN)
      const bearRetBiCol = new Array(n).fill(NaN)
      const bullRetPriceCol = new Array(n).fill(NaN)
      const bullRetBiCol = new Array(n).fill(NaN)

      const result = () => ({
        zzPivot: nulls(zzPivot),
        zz1: nulls(zz1Col),
        zz2: nulls(zz2Col),
        zz3: nulls(zz3Col),
        bi1: nulls(bi1Col),
        bi2: nulls(bi2Col),
        bi3: nulls(bi3Col),
        bearShift: nulls(bearShiftCol),
        bullShift: nulls(bullShiftCol),
        bearRet: nulls(bearRetCol),
        bullRet: nulls(bullRetCol),
        bearRetPrice: nulls(bearRetPriceCol),
        bearRetBi: nulls(bearRetBiCol),
        bullRetPrice: nulls(bullRetPriceCol),
        bullRetBi: nulls(bullRetBiCol),
      })
      if (n === 0) return result()

      // barstate.isconfirmed is true on every closed bar and false only on a
      // still-forming last bar. With no context the history is all there is.
      const lastConfirmed = !(ctx && ctx.barState && ctx.barState.isConfirmed === false)
      const confirmedAt = (i) => (i < n - 1 ? true : lastConfirmed)

      const hi = new Array(n).fill(NaN)
      const lo = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        if (useOpenClose) {
          if (Number.isFinite(b.open) && Number.isFinite(b.close)) {
            hi[i] = Math.max(b.open, b.close)
            lo[i] = Math.min(b.open, b.close)
          }
        } else {
          if (Number.isFinite(b.high)) hi[i] = b.high
          if (Number.isFinite(b.low)) lo[i] = b.low
        }
      }

      // ta.highestbars(_high, period) == 0 means this bar holds the window's
      // high. Pine has no value until the window is full, so the first
      // period - 1 bars produce no pivot at all.
      const isWindowHigh = (i) => {
        if (i < period - 1) return false
        const v = hi[i]
        if (!Number.isFinite(v)) return false
        for (let k = 1; k < period; k++) {
          if (Number.isFinite(hi[i - k]) && hi[i - k] > v) return false
        }
        return true
      }
      const isWindowLow = (i) => {
        if (i < period - 1) return false
        const v = lo[i]
        if (!Number.isFinite(v)) return false
        for (let k = 1; k < period; k++) {
          if (Number.isFinite(lo[i - k]) && lo[i - k] < v) return false
        }
        return true
      }

      // The Pine array is [value0, barIndex0, value1, barIndex1, ...] with the
      // newest pivot at the front, capped at ten entries. The cap is what makes
      // the swing lookups below shift while the history is still short, so the
      // array is reproduced literally rather than replaced by a tidier list.
      const MAX_ARRAY_SIZE = 10
      const zigzag = []
      const pivots = []

      const addToZigzag = (value, barIndex) => {
        zigzag.unshift(barIndex)
        zigzag.unshift(value)
        if (zigzag.length > MAX_ARRAY_SIZE) {
          zigzag.pop()
          zigzag.pop()
        }
        pivots.push({ value, bar: barIndex })
      }
      const updateZigzag = (value, barIndex, dir) => {
        if (zigzag.length === 0) {
          addToZigzag(value, barIndex)
          return
        }
        const head = zigzag[0]
        if ((dir === 1 && value > head) || (dir === -1 && value < head)) {
          zigzag[0] = value
          zigzag[1] = barIndex
          if (pivots.length > 0) pivots[pivots.length - 1] = { value, bar: barIndex }
        }
      }

      let prevDir = 0
      let prevZz2 = NaN
      let prevHigh = NaN
      let prevLow = NaN
      let prevClose = NaN
      let bearRetPrice = NaN
      let bearRetBi = NaN
      let bullRetPrice = NaN
      let bullRetBi = NaN
      let prevBearRetPrice = NaN
      let prevBullRetPrice = NaN
      let bearStatePrev = 0
      let bullStatePrev = 0

      for (let i = 0; i < n; i++) {
        const ph = isWindowHigh(i) ? hi[i] : NaN
        const pl = isWindowLow(i) ? lo[i] : NaN

        // var dir := pl and na(ph) ? -1 : ph and na(pl) ? 1 : dir
        let dir
        if (truthy(pl) && !Number.isFinite(ph)) dir = -1
        else if (truthy(ph) && !Number.isFinite(pl)) dir = 1
        else dir = prevDir

        // ta.change(dir) is na on the first bar, which reads as false.
        const dirChanged = i > 0 && dir !== prevDir

        if (truthy(ph) || truthy(pl)) {
          const value = dir === 1 ? ph : pl
          if (Number.isFinite(value)) {
            if (dirChanged) addToZigzag(value, i)
            else updateZigzag(value, i, dir)
          }
        }

        // The three most recent completed swings, read off the capped array by
        // the source's own offsets. While the array is short these land on
        // different pivots than they do once it is full; that is the source's
        // behaviour and it is reproduced, not corrected.
        const size = zigzag.length
        const zz1 = size > 7 ? zigzag[size - 8] : NaN
        const bi1 = size > 6 ? zigzag[size - 7] : NaN
        const zz2 = size > 5 ? zigzag[size - 6] : NaN
        const bi2 = size > 4 ? zigzag[size - 5] : NaN
        const zz3 = size > 3 ? zigzag[size - 4] : NaN
        const bi3 = size > 2 ? zigzag[size - 3] : NaN

        zz1Col[i] = zz1
        zz2Col[i] = zz2
        zz3Col[i] = zz3
        bi1Col[i] = bi1
        bi2Col[i] = bi2
        bi3Col[i] = bi3

        const swingsReady = Number.isFinite(zz1) && Number.isFinite(zz2) && Number.isFinite(zz3)

        let passFilter = false
        if (swingsReady) {
          if (filterChoice === 'Multiplier') {
            passFilter = Math.abs(zz1 - zz2) > Math.abs(zz3 - zz2) * multiplier
          } else if (zz3 !== 0) {
            passFilter = Math.abs(((zz3 - zz1) / zz3) * 100) > percentage
          }
        }

        const close = bars[i].close
        const high = bars[i].high
        const low = bars[i].low
        const confirmed = confirmedAt(i)

        // Every comparison is guarded: in JavaScript `5 > null` is true, so an
        // unguarded test would fire straight through the warmup.
        const crossReady =
          swingsReady && Number.isFinite(close) && Number.isFinite(prevClose) && Number.isFinite(prevZz2)
        const crossUnderZz2 = crossReady && close < zz2 && prevClose >= prevZz2
        const crossOverZz2 = crossReady && close > zz2 && prevClose <= prevZz2

        const bearishCondition =
          swingsReady &&
          Number.isFinite(close) &&
          zz1 > zz2 &&
          zz1 > zz3 &&
          zz2 < zz3 &&
          close < zz1 &&
          close < zz2 &&
          close < zz3 &&
          crossUnderZz2 &&
          passFilter &&
          confirmed

        const bullishCondition =
          swingsReady &&
          Number.isFinite(close) &&
          zz1 < zz2 &&
          zz1 < zz3 &&
          zz2 > zz3 &&
          close > zz1 &&
          close > zz2 &&
          close > zz3 &&
          crossOverZz2 &&
          passFilter &&
          confirmed

        if (bearishCondition) bearShiftCol[i] = 1
        if (bullishCondition) bullShiftCol[i] = 1

        // A third of the way back into the broken swing range.
        const bearRetLevel = swingsReady ? zz1 - (zz1 - zz2) / 3 : NaN
        const bullRetLevel = swingsReady ? zz1 + (zz2 - zz1) / 3 : NaN

        // Pine latches the retracement price before testing the cross, so the
        // shift bar itself can complete the sequence.
        if (bearishCondition) {
          bearRetPrice = bearRetLevel
          bearRetBi = bi1
        }
        if (bullishCondition) {
          bullRetPrice = bullRetLevel
          bullRetBi = bi1
        }

        const bearRetCondition =
          Number.isFinite(high) &&
          Number.isFinite(prevHigh) &&
          Number.isFinite(bearRetPrice) &&
          Number.isFinite(prevBearRetPrice) &&
          high > bearRetPrice &&
          prevHigh <= prevBearRetPrice &&
          confirmed

        const bullRetCondition =
          Number.isFinite(low) &&
          Number.isFinite(prevLow) &&
          Number.isFinite(bullRetPrice) &&
          Number.isFinite(prevBullRetPrice) &&
          low < bullRetPrice &&
          prevLow >= prevBullRetPrice &&
          confirmed

        // A three-step latch: 0 waiting, 1 shift seen, 2 retracement taken. The
        // 2 lives for exactly one bar and then resets.
        let bearState = bearStatePrev === 2 ? 0 : bearStatePrev
        if (bearishCondition && bearState === 0) bearState = 1
        if (bearRetCondition && bearState === 1) bearState = 2

        let bullState = bullStatePrev === 2 ? 0 : bullStatePrev
        if (bullishCondition && bullState === 0) bullState = 1
        if (bullRetCondition && bullState === 1) bullState = 2

        if (bearState === 2) {
          bearRetCol[i] = 1
          bearRetPriceCol[i] = bearRetPrice
          bearRetBiCol[i] = bearRetBi
        }
        if (bullState === 2) {
          bullRetCol[i] = 1
          bullRetPriceCol[i] = bullRetPrice
          bullRetBiCol[i] = bullRetBi
        }

        prevDir = dir
        prevZz2 = zz2
        prevHigh = high
        prevLow = low
        prevClose = close
        prevBearRetPrice = bearRetPrice
        prevBullRetPrice = bullRetPrice
        bearStatePrev = bearState
        bullStatePrev = bullState
      }

      for (const p of pivots) {
        if (p.bar >= 0 && p.bar < n) zzPivot[p.bar] = p.value
      }

      return result()
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShiftShow = settings.bearShiftShow !== false
      const bullShiftShow = settings.bullShiftShow !== false
      const bearRetShow = settings.bearRetShow !== false
      const bullRetShow = settings.bullRetShow !== false

      // atPrice adds no padding, so the gap is computed from the instrument
      // rather than fixed in points, which would suit one symbol and no other.
      let rangeSum = 0
      let rangeCount = 0
      let lastClose = 0
      for (const b of bars) {
        if (Number.isFinite(b.high) && Number.isFinite(b.low)) {
          rangeSum += b.high - b.low
          rangeCount += 1
        }
        if (Number.isFinite(b.close)) lastClose = b.close
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        if (!Number.isFinite(b.high) || !Number.isFinite(b.low)) continue

        if (bearShow && bearShiftShow && values.bearShift[i] != null) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: BEAR_SIGNAL_COLOR,
          })
        }
        if (bullShow && bullShiftShow && values.bullShift[i] != null) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: BULL_SIGNAL_COLOR,
          })
        }
        // The source marks a retracement with a curved-arrow glyph; a plain
        // letter carries the same meaning without a pictogram.
        if (bearShow && bearRetShow && values.bearRet[i] != null) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.high + pad * 2,
            shape: 'text',
            size: 'tiny',
            text: 'R',
            color: BEAR_SIGNAL_COLOR,
          })
        }
        if (bullShow && bullRetShow && values.bullRet[i] != null) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.low - pad * 2,
            shape: 'text',
            size: 'tiny',
            text: 'R',
            color: BULL_SIGNAL_COLOR,
          })
        }
      }
      return out
    },

    barColors({ bars, values, settings }) {
      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShiftShow = settings.bearShiftShow !== false
      const bullShiftShow = settings.bullShiftShow !== false
      const bearRetShow = settings.bearRetShow !== false
      const bullRetShow = settings.bullRetShow !== false

      // The source paints twice: shift candles first, retracement candles after,
      // so a bar that is both takes the retracement colour.
      return bars.map((_, i) => {
        if (bearShow && bearRetShow && values.bearRet[i] != null) return BEAR_SIGNAL_COLOR
        if (bullShow && bullRetShow && values.bullRet[i] != null) return BULL_SIGNAL_COLOR
        if (bearShow && bearShiftShow && values.bearShift[i] != null) return BEAR_SIGNAL_COLOR
        if (bullShow && bullShiftShow && values.bullShift[i] != null) return BULL_SIGNAL_COLOR
        return null
      })
    },

    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShiftShow = settings.bearShiftShow !== false
      const bullShiftShow = settings.bullShiftShow !== false
      const bearRetShow = settings.bearRetShow !== false
      const bullRetShow = settings.bullRetShow !== false
      const zzShow = settings.zzShow === true

      const rawTransp = Number(settings.boxTransparency)
      const transparency = Number.isFinite(rawTransp) ? Math.min(100, Math.max(0, rawTransp)) : 75
      const boxOpacity = (100 - transparency) / 100

      // A bar index only means something while it points into the loaded bars.
      const timeAt = (raw) => {
        const idx = Math.round(Number(raw))
        if (!Number.isFinite(idx) || idx < 0 || idx >= n) return null
        return bars[idx].time
      }

      const out = []
      // Walk backwards so the cap keeps the most recent structures.
      for (let i = n - 1; i >= 0 && out.length < MAX_DRAWINGS; i--) {
        const isBear = values.bearShift[i] != null
        const isBull = values.bullShift[i] != null
        if (!isBear && !isBull) continue
        if (isBear && !bearShow) continue
        if (isBull && !bullShow) continue

        const zz1 = values.zz1[i]
        const zz2 = values.zz2[i]
        const zz3 = values.zz3[i]
        const t3 = timeAt(values.bi3[i])
        const t1 = timeAt(values.bi1[i])
        const t2 = timeAt(values.bi2[i])
        const colour = isBear ? NEG_COLOR : POS_COLOR

        if (t3 != null && t1 != null && zz3 != null && zz1 != null) {
          out.push({
            kind: 'box',
            from: { time: t3, price: zz3 },
            to: { time: t1, price: zz1 },
            // The source draws the border fully transparent.
            color: withAlpha(colour, 0),
            fillColor: colour,
            opacity: boxOpacity,
          })
        }

        const shiftShow = isBear ? bearShiftShow : bullShiftShow
        if (shiftShow && t2 != null && zz2 != null) {
          out.push({
            kind: 'line',
            from: { time: t2, price: zz2 },
            to: { time: bars[i].time, price: zz2 },
            color: colour,
            lineWidth: 1,
            lineStyle: 'dashed',
          })
        }
      }

      // Retracement levels, drawn from the swing they were measured off to the
      // bar that took them.
      for (let i = n - 1; i >= 0 && out.length < MAX_DRAWINGS * 2; i--) {
        if (bearShow && bearRetShow && values.bearRet[i] != null) {
          const price = values.bearRetPrice[i]
          const t = timeAt(values.bearRetBi[i])
          if (t != null && price != null) {
            out.push({
              kind: 'line',
              from: { time: t, price },
              to: { time: bars[i].time, price },
              color: NEG_COLOR,
              lineWidth: 1,
              lineStyle: 'dotted',
            })
          }
        }
        if (bullShow && bullRetShow && values.bullRet[i] != null) {
          const price = values.bullRetPrice[i]
          const t = timeAt(values.bullRetBi[i])
          if (t != null && price != null) {
            out.push({
              kind: 'line',
              from: { time: t, price },
              to: { time: bars[i].time, price },
              color: POS_COLOR,
              lineWidth: 1,
              lineStyle: 'dotted',
            })
          }
        }
      }

      if (zzShow) {
        const points = []
        for (let i = 0; i < n; i++) {
          const v = values.zzPivot[i]
          if (v != null) points.push({ time: bars[i].time, price: v })
        }
        // The source rebuilds one segment at a time; the finished shape is the
        // polyline through every pivot it has kept.
        const tail = points.length > MAX_DRAWINGS ? points.slice(points.length - MAX_DRAWINGS) : points
        if (tail.length > 1) {
          out.push({ kind: 'polyline', points: tail, color: ZZ_COLOR, lineWidth: 2 })
        }
      }

      return out
    },
  })
}
