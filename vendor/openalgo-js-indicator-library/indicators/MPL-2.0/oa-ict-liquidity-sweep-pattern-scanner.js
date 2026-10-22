/**
 * ICT Liquidity Sweep Pattern Scanner - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Liquidity Sweep Pattern Scanner/Scanner - ICT Liquidity Sweep Pattern Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar. This code is subject to the terms of the
 *          Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A zig zag built from running highs and lows keeps the last seven swing points.
 * When those seven sit in the shape the script looks for and the newest swing
 * then crosses a chosen earlier swing level, the move is read as a liquidity
 * sweep of that level: the bar is flagged, recoloured, and the swept level is
 * drawn back to the swing it came from.
 *
 * The zig zag itself is acknowledged by the author to 'Zig Zag Ratio Simplified'
 * by RozaniGhani-RG.
 *
 * NOT PORTED: the 40-symbol screener table. The source reads each pasted symbol
 * with request.security and lists the ones signalling right now. That is a
 * screener over other instruments, which a chart study cannot express here, so
 * everything that runs on the chart's own symbol is ported and the cross-symbol
 * table is left out. The second, per-symbol data table (%Chg, Vol %Chg, Vol,
 * PD Vol) is the chart symbol's own and is ported in full.
 */

const POS_MID = '#26A69A'
const POS_LIGHT = '#ACE5DC'
const NEG_MID = '#FF5252'
const NEG_LIGHT = '#FCCBCD'
const NEU_LIGHT = '#D1D4DC'
const NEU_MID = '#2A2E39'
const NEU_DARK = '#141516'
const ZIGZAG_COLOR = '#1E53E5'

const METHODS = ['Prev 1 Swing Sweep', 'Prev 2 Swing Sweep', 'Prev 3 Swing Sweep']
const LINE_STYLES = ['solid', 'dashed', 'dotted']
const FONT_SIZES = { auto: 12, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }
const TABLE_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export default function ({
  registerIndicator,
  highestBars,
  lowestBars,
  calendarPeriodFlags,
  isNewZonedDay,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  nulls,
}) {
  registerIndicator({
    id: 'oa-ict-liquidity-sweep-pattern-scanner',
    name: 'ICT Liquidity Sweep Pattern Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'method',
        type: 'select',
        label: 'Screening Method',
        default: 'Prev 2 Swing Sweep',
        group: 'Scanner',
        options: METHODS.map((m) => ({ label: m, value: m })),
        tooltip: 'Which earlier swing the newest swing has to sweep: the 1st, 2nd or 3rd one back.',
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Scanner' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Scanner' },

      { key: 'showZigzag', type: 'boolean', label: 'Display Zig Zag', default: true, group: 'Zig Zag' },
      { key: 'zzPeriod', type: 'number', label: 'Zig Zag Length', default: 4, min: 2, max: 500, step: 1, group: 'Zig Zag' },
      {
        key: 'zzSource',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: 'Zig Zag',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
        ],
      },
      {
        key: 'levelLineStyle',
        type: 'select',
        label: 'Swept Level Line Style',
        default: 'solid',
        group: 'Zig Zag',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
        tooltip: 'Style of the line drawn from the swept swing across to the signal bar.',
      },

      { key: 'showDataTable', type: 'boolean', label: 'Display Table', default: true, group: 'Data Table' },
      {
        key: 'tablePosition',
        type: 'select',
        label: 'Position',
        default: 'bottom-right',
        group: 'Data Table',
        options: TABLE_POSITIONS.map((p) => ({ label: p.replace('-', ' '), value: p })),
      },
      {
        key: 'tableSize',
        type: 'select',
        label: 'Size',
        default: 'normal',
        group: 'Data Table',
        options: Object.keys(FONT_SIZES).map((k) => ({ label: k, value: k })),
      },
    ],

    // The source has no plot() at all: the zig zag is a run of line.new calls
    // joining consecutive swing points. One column carrying the straight-line
    // value between each pair of points draws the same polyline, and gives the
    // leg a colour and a width control the drawing layer would not.
    plots: [
      { key: 'zigzag', type: 'line', title: 'Zig Zag', style: { color: ZIGZAG_COLOR, lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      // A cleared field arrives as '', and Number('') is 0. Pine's minval is 2.
      const period = Math.max(2, Math.floor(Number(settings.zzPeriod) || 4))
      const useOpenClose = settings.zzSource === 'Open/Close'
      const showZigzag = settings.showZigzag !== false
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      // A dropdown in Pine always holds one of its options; a cleared select here
      // does not, so fall back to the default rather than drawing nothing.
      const method = METHODS.includes(settings.method) ? settings.method : METHODS[1]

      const zigzagCol = new Array(n).fill(NaN)
      const longSig = new Array(n).fill(NaN)
      const shortSig = new Array(n).fill(NaN)
      const levelPrice = new Array(n).fill(NaN)
      const levelTime = new Array(n).fill(NaN)
      const cumPchg = new Array(n).fill(NaN)
      const cumVolPchg = new Array(n).fill(NaN)
      const cumVol = new Array(n).fill(NaN)
      const prevVol = new Array(n).fill(NaN)

      /* ---- zig zag ------------------------------------------------------ */

      const swingHigh = new Array(n)
      const swingLow = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        swingHigh[i] = useOpenClose ? Math.max(b.open, b.close) : b.high
        swingLow[i] = useOpenClose ? Math.min(b.open, b.close) : b.low
      }
      // ta.highestbars(...) == 0 means this bar is the highest of the window, so
      // the pivot is known on the bar itself and never repaints backwards. Both
      // helpers hold NaN for the first period-1 bars, exactly as Pine holds na,
      // and both resolve a tie to the most recent bar, which is what Pine does.
      const hiBars = highestBars(swingHigh, period)
      const loBars = lowestBars(swingLow, period)

      // The Pine array is a flat [value, barIndex, ...] stack, newest pair first,
      // trimmed to seven points. Kept literally, because zz_1 .. zz_7 below are
      // read by offset from its END and those offsets shift while it fills.
      const MAX_ARRAY_SIZE = 14
      const zigzag = []
      // The same points in chronological order, for the legs the source draws.
      const points = []
      let dir = 0

      const addPoint = (value, index) => {
        zigzag.unshift(index)
        zigzag.unshift(value)
        if (zigzag.length > MAX_ARRAY_SIZE) {
          zigzag.pop()
          zigzag.pop()
        }
        points.push({ value, index })
      }

      const at = (k) => (k >= 0 && k < zigzag.length ? zigzag[k] : NaN)

      const zz1 = new Array(n).fill(NaN)
      const zz2 = new Array(n).fill(NaN)
      const zz3 = new Array(n).fill(NaN)
      const zz4 = new Array(n).fill(NaN)
      const zz5 = new Array(n).fill(NaN)
      const zz6 = new Array(n).fill(NaN)
      const zz7 = new Array(n).fill(NaN)
      const bi3 = new Array(n).fill(NaN)
      const bi5 = new Array(n).fill(NaN)
      const bi7 = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const ph = hiBars[i] === 0 ? swingHigh[i] : NaN
        const pl = loBars[i] === 0 ? swingLow[i] : NaN
        const hasPh = Number.isFinite(ph)
        const hasPl = Number.isFinite(pl)

        // dir flips only when exactly one side prints: a bar that is both the
        // window high and the window low leaves the direction alone.
        const prevDir = dir
        if (hasPl && !hasPh) dir = -1
        else if (hasPh && !hasPl) dir = 1
        const dirChanged = dir !== prevDir

        if (hasPh || hasPl) {
          const value = dir === 1 ? ph : pl
          if (Number.isFinite(value)) {
            if (dirChanged) {
              addPoint(value, i)
            } else if (zigzag.length === 0) {
              addPoint(value, i)
            } else if ((dir === 1 && value > zigzag[0]) || (dir === -1 && value < zigzag[0])) {
              // The swing in progress extends: move the newest point, do not add.
              zigzag[0] = value
              zigzag[1] = i
              points[points.length - 1] = { value, index: i }
            }
          }
        }

        // Read verbatim from the source, including the offsets it uses while the
        // stack is still filling, where zz_1 is na and zz_2 holds the newest point.
        const size = zigzag.length
        zz1[i] = size > 13 ? at(size - 14) : NaN
        zz2[i] = size > 11 ? at(size - 12) : NaN
        zz3[i] = size > 9 ? at(size - 10) : NaN
        bi3[i] = size > 8 ? at(size - 9) : NaN
        zz4[i] = size > 7 ? at(size - 8) : NaN
        zz5[i] = size > 5 ? at(size - 6) : NaN
        bi5[i] = size > 4 ? at(size - 5) : NaN
        zz6[i] = size > 3 ? at(size - 4) : NaN
        zz7[i] = size > 1 ? at(size - 2) : NaN
        bi7[i] = size > 0 ? at(size - 1) : NaN
      }

      if (showZigzag) {
        // One leg per consecutive pair of points. The source only starts drawing
        // once three points exist, so its very first leg is never painted; that
        // is reproduced here rather than quietly improved.
        for (let k = 1; k + 1 < points.length; k++) {
          const a = points[k]
          const b = points[k + 1]
          const span = b.index - a.index
          if (!(span > 0)) {
            zigzagCol[b.index] = b.value
            continue
          }
          for (let i = a.index; i <= b.index; i++) {
            zigzagCol[i] = a.value + ((b.value - a.value) * (i - a.index)) / span
          }
        }
      }

      /* ---- sweep conditions --------------------------------------------- */

      const crossOver = (a, b, i) =>
        i > 0 &&
        Number.isFinite(a[i]) && Number.isFinite(b[i]) &&
        Number.isFinite(a[i - 1]) && Number.isFinite(b[i - 1]) &&
        a[i] > b[i] && a[i - 1] <= b[i - 1]

      const crossUnder = (a, b, i) =>
        i > 0 &&
        Number.isFinite(a[i]) && Number.isFinite(b[i]) &&
        Number.isFinite(a[i - 1]) && Number.isFinite(b[i - 1]) &&
        a[i] < b[i] && a[i - 1] >= b[i - 1]

      // The seven-swing shape the source demands, transcribed comparison for
      // comparison. a..f are zz_2 .. zz_7; zz_1 is the swing doing the sweeping.
      const bearStack = (i) => {
        const a = zz2[i], b = zz3[i], c = zz4[i], d = zz5[i], e = zz6[i], f = zz7[i]
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return false
        if (!Number.isFinite(d) || !Number.isFinite(e) || !Number.isFinite(f)) return false
        return (
          a < b && a < c && a < e && a < f &&
          b < d && b > c && b > a &&
          c < b && c < d && c < e && c < f &&
          d > b && d > c && d > e && d < f &&
          e < d && e < f && e > c &&
          f > a && f > b && f > c && f > d && f > e
        )
      }

      const bullStack = (i) => {
        const a = zz2[i], b = zz3[i], c = zz4[i], d = zz5[i], e = zz6[i], f = zz7[i]
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return false
        if (!Number.isFinite(d) || !Number.isFinite(e) || !Number.isFinite(f)) return false
        return (
          a > b && a > c && a > e && a > f &&
          b > d && b < c && b < a &&
          c > b && c > d && c > e && c > f &&
          d < b && d < c && d < e && d > f &&
          e > d && e > f && e < c &&
          f < a && f < b && f < c && f < d && f < e
        )
      }

      // barstate.isconfirmed: every loaded bar is closed except, on a live feed,
      // the last one. Without a context, treat the series as history.
      const lastIndex = n - 1
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      for (let i = 0; i < n; i++) {
        if (i === lastIndex && !lastConfirmed) continue
        const bear = bearStack(i)
        const bull = bullStack(i)

        let shortHit = false
        let longHit = false
        let price = NaN
        let fromBar = NaN

        if (method === METHODS[0]) {
          shortHit = bear && crossOver(zz1, zz3, i)
          // Verbatim from the source: long_condition_1 tests the SAME stack the
          // short conditions test, unlike long_condition_2 and _3 which mirror it.
          longHit = bear && crossUnder(zz1, zz3, i)
          price = zz3[i]
          fromBar = bi3[i]
        } else if (method === METHODS[1]) {
          shortHit = bear && crossOver(zz1, zz5, i)
          longHit = bull && crossUnder(zz1, zz5, i)
          price = zz5[i]
          fromBar = bi5[i]
        } else {
          shortHit = bear && crossOver(zz1, zz7, i)
          longHit = bull && crossUnder(zz1, zz7, i)
          price = zz7[i]
          fromBar = bi7[i]
        }

        const shortOn = showShort && shortHit
        const longOn = showLong && longHit
        if (shortOn) shortSig[i] = 1
        if (longOn) longSig[i] = 1

        if (shortOn || longOn) {
          const anchor = Math.trunc(fromBar)
          if (Number.isFinite(price) && Number.isFinite(anchor) && anchor >= 0 && anchor < n) {
            levelPrice[i] = price
            levelTime[i] = bars[anchor].time
          }
        }
      }

      /* ---- per-day accumulators behind the data table -------------------- */

      const zoneSetting = ctx?.timezone
      const zone =
        typeof zoneSetting === 'string' && zoneSetting !== '' && isValidTimezone(zoneSetting)
          ? zoneSetting
          : DEFAULT_TIMEZONE
      const newDay = calendarPeriodFlags(bars.map((b) => b.time), (a, b) => isNewZonedDay(a, b, zone))

      let runningPct = NaN
      let dayVol = NaN
      let priorDayVol = NaN
      for (let i = 0; i < n; i++) {
        // The first loaded bar opens the first day: Pine has no previous daily
        // stamp to compare against there either, and seeding the day keeps the
        // volume total from staying na until the first boundary.
        const isNewDay = i === 0 || newDay[i] === true
        const prevClose = i > 0 ? bars[i - 1].close : NaN
        const close = bars[i].close
        const barPct =
          Number.isFinite(prevClose) && prevClose !== 0 && Number.isFinite(close)
            ? ((close - prevClose) / prevClose) * 100
            : 0
        runningPct = isNewDay ? barPct : Number.isFinite(runningPct) ? runningPct + barPct : barPct
        cumPchg[i] = runningPct

        // Volume is genuinely missing on index series, so it counts as nothing
        // rather than poisoning the whole day's total.
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        if (isNewDay) {
          priorDayVol = dayVol
          dayVol = vol
        } else {
          dayVol = (Number.isFinite(dayVol) ? dayVol : 0) + vol
        }
        cumVol[i] = dayVol
        prevVol[i] = priorDayVol

        // nz(prev, current): with no previous day the change against itself is 0.
        const base = Number.isFinite(priorDayVol) ? priorDayVol : dayVol
        cumVolPchg[i] =
          Number.isFinite(base) && base !== 0 && Number.isFinite(dayVol)
            ? ((dayVol - base) / base) * 100
            : NaN
      }

      return {
        zigzag: nulls(zigzagCol),
        longSig: nulls(longSig),
        shortSig: nulls(shortSig),
        levelPrice: nulls(levelPrice),
        levelTime: nulls(levelTime),
        cumPchg: nulls(cumPchg),
        cumVolPchg: nulls(cumVolPchg),
        cumVol: nulls(cumVol),
        prevVol: nulls(prevVol),
      }
    },

    // plotshape(location.abovebar / belowbar). On an overlay those anchor to this
    // indicator's own line, so the triangles are placed at an explicit price with
    // a pad scaled to the instrument's own bar range.
    markers({ bars, values }) {
      const out = []
      if (bars.length === 0) return out

      let sum = 0
      let count = 0
      for (const b of bars) {
        const range = b.high - b.low
        if (Number.isFinite(range)) {
          sum += range
          count += 1
        }
      }
      const meanRange = count > 0 ? sum / count : 0
      const lastClose = bars[bars.length - 1].close
      const pad = Math.max(meanRange * 0.5, Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005, 1e-8)

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (values.shortSig[i] === 1 && Number.isFinite(bar.high)) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT,
          })
        }
        if (values.longSig[i] === 1 && Number.isFinite(bar.low)) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT,
          })
        }
      }
      return out
    },

    // line.new from the swept swing across to the signal bar, at the swing price.
    draws({ bars, values, settings }) {
      const out = []
      if (bars.length === 0) return out
      const lineStyle = LINE_STYLES.includes(settings.levelLineStyle) ? settings.levelLineStyle : 'solid'

      for (let i = 0; i < bars.length; i++) {
        const price = values.levelPrice[i]
        const from = values.levelTime[i]
        if (!Number.isFinite(price) || !Number.isFinite(from)) continue
        out.push({
          kind: 'line',
          from: { time: from, price },
          to: { time: bars[i].time, price },
          color: values.shortSig[i] === 1 ? NEG_MID : POS_MID,
          lineWidth: 1,
          lineStyle,
        })
      }
      return out
    },

    // barcolor(): the short verdict is tested first, exactly as the source does.
    barColors({ bars, values }) {
      return bars.map((b, i) =>
        values.shortSig[i] === 1 ? NEG_LIGHT : values.longSig[i] === 1 ? POS_LIGHT : null
      )
    },

    table({ bars, values, settings }) {
      if (settings.showDataTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const pct = values.cumPchg[i]
      const volPct = values.cumVolPchg[i]
      const vol = values.cumVol[i]
      const priorVol = values.prevVol[i]

      // str.tostring(x, '#.##'): at most two decimals, no trailing zeros.
      const num = (v) => (Number.isFinite(v) ? String(Number(v.toFixed(2))) : '-')
      const lakh = (v) => (Number.isFinite(v) ? String(Number((v / 100000).toFixed(2))) + ' L' : '-')
      const head = (text, bgColor) => ({ text, align: 'left', bgColor, textColor: NEU_LIGHT })
      const cell = (text, bgColor, textColor) => ({ text, align: 'right', bgColor, textColor })

      const pctColor = Number.isFinite(pct) && pct > 0 ? POS_MID : NEG_MID
      const volPctColor = Number.isFinite(volPct) && volPct > 0 ? POS_MID : NEG_MID
      const priorVolColor =
        Number.isFinite(priorVol) && Number.isFinite(vol) && priorVol < vol ? NEG_MID : POS_MID

      const position = TABLE_POSITIONS.includes(settings.tablePosition) ? settings.tablePosition : 'bottom-right'
      const fontSize = FONT_SIZES[settings.tableSize] ?? FONT_SIZES.normal

      return {
        rows: [
          [head('%Chg', NEU_DARK), cell(num(pct) + ' %', NEU_DARK, pctColor)],
          [head('Vol %Chg', NEU_MID), cell(num(volPct) + ' %', NEU_MID, volPctColor)],
          [head('Vol', NEU_DARK), cell(lakh(vol), NEU_DARK, volPctColor)],
          [head('PD Vol', NEU_MID), cell(lakh(priorVol), NEU_MID, priorVolColor)],
        ],
        options: {
          position,
          fontSize,
          cellWidth: [78, 78],
          cellHeight: 20,
          borderColor: NEU_MID,
          borderWidth: 1,
        },
      }
    },
  })
}
