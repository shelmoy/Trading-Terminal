/**
 * Momentum Setup - Ankush Bajaj Momentum Investing Setup - ported to
 * openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - Ankush Bajaj Momentum Investing Setup/Momentum Setup - Ankush Bajaj Momentum Investing Setup.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0. This code is subject to the terms of the Mozilla Public
 *          License 2.0 at https://mozilla.org/MPL/2.0/ - (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A five-filter momentum screen on one price pane: the 250-bar percentage
 * change, RSI with its own average, MFI, CCI with its own average, and volume
 * against a multiple of its EMA. A long signal needs every filter stretched the
 * same way at once, a short signal the mirror image. RSI, MFI, CCI and volume
 * are also redrawn as miniature panels inside the price scale, and the current
 * reading of each sits in a corner table.
 */

// The Pine colour inputs, as constants. Colour is generated per plot by the
// chart, and markers, drawings, the table and the bar tint are not plots, so
// these stay where the source put them rather than becoming settings.
const POS = '#26A69A'
const POS_LIGHT = '#B2DFDB'
const NEG_LIGHT = '#FFCDD2'
const NEG = '#FF5250'
const INDICATOR = '#2962FF'
const SIGNAL = '#FF6D00'
const NEU = '#787B86'

// ta.change(close, 250): the lookback is fixed in the source, only the
// threshold it is compared against is an input.
const PCHG_LOOKBACK = 250

// Pine's oscHighest, the constant the panels are scaled against.
const OSC_HIGHEST = 100

const TABLE_FONT_PX = { auto: 12, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  rsi,
  cci,
  supertrend,
  smaSeededEma,
  rollingSum,
  nulls,
  withAlpha,
  compactVolume,
}) {
  /**
   * ta.mfi(src, length) written out.
   *
   * Pine: upper = sum(volume * (change(src) <= 0 ? 0 : src), length) and
   * lower = sum(volume * (change(src) >= 0 ? 0 : src), length). On the first
   * bar change() is na, and every comparison against na is false, so both
   * ternaries take their false branch and that bar feeds both sums.
   */
  function pineMfi(src, volume, period) {
    const n = src.length
    const upper = new Array(n).fill(0)
    const lower = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      const term = volume[i] * src[i]
      if (!Number.isFinite(term)) continue
      if (i === 0) {
        upper[i] = term
        lower[i] = term
        continue
      }
      const ch = src[i] - src[i - 1]
      upper[i] = ch <= 0 ? 0 : term
      lower[i] = ch >= 0 ? 0 : term
    }
    const up = rollingSum(upper, period)
    const down = rollingSum(lower, period)
    const out = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(up[i]) || !Number.isFinite(down[i])) continue
      // No down flow in the window: the ratio is unbounded and the index pins
      // at its ceiling, which is what the built-in money flow index does too.
      out[i] = down[i] === 0 ? 100 : 100 - 100 / (1 + up[i] / down[i])
    }
    return out
  }

  /**
   * Every setting, coerced once.
   *
   * A cleared number field arrives as '', and Number('') is 0, which would turn
   * an oversold level of -100 into 0 and a length into a zero-width window.
   * `read` keeps a deliberate 0 and rejects only an empty or unparseable field.
   */
  function options(settings) {
    const read = (key, fallback) => {
      const raw = settings?.[key]
      if (raw === '' || raw === null || raw === undefined) return fallback
      const v = Number(raw)
      return Number.isFinite(v) ? v : fallback
    }
    const len = (key, fallback) => Math.max(1, Math.floor(read(key, fallback)))
    const choice = (key, fallback) =>
      typeof settings?.[key] === 'string' && settings[key] !== '' ? settings[key] : fallback
    return {
      pchgThreshold: Math.max(0, read('pchgThreshold', 8)),

      rsiDisplay: settings?.rsiDisplay !== false,
      rsiLen: len('rsiLen', 14),
      rsiSmaLen: len('rsiSmaLen', 14),
      rsiOb: read('rsiOb', 60),
      rsiOs: read('rsiOs', 40),
      rsiVOffset: read('rsiVOffset', 1.3),
      rsiHeight: read('rsiHeight', 2),

      mfiDisplay: settings?.mfiDisplay !== false,
      mfiLen: len('mfiLen', 14),
      mfiOb: read('mfiOb', 60),
      mfiOs: read('mfiOs', 40),
      mfiVOffset: read('mfiVOffset', 1.6),
      mfiHeight: read('mfiHeight', 1),

      cciDisplay: settings?.cciDisplay !== false,
      cciLen: len('cciLen', 20),
      cciSmaLen: len('cciSmaLen', 5),
      cciOb: read('cciOb', 100),
      cciOs: read('cciOs', -100),
      cciVOffset: read('cciVOffset', 1.8),
      cciHeight: read('cciHeight', 0.2),

      volDisplay: settings?.volDisplay !== false,
      volType: choice('volType', 'Regular Volume'),
      volMaLen: len('volMaLen', 20),
      volMaMulti: Math.max(1, read('volMaMulti', 5)),
      volVOffset: read('volVOffset', 0.3),
      volHeight: read('volHeight', 0.6),

      stDisplay: settings?.stDisplay !== false,
      stAtrPeriod: len('stAtrPeriod', 10),
      stFactor: Math.max(0.01, read('stFactor', 3)),

      tablePosition: choice('tablePosition', 'top-right'),
      tableTextSize: choice('tableTextSize', 'normal'),

      displayLen: len('displayLen', 50),
    }
  }

  /** nz(volume): an index series carries none, and Pine reads that as zero. */
  const nzVolumes = (bars) => bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0))

  registerIndicator({
    id: 'oa-momentum-setup---ankush-bajaj-momentum-investing-setup',
    name: 'Momentum Setup - Ankush Bajaj Momentum Investing Setup',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'pchgThreshold',
        type: 'number',
        label: 'Above/Below %',
        default: 8,
        min: 0,
        max: 500,
        step: 0.1,
        group: '250 Candle % Change',
        tooltip:
          'Percentage change between the bar 250 bars back and the current bar. Positive for a bullish trend and the same number negated for a bearish one. 8 suits the daily timeframe, 2 to 4 an intraday one.',
      },

      { key: 'rsiDisplay', type: 'boolean', label: 'Display', default: true, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiLen', type: 'number', label: 'RSI Length', default: 14, min: 1, max: 500, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiSmaLen', type: 'number', label: 'SMA Length', default: 14, min: 1, max: 500, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiOb', type: 'number', label: 'Overbought', default: 60, min: 0, max: 100, step: 1, group: 'Relative Strength Index (RSI)' },
      { key: 'rsiOs', type: 'number', label: 'Oversold', default: 40, min: 0, max: 100, step: 1, group: 'Relative Strength Index (RSI)' },
      {
        key: 'rsiVOffset',
        type: 'number',
        label: 'Vertical Offset',
        default: 1.3,
        min: -10,
        max: 10,
        step: 0.1,
        group: 'Relative Strength Index (RSI)',
        tooltip: 'How far below the lowest price of the display window the RSI panel is drawn.',
      },
      { key: 'rsiHeight', type: 'number', label: 'Height', default: 2, min: -10, max: 10, step: 0.1, group: 'Relative Strength Index (RSI)' },

      { key: 'mfiDisplay', type: 'boolean', label: 'Display', default: true, group: 'Money Flow Index (MFI)' },
      { key: 'mfiLen', type: 'number', label: 'MFI Length', default: 14, min: 1, max: 500, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiOb', type: 'number', label: 'Overbought', default: 60, min: 0, max: 100, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiOs', type: 'number', label: 'Oversold', default: 40, min: 0, max: 100, step: 1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiVOffset', type: 'number', label: 'Vertical Offset', default: 1.6, min: -10, max: 10, step: 0.1, group: 'Money Flow Index (MFI)' },
      { key: 'mfiHeight', type: 'number', label: 'Height', default: 1, min: -10, max: 10, step: 0.1, group: 'Money Flow Index (MFI)' },

      { key: 'cciDisplay', type: 'boolean', label: 'Display', default: true, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciLen', type: 'number', label: 'CCI Length', default: 20, min: 1, max: 500, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciSmaLen', type: 'number', label: 'SMA Length', default: 5, min: 1, max: 500, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciOb', type: 'number', label: 'Overbought', default: 100, min: 0, max: 1000, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciOs', type: 'number', label: 'Oversold', default: -100, min: -1000, max: 0, step: 1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciVOffset', type: 'number', label: 'Vertical Offset', default: 1.8, min: -10, max: 10, step: 0.1, group: 'Commodity Channel Index (CCI)' },
      { key: 'cciHeight', type: 'number', label: 'Height', default: 0.2, min: -10, max: 10, step: 0.1, group: 'Commodity Channel Index (CCI)' },

      {
        key: 'volDisplay',
        type: 'boolean',
        label: 'Display',
        default: true,
        group: 'Volume',
        tooltip: 'Draws the volume moving average line across the volume panel.',
      },
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
        tooltip:
          'Shifts the volume moving average upward. 1 applies no multiplier, and the setup asks for 5, meaning volume five times its average.',
      },
      { key: 'volVOffset', type: 'number', label: 'Vertical Offset', default: 0.3, min: -10, max: 10, step: 0.1, group: 'Volume' },
      { key: 'volHeight', type: 'number', label: 'Height', default: 0.6, min: -10, max: 10, step: 0.1, group: 'Volume' },

      { key: 'stDisplay', type: 'boolean', label: 'Display', default: true, group: 'Supertrend' },
      { key: 'stAtrPeriod', type: 'number', label: 'ATR Length', default: 10, min: 1, max: 500, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 3, min: 0.01, max: 100, step: 0.01, group: 'Supertrend' },

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
        key: 'tableTextSize',
        type: 'select',
        label: 'Size',
        default: 'normal',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
        group: 'Table',
      },

      {
        key: 'displayLen',
        type: 'number',
        label: 'Display Length',
        default: 50,
        min: 1,
        max: 500,
        step: 1,
        group: 'Chart Settings',
        tooltip: 'How many recent bars the miniature panels cover, and how far back the signal shading is drawn.',
      },
    ],

    // The two Pine plots. Everything else the source drew is geometry in price
    // space and lives in draws(), or a signal and lives in markers().
    plots: [
      { key: 'stUp', type: 'line', title: 'Supertrend Up', style: { color: POS, lineWidth: 2 } },
      { key: 'stDown', type: 'line', title: 'Supertrend Down', style: { color: NEG, lineWidth: 2 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const o = options(settings)
      const close = sourceValues(bars, 'close')
      const hlc3 = sourceValues(bars, 'hlc3')
      const volume = nzVolumes(bars)

      // 1. Percentage change against the bar 250 back.
      const pchg = new Array(n).fill(NaN)
      for (let i = PCHG_LOOKBACK; i < n; i++) {
        const c = close[i]
        if (!Number.isFinite(c) || c === 0 || !Number.isFinite(close[i - PCHG_LOOKBACK])) continue
        pchg[i] = ((c - close[i - PCHG_LOOKBACK]) / c) * 100
      }

      // 2. RSI and its average. 3. MFI on hlc3. 4. CCI on hlc3 and its average.
      const rsiLine = rsi(close, o.rsiLen)
      const rsiSma = sma(rsiLine, o.rsiSmaLen)
      const mfiLine = pineMfi(hlc3, volume, o.mfiLen)
      const cciLine = cci(hlc3, o.cciLen)
      const cciSma = sma(cciLine, o.cciSmaLen)

      // 5. Volume: Pine's ta.ema seeds from the SMA of the first `length`
      // values, which is smaSeededEma here, then the multiplier lifts it.
      const volEma = smaSeededEma(volume, o.volMaLen)
      const volSma = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(volEma[i])) volSma[i] = volEma[i] * o.volMaMulti
      }

      // 6. Supertrend. direction is -1 in an uptrend and +1 in a downtrend,
      // the same convention Pine uses.
      const st = supertrend(bars, o.stAtrPeriod, o.stFactor)
      const stUp = new Array(n).fill(NaN)
      const stDown = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // Pine blanks the first bar so the line does not start from the seed.
        if (i === 0) continue
        // The source leaves the down line drawn when Display is off, because
        // its ternary falls through to the series. Both lines hide here: a
        // Display switch that keeps drawing is not what the switch says.
        if (!o.stDisplay) continue
        const point = st[i]
        if (!point || !Number.isFinite(point.value)) continue
        if (point.direction < 0) stUp[i] = point.value
        else stDown[i] = point.value
      }

      // Signals. Pine treats every comparison against na as false, so each
      // reading is checked for a real number before it is compared.
      const lastConfirmed = ctx?.barState?.isConfirmed !== false
      const longSig = new Array(n).fill(null)
      const shortSig = new Array(n).fill(null)
      for (let i = 0; i < n; i++) {
        // barstate.isconfirmed: a bar still forming cannot raise a signal.
        if (i === n - 1 && !lastConfirmed) continue
        const p = pchg[i]
        const r = rsiLine[i]
        const m = mfiLine[i]
        const c = cciLine[i]
        const vs = volSma[i]
        if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(m)) continue
        if (!Number.isFinite(c) || !Number.isFinite(vs)) continue
        if (!(volume[i] > vs)) continue
        if (p < -o.pchgThreshold && r < o.rsiOs && m < o.mfiOs && c < o.cciOs) shortSig[i] = 1
        else if (p > o.pchgThreshold && r > o.rsiOb && m > o.mfiOb && c > o.cciOb) longSig[i] = 1
      }

      return {
        stUp: nulls(stUp),
        stDown: nulls(stDown),
        // Columns no plot draws, read by draws, markers, the table, the pane
        // shading and the bar tint. They are still columns and still have to
        // be exactly bars.length long.
        pchg: nulls(pchg),
        rsi: nulls(rsiLine),
        rsiSma: nulls(rsiSma),
        mfi: nulls(mfiLine),
        cci: nulls(cciLine),
        cciSma: nulls(cciSma),
        volSma: nulls(volSma),
        longSig,
        shortSig,
      }
    },

    /**
     * The miniature panels the source builds out of line.new and box.new.
     *
     * Every y coordinate is Pine's, unchanged: an oscillator reading is mapped
     * into price space against the lowest low of the display window, and the
     * volume histogram against the highest high. Anchors are bar times rather
     * than bar indices, so paging history in does not slide the panels off the
     * bars they were measured from.
     */
    draws({ bars, values, settings }) {
      const n = bars.length
      if (n < 2) return []
      const o = options(settings)
      const last = n - 1
      const from = Math.max(0, last - o.displayLen)
      const out = []

      // ta.highest(high, len) / ta.lowest(low, len) read at the last bar.
      const win = Math.min(o.displayLen, n)
      let priceHighest = -Infinity
      let priceLowest = Infinity
      let volumeHighest = 0
      for (let i = n - win; i < n; i++) {
        if (bars[i].high > priceHighest) priceHighest = bars[i].high
        if (bars[i].low < priceLowest) priceLowest = bars[i].low
        const v = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        if (v > volumeHighest) volumeHighest = v
      }
      if (!Number.isFinite(priceHighest) || !Number.isFinite(priceLowest) || priceHighest === 0) return []
      const priceChangeRate = (priceHighest - priceLowest) / priceHighest
      if (!Number.isFinite(priceChangeRate)) return []

      const oscY = (vOffset, height, value) =>
        priceLowest * (1 - priceChangeRate * vOffset) * (1 + (value / OSC_HIGHEST) * priceChangeRate * height)

      const level = (vOffset, height, value, color) => {
        const price = oscY(vOffset, height, value)
        if (!Number.isFinite(price)) return
        out.push({
          kind: 'line',
          from: { time: bars[from].time, price },
          to: { time: bars[last].time, price },
          color: withAlpha(color, 0.25),
          lineWidth: 1,
        })
      }

      // One polyline per unbroken run of readings: a warmup gap breaks the
      // panel line rather than joining across it.
      const series = (col, vOffset, height, color) => {
        let run = []
        const flush = () => {
          if (run.length > 1) out.push({ kind: 'polyline', points: run, color, lineWidth: 1 })
          run = []
        }
        for (let i = from; i <= last; i++) {
          const v = col?.[i]
          const price = v == null || !Number.isFinite(v) ? NaN : oscY(vOffset, height, v)
          if (!Number.isFinite(price)) {
            flush()
            continue
          }
          run.push({ time: bars[i].time, price })
        }
        flush()
      }

      const reading = (col) => {
        const v = col?.[last]
        return v == null || !Number.isFinite(v) ? null : v
      }
      // The source anchors these plates three bars past the last one. There is
      // no such bar here, so a plate sits on the last bar and opens to the
      // right instead. Pine carried the reading in a tooltip, and a drawing has
      // none, so the reading is in the text.
      const label = (vOffset, height, value, text) => {
        const price = oscY(vOffset, height, value)
        if (!Number.isFinite(price)) return
        out.push({
          kind: 'label',
          at: { time: bars[last].time, price },
          text,
          color: '#00000000',
          textColor: NEU,
          align: 'left',
        })
      }

      const midLine = (OSC_HIGHEST + 0) / 2

      if (o.mfiDisplay) {
        level(o.mfiVOffset, o.mfiHeight, o.mfiOb, POS)
        level(o.mfiVOffset, o.mfiHeight, midLine, NEU)
        level(o.mfiVOffset, o.mfiHeight, o.mfiOs, NEG)
        series(values.mfi, o.mfiVOffset, o.mfiHeight, INDICATOR)
        const v = reading(values.mfi)
        label(o.mfiVOffset, o.mfiHeight, midLine, v == null ? 'MFI' : 'MFI ' + v.toFixed(2))
      }

      if (o.rsiDisplay) {
        level(o.rsiVOffset, o.rsiHeight, o.rsiOb, POS)
        level(o.rsiVOffset, o.rsiHeight, midLine, NEU)
        level(o.rsiVOffset, o.rsiHeight, o.rsiOs, NEG)
        series(values.rsi, o.rsiVOffset, o.rsiHeight, INDICATOR)
        series(values.rsiSma, o.rsiVOffset, o.rsiHeight, SIGNAL)
        const v = reading(values.rsi)
        label(o.rsiVOffset, o.rsiHeight, midLine, v == null ? 'RSI' : 'RSI ' + v.toFixed(2))
      }

      if (o.cciDisplay) {
        level(o.cciVOffset, o.cciHeight, o.cciOb, POS)
        // The CCI midline is zero, which is why the source drops the height
        // term from this one instead of using the 50 the other panels use.
        level(o.cciVOffset, o.cciHeight, 0, NEU)
        level(o.cciVOffset, o.cciHeight, o.cciOs, NEG)
        series(values.cci, o.cciVOffset, o.cciHeight, INDICATOR)
        series(values.cciSma, o.cciVOffset, o.cciHeight, SIGNAL)
        const v = reading(values.cci)
        label(o.cciVOffset, o.cciHeight, 0, v == null ? 'CCI' : 'CCI ' + v.toFixed(2))
      }

      // The volume panel. The source guards the whole block on the current bar
      // carrying volume at all, so an index series draws nothing here.
      const lastVolume = Number.isFinite(bars[last].volume) ? bars[last].volume : 0
      if (o.volType !== 'None' && lastVolume !== 0 && volumeHighest > 0) {
        const volBase = priceHighest * (1 + priceChangeRate * o.volVOffset)
        const volY = (v) => volBase * (1 + (v / volumeHighest) * priceChangeRate * o.volHeight)
        const buySell = o.volType === 'Buying/Selling Volume'

        for (let i = from; i <= last; i++) {
          const bar = bars[i]
          const v = Number.isFinite(bar.volume) ? bar.volume : 0
          const top = volY(v)
          if (!Number.isFinite(top)) continue
          const bull = bar.close > bar.open
          // A Pine box with both x anchors on the same bar and a two pixel
          // border is a vertical bar, which is what this draws.
          out.push({
            kind: 'line',
            from: { time: bar.time, price: volBase },
            to: { time: bar.time, price: top },
            color: buySell || bull ? POS : NEG,
            lineWidth: 2,
          })
          if (buySell) {
            const range = bar.high - bar.low
            if (range > 0) {
              const sellTop = volY((v * (bar.high - bar.close)) / range)
              if (Number.isFinite(sellTop)) {
                out.push({
                  kind: 'line',
                  from: { time: bar.time, price: volBase },
                  to: { time: bar.time, price: sellTop },
                  color: NEG,
                  lineWidth: 2,
                })
              }
            }
          }
        }

        // The volume moving average, drawn as Pine writes it: the bar's own
        // height divided by its ratio to the average. A bar with no volume
        // makes that 0/0, which is na in Pine and a break in the line here.
        if (o.volDisplay) {
          let run = []
          const flush = () => {
            if (run.length > 1) out.push({ kind: 'polyline', points: run, color: NEU, lineWidth: 1 })
            run = []
          }
          for (let i = from; i <= last; i++) {
            const v = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
            const avg = values.volSma?.[i]
            const rate = avg == null || !Number.isFinite(avg) || avg === 0 ? NaN : v / avg
            const price =
              !Number.isFinite(rate) || rate === 0
                ? NaN
                : volBase * (1 + ((v / volumeHighest) * priceChangeRate * o.volHeight) / rate)
            if (!Number.isFinite(price)) {
              flush()
              continue
            }
            run.push({ time: bars[i].time, price })
          }
          flush()
        }

        // B and S from the source: the close's position inside the bar's range
        // splits that bar's volume into buying and selling.
        const split = (() => {
          const bar = bars[last]
          const range = bar.high - bar.low
          if (!(range > 0)) return null
          const b = (lastVolume * (bar.close - bar.low)) / range
          const s = (lastVolume * (bar.high - bar.close)) / range
          if (b + s === 0) return null
          return { buyPct: (b / (b + s)) * 100, sellPct: (s / (b + s)) * 100 }
        })()
        const avg = values.volSma?.[last]
        const volText = [
          'VOL',
          split ? 'Buy Vol : ' + split.buyPct.toFixed(2) + '%' : 'Buy Vol : -',
          split ? 'Sell Vol : ' + split.sellPct.toFixed(2) + '%' : 'Sell Vol : -',
          'Last Vol : ' + compactVolume(lastVolume),
          'Avg Vol : ' + (avg == null || !Number.isFinite(avg) ? '-' : compactVolume(avg)),
        ].join('\n')
        if (Number.isFinite(volBase)) {
          out.push({
            kind: 'label',
            at: { time: bars[last].time, price: volBase },
            text: volText,
            color: '#00000000',
            textColor: NEU,
            align: 'left',
          })
        }
      }

      return out
    },

    /**
     * plotshape, placed against the candle rather than against the supertrend
     * line. aboveBar and belowBar resolve against this indicator's own plot on
     * an overlay, so the padding is computed here and the anchor is a price.
     */
    markers({ bars, values }) {
      const n = bars.length
      if (n === 0) return []
      let sum = 0
      let count = 0
      for (let i = Math.max(0, n - 100); i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sum += r
          count += 1
        }
      }
      const meanRange = count > 0 ? sum / count : 0
      const lastClose = bars[n - 1].close
      const pad = Math.max(meanRange * 0.5, Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005)
      const longSig = values.longSig || []
      const shortSig = values.shortSig || []
      const out = []
      for (let i = 0; i < n; i++) {
        if (shortSig[i] === 1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            color: NEG_LIGHT,
            size: 'tiny',
          })
        } else if (longSig[i] === 1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            color: POS_LIGHT,
            size: 'tiny',
          })
        }
      }
      return out
    },

    // bgcolor with show_last = Display Length: only the most recent bars are
    // shaded, at the 90 percent transparency the source asks for.
    background({ bars, values, settings }) {
      const n = bars.length
      const o = options(settings)
      const out = new Array(n).fill(null)
      const longSig = values.longSig || []
      const shortSig = values.shortSig || []
      for (let i = Math.max(0, n - o.displayLen); i < n; i++) {
        if (shortSig[i] === 1) out[i] = withAlpha(NEG_LIGHT, 0.1)
        else if (longSig[i] === 1) out[i] = withAlpha(POS_LIGHT, 0.1)
      }
      return out
    },

    // barcolor: the signal candle itself, across the whole history.
    barColors({ bars, values }) {
      const n = bars.length
      const out = new Array(n).fill(null)
      const longSig = values.longSig || []
      const shortSig = values.shortSig || []
      for (let i = 0; i < n; i++) {
        if (shortSig[i] === 1) out[i] = NEG_LIGHT
        else if (longSig[i] === 1) out[i] = POS_LIGHT
      }
      return out
    },

    // The five row scoreboard, read at the last bar. The Pine table is already
    // drawn only on the last bar, so its barstate.islast guard has nothing left
    // to do here.
    table({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return null
      const o = options(settings)
      const i = n - 1
      const at = (key) => {
        const v = values[key]?.[i]
        return v == null || !Number.isFinite(v) ? null : v
      }
      const fmt = (v) => (v == null ? '-' : v.toFixed(2))

      const pchg = at('pchg')
      const rsiValue = at('rsi')
      const mfiValue = at('mfi')
      const cciValue = at('cci')
      const volSma = at('volSma')
      const volume = Number.isFinite(bars[i].volume) ? bars[i].volume : 0

      const band = (v, ob, os) => {
        if (v == null) return NEU
        if (v > ob) return POS
        if (v < os) return NEG
        return NEU
      }
      const colPchg = band(pchg, o.pchgThreshold, -o.pchgThreshold)
      const colRsi = band(rsiValue, o.rsiOb, o.rsiOs)
      const colMfi = band(mfiValue, o.mfiOb, o.mfiOs)
      const colCci = band(cciValue, o.cciOb, o.cciOs)
      const colVol = volSma != null && volume > volSma ? POS : NEU

      const cell = (text, color) => ({ text, textColor: color, bgColor: withAlpha(color, 0.1), align: 'left' })

      return {
        rows: [
          [cell('%Chg', colPchg), cell(fmt(pchg), colPchg)],
          [cell('RSI', colRsi), cell(fmt(rsiValue), colRsi)],
          [cell('MFI', colMfi), cell(fmt(mfiValue), colMfi)],
          [cell('CCI', colCci), cell(fmt(cciValue), colCci)],
          [cell('Vol', colVol), cell((volume / 100000).toFixed(2) + ' L', colVol)],
        ],
        options: {
          position: o.tablePosition,
          fontSize: TABLE_FONT_PX[o.tableTextSize] ?? 12,
          borderColor: NEU,
          borderWidth: 2,
          cellWidth: [64, 88],
          cellHeight: 20,
        },
      }
    },
  })
}
