/**
 * Magnetic Zones - Multi Timeframe - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/[Indicator] Magnetic Zones - Multi Timeframe.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * This source code is subject to the terms of the Mozilla Public License 2.0 at
 * https://mozilla.org/MPL/2.0/
 *
 * Fibonacci-spaced support and resistance projected from the previous higher
 * timeframe bar: each level sits a multiple of that bar's range above or below
 * its midpoint, and each drawn level carries a buffer box an eighth of the
 * neighbouring gap deep. Three timeframes can be drawn at once, alongside two
 * optional higher timeframe moving averages, an anchored VWAP and a Supertrend.
 */

// The Fibonacci ladder the zones are spaced on, R1..R6 and S1..S6.
const MZ_MULTIPLIERS = [0.236, 0.786, 1.618, 2.618, 4.236, 6.618]

// The Pine defaults. Drawings take no generated style controls, so the colours
// of the zone lines and boxes are fixed here rather than taken as inputs.
const COLOR_SUB = '#9598A1'
const COLOR_R_LINE = '#E81123'
const COLOR_S_LINE = '#009E49'
const COLOR_R_TOP = '#00BCF2'
const COLOR_S_TOP = '#FF8C00'
const COLOR_MA_1 = '#22AB94'
const COLOR_MA_2 = '#F7525F'
const COLOR_VWAP = '#2962FF'
const COLOR_ST_UP = '#22AB94'
const COLOR_ST_DOWN = '#F7525F'

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  smaSeededEma,
  atr,
  nulls,
  withAlpha,
  roundToTick,
  precisionForStep,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
  calendarPeriodFlags,
  isNewZonedDay,
  isNewZonedWeek,
  isNewZonedMonth,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  /* ---------------------------------------------------------------- inputs */

  // A cleared number field arrives as '', and Number('') is 0. These zone
  // counts have a Pine minval of 0, so a cleared field legitimately means
  // "draw nothing" rather than "fall back to the default".
  const countInput = (value, fallback) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(0, Math.min(50, Math.floor(n)))
  }

  const lengthInput = (value, fallback) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1) return fallback
    return Math.max(1, Math.min(5000, Math.floor(n)))
  }

  const floatInput = (value, fallback, min) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < min) return fallback
    return n
  }

  const on = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

  const text = (value, fallback) => (typeof value === 'string' ? value.trim() : fallback)

  // Bar times are UTC seconds and every calendar bucket below is exchange wall
  // clock, so the zone is resolved once and never read off the browser.
  const zoneFrom = (settings, ctx) => {
    const wanted = [settings?.timezone, ctx?.timezone]
    for (const candidate of wanted) {
      if (typeof candidate === 'string' && candidate !== '' && isValidTimezone(candidate)) {
        return candidate
      }
    }
    return DEFAULT_TIMEZONE
  }

  /* ------------------------------------------------------------ timeframes */

  // Pine timeframe strings: '' is the chart, a bare number is minutes, 'S' is
  // seconds, 'D' days, 'W' weeks and an upper case 'M' months. A lower case
  // 'm' is minutes, which is why the case matters here.
  const parseTimeframe = (spec) => {
    const raw = text(spec, '')
    if (raw === '') return null
    const match = /^([0-9]*)\s*([A-Za-z]*)$/.exec(raw)
    if (!match) return null
    const count = match[1] === '' ? 1 : Math.max(1, Math.floor(Number(match[1])))
    if (!Number.isFinite(count)) return null
    const unit = match[2] === '' ? 'm' : match[2][0]
    switch (unit) {
      case 'S':
      case 's':
        return { unit: 'second', count }
      case 'm':
        return { unit: 'minute', count }
      case 'h':
      case 'H':
        return { unit: 'minute', count: count * 60 }
      case 'D':
      case 'd':
        return { unit: 'day', count }
      case 'W':
      case 'w':
        return { unit: 'week', count }
      case 'M':
        return { unit: 'month', count }
      default:
        return null
    }
  }

  /**
   * Fold the chart's own bars up to the requested timeframe.
   *
   * There is no request.security here, and folding is the safer half of that
   * trade: every level below is built from the PREVIOUS higher timeframe bar,
   * which is complete before the current one opens, so nothing reads a value
   * the bar had not produced yet.
   *
   * Intraday buckets restart at each trading day's first bar rather than on
   * the epoch, so a 60 minute bucket on a 09:15 open starts at 09:15.
   */
  const foldHigherTimeframe = (bars, tf, zone) => {
    const out = []
    if (!Array.isArray(bars) || bars.length === 0) return out
    const calendar = tf && (tf.unit === 'day' || tf.unit === 'week' || tf.unit === 'month')
    let previousKey = null
    let ordinal = -1
    let dayKey = null
    let dayStart = 0

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]
      const t = bar.time
      let key
      if (!tf) {
        key = i
      } else if (tf.unit === 'second' || tf.unit === 'minute') {
        const day = zonedDayIndex(t, zone)
        if (day !== dayKey) {
          dayKey = day
          dayStart = t
        }
        const size = tf.unit === 'second' ? tf.count : tf.count * 60
        key = `${day}:${Math.floor((t - dayStart) / Math.max(1, size))}`
      } else if (tf.unit === 'day') {
        key = zonedDayIndex(t, zone)
      } else if (tf.unit === 'week') {
        key = zonedWeekIndex(t, zone)
      } else {
        const parts = utcSecondsToZonedParts(t, zone)
        key = parts.year * 12 + (parts.month - 1)
      }
      if (key !== previousKey) {
        previousKey = key
        ordinal += 1
      }
      const group = calendar ? Math.floor(ordinal / tf.count) : ordinal
      const last = out[out.length - 1]
      if (!last || last.group !== group) {
        out.push({
          group,
          from: i,
          to: i,
          time: t,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: Number.isFinite(bar.volume) ? bar.volume : 0,
        })
      } else {
        last.to = i
        if (Number.isFinite(bar.high)) last.high = Number.isFinite(last.high) ? Math.max(last.high, bar.high) : bar.high
        if (Number.isFinite(bar.low)) last.low = Number.isFinite(last.low) ? Math.min(last.low, bar.low) : bar.low
        last.close = bar.close
        if (Number.isFinite(bar.volume)) last.volume += bar.volume
      }
    }
    return out
  }

  // Pine's res_to_str, used only by the moving average labels.
  const resolutionLabel = (res) => {
    const map = {
      1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 45: '45m',
      60: '1h', 120: '2h', 180: '3h', 240: '4h',
      '1D': 'D', '1W': 'W', '1M': 'M', '3M': '3M', '6M': '6M', '12M': '12M',
    }
    const raw = text(res, '')
    if (raw === '') return ''
    return map[raw] ?? raw
  }

  /* ---------------------------------------------------------------- levels */

  // magnetic_zones(): every level is measured from the previous bar's midpoint
  // by a multiple of the previous bar's range.
  const zoneLevels = (previous) => {
    if (!previous || !Number.isFinite(previous.high) || !Number.isFinite(previous.low)) return null
    const pivot = (previous.high + previous.low) / 2
    const span = previous.high - previous.low
    return {
      ph: previous.high,
      pl: previous.low,
      p: pivot,
      r: MZ_MULTIPLIERS.map((m) => pivot + m * span),
      s: MZ_MULTIPLIERS.map((m) => pivot - m * span),
    }
  }

  // buffer_zone(): an eighth of the gap to the neighbouring level, both sides.
  const buffer = (level, top, bottom) => {
    if (![level, top, bottom].every(Number.isFinite)) return null
    const half = (top - bottom) / 8
    return { top: level + half, bottom: level - half }
  }

  /* -------------------------------------------------------------- plotting */

  // Pine's moving_average_htf: the average is computed on the higher timeframe
  // series, and request.security without lookahead publishes it only once that
  // bar has closed, so every chart bar inside period k reads period k-1.
  const higherTimeframeMa = (bars, spec, type, source, length, zone) => {
    const out = new Array(bars.length).fill(NaN)
    const average = (values) => (type === 'SMA' ? sma(values, length) : smaSeededEma(values, length))
    const tf = parseTimeframe(spec)
    if (!tf) {
      const chart = average(sourceValues(bars, source))
      for (let i = 0; i < bars.length; i++) out[i] = chart[i]
      return out
    }
    const buckets = foldHigherTimeframe(bars, tf, zone)
    if (buckets.length === 0) return out
    const htfBars = buckets.map((b) => ({
      time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    const ma = average(sourceValues(htfBars, source))
    for (let k = 1; k < buckets.length; k++) {
      const value = ma[k - 1]
      if (!Number.isFinite(value)) continue
      for (let i = buckets[k].from; i <= buckets[k].to; i++) out[i] = value
    }
    return out
  }

  // ta.vwap(source, anchor, 1): a running volume weighted mean reset at each
  // period start. Index series carry no volume, so the mean stays empty rather
  // than dividing by zero.
  const anchoredVwap = (bars, source, anchor, zone) => {
    const out = new Array(bars.length).fill(NaN)
    if (bars.length === 0) return out
    const src = sourceValues(bars, source)
    const isNew =
      anchor === 'Week'
        ? (a, b) => isNewZonedWeek(a, b, zone)
        : anchor === 'Month'
          ? (a, b) => isNewZonedMonth(a, b, zone)
          : (a, b) => isNewZonedDay(a, b, zone)
    const starts = calendarPeriodFlags(bars.map((b) => b.time), isNew)
    let weighted = 0
    let volume = 0
    for (let i = 0; i < bars.length; i++) {
      if (starts[i]) {
        weighted = 0
        volume = 0
      }
      const v = Number.isFinite(bars[i].volume) && bars[i].volume > 0 ? bars[i].volume : 0
      if (v > 0 && Number.isFinite(src[i])) {
        weighted += src[i] * v
        volume += v
      }
      out[i] = volume > 0 ? weighted / volume : NaN
    }
    return out
  }

  // The script's own Supertrend, which is not ta.supertrend: the bands ratchet
  // on the PREVIOUS close and the direction flips on the current one.
  const legacySupertrend = (bars, period, factor) => {
    const n = bars.length
    const line = new Array(n).fill(NaN)
    const dir = new Array(n).fill(NaN)
    if (n === 0) return { line, dir }
    const range = atr(bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), period)
    let trendUp = NaN
    let trendDown = NaN
    let trend = NaN
    for (let i = 0; i < n; i++) {
      const bar = bars[i]
      const mid = (bar.high + bar.low) / 2
      const band = range[i]
      const rawUp = mid - factor * band
      const rawDown = mid + factor * band
      const prevClose = i > 0 ? bars[i - 1].close : NaN
      const prevUp = trendUp
      const prevDown = trendDown
      const prevTrend = trend
      // Pine treats every comparison against na as false, so each side needs an
      // explicit finite guard or the ratchet fires straight through the warmup.
      trendUp =
        Number.isFinite(prevClose) && Number.isFinite(prevUp) && prevClose > prevUp
          ? Math.max(rawUp, prevUp)
          : rawUp
      trendDown =
        Number.isFinite(prevClose) && Number.isFinite(prevDown) && prevClose < prevDown
          ? Math.min(rawDown, prevDown)
          : rawDown
      const close = bar.close
      if (Number.isFinite(prevDown) && close > prevDown) trend = 1
      else if (Number.isFinite(prevUp) && close < prevUp) trend = -1
      else trend = Number.isFinite(prevTrend) ? prevTrend : 1
      line[i] = trend === 1 ? trendUp : trendDown
      dir[i] = Number.isFinite(line[i]) ? trend : NaN
    }
    return { line, dir }
  }

  /* ----------------------------------------------------------- draw helpers */

  const barStep = (bars) => {
    if (bars.length < 2) return 60
    const gaps = []
    for (let i = Math.max(1, bars.length - 50); i < bars.length; i++) {
      const gap = bars[i].time - bars[i - 1].time
      if (gap > 0) gaps.push(gap)
    }
    if (gaps.length === 0) return 60
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }

  // math.round_to_mintick for the box captions. The tick reaches draws through
  // a column because only calc is handed the calculation context.
  const formatPrice = (value, tick) => {
    if (!Number.isFinite(value)) return ''
    if (tick > 0) {
      const snapped = roundToTick(value, tick)
      return snapped.toFixed(Math.min(8, Math.max(0, precisionForStep(tick))))
    }
    const magnitude = Math.abs(value)
    const decimals = magnitude >= 1000 ? 1 : magnitude >= 100 ? 2 : magnitude >= 1 ? 3 : 5
    return value.toFixed(decimals)
  }

  const readTick = (values) => {
    const column = values?.tick
    if (!Array.isArray(column) || column.length === 0) return 0
    const last = column[column.length - 1]
    return Number.isFinite(last) && last > 0 ? last : 0
  }

  const pushLine = (out, left, right, price, color, style) => {
    if (!Number.isFinite(price)) return
    out.push({
      kind: 'line',
      from: { time: left, price },
      to: { time: right, price },
      color,
      lineWidth: 1,
      lineStyle: style,
    })
  }

  const pushBox = (out, left, right, band, color, alpha, caption) => {
    if (!band || !Number.isFinite(band.top) || !Number.isFinite(band.bottom)) return
    out.push({
      kind: 'box',
      from: { time: left, price: band.top },
      to: { time: right, price: band.bottom },
      color: withAlpha(color, alpha),
      fillColor: color,
      opacity: alpha,
      lineWidth: 1,
      text: caption,
      textColor: color,
    })
  }

  /**
   * One timeframe's worth of lines and boxes, for the last `showLast` periods.
   *
   * Pine keeps the drawings in arrays and deletes the oldest once more than
   * `Show Last` survive, which comes to the same thing as walking back that
   * many closed periods from the end.
   */
  const drawZoneGroup = (out, bars, cfg, zone, step, tick) => {
    if (cfg.showLast <= 0) return
    const buckets = foldHigherTimeframe(bars, parseTimeframe(cfg.tf), zone)
    if (buckets.length < 2) return
    const alpha = Math.max(0, Math.min(1, (100 - cfg.transparency) / 100))
    const subAlpha = Math.max(0, Math.min(1, (100 - Math.min(100, cfg.transparency + 10)) / 100))
    const first = Math.max(1, buckets.length - cfg.showLast)
    const label = text(cfg.tf, '')

    for (let k = first; k < buckets.length; k++) {
      const levels = zoneLevels(buckets[k - 1])
      if (!levels) continue
      const left = bars[buckets[k].from].time
      // Pine runs each segment to the higher timeframe bar's close time. The
      // next period's first bar is that instant for every closed period; the
      // one still forming gets a single bar of width instead of a timestamp
      // that does not exist yet.
      const right =
        k + 1 < buckets.length ? bars[buckets[k + 1].from].time : bars[buckets[k].to].time + step
      const r = levels.r
      const s = levels.s

      if (cfg.sr[0]) {
        pushBox(out, left, right, { top: buffer(r[0], r[0], s[0])?.top, bottom: buffer(s[0], r[0], s[0])?.bottom }, COLOR_SUB, alpha, '')
        pushBox(out, left, right, buffer(r[0], r[0], s[0]), COLOR_SUB, subAlpha, label === '' ? formatPrice(r[0], tick) : `${formatPrice(r[0], tick)} : ${label}`)
        pushBox(out, left, right, buffer(s[0], r[0], s[0]), COLOR_SUB, subAlpha, label === '' ? formatPrice(s[0], tick) : `${formatPrice(s[0], tick)} : ${label}`)
      }
      if (cfg.sr[1]) {
        pushBox(out, left, right, buffer(r[1], r[1], r[0]), COLOR_S_LINE, alpha, formatPrice(r[1], tick))
        pushBox(out, left, right, buffer(s[1], s[0], s[1]), COLOR_R_LINE, alpha, formatPrice(s[1], tick))
      }
      // R3/S3 and R5/S5 draw lines only: their boxes are commented out upstream.
      if (cfg.sr[3]) {
        pushBox(out, left, right, buffer(r[3], r[3], r[2]), COLOR_R_TOP, alpha, formatPrice(r[3], tick))
        pushBox(out, left, right, buffer(s[3], s[2], s[3]), COLOR_S_TOP, alpha, formatPrice(s[3], tick))
      }
      if (cfg.sr[5]) {
        pushBox(out, left, right, buffer(r[5], r[5], r[4]), COLOR_R_TOP, alpha, formatPrice(r[5], tick))
        pushBox(out, left, right, buffer(s[5], s[4], s[5]), COLOR_S_TOP, alpha, formatPrice(s[5], tick))
      }

      if (cfg.pdhl) {
        pushLine(out, left, right, levels.ph, COLOR_SUB, cfg.lineStyle)
        pushLine(out, left, right, levels.pl, COLOR_SUB, cfg.lineStyle)
      }
      if (cfg.pivot) pushLine(out, left, right, levels.p, COLOR_SUB, cfg.lineStyle)
      for (let band = 0; band < cfg.sr.length; band++) {
        if (!cfg.sr[band]) continue
        const resistanceColor = band === 0 ? COLOR_SUB : band === 1 ? COLOR_S_LINE : COLOR_R_TOP
        const supportColor = band === 0 ? COLOR_SUB : band === 1 ? COLOR_R_LINE : COLOR_S_TOP
        pushLine(out, left, right, r[band], resistanceColor, cfg.lineStyle)
        pushLine(out, left, right, s[band], supportColor, cfg.lineStyle)
      }
    }
  }

  /* ------------------------------------------------------------ descriptor */

  const lineStyleOptions = [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ]
  const maTypeOptions = [
    { label: 'EMA', value: 'EMA' },
    { label: 'SMA', value: 'SMA' },
  ]

  registerIndicator({
    id: 'oa-magnetic-zones---multi-timeframe',
    name: 'Magnetic Zones - Multi Timeframe',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      { key: 'mz1Tf', type: 'text', label: 'Timeframe', default: 'D', group: 'Magnetic Zones 1', tooltip: "Pine timeframe code: '' for the chart, a number for minutes, D, W or M." },
      { key: 'mz1ShowLast', type: 'number', label: 'Show Last', default: 1, min: 0, max: 50, step: 1, group: 'Magnetic Zones 1' },
      { key: 'mz1Pdhl', type: 'boolean', label: 'PDHL', default: true, group: 'Magnetic Zones 1' },
      { key: 'mz1P', type: 'boolean', label: 'Pivot', default: true, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr1', type: 'boolean', label: 'SR1', default: true, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr2', type: 'boolean', label: 'SR2', default: true, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr3', type: 'boolean', label: 'SR3', default: false, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr4', type: 'boolean', label: 'SR4', default: false, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr5', type: 'boolean', label: 'SR5', default: false, group: 'Magnetic Zones 1' },
      { key: 'mz1Sr6', type: 'boolean', label: 'SR6', default: false, group: 'Magnetic Zones 1' },
      { key: 'mz1Style', type: 'select', label: 'Line Style', default: 'solid', options: lineStyleOptions, group: 'Magnetic Zones 1' },

      { key: 'mz2Tf', type: 'text', label: 'Timeframe', default: 'W', group: 'Magnetic Zones 2' },
      { key: 'mz2ShowLast', type: 'number', label: 'Show Last', default: 0, min: 0, max: 50, step: 1, group: 'Magnetic Zones 2' },
      { key: 'mz2Pdhl', type: 'boolean', label: 'PDHL', default: true, group: 'Magnetic Zones 2' },
      { key: 'mz2P', type: 'boolean', label: 'Pivot', default: true, group: 'Magnetic Zones 2' },
      { key: 'mz2Sr1', type: 'boolean', label: 'SR1', default: true, group: 'Magnetic Zones 2' },
      { key: 'mz2Sr2', type: 'boolean', label: 'SR2', default: true, group: 'Magnetic Zones 2' },
      { key: 'mz2Style', type: 'select', label: 'Line Style', default: 'dashed', options: lineStyleOptions, group: 'Magnetic Zones 2' },

      { key: 'mz3Tf', type: 'text', label: 'Timeframe', default: 'M', group: 'Magnetic Zones 3' },
      { key: 'mz3ShowLast', type: 'number', label: 'Show Last', default: 0, min: 0, max: 50, step: 1, group: 'Magnetic Zones 3' },
      { key: 'mz3Pdhl', type: 'boolean', label: 'PDHL', default: true, group: 'Magnetic Zones 3' },
      { key: 'mz3P', type: 'boolean', label: 'Pivot', default: true, group: 'Magnetic Zones 3' },
      { key: 'mz3Sr1', type: 'boolean', label: 'SR1', default: true, group: 'Magnetic Zones 3' },
      { key: 'mz3Sr2', type: 'boolean', label: 'SR2', default: true, group: 'Magnetic Zones 3' },
      { key: 'mz3Style', type: 'select', label: 'Line Style', default: 'dotted', options: lineStyleOptions, group: 'Magnetic Zones 3' },

      { key: 'boxTransp', type: 'number', label: 'Box Transparency', default: 70, min: 0, max: 100, step: 1, group: 'Magnetic Zones General Inputs' },

      { key: 'ma1Show', type: 'boolean', label: 'Show MA 1', default: false, group: 'Moving Average' },
      { key: 'ma1Length', type: 'number', label: 'MA 1 Length', default: 20, min: 1, max: 5000, step: 1, group: 'Moving Average' },
      { key: 'ma1Type', type: 'select', label: 'MA 1 Type', default: 'EMA', options: maTypeOptions, group: 'Moving Average' },
      { key: 'ma1Source', type: 'source', label: 'MA 1 Source', default: 'close', group: 'Moving Average' },
      { key: 'ma1Tf', type: 'text', label: 'MA 1 Timeframe', default: '', group: 'Moving Average', tooltip: 'Blank uses the chart timeframe.' },
      { key: 'ma2Show', type: 'boolean', label: 'Show MA 2', default: false, group: 'Moving Average' },
      { key: 'ma2Length', type: 'number', label: 'MA 2 Length', default: 200, min: 1, max: 5000, step: 1, group: 'Moving Average' },
      { key: 'ma2Type', type: 'select', label: 'MA 2 Type', default: 'EMA', options: maTypeOptions, group: 'Moving Average' },
      { key: 'ma2Source', type: 'source', label: 'MA 2 Source', default: 'close', group: 'Moving Average' },
      { key: 'ma2Tf', type: 'text', label: 'MA 2 Timeframe', default: '', group: 'Moving Average' },
      { key: 'maLabelLength', type: 'boolean', label: 'Label: Length', default: false, group: 'Moving Average' },
      { key: 'maLabelType', type: 'boolean', label: 'Label: Type', default: false, group: 'Moving Average' },
      { key: 'maLabelTf', type: 'boolean', label: 'Label: Timeframe', default: false, group: 'Moving Average' },

      { key: 'vwapShow', type: 'boolean', label: 'Show VWAP', default: false, group: 'VWAP' },
      {
        key: 'vwapAnchor',
        type: 'select',
        label: 'Anchor',
        default: 'Day',
        options: [
          { label: 'Day', value: 'Day' },
          { label: 'Week', value: 'Week' },
          { label: 'Month', value: 'Month' },
        ],
        group: 'VWAP',
      },
      { key: 'vwapSource', type: 'source', label: 'Source', default: 'hlc3', group: 'VWAP' },

      { key: 'stShow', type: 'boolean', label: 'Show Supertrend', default: false, group: 'Supertrend' },
      { key: 'stAtrLength', type: 'number', label: 'ATR Length', default: 7, min: 1, max: 500, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 2, min: 0.01, max: 100, step: 0.01, group: 'Supertrend' },
    ],

    plots: [
      { key: 'ma1', type: 'line', title: 'MA 1', style: { color: COLOR_MA_1, lineWidth: 1 } },
      { key: 'ma2', type: 'line', title: 'MA 2', style: { color: COLOR_MA_2, lineWidth: 1 } },
      { key: 'vwap', type: 'line', title: 'VWAP', style: { color: COLOR_VWAP, lineWidth: 1 } },
      {
        key: 'st',
        type: 'line',
        title: 'Supertrend',
        style: { color: COLOR_ST_UP, lineWidth: 1 },
        colorBy: ({ index, values }) => (values.stDir?.[index] === -1 ? COLOR_ST_DOWN : COLOR_ST_UP),
      },
      // Carried for colorBy and never drawn on its own.
      { key: 'stDir', type: 'line', title: 'Supertrend Direction', style: { visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const zone = zoneFrom(settings, ctx)
      const tick = Number(ctx?.tickSize) || 0
      const blank = () => new Array(n).fill(NaN)

      const ma1 = on(settings.ma1Show, false)
        ? higherTimeframeMa(
            bars,
            settings.ma1Tf,
            settings.ma1Type === 'SMA' ? 'SMA' : 'EMA',
            settings.ma1Source ?? 'close',
            lengthInput(settings.ma1Length, 20),
            zone
          )
        : blank()

      const ma2 = on(settings.ma2Show, false)
        ? higherTimeframeMa(
            bars,
            settings.ma2Tf,
            settings.ma2Type === 'SMA' ? 'SMA' : 'EMA',
            settings.ma2Source ?? 'close',
            lengthInput(settings.ma2Length, 200),
            zone
          )
        : blank()

      const vwap = on(settings.vwapShow, false)
        ? anchoredVwap(bars, settings.vwapSource ?? 'hlc3', settings.vwapAnchor ?? 'Day', zone)
        : blank()

      let st = blank()
      let stDir = blank()
      if (on(settings.stShow, false)) {
        const trend = legacySupertrend(
          bars,
          lengthInput(settings.stAtrLength, 7),
          floatInput(settings.stFactor, 2, 0.01)
        )
        st = trend.line
        stDir = trend.dir
      }

      return {
        ma1: nulls(ma1),
        ma2: nulls(ma2),
        vwap: nulls(vwap),
        st: nulls(st),
        stDir: nulls(stDir),
        // The tick is only known to calc, and the zone captions are drawn by
        // draws, which is handed the columns and nothing else.
        tick: new Array(n).fill(tick),
      }
    },

    draws({ bars, values, settings }) {
      if (!Array.isArray(bars) || bars.length === 0) return []
      const out = []
      const zone = zoneFrom(settings, undefined)
      const step = barStep(bars)
      const tick = readTick(values)
      const transparency = (() => {
        const n = Number(settings.boxTransp)
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70
      })()

      drawZoneGroup(out, bars, {
        tf: settings.mz1Tf ?? 'D',
        showLast: countInput(settings.mz1ShowLast, 1),
        pdhl: on(settings.mz1Pdhl, true),
        pivot: on(settings.mz1P, true),
        sr: [
          on(settings.mz1Sr1, true),
          on(settings.mz1Sr2, true),
          on(settings.mz1Sr3, false),
          on(settings.mz1Sr4, false),
          on(settings.mz1Sr5, false),
          on(settings.mz1Sr6, false),
        ],
        lineStyle: settings.mz1Style ?? 'solid',
        transparency,
      }, zone, step, tick)

      drawZoneGroup(out, bars, {
        tf: settings.mz2Tf ?? 'W',
        showLast: countInput(settings.mz2ShowLast, 0),
        pdhl: on(settings.mz2Pdhl, true),
        pivot: on(settings.mz2P, true),
        sr: [on(settings.mz2Sr1, true), on(settings.mz2Sr2, true)],
        lineStyle: settings.mz2Style ?? 'dashed',
        transparency,
      }, zone, step, tick)

      drawZoneGroup(out, bars, {
        tf: settings.mz3Tf ?? 'M',
        showLast: countInput(settings.mz3ShowLast, 0),
        pdhl: on(settings.mz3Pdhl, true),
        pivot: on(settings.mz3P, true),
        sr: [on(settings.mz3Sr1, true), on(settings.mz3Sr2, true)],
        lineStyle: settings.mz3Style ?? 'dotted',
        transparency,
      }, zone, step, tick)

      // add_label(): one plate per moving average on the newest bar, naming
      // whichever of length, type and timeframe the user asked for. The
      // upstream string build leaves a lone closing bracket when the timeframe
      // is the only part shown, and that is reproduced rather than corrected.
      const last = bars.length - 1
      const labelFor = (show, column, spec, type, length, color) => {
        if (!show) return
        let caption = ''
        if (on(settings.maLabelLength, false)) caption = String(length)
        if (on(settings.maLabelType, false)) caption += (caption !== '' ? ' ' : '') + type
        const res = resolutionLabel(spec)
        if (on(settings.maLabelTf, false) && res !== '') {
          caption += (caption !== '' ? ' (' : '') + res + ')'
        }
        if (caption === '') return
        const value = Array.isArray(column) ? column[last] : null
        const price = Number.isFinite(value) ? value : bars[last].close
        if (!Number.isFinite(price)) return
        out.push({
          kind: 'label',
          at: { time: bars[last].time, price },
          text: caption,
          color: withAlpha('#000000', 0),
          textColor: color,
          align: 'left',
        })
      }

      labelFor(
        on(settings.ma1Show, false),
        values.ma1,
        settings.ma1Tf,
        settings.ma1Type === 'SMA' ? 'SMA' : 'EMA',
        lengthInput(settings.ma1Length, 20),
        COLOR_MA_1
      )
      labelFor(
        on(settings.ma2Show, false),
        values.ma2,
        settings.ma2Tf,
        settings.ma2Type === 'SMA' ? 'SMA' : 'EMA',
        lengthInput(settings.ma2Length, 200),
        COLOR_MA_2
      )

      return out
    },
  })
}
