/**
 * Momentum Setup - Ankush Bajaj Momentum Investing Setup with Scanner - ported
 * to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - Ankush Bajaj Momentum Investing Setup/Momentum Setup - Ankush Bajaj Momentum Investing Setup with Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A five-filter momentum screen: the 250-bar percentage change, RSI, MFI, CCI
 * and volume against a multiple of its own moving average all have to agree
 * before a bar is flagged. Supertrend rides the price, and the oscillators are
 * redrawn as miniature curves in price space under and over the candles.
 *
 * Not ported: the 39-symbol scanner. It reads other instruments through
 * request.security and lists their signals in a second table, which is a
 * screener rather than a chart study and has no equivalent here. Everything
 * that runs on the charted symbol is ported in full.
 */

// The Pine defaults for the seven colour inputs, kept as constants: the chart
// generates the colour controls for plots, so these are only for the drawings,
// markers, background, bar colours and table, which have no generated controls.
const POS = '#26A69A'
const POS_LIGHT = '#B2DFDB'
const NEG_LIGHT = '#FFCDD2'
const NEG = '#FF5250'
const INDICATOR = '#2962FF'
const SIGNAL = '#FF6D00'
const NEUTRAL = '#787B86'

// Pine hard-codes the lookback of ta.change(close, 250); only the threshold is
// an input, so this stays a constant here too.
const PCHG_LOOKBACK = 250

// ta.mfi, ta.rsi and ta.cci are all plotted on a fixed 0..100 style scale in
// the overlay section, which Pine spells `oscHighest = 100`.
const OSC_TOP = 100

const VOL_TYPES = new Set(['Buying/Selling Volume', 'Regular Volume', 'None'])
// Pine's nine table positions, all of which the chart's TablePosition accepts.
const TABLE_POSITIONS = new Set([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])
const TABLE_FONT_PX = { tiny: 8, small: 10, normal: 12, large: 15, huge: 19 }

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  smaSeededEma,
  rsi,
  cci,
  change,
  supertrend,
  compactVolume,
  withAlpha,
  nulls,
}) {
  // A cleared number or text field arrives as '', and Number('') is 0, so a
  // plain `Number(x) || fallback` would also swallow a deliberate 0.
  const num = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const int = (v, fallback, floor) => Math.max(floor, Math.floor(num(v, fallback)))
  const fin = (v) => Number.isFinite(v)

  /** Every coerced setting in one place, so calc and the hooks cannot drift. */
  const read = (s) => ({
    pchgPct: Math.max(0, num(s.pchgPct, 8)),

    rsiDisplay: s.rsiDisplay !== false,
    rsiLen: int(s.rsiLen, 14, 1),
    rsiSmaLen: int(s.rsiSmaLen, 14, 1),
    rsiOb: num(s.rsiOb, 60),
    rsiOs: num(s.rsiOs, 40),
    rsiVoffset: num(s.rsiVoffset, 1.3),
    rsiHeight: num(s.rsiHeight, 2),

    mfiDisplay: s.mfiDisplay !== false,
    mfiLen: int(s.mfiLen, 14, 1),
    mfiOb: num(s.mfiOb, 60),
    mfiOs: num(s.mfiOs, 40),
    mfiVoffset: num(s.mfiVoffset, 1.6),
    mfiHeight: num(s.mfiHeight, 1),

    cciDisplay: s.cciDisplay !== false,
    cciLen: int(s.cciLen, 20, 1),
    cciSmaLen: int(s.cciSmaLen, 5, 1),
    cciOb: num(s.cciOb, 100),
    cciOs: num(s.cciOs, -100),
    cciVoffset: num(s.cciVoffset, 1.8),
    cciHeight: num(s.cciHeight, 0.2),

    volDisplay: s.volDisplay !== false,
    volType: VOL_TYPES.has(s.volType) ? s.volType : 'Regular Volume',
    volMaLen: int(s.volMaLen, 20, 1),
    volMaMulti: Math.max(1, num(s.volMaMulti, 5)),
    volVoffset: num(s.volVoffset, 0.3),
    volHeight: num(s.volHeight, 0.6),

    stDisplay: s.stDisplay !== false,
    stAtrPeriod: int(s.stAtrPeriod, 10, 1),
    stFactor: Math.max(0.01, num(s.stFactor, 3)),

    displayLen: int(s.displayLen, 50, 1),

    tablePosition: TABLE_POSITIONS.has(s.tablePosition) ? s.tablePosition : 'top-right',
    tableFont: TABLE_FONT_PX[s.tableSize] ?? TABLE_FONT_PX.normal,
  })

  /**
   * math.sum, as a sliding window that recovers.
   *
   * The exported rollingSum keeps a running total, so one non-finite term
   * poisons every later bar. Pine's math.sum is a window: a bar with no volume
   * blanks the next `period` results and no more. A symbol that carries no
   * volume at all therefore blanks the whole series, which is what Pine does
   * and what the money flow filter should do.
   */
  const slidingSum = (values, period) => {
    const len = values.length
    const out = new Array(len).fill(NaN)
    if (period <= 0) return out
    let total = 0
    let missing = 0
    for (let i = 0; i < len; i++) {
      if (fin(values[i])) total += values[i]
      else missing += 1
      if (i >= period) {
        const old = values[i - period]
        if (fin(old)) total -= old
        else missing -= 1
      }
      if (i >= period - 1) out[i] = missing === 0 ? total : NaN
    }
    return out
  }

  /**
   * ta.mfi(src, length), spelled out rather than taken from the built-in MFI.
   *
   * The built-in reads the typical price too but emits its first value one bar
   * later than Pine does, because Pine's `ta.change(src) <= 0 ? 0 : src` is
   * false on bar 0 (every comparison with na is) and so counts bar 0 into both
   * the positive and the negative money flow. Reproducing that keeps the
   * warmup and the first values identical to the source.
   */
  const mfiOf = (src, volumes, period) => {
    const n = src.length
    const chg = change(src, 1)
    const up = new Array(n).fill(NaN)
    const down = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      // ta.mfi reads the raw volume, not nz(volume): a feed without volume
      // leaves the money flow undefined rather than flat at zero.
      const v = volumes[i]
      const value = src[i]
      if (!fin(v) || !fin(value)) continue
      const c = chg[i]
      up[i] = v * (fin(c) && c <= 0 ? 0 : value)
      down[i] = v * (fin(c) && c >= 0 ? 0 : value)
    }
    const upper = slidingSum(up, period)
    const lower = slidingSum(down, period)
    const out = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      if (!fin(upper[i]) || !fin(lower[i])) continue
      // Pine divides upper by lower in doubles: 0/0 is na and the reading is
      // blank, which is what a window with no volume at all has to give. An
      // index feed that reports volume 0 on every bar would otherwise read a
      // flat 100 and colour the table cell as if money were pouring in.
      if (upper[i] === 0 && lower[i] === 0) continue
      if (lower[i] === 0) out[i] = 100
      else if (upper[i] === 0) out[i] = 0
      else out[i] = 100 - 100 / (1 + upper[i] / lower[i])
    }
    return out
  }

  const fmt = (v, dp = 2) => (fin(v) ? v.toFixed(dp) : '-')

  registerIndicator({
    id: 'oa-momentum-setup---ankush-bajaj-momentum-investing-setup-with-',
    name: 'Momentum Setup - Ankush Bajaj Momentum Investing Setup with Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'pchgPct',
        type: 'number',
        label: 'Above/Below %',
        default: 8,
        min: 0,
        max: 1000,
        step: 0.1,
        group: '250 Candle % Change',
        tooltip:
          'Percentage change between the bar 250 back and this one. Positive for the long filter, its negative for the short filter. 8 suits the daily timeframe; try 2 to 4 intraday.',
      },

      { key: 'rsiDisplay', type: 'boolean', label: 'Display', default: true, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiLen', type: 'number', label: 'RSI Length', default: 14, min: 1, max: 500, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiSmaLen', type: 'number', label: 'SMA Length', default: 14, min: 1, max: 500, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiOb', type: 'number', label: 'Overbought', default: 60, min: 0, max: 100, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiOs', type: 'number', label: 'Oversold', default: 40, min: 0, max: 100, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiVoffset', type: 'number', label: 'Vertical Offset', default: 1.3, min: -10, max: 10, step: 0.1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiHeight', type: 'number', label: 'Height', default: 2, min: 0.1, max: 20, step: 0.1, group: 'Relative Strength Index (RSI)' },

      { key: 'mfiDisplay', type: 'boolean', label: 'Display', default: true, group: 'Money Flow Index (MFI)' },
      { key: 'mfiLen', type: 'number', label: 'MFI Length', default: 14, min: 1, max: 500, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiOb', type: 'number', label: 'Overbought', default: 60, min: 0, max: 100, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiOs', type: 'number', label: 'Oversold', default: 40, min: 0, max: 100, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiVoffset', type: 'number', label: 'Vertical Offset', default: 1.6, min: -10, max: 10, step: 0.1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiHeight', type: 'number', label: 'Height', default: 1, min: 0.1, max: 20, step: 0.1, group: 'Money Flow Index (MFI)' },

      { key: 'cciDisplay', type: 'boolean', label: 'Display', default: true, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciLen', type: 'number', label: 'CCI Length', default: 20, min: 1, max: 500, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciSmaLen', type: 'number', label: 'SMA Length', default: 5, min: 1, max: 500, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciOb', type: 'number', label: 'Overbought', default: 100, min: 0, max: 500, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciOs', type: 'number', label: 'Oversold', default: -100, min: -500, max: 0, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciVoffset', type: 'number', label: 'Vertical Offset', default: 1.8, min: -10, max: 10, step: 0.1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciHeight', type: 'number', label: 'Height', default: 0.2, min: 0.1, max: 20, step: 0.1, group: 'Commodity Channel Index (CCI)' },

      { key: 'volDisplay', type: 'boolean', label: 'Display MA Line', default: true, group: 'Volume' },
      {
        key: 'volType',
        type: 'select',
        label: 'Type',
        default: 'Regular Volume',
        options: [
          { label: 'Buying/Selling Volume', value: 'Buying/Selling Volume' },
          { label: 'Regular Volume', value: 'Regular Volume' },
          { label: 'None', value: 'None' },
        ],
        group: 'Volume',
      },
      { key: 'volMaLen', type: 'number', label: 'MA Length', default: 20, min: 1, max: 500, step: 1, group: 'Volume' },
      {
        key: 'volMaMulti',
        type: 'number',
        label: 'MA Multiplier (x)',
        default: 5,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Volume',
        tooltip: 'Lifts the volume moving average the signal has to clear. 1 applies no multiplier; the strategy asks for 5.',
      },
      { key: 'volVoffset', type: 'number', label: 'Vertical Offset', default: 0.3, min: -10, max: 10, step: 0.1, group: 'Volume' },
      { key: 'volHeight', type: 'number', label: 'Height', default: 0.6, min: 0.1, max: 20, step: 0.1, group: 'Volume' },

      { key: 'stDisplay', type: 'boolean', label: 'Display', default: true, group: 'Supertrend' },
      { key: 'stAtrPeriod', type: 'number', label: 'ATR Length', default: 10, min: 1, max: 500, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 3, min: 0.01, max: 50, step: 0.01, group: 'Supertrend' },

      {
        key: 'displayLen',
        type: 'number',
        label: 'Display Length',
        default: 50,
        min: 1,
        max: 500,
        step: 1,
        group: 'Chart Settings',
        tooltip: 'How many recent bars the overlay curves, the volume histogram and the signal shading cover.',
      },

      {
        key: 'tablePosition',
        type: 'select',
        label: 'Position',
        default: 'top-right',
        options: [
          { label: 'Top Left', value: 'top-left' },
          { label: 'Top Center', value: 'top-center' },
          { label: 'Top Right', value: 'top-right' },
          { label: 'Middle Left', value: 'middle-left' },
          { label: 'Middle Center', value: 'middle-center' },
          { label: 'Middle Right', value: 'middle-right' },
          { label: 'Bottom Left', value: 'bottom-left' },
          { label: 'Bottom Center', value: 'bottom-center' },
          { label: 'Bottom Right', value: 'bottom-right' },
        ],
        group: 'Table',
      },
      {
        key: 'tableSize',
        type: 'select',
        label: 'Size',
        default: 'normal',
        options: [
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
        group: 'Table',
      },
    ],

    // The Pine script plots exactly three series: the Supertrend split into an
    // up half and a down half so each keeps its own colour and breaks at the
    // flip, and a hidden body-middle line it declares as a fill anchor.
    plots: [
      { key: 'stUp', type: 'line', title: 'Supertrend Up', style: { color: POS, lineWidth: 2 } },
      { key: 'stDown', type: 'line', title: 'Supertrend Down', style: { color: NEG, lineWidth: 2 } },
      { key: 'bodyMid', type: 'line', title: 'Body Middle', style: { color: NEUTRAL, lineWidth: 1, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const s = read(settings)

      const close = sourceValues(bars, 'close')
      const hlc3 = sourceValues(bars, 'hlc3')
      const volumes = bars.map((b) => (fin(b.volume) ? b.volume : NaN))
      // Pine's nz(volume): a feed with no volume reads as zero, not as a gap.
      const nzVolume = volumes.map((v) => (fin(v) ? v : 0))

      // 1. Percentage change over 250 bars, divided by the CURRENT close.
      const chg250 = change(close, PCHG_LOOKBACK)
      const pchg = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!fin(chg250[i]) || !fin(close[i]) || close[i] === 0) continue
        pchg[i] = (chg250[i] / close[i]) * 100
      }

      // 2..4. The three oscillators, each on the source Pine gives it.
      const rsiVals = rsi(close, s.rsiLen)
      const rsiSmaVals = sma(rsiVals, s.rsiSmaLen)
      const mfiVals = mfiOf(hlc3, volumes, s.mfiLen)
      const cciVals = cci(hlc3, s.cciLen)
      const cciSmaVals = sma(cciVals, s.cciSmaLen)

      // 5. Volume moving average. Pine uses ta.ema, which seeds from the SMA of
      // the first `length` values, so smaSeededEma rather than ema. It reads
      // the raw volume, so a feed without one leaves the threshold undefined
      // and no signal can clear it.
      const volEma = smaSeededEma(volumes, s.volMaLen)
      const volSma = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!fin(volEma[i])) continue
        volSma[i] = volEma[i] * s.volMaMulti
      }

      // 6. Supertrend. The helper takes bars and the Pine call takes the factor
      // first, so the two argument orders are deliberately crossed here.
      const st = supertrend(bars, s.stAtrPeriod, s.stFactor)
      const stUp = new Array(n).fill(NaN)
      const stDown = new Array(n).fill(NaN)
      const bodyMid = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const point = st[i]
        const value = fin(point?.value) ? point.value : NaN
        const dir = point?.direction
        // Pine blanks the first bar of both the level and the body middle while
        // the Supertrend is displayed, so the line does not start at the axis.
        const firstBarBlank = s.stDisplay && i === 0
        if (!firstBarBlank) bodyMid[i] = (bars[i].open + bars[i].close) / 2
        if (!s.stDisplay || firstBarBlank || !fin(value)) continue
        // `direction < 0` is an uptrend; anything else, including a warmup gap,
        // falls to the down plot exactly as the Pine ternary does.
        if (dir < 0) stUp[i] = value
        else stDown[i] = value
      }

      // Buying and selling volume, used only by the overlay histogram and the
      // volume label. A doji with no range has no split to report.
      const bvol = new Array(n).fill(NaN)
      const svol = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const range = bars[i].high - bars[i].low
        if (!fin(range) || range === 0) continue
        bvol[i] = (nzVolume[i] * (bars[i].close - bars[i].low)) / range
        svol[i] = (nzVolume[i] * (bars[i].high - bars[i].close)) / range
      }

      // Signals. Pine gates both on barstate.isconfirmed, so the forming bar
      // never flags; every historical bar is confirmed by definition.
      const lastConfirmed = ctx?.barState?.isConfirmed !== false
      const long = new Array(n).fill(null)
      const short = new Array(n).fill(null)
      for (let i = 0; i < n; i++) {
        const confirmed = i < n - 1 ? true : lastConfirmed
        if (!confirmed) continue
        // Every comparison is guarded: in Pine a test against na is false, in
        // JavaScript `5 > null` is true and the whole warmup would fire.
        if (!fin(pchg[i]) || !fin(rsiVals[i]) || !fin(mfiVals[i]) || !fin(cciVals[i])) continue
        if (!fin(volumes[i]) || !fin(volSma[i])) continue
        const volOk = volumes[i] > volSma[i]
        if (!volOk) continue
        if (pchg[i] < -s.pchgPct && rsiVals[i] < s.rsiOs && mfiVals[i] < s.mfiOs && cciVals[i] < s.cciOs) {
          short[i] = 1
        } else if (pchg[i] > s.pchgPct && rsiVals[i] > s.rsiOb && mfiVals[i] > s.mfiOb && cciVals[i] > s.cciOb) {
          long[i] = 1
        }
      }

      return {
        stUp: nulls(stUp),
        stDown: nulls(stDown),
        bodyMid: nulls(bodyMid),
        // Columns no plot draws, read by the table, the markers, the shading
        // and the overlay drawings. They still have to be returned.
        pchg: nulls(pchg),
        rsi: nulls(rsiVals),
        rsiSma: nulls(rsiSmaVals),
        mfi: nulls(mfiVals),
        cci: nulls(cciVals),
        cciSma: nulls(cciSmaVals),
        volSma: nulls(volSma),
        bvol: nulls(bvol),
        svol: nulls(svol),
        long,
        short,
      }
    },

    // plotshape(location.abovebar / location.belowbar). On an overlay both
    // aboveBar and belowBar would anchor to this indicator's own Supertrend
    // line, so the triangles are placed at an explicit price instead, padded by
    // a fraction of the mean bar range so they scale with the instrument.
    markers({ bars, values }) {
      if (bars.length === 0) return []
      let range = 0
      let counted = 0
      for (let i = Math.max(0, bars.length - 100); i < bars.length; i++) {
        const r = bars[i].high - bars[i].low
        if (fin(r)) {
          range += r
          counted += 1
        }
      }
      const mean = counted > 0 ? range / counted : 0
      const last = bars[bars.length - 1].close
      const pad = Math.max(mean * 0.5, Math.abs(fin(last) ? last : 0) * 0.0005, 1e-6)

      const out = []
      for (let i = 0; i < bars.length; i++) {
        if (values.short?.[i] != null) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT,
            text: 'Short',
          })
        } else if (values.long?.[i] != null) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT,
            text: 'Long',
          })
        }
      }
      return out
    },

    // bgcolor(..., show_last=i_display_len): only the most recent display-length
    // bars are shaded, at Pine transparency 90, which is 0.1 alpha here.
    background({ bars, values, settings }) {
      const s = read(settings)
      const first = bars.length - s.displayLen
      return bars.map((b, i) => {
        if (i < first) return null
        if (values.short?.[i] != null) return withAlpha(NEG_LIGHT, 0.1)
        if (values.long?.[i] != null) return withAlpha(POS_LIGHT, 0.1)
        return null
      })
    },

    // barcolor() carries no show_last, so it repaints every signal bar.
    barColors({ bars, values }) {
      return bars.map((b, i) => {
        if (values.short?.[i] != null) return NEG_LIGHT
        if (values.long?.[i] != null) return POS_LIGHT
        return null
      })
    },

    /**
     * The overlay charts: RSI, MFI and CCI redrawn as curves in price space
     * below the candles, and volume as a histogram above them.
     *
     * Pine builds these from line.new and box.new inside a barstate.islast
     * block, rebuilding the whole set on every update. `draws` is evaluated for
     * the drawn state already, so the delete-and-rebuild bookkeeping and the
     * islast guard both disappear.
     *
     * Pine's boxes with an equal top and bottom are horizontal lines, and its
     * zero-width boxes are vertical bars, so both are emitted as lines here.
     */
    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const s = read(settings)
      const last = n - 1
      // Two windows, because Pine uses two. The lines and boxes are anchored
      // between bar_index[i_display_len] and bar_index, which spans one bar
      // more than the length: that is `startIdx`. The extremes come from
      // ta.highest/ta.lowest over i_display_len bars, and the volume histogram
      // runs `for barIndex = 0 to i_display_len - 1`, both of which stop one
      // bar later: that is `statIdx`.
      const startIdx = Math.max(0, last - s.displayLen)
      const statIdx = Math.max(0, last - s.displayLen + 1)
      const startTime = bars[startIdx].time
      const lastTime = bars[last].time

      let priceHighest = -Infinity
      let priceLowest = Infinity
      let volumeHighest = 0
      for (let i = statIdx; i <= last; i++) {
        if (fin(bars[i].high) && bars[i].high > priceHighest) priceHighest = bars[i].high
        if (fin(bars[i].low) && bars[i].low < priceLowest) priceLowest = bars[i].low
        const v = fin(bars[i].volume) ? bars[i].volume : 0
        if (v > volumeHighest) volumeHighest = v
      }
      if (!fin(priceHighest) || !fin(priceLowest)) return []
      const priceChangeRate = priceHighest !== 0 ? (priceHighest - priceLowest) / priceHighest : 0

      const out = []

      // An oscillator level mapped into price space, the same expression Pine
      // repeats for every box, line and label in this section.
      const mapOsc = (voffset, height, level) => {
        if (!fin(level)) return NaN
        return priceLowest * (1 - priceChangeRate * voffset) * (1 + (level / OSC_TOP) * priceChangeRate * height)
      }

      // A curve, split wherever the oscillator is still warming up: a polyline
      // needs every anchor finite, and a warmup gap should break the line.
      const curve = (col, voffset, height, color) => {
        if (!Array.isArray(col)) return
        let run = []
        for (let i = startIdx; i <= last; i++) {
          const price = mapOsc(voffset, height, col[i])
          if (fin(price) && fin(bars[i].time)) run.push({ time: bars[i].time, price })
          else {
            if (run.length > 1) out.push({ kind: 'polyline', points: run, color, lineWidth: 1 })
            run = []
          }
        }
        if (run.length > 1) out.push({ kind: 'polyline', points: run, color, lineWidth: 1 })
      }

      // A reference level: Pine draws it as a box whose top and bottom agree,
      // at transparency 75, which is 0.25 alpha here.
      const level = (voffset, height, value, color) => {
        const price = mapOsc(voffset, height, value)
        if (!fin(price)) return
        out.push({
          kind: 'line',
          from: { time: startTime, price },
          to: { time: lastTime, price },
          color: withAlpha(color, 0.25),
          lineWidth: 1,
        })
      }

      // Pine anchors every label at bar_index + 3. There is no bar three ahead,
      // so the label sits on the last bar and opens to the right instead. Its
      // reading, which Pine hides in a hover tooltip, goes into the text.
      const label = (voffset, height, value, text, color) => {
        const price = mapOsc(voffset, height, value)
        if (!fin(price)) return
        out.push({
          kind: 'label',
          at: { time: lastTime, price },
          text,
          color: '#00000000',
          textColor: color,
          align: 'left',
        })
      }

      const mid = 50 // math.avg(100, 0)

      if (s.mfiDisplay) {
        level(s.mfiVoffset, s.mfiHeight, s.mfiOb, POS)
        level(s.mfiVoffset, s.mfiHeight, mid, NEUTRAL)
        level(s.mfiVoffset, s.mfiHeight, s.mfiOs, NEG)
        curve(values.mfi, s.mfiVoffset, s.mfiHeight, INDICATOR)
        label(s.mfiVoffset, s.mfiHeight, mid, `MFI ${fmt(values.mfi?.[last])}`, INDICATOR)
      }

      if (s.rsiDisplay) {
        level(s.rsiVoffset, s.rsiHeight, s.rsiOb, POS)
        level(s.rsiVoffset, s.rsiHeight, mid, NEUTRAL)
        level(s.rsiVoffset, s.rsiHeight, s.rsiOs, NEG)
        curve(values.rsi, s.rsiVoffset, s.rsiHeight, INDICATOR)
        curve(values.rsiSma, s.rsiVoffset, s.rsiHeight, SIGNAL)
        label(s.rsiVoffset, s.rsiHeight, mid, `RSI ${fmt(values.rsi?.[last])}`, INDICATOR)
      }

      if (s.cciDisplay) {
        // CCI's middle line is the zero level, which Pine writes out as the
        // bare offset with no height term. Level 0 is the same expression.
        level(s.cciVoffset, s.cciHeight, s.cciOb, POS)
        level(s.cciVoffset, s.cciHeight, 0, NEUTRAL)
        level(s.cciVoffset, s.cciHeight, s.cciOs, NEG)
        curve(values.cci, s.cciVoffset, s.cciHeight, INDICATOR)
        curve(values.cciSma, s.cciVoffset, s.cciHeight, SIGNAL)
        label(s.cciVoffset, s.cciHeight, 0, `CCI ${fmt(values.cci?.[last])}`, INDICATOR)
      }

      // Volume sits above the candles rather than below them.
      const volBase = priceHighest * (1 + priceChangeRate * s.volVoffset)
      const mapVol = (v) => {
        if (!fin(v) || volumeHighest <= 0 || !fin(volBase)) return NaN
        return volBase * (1 + (v / volumeHighest) * priceChangeRate * s.volHeight)
      }

      if (s.volType !== 'None') {
        const b = values.bvol?.[last]
        const sell = values.svol?.[last]
        const total = fin(b) && fin(sell) ? b + sell : NaN
        const buyPct = fin(total) && total !== 0 ? fmt((b / total) * 100) : '-'
        const sellPct = fin(total) && total !== 0 ? fmt((sell / total) * 100) : '-'
        const lastVol = fin(bars[last].volume) ? bars[last].volume : 0
        const avgVol = values.volSma?.[last]
        if (fin(volBase)) {
          out.push({
            kind: 'label',
            at: { time: lastTime, price: volBase },
            text:
              `VOL  Buy ${buyPct}%  Sell ${sellPct}%\n` +
              `Last ${compactVolume(lastVol)}  Avg ${fin(avgVol) ? compactVolume(avgVol) : '-'}`,
            color: '#00000000',
            textColor: NEUTRAL,
            align: 'left',
          })
        }
      }

      // Pine guards the whole histogram on the last bar carrying volume at all.
      const lastVolume = fin(bars[last].volume) ? bars[last].volume : 0
      if (s.volType !== 'None' && lastVolume !== 0) {
        const buySell = s.volType === 'Buying/Selling Volume'
        for (let i = statIdx; i <= last; i++) {
          const v = fin(bars[i].volume) ? bars[i].volume : 0
          const top = mapVol(v)
          if (!fin(top) || !fin(volBase)) continue
          const bullCandle = bars[i].close > bars[i].open
          const color = buySell ? POS : bullCandle ? POS : NEG
          out.push({
            kind: 'line',
            from: { time: bars[i].time, price: volBase },
            to: { time: bars[i].time, price: top },
            color,
            lineWidth: 2,
          })
          if (buySell) {
            const sellTop = mapVol(values.svol?.[i])
            if (fin(sellTop)) {
              out.push({
                kind: 'line',
                from: { time: bars[i].time, price: volBase },
                to: { time: bars[i].time, price: sellTop },
                color: NEG,
                lineWidth: 2,
              })
            }
          }
        }

        // The volume moving average, drawn through the histogram. Pine divides
        // the bar's own height by volumeMARate, which is volume / vol_sma.
        if (s.volDisplay) {
          let run = []
          for (let i = startIdx; i <= last; i++) {
            const v = fin(bars[i].volume) ? bars[i].volume : 0
            const maVal = values.volSma?.[i]
            const rate = fin(maVal) && maVal !== 0 ? v / maVal : NaN
            let price = NaN
            if (fin(rate) && rate !== 0 && volumeHighest > 0 && fin(volBase)) {
              price = volBase * (1 + ((v / volumeHighest) * priceChangeRate * s.volHeight) / rate)
            }
            if (fin(price)) run.push({ time: bars[i].time, price })
            else {
              if (run.length > 1) out.push({ kind: 'polyline', points: run, color: NEUTRAL, lineWidth: 1 })
              run = []
            }
          }
          if (run.length > 1) out.push({ kind: 'polyline', points: run, color: NEUTRAL, lineWidth: 1 })
        }
      }

      return out
    },

    // The 2x5 readout Pine builds with table.new on the last bar. Cell colours
    // follow the same three-way verdict, at transparency 90 for the background.
    table({ bars, values, settings }) {
      if (bars.length === 0) return null
      const s = read(settings)
      const i = bars.length - 1
      const at = (k) => {
        const v = values[k]?.[i]
        return fin(v) ? v : NaN
      }

      const pchg = at('pchg')
      const rsiVal = at('rsi')
      const mfiVal = at('mfi')
      const cciVal = at('cci')
      const volSma = at('volSma')
      const vol = fin(bars[i].volume) ? bars[i].volume : NaN

      const verdict = (v, ob, os) => {
        if (!fin(v)) return NEUTRAL
        if (v > ob) return POS
        if (v < os) return NEG
        return NEUTRAL
      }
      const colPchg = verdict(pchg, s.pchgPct, -s.pchgPct)
      const colRsi = verdict(rsiVal, s.rsiOb, s.rsiOs)
      const colMfi = verdict(mfiVal, s.mfiOb, s.mfiOs)
      const colCci = verdict(cciVal, s.cciOb, s.cciOs)
      const colVol = fin(vol) && fin(volSma) && vol > volSma ? POS : NEUTRAL

      const cell = (text, color, align) => ({
        text,
        textColor: color,
        bgColor: withAlpha(color, 0.1),
        align: align ?? 'left',
      })

      return {
        rows: [
          [cell('%Chg', colPchg), cell(fmt(pchg), colPchg)],
          [cell('RSI', colRsi), cell(fmt(rsiVal), colRsi)],
          [cell('MFI', colMfi), cell(fmt(mfiVal), colMfi)],
          [cell('CCI', colCci), cell(fmt(cciVal), colCci)],
          [cell('Vol', colVol), cell(`${fin(vol) ? fmt(vol / 100000) : '-'} L`, colVol)],
        ],
        options: {
          position: s.tablePosition,
          fontSize: s.tableFont,
          borderWidth: 2,
          cellWidth: [64, 80],
          cellHeight: Math.round(s.tableFont * 1.8),
        },
      }
    },
  })
}
