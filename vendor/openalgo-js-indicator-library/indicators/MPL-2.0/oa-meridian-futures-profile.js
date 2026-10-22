/**
 * Meridian - Futures Profile - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/futures/meridian-futures-profile.pine
 * Repo: sukesan7/meridian-indicators
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * An RTH time-price-opportunity profile. Each session's bars are bucketed into
 * fixed-minute TPO blocks and into price rows, which gives a developing POC and
 * value area, the initial balance and its extensions, single prints, poor
 * extremes, and an Auction Market Theory reading of the session against the
 * previous one.
 */

/* The Meridian theme, as the Pine script's colour inputs default it. The chart
 * generates colour, width and style controls for every plot, so the palette is
 * only needed for the drawing layer and the dashboard, which it owns itself. */
const ACCENT = '#a855f7'
const SECONDARY = '#6366f1'
const VALUE_AREA = '#8b5cf6'
const OUTSIDE_VALUE = '#334155'
const PREV_VALUE = '#5b4b8a'
const PREV_OUTSIDE = '#262d3f'
const POC_COLOR = '#f472b6'
const DEVELOPING = '#22d3ee'
const SINGLE_PRINT = '#f9a8d4'
const POOR = '#f59e0b'
const BULLISH = '#22c55e'
const BEARISH = '#ef4444'
const NEUTRAL = '#94a3b8'
const PANEL = '#0f172a'
const TEXT = '#f1f5f9'

/* Every string the Pine script builds is carried as a numeric code column, so
 * the table and the alerts can read it back out of `values`. */
const VALUE_RELATION = [
  'No Comparison', 'Higher Value', 'Lower Value', 'Overlapping Higher',
  'Overlapping Lower', 'Inside Prior Value', 'Outside Prior Value', 'Overlapping Value',
]
const POC_MIGRATION = ['No Comparison', 'Strongly Higher', 'Higher', 'Strongly Lower', 'Lower', 'Stable']
const OPEN_LOCATION = [
  'No Prior Profile', 'Above Prior Range', 'Above Prior Value',
  'Inside Prior Value', 'Below Prior Value', 'Below Prior Range',
]
const CURRENT_LOCATION = [
  'No Profile', 'Above Profile', 'Above Value', 'At POC',
  'Inside Value', 'Below Value', 'Below Profile',
]
const PARTICIPANT = [
  'Indeterminate', 'Two-sided Trade', 'Responsive Selling',
  'Responsive Buying', 'Initiative Buying', 'Initiative Selling',
]
const IB_STATE = ['IB Developing', 'Above IB', 'Below IB', 'Inside IB']
const STRUCTURE = ['No Profile', 'Poor High + Low', 'Poor High', 'Poor Low', 'Single Rows', 'Clean Extremes']
/* -1 is the "Developing" state the Pine shape helper starts in. */
const SHAPE = {
  '-1': 'Developing',
  0: 'Neutral / Mixed',
  1: 'D-shaped',
  2: 'P-shaped',
  3: 'b-shaped',
  4: 'Double Distribution',
  5: 'Trend Profile',
}
const AUCTION = {
  '-3': 'Failed Upward Auction',
  '-2': 'Downward Trend Auction',
  '-1': 'Downward Imbalance',
  0: 'Transition',
  1: 'Upward Imbalance',
  2: 'Upward Trend Auction',
  3: 'Failed Downward Auction',
  4: 'Double Distribution',
  5: 'Balanced Auction',
  6: 'Developing Balance',
}

const TABLE_POSITION = {
  'Top Right': 'top-right',
  'Top Left': 'top-left',
  'Bottom Right': 'bottom-right',
  'Bottom Left': 'bottom-left',
  'Middle Right': 'middle-right',
  'Middle Left': 'middle-left',
}
const TABLE_FONT = { Tiny: 9, Small: 11, Normal: 13, Large: 15 }
const BLOCK_MINUTES = {
  '5 Minutes': 5,
  '10 Minutes': 10,
  '15 Minutes': 15,
  '30 Minutes': 30,
  '60 Minutes': 60,
}

const PLOT_KEYS = [
  'poc', 'vah', 'val', 'mid', 'ibh', 'ibl', 'ibUp1', 'ibDn1', 'ibUp2', 'ibDn2',
  'prevPoc', 'prevVah', 'prevVal', 'poorHigh', 'poorLow',
  'vpoc', 'vvah', 'vval', 'rthOpen', 'rthClose',
]
const STATE_KEYS = [
  'auction', 'shape', 'valueRel', 'pocMig', 'openLoc', 'curLoc', 'participant',
  'structure', 'ibState', 'rotation', 'skew', 'totalTpo', 'singles', 'tpoAbove',
  'tpoBelow', 'vaWidth', 'curValid', 'prevValid', 'curPoorHigh', 'curPoorLow',
  'prevPocState', 'prevVahState', 'prevValState', 'prevPocTouch', 'prevVahTouch',
  'prevValTouch', 'singleOverlap', 'poorHighFix', 'poorLowFix', 'inRth',
  'rowTicks', 'warn', 'openPrice', 'tick',
]

const isF = (v) => Number.isFinite(v)

export default function ({
  registerIndicator, nulls, withAlpha, isValidTimezone, DEFAULT_TIMEZONE,
  utcSecondsToZonedParts, zonedWallClockToUtcSeconds, parseSessionSpec, inSessionAt,
  intervalToSeconds, isIntradayInterval, precisionForStep,
}) {
  const rowLow = (row, size) => row * size
  const rowHigh = (row, size) => (row + 1) * size
  const rowCenter = (row, size) => (row + 0.5) * size
  const mapGet = (m, key) => {
    const v = m.get(key)
    return v === undefined ? 0 : v
  }

  /* The count of a row, optionally including the still-forming TPO block. */
  const tpoCount = (m, row, includeActive, aLow, aHigh) =>
    mapGet(m, row) + (includeActive && row >= aLow && row <= aHigh ? 1 : 0)

  const addTpoBlock = (m, lowRow, highRow, minRow, maxRow, maxRowsPerBlock) => {
    const rowsTouched = highRow - lowRow + 1
    if (rowsTouched > 0 && rowsTouched <= maxRowsPerBlock) {
      for (let row = lowRow; row <= highRow; row++) m.set(row, mapGet(m, row) + 1)
      return {
        min: minRow === null ? lowRow : Math.min(minRow, lowRow),
        max: maxRow === null ? highRow : Math.max(maxRow, highRow),
        overflow: false,
      }
    }
    return { min: minRow, max: maxRow, overflow: rowsTouched > maxRowsPerBlock }
  }

  const addEstimatedVolume = (m, lowRow, highRow, barVolume, maxRowsPerBlock) => {
    const rowsTouched = highRow - lowRow + 1
    if (rowsTouched > 0 && rowsTouched <= maxRowsPerBlock) {
      const perRow = (isF(barVolume) ? barVolume : 0) / rowsTouched
      for (let row = lowRow; row <= highRow; row++) m.set(row, mapGet(m, row) + perRow)
      return false
    }
    return rowsTouched > maxRowsPerBlock
  }

  /* Pine f_tpo_stats. Prices stay NaN rather than null so that every downstream
   * comparison is false during warmup, which is how `na` behaves in Pine. */
  const tpoStats = (m, minRow, maxRow, rowSize, includeActive, aLow, aHigh, vaPercent) => {
    const valid = minRow !== null && maxRow !== null && maxRow >= minRow && isF(rowSize) && rowSize > 0
    let pocRow = null
    let vahRow = null
    let valRow = null
    let totalTpo = 0
    let tpoAbove = 0
    let tpoBelow = 0
    let singleRows = 0
    let maximumCount = 0
    let poorHigh = false
    let poorLow = false
    let skewness = NaN
    /* The row counts are read three times over, so they are materialised once
     * rather than hashed out of the map on every pass. */
    const counts = []
    if (valid) {
      for (let row = minRow; row <= maxRow; row++) counts.push(tpoCount(m, row, includeActive, aLow, aHigh))
    }
    const at = (row) => counts[row - minRow]

    if (valid) {
      const midpointRow = (minRow + maxRow) * 0.5
      let weightedSum = 0
      for (let row = minRow; row <= maxRow; row++) {
        const rowCount = at(row)
        totalTpo += rowCount
        weightedSum += row * rowCount
        const betterPoc = rowCount > maximumCount
        const equalAndCloser = rowCount === maximumCount && rowCount > 0 &&
          (pocRow === null || Math.abs(row - midpointRow) < Math.abs(pocRow - midpointRow))
        const equalDistanceHigher = rowCount === maximumCount && rowCount > 0 && pocRow !== null &&
          Math.abs(row - midpointRow) === Math.abs(pocRow - midpointRow) && row > pocRow
        if (betterPoc || equalAndCloser || equalDistanceHigher) {
          maximumCount = rowCount
          pocRow = row
        }
      }

      if (totalTpo > 0 && pocRow !== null) {
        const weightedMeanRow = weightedSum / totalTpo
        let secondMoment = 0
        let thirdMoment = 0
        for (let row = minRow; row <= maxRow; row++) {
          const rowCount = at(row)
          const centered = row - weightedMeanRow
          secondMoment += centered * centered * rowCount
          thirdMoment += centered * centered * centered * rowCount
          if (row > pocRow) tpoAbove += rowCount
          else if (row < pocRow) tpoBelow += rowCount
          if (row > minRow && row < maxRow && rowCount === 1) singleRows += 1
        }
        const varianceRows = secondMoment / totalTpo
        const sdRows = Math.sqrt(Math.max(varianceRows, 0))
        skewness = sdRows > 1e-9 ? (thirdMoment / totalTpo) / Math.pow(sdRows, 3) : 0

        const targetTpo = Math.ceil((totalTpo * vaPercent) / 100)
        let includedTpo = at(pocRow)
        let valueLowRow = pocRow
        let valueHighRow = pocRow
        let safety = 0
        while (
          includedTpo < targetTpo &&
          (valueLowRow > minRow || valueHighRow < maxRow) &&
          safety <= maxRow - minRow + 2
        ) {
          const aboveCount = valueHighRow < maxRow ? at(valueHighRow + 1) : -1
          const belowCount = valueLowRow > minRow ? at(valueLowRow - 1) : -1
          if (aboveCount >= belowCount) {
            valueHighRow += 1
            includedTpo += Math.max(aboveCount, 0)
          } else {
            valueLowRow -= 1
            includedTpo += Math.max(belowCount, 0)
          }
          safety += 1
        }
        vahRow = valueHighRow
        valRow = valueLowRow
        poorHigh = at(maxRow) > 1
        poorLow = at(minRow) > 1
      }
    }

    const profileHigh = valid ? rowHigh(maxRow, rowSize) : NaN
    const profileLow = valid ? rowLow(minRow, rowSize) : NaN
    return {
      valid,
      pocRow,
      vahRow,
      valRow,
      totalTpo,
      tpoAbove,
      tpoBelow,
      singleRows,
      maximumCount,
      poorHigh,
      poorLow,
      skewness,
      profileHigh,
      profileLow,
      profileMid: valid ? (profileHigh + profileLow) * 0.5 : NaN,
      poc: valid && pocRow !== null ? rowCenter(pocRow, rowSize) : NaN,
      vah: valid && vahRow !== null ? rowHigh(vahRow, rowSize) : NaN,
      val: valid && valRow !== null ? rowLow(valRow, rowSize) : NaN,
    }
  }

  /* Pine f_volume_stats. */
  const volumeStats = (m, minRow, maxRow, rowSize, vaPercent) => {
    const valid = minRow !== null && maxRow !== null && maxRow >= minRow &&
      isF(rowSize) && rowSize > 0 && m.size > 0
    let pocRow = null
    let vahRow = null
    let valRow = null
    let totalVolume = 0
    let maximumVolume = 0

    if (valid) {
      const midpointRow = (minRow + maxRow) * 0.5
      for (let row = minRow; row <= maxRow; row++) {
        const rowVolume = mapGet(m, row)
        totalVolume += rowVolume
        const betterPoc = rowVolume > maximumVolume
        const equalAndCloser = rowVolume === maximumVolume && rowVolume > 0 &&
          (pocRow === null || Math.abs(row - midpointRow) < Math.abs(pocRow - midpointRow))
        if (betterPoc || equalAndCloser) {
          maximumVolume = rowVolume
          pocRow = row
        }
      }
      if (totalVolume > 0 && pocRow !== null) {
        const targetVolume = (totalVolume * vaPercent) / 100
        let includedVolume = mapGet(m, pocRow)
        let valueLowRow = pocRow
        let valueHighRow = pocRow
        let safety = 0
        while (
          includedVolume < targetVolume &&
          (valueLowRow > minRow || valueHighRow < maxRow) &&
          safety <= maxRow - minRow + 2
        ) {
          const aboveVolume = valueHighRow < maxRow ? mapGet(m, valueHighRow + 1) : -1
          const belowVolume = valueLowRow > minRow ? mapGet(m, valueLowRow - 1) : -1
          if (aboveVolume >= belowVolume) {
            valueHighRow += 1
            includedVolume += Math.max(aboveVolume, 0)
          } else {
            valueLowRow -= 1
            includedVolume += Math.max(belowVolume, 0)
          }
          safety += 1
        }
        vahRow = valueHighRow
        valRow = valueLowRow
      }
    }
    return {
      valid,
      pocRow,
      vahRow,
      valRow,
      totalVolume,
      maximumVolume,
      poc: valid && pocRow !== null ? rowCenter(pocRow, rowSize) : NaN,
      vah: valid && vahRow !== null ? rowHigh(vahRow, rowSize) : NaN,
      val: valid && valRow !== null ? rowLow(valRow, rowSize) : NaN,
    }
  }

  /* Pine f_profile_shape. Returns the numeric code only; the text map is above. */
  const profileShape = (m, minRow, maxRow, includeActive, aLow, aHigh, pocRow, skewness,
    profileRange, ibRange, cfg) => {
    let shapeCode = -1
    let doubleDistribution = false
    if (minRow !== null && maxRow !== null && pocRow !== null && maxRow > minRow) {
      const counts = []
      for (let row = minRow; row <= maxRow; row++) counts.push(tpoCount(m, row, includeActive, aLow, aHigh))
      const at = (row) => counts[row - minRow]
      const primaryPeakRow = pocRow
      const primaryPeakCount = at(primaryPeakRow)
      let secondaryPeakRow = null
      let secondaryPeakCount = 0
      for (let row = minRow; row <= maxRow; row++) {
        const rowCount = at(row)
        if (Math.abs(row - primaryPeakRow) >= cfg.minSeparation && rowCount > secondaryPeakCount) {
          secondaryPeakCount = rowCount
          secondaryPeakRow = row
        }
      }
      if (secondaryPeakRow !== null && secondaryPeakCount >= primaryPeakCount * cfg.peakRatio) {
        const valleyStart = Math.min(primaryPeakRow, secondaryPeakRow)
        const valleyEnd = Math.max(primaryPeakRow, secondaryPeakRow)
        let valleyCount = 1000000
        if (valleyEnd - valleyStart > 1) {
          for (let row = valleyStart + 1; row <= valleyEnd - 1; row++) {
            valleyCount = Math.min(valleyCount, at(row))
          }
        }
        doubleDistribution = valleyCount <= Math.min(primaryPeakCount, secondaryPeakCount) * cfg.valleyRatio
      }

      const pocLocation = (pocRow - minRow) / Math.max(maxRow - minRow, 1)
      const trendProfile = isF(ibRange) && ibRange > 0 && profileRange / ibRange >= cfg.trendExtension
      const skew = isF(skewness) ? skewness : 0
      if (doubleDistribution) shapeCode = 4
      else if (trendProfile && (pocLocation >= 0.70 || pocLocation <= 0.30 || Math.abs(skew) >= cfg.skewThreshold)) shapeCode = 5
      else if (skew <= -cfg.skewThreshold && pocLocation > 0.52) shapeCode = 2
      else if (skew >= cfg.skewThreshold && pocLocation < 0.48) shapeCode = 3
      else if (Math.abs(skew) < cfg.skewThreshold && pocLocation >= 0.35 && pocLocation <= 0.65) shapeCode = 1
      else shapeCode = 0
    }
    return { shapeCode, doubleDistribution }
  }

  /* Pine's single-print scan over a completed profile. */
  const buildZones = (m, minRow, maxRow, valid) => {
    const zones = []
    if (!valid || minRow === null || maxRow === null) return zones
    let zoneStart = null
    for (let row = minRow; row <= maxRow; row++) {
      const rowCount = mapGet(m, row)
      const isSingle = row > minRow && row < maxRow && rowCount === 1
      if (isSingle && zoneStart === null) zoneStart = row
      if (!isSingle && zoneStart !== null) {
        zones.push([zoneStart, row - 1])
        zoneStart = null
      }
    }
    if (zoneStart !== null) zones.push([zoneStart, maxRow - 1])
    return zones
  }

  /* The median gap between bars, used where Pine would read the chart timeframe
   * and to express a drawing width stated in bars as a width in seconds. */
  const medianBarSeconds = (bars) => {
    if (bars.length < 2) return NaN
    const gaps = []
    for (let i = 1; i < bars.length; i++) {
      const d = bars[i].time - bars[i - 1].time
      if (d > 0) gaps.push(d)
    }
    if (gaps.length === 0) return NaN
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }

  registerIndicator({
    id: 'oa-meridian-futures-profile',
    name: 'Meridian - Futures Profile',
    category: 'Meridian',
    placement: 'onchart',

    inputs: [
      { key: 'indicatorEnabled', type: 'boolean', label: 'Enable indicator', default: true, group: '01 - General' },
      {
        key: 'sessionTimezone', type: 'text', label: 'Analysis time zone', default: 'America/New_York',
        group: '01 - General',
        tooltip: 'IANA zone name the RTH session and the block clock are read in, for example America/New_York or Asia/Kolkata.',
      },

      {
        key: 'rthSession', type: 'text', label: 'RTH session', default: '0930-1600:23456', group: '02 - Session + TPO Blocks',
        tooltip: 'Start and end in HHMM, optionally followed by :days where 1 is Sunday. Exchange wall clock in the zone above.',
      },
      { key: 'rthOpenHour', type: 'number', label: 'RTH open hour', default: 9, min: 0, max: 23, step: 1, group: '02 - Session + TPO Blocks' },
      { key: 'rthOpenMinute', type: 'number', label: 'Minute', default: 30, min: 0, max: 59, step: 1, group: '02 - Session + TPO Blocks' },
      {
        key: 'blockSizeInput', type: 'select', label: 'TPO block size', default: '30 Minutes', group: '02 - Session + TPO Blocks',
        options: [
          { label: '5 Minutes', value: '5 Minutes' },
          { label: '10 Minutes', value: '10 Minutes' },
          { label: '15 Minutes', value: '15 Minutes' },
          { label: '30 Minutes', value: '30 Minutes' },
          { label: '60 Minutes', value: '60 Minutes' },
        ],
      },
      {
        key: 'initialBalanceBlocks', type: 'number', label: 'Initial Balance blocks', default: 2, min: 1, max: 12, step: 1,
        group: '02 - Session + TPO Blocks',
        tooltip: 'Two 30-minute blocks produce the conventional 60-minute Initial Balance.',
      },
      {
        key: 'maximumChartMinutes', type: 'number', label: 'Maximum chart timeframe', default: 30, min: 1, max: 60, step: 1,
        group: '02 - Session + TPO Blocks',
        tooltip: 'The chart timeframe should not exceed the selected TPO block size. 1m, 5m and 15m charts are recommended.',
      },

      {
        key: 'rowSizeMode', type: 'select', label: 'Row-size mode', default: 'Auto', group: '03 - Profile Rows',
        options: [{ label: 'Auto', value: 'Auto' }, { label: 'Manual', value: 'Manual' }],
      },
      { key: 'manualTicksPerRow', type: 'number', label: 'Manual ticks per row', default: 8, min: 1, max: 1000, step: 1, group: '03 - Profile Rows' },
      { key: 'automaticTargetRows', type: 'number', label: 'Automatic target rows', default: 70, min: 20, max: 150, step: 1, group: '03 - Profile Rows' },
      { key: 'minimumAutomaticTicks', type: 'number', label: 'Minimum automatic ticks', default: 1, min: 1, max: 100, step: 1, group: '03 - Profile Rows' },
      {
        key: 'maximumRenderedRows', type: 'number', label: 'Maximum rendered rows', default: 100, min: 30, max: 140, step: 1,
        group: '03 - Profile Rows',
        tooltip: 'Profiles with more rows stay mathematically intact but are visually grouped to keep the drawing count sane.',
      },
      {
        key: 'maximumRowsPerBlock', type: 'number', label: 'Maximum rows per TPO block', default: 250, min: 50, max: 1000, step: 1,
        group: '03 - Profile Rows',
        tooltip: 'Protects the study when a manual row size is too small for a volatile bar or a gap.',
      },
      { key: 'valueAreaPercent', type: 'number', label: 'Value area percentage', default: 70, min: 50, max: 95, step: 1, group: '03 - Profile Rows' },

      { key: 'showCurrentProfile', type: 'boolean', label: 'Show current profile', default: true, group: '04 - Profile Display' },
      { key: 'showPreviousProfile', type: 'boolean', label: 'Show previous profile', default: true, group: '04 - Profile Display' },
      { key: 'maximumProfileWidthBars', type: 'number', label: 'Maximum TPO width (bars)', default: 20, min: 6, max: 50, step: 1, group: '04 - Profile Display' },
      { key: 'showRowCounts', type: 'boolean', label: 'Show TPO count on rows', default: false, group: '04 - Profile Display' },
      { key: 'showProfileNames', type: 'boolean', label: 'Show Current / Previous labels', default: true, group: '04 - Profile Display' },
      { key: 'showValueAreaShading', type: 'boolean', label: 'Highlight value-area rows', default: true, group: '04 - Profile Display' },
      { key: 'showProfileMidpoint', type: 'boolean', label: 'Show profile midpoint', default: true, group: '04 - Profile Display' },
      { key: 'profileTransparency', type: 'number', label: 'Profile transparency', default: 28, min: 0, max: 90, step: 1, group: '04 - Profile Display' },
      { key: 'previousProfileTransparency', type: 'number', label: 'Previous profile transparency', default: 48, min: 0, max: 95, step: 1, group: '04 - Profile Display' },

      { key: 'showCurrentLevels', type: 'boolean', label: 'Show current POC / VAH / VAL', default: true, group: '05 - Levels + Structure' },
      { key: 'extendPreviousLevels', type: 'boolean', label: 'Show previous POC / VAH / VAL', default: true, group: '05 - Levels + Structure' },
      { key: 'showInitialBalance', type: 'boolean', label: 'Show Initial Balance', default: true, group: '05 - Levels + Structure' },
      { key: 'showIbExtensions', type: 'boolean', label: 'Show IB range extensions', default: true, group: '05 - Levels + Structure' },
      { key: 'firstIbExtension', type: 'number', label: 'First IB extension', default: 0.5, min: 0.1, max: 5, step: 0.1, group: '05 - Levels + Structure' },
      { key: 'secondIbExtension', type: 'number', label: 'Second IB extension', default: 1, min: 0.1, max: 10, step: 0.1, group: '05 - Levels + Structure' },
      { key: 'showSessionOpenClose', type: 'boolean', label: 'Show session open / close', default: false, group: '05 - Levels + Structure' },
      { key: 'acceptanceCloses', type: 'number', label: 'Closes for prior-value acceptance', default: 2, min: 1, max: 5, step: 1, group: '05 - Levels + Structure' },
      { key: 'showSinglePrintZones', type: 'boolean', label: 'Show previous single-print zones', default: true, group: '05 - Levels + Structure' },
      { key: 'showPoorHighLow', type: 'boolean', label: 'Show previous poor high / low', default: true, group: '05 - Levels + Structure' },
      { key: 'maximumSinglePrintZones', type: 'number', label: 'Maximum single-print zones', default: 12, min: 1, max: 30, step: 1, group: '05 - Levels + Structure' },

      {
        key: 'showEstimatedVolume', type: 'boolean', label: 'Show estimated volume profile', default: false, group: '06 - Estimated Volume Profile',
        tooltip: 'Spreads each bar\'s volume evenly across every profile row the bar touched. An estimate, not exchange volume at price.',
      },
      { key: 'estimatedVolumeWidthBars', type: 'number', label: 'Maximum volume width (bars)', default: 12, min: 4, max: 30, step: 1, group: '06 - Estimated Volume Profile' },
      { key: 'showEstimatedVolumeLevels', type: 'boolean', label: 'Show estimated VPOC / VAH / VAL', default: true, group: '06 - Estimated Volume Profile' },
      { key: 'estimatedVolumeValueArea', type: 'number', label: 'Estimated volume value area', default: 70, min: 50, max: 95, step: 1, group: '06 - Estimated Volume Profile' },

      { key: 'doublePeakMinimumRatio', type: 'number', label: 'Double-distribution secondary peak', default: 0.62, min: 0.30, max: 1, step: 0.01, group: '07 - Auction Classification' },
      { key: 'doublePeakValleyRatio', type: 'number', label: 'Double-distribution valley ratio', default: 0.55, min: 0.10, max: 0.90, step: 0.01, group: '07 - Auction Classification' },
      { key: 'doublePeakMinimumSeparation', type: 'number', label: 'Minimum peak separation (rows)', default: 5, min: 2, max: 30, step: 1, group: '07 - Auction Classification' },
      { key: 'shapeSkewThreshold', type: 'number', label: 'P / b shape skew threshold', default: 0.45, min: 0.10, max: 2, step: 0.05, group: '07 - Auction Classification' },
      { key: 'trendRangeExtension', type: 'number', label: 'Trend-profile range / IB', default: 1.75, min: 1.1, max: 5, step: 0.05, group: '07 - Auction Classification' },
      { key: 'strongPocMigrationRows', type: 'number', label: 'Strong POC migration (rows)', default: 2, min: 0.5, max: 10, step: 0.5, group: '07 - Auction Classification' },

      { key: 'showDashboard', type: 'boolean', label: 'Show Profile dashboard', default: true, group: '08 - Dashboard' },
      {
        key: 'dashboardWithFuturesLevels', type: 'boolean', label: 'Layout with Futures Levels', default: true, group: '08 - Dashboard',
        tooltip: 'Pins the dashboard to the top-right so it stacks above a Futures Levels dashboard in the bottom-right corner.',
      },
      {
        key: 'dashboardPosition', type: 'select', label: 'Standalone dashboard position', default: 'Bottom Right', group: '08 - Dashboard',
        options: [
          { label: 'Top Right', value: 'Top Right' },
          { label: 'Top Left', value: 'Top Left' },
          { label: 'Bottom Right', value: 'Bottom Right' },
          { label: 'Bottom Left', value: 'Bottom Left' },
          { label: 'Middle Right', value: 'Middle Right' },
          { label: 'Middle Left', value: 'Middle Left' },
        ],
        tooltip: 'Used only when Layout with Futures Levels is off.',
      },
      {
        key: 'dashboardTextSize', type: 'select', label: 'Dashboard text size', default: 'Small', group: '08 - Dashboard',
        options: [
          { label: 'Tiny', value: 'Tiny' },
          { label: 'Small', value: 'Small' },
          { label: 'Normal', value: 'Normal' },
          { label: 'Large', value: 'Large' },
        ],
      },
      { key: 'dashboardColumnWidth', type: 'number', label: 'Dashboard column width (%)', default: 11, min: 8, max: 20, step: 1, group: '08 - Dashboard' },
      { key: 'dashboardHeaderHeight', type: 'number', label: 'Header height (%)', default: 4, min: 2, max: 10, step: 1, group: '08 - Dashboard' },
      { key: 'dashboardCardHeight', type: 'number', label: 'Card row height (%)', default: 7, min: 4, max: 14, step: 1, group: '08 - Dashboard' },
      { key: 'dashboardFooterHeight', type: 'number', label: 'Footer height (%)', default: 2, min: 1, max: 6, step: 1, group: '08 - Dashboard' },

      { key: 'alertPreviousLevels', type: 'boolean', label: 'Alert on previous POC / VAH / VAL', default: true, group: '09 - Alerts' },
      { key: 'alertSinglePrints', type: 'boolean', label: 'Alert on previous single prints', default: true, group: '09 - Alerts' },
      { key: 'alertPoorHighLow', type: 'boolean', label: 'Alert on poor high / low repair', default: true, group: '09 - Alerts' },
      { key: 'alertAuctionChanges', type: 'boolean', label: 'Alert on auction-state changes', default: true, group: '09 - Alerts' },
    ],

    plots: [
      { key: 'poc', type: 'line', title: 'TPO POC', style: { color: POC_COLOR, lineWidth: 2 } },
      { key: 'vah', type: 'line', title: 'TPO VAH', style: { color: DEVELOPING, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'val', type: 'line', title: 'TPO VAL', style: { color: DEVELOPING, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'mid', type: 'line', title: 'TPO MID', style: { color: ACCENT, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'ibh', type: 'line', title: 'IBH', style: { color: SECONDARY, lineWidth: 1 } },
      { key: 'ibl', type: 'line', title: 'IBL', style: { color: SECONDARY, lineWidth: 1 } },
      { key: 'ibUp1', type: 'line', title: 'IB Ext 1 Up', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'ibDn1', type: 'line', title: 'IB Ext 1 Down', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'ibUp2', type: 'line', title: 'IB Ext 2 Up', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'ibDn2', type: 'line', title: 'IB Ext 2 Down', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dotted' } },
      {
        key: 'prevPoc', type: 'line', title: 'Prior POC', style: { color: PREV_VALUE, lineWidth: 1, lineStyle: 'dashed' },
        // Pine recolours the prior level by how price has treated it.
        colorBy: ({ index, values }) => {
          const state = values.prevPocState?.[index]
          if (state === 1 || state === 2) return BULLISH
          if (state === -1 || state === -2) return BEARISH
          return values.prevPocTouch?.[index] === 1 ? POOR : PREV_VALUE
        },
      },
      {
        key: 'prevVah', type: 'line', title: 'Prior VAH', style: { color: PREV_VALUE, lineWidth: 1, lineStyle: 'dashed' },
        colorBy: ({ index, values }) => {
          const state = values.prevVahState?.[index]
          if (state === 1) return BULLISH
          if (state === -2) return BEARISH
          return values.prevVahTouch?.[index] === 1 ? POOR : PREV_VALUE
        },
      },
      {
        key: 'prevVal', type: 'line', title: 'Prior VAL', style: { color: PREV_VALUE, lineWidth: 1, lineStyle: 'dashed' },
        colorBy: ({ index, values }) => {
          const state = values.prevValState?.[index]
          if (state === 2) return BULLISH
          if (state === -1) return BEARISH
          return values.prevValTouch?.[index] === 1 ? POOR : PREV_VALUE
        },
      },
      {
        key: 'poorHigh', type: 'line', title: 'Poor High', style: { color: POOR, lineWidth: 1, lineStyle: 'dotted' },
        colorBy: ({ index, values }) => (values.poorHighFix?.[index] === 1 ? NEUTRAL : POOR),
      },
      {
        key: 'poorLow', type: 'line', title: 'Poor Low', style: { color: POOR, lineWidth: 1, lineStyle: 'dotted' },
        colorBy: ({ index, values }) => (values.poorLowFix?.[index] === 1 ? NEUTRAL : POOR),
      },
      { key: 'vpoc', type: 'line', title: 'Est. VPOC', style: { color: SECONDARY, lineWidth: 1 } },
      { key: 'vvah', type: 'line', title: 'Est. VVAH', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'vval', type: 'line', title: 'Est. VVAL', style: { color: SECONDARY, lineWidth: 1, lineStyle: 'dashed' } },
      { key: 'rthOpen', type: 'line', title: 'RTH Open', style: { color: TEXT, lineWidth: 1 } },
      { key: 'rthClose', type: 'line', title: 'RTH Close', style: { color: NEUTRAL, lineWidth: 1, lineStyle: 'dotted' } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const out = {}
      for (const key of PLOT_KEYS) out[key] = new Array(n).fill(NaN)
      for (const key of STATE_KEYS) out[key] = new Array(n).fill(NaN)
      out.snap = new Array(n).fill(null)

      const finish = () => {
        const result = { snap: out.snap }
        for (const key of PLOT_KEYS) result[key] = nulls(out[key])
        for (const key of STATE_KEYS) result[key] = out[key]
        return result
      }

      const enabled = settings.indicatorEnabled !== false
      if (n === 0 || !enabled) return finish()

      /* A cleared number field arrives as '', and Number('') is 0, so a blank
       * falls back to the declared default rather than to a zero-width window. */
      const num = (key, fallback, min, max) => {
        const raw = settings[key]
        if (raw === '' || raw === null || raw === undefined) return fallback
        const v = Number(raw)
        if (!isF(v)) return fallback
        return Math.min(max, Math.max(min, v))
      }
      const int = (key, fallback, min, max) => Math.floor(num(key, fallback, min, max))
      const flag = (key, fallback) => (typeof settings[key] === 'boolean' ? settings[key] : fallback)

      const zoneRaw = String(settings.sessionTimezone ?? '').trim()
      const fallbackZone = isValidTimezone('America/New_York') ? 'America/New_York' : DEFAULT_TIMEZONE
      const zone = zoneRaw !== '' && isValidTimezone(zoneRaw) ? zoneRaw : fallbackZone

      const spec = parseSessionSpec(String(settings.rthSession ?? '').trim()) ??
        parseSessionSpec('0930-1600:23456')
      if (!spec) return finish()

      const openHour = int('rthOpenHour', 9, 0, 23)
      const openMinute = int('rthOpenMinute', 30, 0, 59)
      const blockMinutes = BLOCK_MINUTES[settings.blockSizeInput] ?? 30
      const blockSeconds = blockMinutes * 60
      const ibBlocks = int('initialBalanceBlocks', 2, 1, 12)
      const maxChartMinutes = int('maximumChartMinutes', 30, 1, 60)

      const rowMode = settings.rowSizeMode === 'Manual' ? 'Manual' : 'Auto'
      const manualTicks = int('manualTicksPerRow', 8, 1, 1000)
      const targetRows = int('automaticTargetRows', 70, 20, 150)
      const minAutoTicks = int('minimumAutomaticTicks', 1, 1, 100)
      const maxRenderedRows = int('maximumRenderedRows', 100, 30, 140)
      const maxRowsPerBlock = int('maximumRowsPerBlock', 250, 50, 1000)
      const vaPercent = num('valueAreaPercent', 70, 50, 95)

      const showCurrentProfile = flag('showCurrentProfile', true)
      const showPreviousProfile = flag('showPreviousProfile', true)
      const maxProfileWidthBars = int('maximumProfileWidthBars', 20, 6, 50)
      const showRowCounts = flag('showRowCounts', false)
      const showProfileNames = flag('showProfileNames', true)
      const showValueAreaShading = flag('showValueAreaShading', true)
      const showProfileMidpoint = flag('showProfileMidpoint', true)
      const profileTransparency = int('profileTransparency', 28, 0, 90)
      const previousProfileTransparency = int('previousProfileTransparency', 48, 0, 95)

      const showCurrentLevels = flag('showCurrentLevels', true)
      const extendPreviousLevels = flag('extendPreviousLevels', true)
      const showInitialBalance = flag('showInitialBalance', true)
      const showIbExtensions = flag('showIbExtensions', true)
      const firstIbExtension = num('firstIbExtension', 0.5, 0.1, 5)
      const secondIbExtension = num('secondIbExtension', 1, 0.1, 10)
      const showSessionOpenClose = flag('showSessionOpenClose', false)
      const acceptanceCloses = int('acceptanceCloses', 2, 1, 5)
      const showSinglePrintZones = flag('showSinglePrintZones', true)
      const showPoorHighLow = flag('showPoorHighLow', true)
      const maxSinglePrintZones = int('maximumSinglePrintZones', 12, 1, 30)

      const showEstimatedVolume = flag('showEstimatedVolume', false)
      const estimatedVolumeWidthBars = int('estimatedVolumeWidthBars', 12, 4, 30)
      const showEstimatedVolumeLevels = flag('showEstimatedVolumeLevels', true)
      const volumeVaPercent = num('estimatedVolumeValueArea', 70, 50, 95)

      const shapeCfg = {
        peakRatio: num('doublePeakMinimumRatio', 0.62, 0.30, 1),
        valleyRatio: num('doublePeakValleyRatio', 0.55, 0.10, 0.90),
        minSeparation: int('doublePeakMinimumSeparation', 5, 2, 30),
        skewThreshold: num('shapeSkewThreshold', 0.45, 0.10, 2),
        trendExtension: num('trendRangeExtension', 1.75, 1.1, 5),
      }
      const strongPocRows = num('strongPocMigrationRows', 2, 0.5, 10)

      /* syminfo.mintick. The host supplies it once the pane has a minMove; with
       * no minMove the scale infers precision from the range, so approximate a
       * tick at one basis point of price rather than asking the user for one. */
      let tick = Number(ctx?.tickSize)
      if (!isF(tick) || tick <= 0) {
        let reference = NaN
        for (let i = bars.length - 1; i >= 0 && !isF(reference); i--) {
          if (isF(bars[i].close) && Math.abs(bars[i].close) > 0) reference = Math.abs(bars[i].close)
        }
        tick = isF(reference) && reference > 0
          ? Math.max(1e-8, Math.pow(10, Math.floor(Math.log10(reference)) - 4))
          : 0.01
      }

      /* syminfo.root: only the two Nasdaq futures roots change the fallback row
       * size, and the host only knows a symbol when it has set a data context. */
      const root = String(ctx?.symbol ?? '').toUpperCase()
      const defaultRowTicks = root.startsWith('MNQ') || root.startsWith('NQ') ? 8 : 4

      const chooseTicks = (previousRange) => {
        const fallbackTicks = Math.max(defaultRowTicks, minAutoTicks)
        const autoTicks = isF(previousRange) && previousRange > tick
          ? Math.ceil(previousRange / tick / targetRows)
          : fallbackTicks
        return rowMode === 'Manual' ? manualTicks : Math.max(autoTicks, minAutoTicks)
      }

      /* timeframe.isintraday / timeframe.in_seconds(). */
      const barSeconds = medianBarSeconds(bars)
      let chartMinutes = 0
      let intraday = false
      const code = ctx?.interval
      if (code) {
        try {
          intraday = isIntradayInterval(code)
          const secs = intervalToSeconds(code)
          if (intraday && isF(secs) && secs > 0) chartMinutes = Math.round(secs / 60)
        } catch (e) {
          intraday = false
        }
      } else if (isF(barSeconds) && barSeconds > 0 && barSeconds < 86400) {
        intraday = true
        chartMinutes = Math.round(barSeconds / 60)
      }
      const supportedTimeframe = intraday && chartMinutes >= 1 &&
        chartMinutes <= maxChartMinutes && chartMinutes <= blockMinutes
      const chartWarning = !supportedTimeframe

      /* Session state, carried bar to bar exactly as the Pine `var`s are. */
      let curTpo = new Map()
      let prevTpo = new Map()
      let curVol = new Map()
      let prevVol = new Map()
      let curRowSize = NaN
      let prevRowSize = NaN
      let curMinRow = null
      let curMaxRow = null
      let prevMinRow = null
      let prevMaxRow = null
      let curHasData = false
      let prevHasData = false
      let curOverflow = false
      let prevOverflow = false
      let curStartIdx = null
      let curEndIdx = null
      let prevStartIdx = null
      let prevEndIdx = null
      let curOpen = NaN
      let curClose = NaN
      let curHigh = NaN
      let curLow = NaN
      let prevHigh = NaN
      let prevLow = NaN
      let curIbHigh = NaN
      let curIbLow = NaN
      let curRotation = 0
      let activeBlockId = -1
      let activeHigh = NaN
      let activeLow = NaN
      let lastBlockHigh = NaN
      let lastBlockLow = NaN
      let curBlocks = 0
      let pocState = 0
      let vahState = 0
      let valState = 0
      let prevStats = null
      let prevZones = []
      let prevStatsStale = true
      let curCache = null
      let volCache = null
      let shapeCache = null
      let inPrevBar = false
      let prevDateKey = null
      let snapshot = null

      /* math.sum(..., acceptanceCloses): a rolling window of 0/1 terms. */
      const windows = { poc: [], pocBelow: [], vah: [], val: [] }
      const push = (name, value) => {
        const w = windows[name]
        w.push(value)
        if (w.length > acceptanceCloses) w.shift()
        let total = 0
        for (const x of w) total += x
        return total
      }

      const commitBlock = () => {
        const lowRow = Math.floor(activeLow / curRowSize)
        const highRow = Math.floor(activeHigh / curRowSize)
        const added = addTpoBlock(curTpo, lowRow, highRow, curMinRow, curMaxRow, maxRowsPerBlock)
        curMinRow = added.min
        curMaxRow = added.max
        curOverflow = curOverflow || added.overflow
        if (isF(lastBlockHigh)) {
          curRotation += activeHigh > lastBlockHigh ? 1 : activeHigh < lastBlockHigh ? -1 : 0
          curRotation += activeLow > lastBlockLow ? 1 : activeLow < lastBlockLow ? -1 : 0
        }
        curBlocks += 1
        lastBlockHigh = activeHigh
        lastBlockLow = activeLow
      }

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const inRTH = inSessionAt(bar.time, spec, zone)
        const parts = utcSecondsToZonedParts(bar.time, zone)
        const dateKey = parts.year * 10000 + parts.month * 100 + parts.day
        const newRTH = inRTH && (i === 0 || !inPrevBar || dateKey !== prevDateKey)
        const endRTH = !inRTH && inPrevBar
        const rthStart = zonedWallClockToUtcSeconds(parts.year, parts.month, parts.day, openHour, openMinute, 0, zone)
        const blockId = inRTH ? Math.floor((bar.time - rthStart) / blockSeconds) : -1

        if (newRTH) {
          if (curHasData) {
            if (activeBlockId >= 0 && isF(activeHigh) && isF(activeLow) && isF(curRowSize)) commitBlock()
            curClose = i > 0 ? bars[i - 1].close : bar.close
            curEndIdx = i > 0 ? i - 1 : i

            prevTpo = new Map(curTpo)
            prevVol = new Map(curVol)
            prevRowSize = curRowSize
            prevMinRow = curMinRow
            prevMaxRow = curMaxRow
            prevStartIdx = curStartIdx
            prevEndIdx = curEndIdx
            prevHigh = curHigh
            prevLow = curLow
            prevOverflow = curOverflow
            prevHasData = curTpo.size > 0
            prevStatsStale = true
          }

          const previousRangeForSizing = prevHasData && isF(prevHigh) && isF(prevLow)
            ? prevHigh - prevLow
            : NaN
          curRowSize = chooseTicks(previousRangeForSizing) * tick
          curTpo = new Map()
          curVol = new Map()
          curMinRow = null
          curMaxRow = null
          curHasData = true
          curOverflow = false
          curStartIdx = i
          curEndIdx = null
          curOpen = bar.open
          curClose = NaN
          curHigh = bar.high
          curLow = bar.low
          curIbHigh = NaN
          curIbLow = NaN
          curRotation = 0
          curBlocks = 0
          activeBlockId = -1
          activeHigh = NaN
          activeLow = NaN
          lastBlockHigh = NaN
          lastBlockLow = NaN
          /* Pine clears the prior-level acceptance states on a new session. */
          pocState = 0
          vahState = 0
          valState = 0
        }

        if (inRTH && curHasData && isF(curRowSize) && curRowSize > 0) {
          curHigh = !isF(curHigh) ? bar.high : Math.max(curHigh, bar.high)
          curLow = !isF(curLow) ? bar.low : Math.min(curLow, bar.low)

          if (blockId >= 0 && blockId < ibBlocks) {
            curIbHigh = !isF(curIbHigh) ? bar.high : Math.max(curIbHigh, bar.high)
            curIbLow = !isF(curIbLow) ? bar.low : Math.min(curIbLow, bar.low)
          }

          if (activeBlockId < 0) {
            activeBlockId = blockId
            activeHigh = bar.high
            activeLow = bar.low
          } else if (blockId !== activeBlockId) {
            commitBlock()
            activeBlockId = blockId
            activeHigh = bar.high
            activeLow = bar.low
          } else {
            activeHigh = Math.max(activeHigh, bar.high)
            activeLow = Math.min(activeLow, bar.low)
          }

          /* Pine guards this with barstate.isconfirmed; every loaded bar is a
           * closed bar, so the historical branch is the one that applies. */
          if (showEstimatedVolume) {
            const barLowRow = Math.floor(bar.low / curRowSize)
            const barHighRow = Math.floor(bar.high / curRowSize)
            const overflow = addEstimatedVolume(curVol, barLowRow, barHighRow, bar.volume, maxRowsPerBlock)
            curOverflow = curOverflow || overflow
          }
        }

        if (endRTH && curHasData && activeBlockId >= 0 && isF(curRowSize) && curRowSize > 0) {
          commitBlock()
          curClose = i > 0 ? bars[i - 1].close : bar.close
          curEndIdx = i > 0 ? i - 1 : i
          activeBlockId = -1
          activeHigh = NaN
          activeLow = NaN
        }

        const aLow = inRTH && activeBlockId >= 0 && isF(activeLow) && isF(curRowSize) && curRowSize > 0
          ? Math.floor(activeLow / curRowSize)
          : null
        const aHigh = inRTH && activeBlockId >= 0 && isF(activeHigh) && isF(curRowSize) && curRowSize > 0
          ? Math.floor(activeHigh / curRowSize)
          : null
        const includeActive = inRTH && activeBlockId >= 0 && aLow !== null && aHigh !== null
        const dispMin = includeActive ? (curMinRow === null ? aLow : Math.min(curMinRow, aLow)) : curMinRow
        const dispMax = includeActive ? (curMaxRow === null ? aHigh : Math.max(curMaxRow, aHigh)) : curMaxRow

        /* Outside the session nothing about the current profile can move, so
         * the previous bar's statistics still stand. */
        const mutated = newRTH || endRTH || (inRTH && curHasData)
        if (mutated || curCache === null) {
          curCache = tpoStats(curTpo, dispMin, dispMax, curRowSize, includeActive, aLow, aHigh, vaPercent)
          volCache = null
          shapeCache = null
        }
        const cur = curCache
        if (prevStatsStale) {
          prevStats = tpoStats(prevTpo, prevMinRow, prevMaxRow, prevRowSize, false, null, null, vaPercent)
          prevZones = buildZones(prevTpo, prevMinRow, prevMaxRow, prevStats.valid)
          prevStatsStale = false
        }
        const prev = prevStats
        if (volCache === null) volCache = volumeStats(curVol, dispMin, dispMax, curRowSize, volumeVaPercent)
        const vol = volCache

        const ibRange = isF(curIbHigh) && isF(curIbLow) ? curIbHigh - curIbLow : NaN
        const profileRange = cur.valid ? cur.profileHigh - cur.profileLow : NaN
        if (shapeCache === null) {
          shapeCache = profileShape(curTpo, dispMin, dispMax, includeActive, aLow, aHigh,
            cur.pocRow, cur.skewness, profileRange, ibRange, shapeCfg)
        }
        const shapeOut = shapeCache

        const close = bar.close
        let valueRel = 0
        if (cur.valid && prev.valid) {
          if (cur.val > prev.vah) valueRel = 1
          else if (cur.vah < prev.val) valueRel = 2
          else if (cur.vah > prev.vah && cur.val > prev.val) valueRel = 3
          else if (cur.vah < prev.vah && cur.val < prev.val) valueRel = 4
          else if (cur.vah <= prev.vah && cur.val >= prev.val) valueRel = 5
          else if (cur.vah >= prev.vah && cur.val <= prev.val) valueRel = 6
          else valueRel = 7
        }

        const migrationRows = cur.valid && prev.valid
          ? (cur.poc - prev.poc) / Math.max(curRowSize, tick)
          : NaN
        let pocMig = 0
        if (isF(migrationRows)) {
          if (migrationRows >= strongPocRows) pocMig = 1
          else if (migrationRows > 0.5) pocMig = 2
          else if (migrationRows <= -strongPocRows) pocMig = 3
          else if (migrationRows < -0.5) pocMig = 4
          else pocMig = 5
        }

        let openLoc = 0
        if (prev.valid && isF(curOpen)) {
          if (curOpen > prev.profileHigh) openLoc = 1
          else if (curOpen > prev.vah) openLoc = 2
          else if (curOpen >= prev.val) openLoc = 3
          else if (curOpen >= prev.profileLow) openLoc = 4
          else openLoc = 5
        }

        let curLoc = 0
        if (cur.valid) {
          if (close > cur.profileHigh) curLoc = 1
          else if (close > cur.vah) curLoc = 2
          else if (Math.abs(close - cur.poc) <= curRowSize) curLoc = 3
          else if (close >= cur.val) curLoc = 4
          else if (close >= cur.profileLow) curLoc = 5
          else curLoc = 6
        }

        const upwardValue = valueRel === 1 || valueRel === 3
        const downwardValue = valueRel === 2 || valueRel === 4
        const pocUp = pocMig === 1 || pocMig === 2
        const pocDown = pocMig === 3 || pocMig === 4
        const aboveIb = isF(curIbHigh) && close > curIbHigh
        const belowIb = isF(curIbLow) && close < curIbLow
        const returnedInsidePriorValue = prev.valid && close <= prev.vah && close >= prev.val
        const openedAbovePriorValue = prev.valid && curOpen > prev.vah
        const openedBelowPriorValue = prev.valid && curOpen < prev.val

        let participant = 0
        if (shapeOut.shapeCode === 1 && curLoc === 4) participant = 1
        else if (openedAbovePriorValue && returnedInsidePriorValue) participant = 2
        else if (openedBelowPriorValue && returnedInsidePriorValue) participant = 3
        else if (upwardValue && pocUp && (aboveIb || close > cur.vah)) participant = 4
        else if (downwardValue && pocDown && (belowIb || close < cur.val)) participant = 5

        let auctionCode = 0
        if (shapeOut.doubleDistribution) auctionCode = 4
        else if (openedAbovePriorValue && returnedInsidePriorValue && !pocUp) auctionCode = -3
        else if (openedBelowPriorValue && returnedInsidePriorValue && !pocDown) auctionCode = 3
        else if (shapeOut.shapeCode === 5 && upwardValue && pocUp) auctionCode = 2
        else if (shapeOut.shapeCode === 5 && downwardValue && pocDown) auctionCode = -2
        else if (upwardValue && pocUp && close >= cur.poc) auctionCode = 1
        else if (downwardValue && pocDown && close <= cur.poc) auctionCode = -1
        else if (shapeOut.shapeCode === 1 && curLoc === 4) auctionCode = 5
        else if (cur.valid && close >= cur.val && close <= cur.vah) auctionCode = 6

        const pocTouched = inRTH && prev.valid && bar.high >= prev.poc && bar.low <= prev.poc
        const vahTouched = inRTH && prev.valid && bar.high >= prev.vah && bar.low <= prev.vah
        const valTouched = inRTH && prev.valid && bar.high >= prev.val && bar.low <= prev.val

        const closesAbovePocCount = push('poc', prev.valid && close > prev.poc ? 1 : 0)
        const closesBelowPocCount = push('pocBelow', prev.valid && close < prev.poc ? 1 : 0)
        const closesAboveVahCount = push('vah', prev.valid && close > prev.vah ? 1 : 0)
        const closesBelowValCount = push('val', prev.valid && close < prev.val ? 1 : 0)
        const closesAbovePoc = prev.valid && closesAbovePocCount >= acceptanceCloses
        const closesBelowPoc = prev.valid && closesBelowPocCount >= acceptanceCloses
        const closesAboveVah = prev.valid && closesAboveVahCount >= acceptanceCloses
        const closesBelowVal = prev.valid && closesBelowValCount >= acceptanceCloses

        if (inRTH && prev.valid) {
          if (closesAbovePoc) pocState = 1
          else if (closesBelowPoc) pocState = -1
          else if (pocTouched) pocState = close >= prev.poc ? 2 : -2

          if (closesAboveVah) vahState = 1
          else if (vahTouched && close < prev.vah) vahState = -2

          if (closesBelowVal) valState = -1
          else if (valTouched && close > prev.val) valState = 2
        }

        const poorHighRepaired = inRTH && prev.valid && prev.poorHigh && bar.high > prev.profileHigh
        const poorLowRepaired = inRTH && prev.valid && prev.poorLow && bar.low < prev.profileLow

        let singleOverlap = false
        if (inRTH && prev.valid && prevZones.length > 0 && isF(prevRowSize)) {
          for (const [startRow, endRow] of prevZones) {
            const zoneLow = rowLow(startRow, prevRowSize)
            const zoneHigh = rowHigh(endRow, prevRowSize)
            if (bar.high >= zoneLow && bar.low <= zoneHigh) {
              singleOverlap = true
              break
            }
          }
        }

        /* Levels. Each column carries the same enable test the Pine line does. */
        if (showCurrentLevels && cur.valid) {
          out.poc[i] = cur.poc
          out.vah[i] = cur.vah
          out.val[i] = cur.val
        }
        if (showProfileMidpoint && cur.valid) out.mid[i] = cur.profileMid
        if (showInitialBalance && isF(curIbHigh)) out.ibh[i] = curIbHigh
        if (showInitialBalance && isF(curIbLow)) out.ibl[i] = curIbLow
        if (showIbExtensions && isF(ibRange)) {
          out.ibUp1[i] = curIbHigh + ibRange * firstIbExtension
          out.ibDn1[i] = curIbLow - ibRange * firstIbExtension
          out.ibUp2[i] = curIbHigh + ibRange * secondIbExtension
          out.ibDn2[i] = curIbLow - ibRange * secondIbExtension
        }
        if (extendPreviousLevels && prev.valid) {
          out.prevPoc[i] = prev.poc
          out.prevVah[i] = prev.vah
          out.prevVal[i] = prev.val
        }
        if (showPoorHighLow && prev.valid && prev.poorHigh) out.poorHigh[i] = prev.profileHigh
        if (showPoorHighLow && prev.valid && prev.poorLow) out.poorLow[i] = prev.profileLow
        if (showEstimatedVolume && showEstimatedVolumeLevels && vol.valid) {
          out.vpoc[i] = vol.poc
          out.vvah[i] = vol.vah
          out.vval[i] = vol.val
        }
        if (showSessionOpenClose && isF(curOpen)) out.rthOpen[i] = curOpen
        const liveClose = inRTH ? close : curClose
        if (showSessionOpenClose && isF(liveClose)) out.rthClose[i] = liveClose

        /* Reading columns for the dashboard and the alerts. */
        let ibStateCode = 0
        if (cur.valid && isF(curIbHigh) && isF(curIbLow)) {
          ibStateCode = close > curIbHigh ? 1 : close < curIbLow ? 2 : 3
        }
        let structureCode = 0
        if (cur.valid) {
          if (cur.poorHigh && cur.poorLow) structureCode = 1
          else if (cur.poorHigh) structureCode = 2
          else if (cur.poorLow) structureCode = 3
          else if (cur.singleRows > 0) structureCode = 4
          else structureCode = 5
        }

        out.auction[i] = auctionCode
        out.shape[i] = shapeOut.shapeCode
        out.valueRel[i] = valueRel
        out.pocMig[i] = pocMig
        out.openLoc[i] = openLoc
        out.curLoc[i] = curLoc
        out.participant[i] = participant
        out.structure[i] = structureCode
        out.ibState[i] = ibStateCode
        out.rotation[i] = curRotation
        out.skew[i] = isF(cur.skewness) ? cur.skewness : NaN
        out.totalTpo[i] = cur.totalTpo
        out.singles[i] = cur.singleRows
        out.tpoAbove[i] = cur.tpoAbove
        out.tpoBelow[i] = cur.tpoBelow
        out.vaWidth[i] = cur.valid && isF(cur.vah) && isF(cur.val) ? cur.vah - cur.val : NaN
        out.curValid[i] = cur.valid ? 1 : 0
        out.prevValid[i] = prev.valid ? 1 : 0
        out.curPoorHigh[i] = cur.poorHigh ? 1 : 0
        out.curPoorLow[i] = cur.poorLow ? 1 : 0
        out.prevPocState[i] = pocState
        out.prevVahState[i] = vahState
        out.prevValState[i] = valState
        out.prevPocTouch[i] = pocTouched ? 1 : 0
        out.prevVahTouch[i] = vahTouched ? 1 : 0
        out.prevValTouch[i] = valTouched ? 1 : 0
        out.singleOverlap[i] = singleOverlap ? 1 : 0
        out.poorHighFix[i] = poorHighRepaired ? 1 : 0
        out.poorLowFix[i] = poorLowRepaired ? 1 : 0
        out.inRth[i] = inRTH ? 1 : 0
        out.rowTicks[i] = isF(curRowSize) && tick > 0 ? Math.round(curRowSize / tick) : NaN
        out.warn[i] = chartWarning ? 1 : curOverflow || prevOverflow ? 2 : 0
        out.openPrice[i] = isF(curOpen) ? curOpen : NaN
        out.tick[i] = tick

        /* The drawing layer needs whole profiles, not one value per bar, so the
         * last bar carries a snapshot of them. Pine draws the same thing under
         * `barstate.islast`. */
        if (i === n - 1) {
          const rowsOf = (m, minRow, maxRow, active, lo, hi) => {
            if (minRow === null || maxRow === null || maxRow < minRow) return []
            const counts = []
            for (let row = minRow; row <= maxRow; row++) counts.push(tpoCount(m, row, active, lo, hi))
            return counts
          }
          const volumesOf = (m, minRow, maxRow) => {
            if (minRow === null || maxRow === null || maxRow < minRow) return []
            const vals = []
            for (let row = minRow; row <= maxRow; row++) vals.push(mapGet(m, row))
            return vals
          }
          const width = isF(barSeconds) && barSeconds > 0 ? barSeconds : 60
          snapshot = {
            barSeconds: width,
            lastTime: bar.time,
            maxRenderedRows,
            maxProfileWidthBars,
            estimatedVolumeWidthBars,
            profileTransparency,
            previousProfileTransparency,
            showValueAreaShading,
            showRowCounts,
            showProfileNames,
            current: showCurrentProfile && cur.valid ? {
              startTime: bars[curStartIdx === null ? i : curStartIdx].time,
              rowSize: curRowSize,
              minRow: dispMin,
              maxRow: dispMax,
              counts: rowsOf(curTpo, dispMin, dispMax, includeActive, aLow, aHigh),
              pocRow: cur.pocRow,
              vahRow: cur.vahRow,
              valRow: cur.valRow,
              profileHigh: cur.profileHigh,
            } : null,
            previous: showPreviousProfile && prev.valid ? {
              startTime: bars[prevStartIdx === null ? i : prevStartIdx].time,
              rowSize: prevRowSize,
              minRow: prevMinRow,
              maxRow: prevMaxRow,
              counts: rowsOf(prevTpo, prevMinRow, prevMaxRow, false, null, null),
              pocRow: prev.pocRow,
              vahRow: prev.vahRow,
              valRow: prev.valRow,
              profileHigh: prev.profileHigh,
            } : null,
            volume: showEstimatedVolume && vol.valid && cur.valid ? {
              startTime: bars[curStartIdx === null ? i : curStartIdx].time,
              rowSize: curRowSize,
              minRow: dispMin,
              maxRow: dispMax,
              volumes: volumesOf(curVol, dispMin, dispMax),
              pocRow: vol.pocRow,
              vahRow: vol.vahRow,
              valRow: vol.valRow,
              profileHigh: cur.profileHigh,
            } : null,
            zones: showSinglePrintZones && prev.valid && inRTH && isF(prevRowSize)
              ? prevZones.slice(0, maxSinglePrintZones).map(([startRow, endRow]) => {
                const zoneLow = rowLow(startRow, prevRowSize)
                const zoneHigh = rowHigh(endRow, prevRowSize)
                return {
                  low: zoneLow,
                  high: zoneHigh,
                  touched: curHigh >= zoneLow && curLow <= zoneHigh,
                  repaired: curHigh >= zoneHigh && curLow <= zoneLow,
                  from: bars[prevEndIdx === null ? Math.max(0, i - 1) : prevEndIdx].time,
                }
              })
              : [],
          }
        }

        inPrevBar = inRTH
        prevDateKey = dateKey
      }

      out.snap[n - 1] = snapshot
      return finish()
    },

    draws({ bars, values, settings }) {
      if (bars.length === 0) return []
      if (settings.indicatorEnabled === false) return []
      const snap = values.snap?.[bars.length - 1]
      if (!snap) return []
      const items = []

      /* Pine's grouping pass: rows are folded into strides so a dense profile
       * still renders inside the drawing budget, and each group's box is as
       * wide as its busiest row relative to the busiest group. */
      const groups = (minRow, maxRow, valueAt) => {
        const rows = maxRow - minRow + 1
        const stride = Math.max(1, Math.ceil(rows / snap.maxRenderedRows))
        const count = Math.ceil(rows / stride)
        const built = []
        for (let g = 0; g < count; g++) {
          const lowRow = minRow + g * stride
          const highRow = Math.min(lowRow + stride - 1, maxRow)
          built.push({ lowRow, highRow, value: valueAt(lowRow, highRow) })
        }
        return built
      }

      const box = (left, right, top, bottom, base, fillTransparency, borderTransparency) => {
        const fillAlpha = Math.max(0, 1 - fillTransparency / 100)
        const borderAlpha = Math.max(0, 1 - borderTransparency / 100)
        items.push({
          kind: 'box',
          from: { time: left, price: top },
          to: { time: right, price: bottom },
          color: withAlpha(base, borderAlpha),
          fillColor: base,
          opacity: fillAlpha,
        })
      }

      /* Current TPO profile. Pine offsets it past the newest bar, which a
       * time anchor cannot reach, so it is drawn from its own session start. */
      const cur = snap.current
      if (cur) {
        const counts = cur.counts
        const at = (row) => counts[row - cur.minRow] ?? 0
        const built = groups(cur.minRow, cur.maxRow, (lowRow, highRow) => {
          let groupMaximum = 0
          let single = false
          for (let row = lowRow; row <= highRow; row++) {
            const c = at(row)
            groupMaximum = Math.max(groupMaximum, c)
            single = single || (row > cur.minRow && row < cur.maxRow && c === 1)
          }
          return { groupMaximum, single }
        })
        let groupedMax = 1
        for (const g of built) groupedMax = Math.max(groupedMax, g.value.groupMaximum)

        for (const g of built) {
          const width = Math.max(1, Math.round((g.value.groupMaximum / Math.max(groupedMax, 1)) * snap.maxProfileWidthBars))
          const isValue = cur.valRow !== null && cur.vahRow !== null &&
            g.highRow >= cur.valRow && g.lowRow <= cur.vahRow
          const isPoc = cur.pocRow !== null && g.highRow >= cur.pocRow && g.lowRow <= cur.pocRow
          const base = isPoc ? POC_COLOR
            : g.value.single ? SINGLE_PRINT
              : isValue && snap.showValueAreaShading ? VALUE_AREA : OUTSIDE_VALUE
          const transparency = isPoc ? Math.max(snap.profileTransparency - 12, 0) : snap.profileTransparency
          const left = cur.startTime
          const right = cur.startTime + width * snap.barSeconds
          const top = (g.highRow + 1) * cur.rowSize
          const bottom = g.lowRow * cur.rowSize
          box(left, right, top, bottom, base, transparency, Math.min(transparency + 10, 100))
          if (snap.showRowCounts) {
            items.push({
              kind: 'label',
              at: { time: right + snap.barSeconds, price: (top + bottom) * 0.5 },
              text: String(g.value.groupMaximum),
              color: withAlpha(TEXT, 0.88),
            })
          }
        }
      }

      const prev = snap.previous
      if (prev) {
        const counts = prev.counts
        const at = (row) => counts[row - prev.minRow] ?? 0
        const built = groups(prev.minRow, prev.maxRow, (lowRow, highRow) => {
          let groupMaximum = 0
          let single = false
          for (let row = lowRow; row <= highRow; row++) {
            const c = at(row)
            groupMaximum = Math.max(groupMaximum, c)
            single = single || (row > prev.minRow && row < prev.maxRow && c === 1)
          }
          return { groupMaximum, single }
        })
        let groupedMax = 1
        for (const g of built) groupedMax = Math.max(groupedMax, g.value.groupMaximum)

        for (const g of built) {
          const width = Math.max(1, Math.round((g.value.groupMaximum / Math.max(groupedMax, 1)) * snap.maxProfileWidthBars))
          const isValue = prev.valRow !== null && prev.vahRow !== null &&
            g.highRow >= prev.valRow && g.lowRow <= prev.vahRow
          const isPoc = prev.pocRow !== null && g.highRow >= prev.pocRow && g.lowRow <= prev.pocRow
          const base = isPoc ? POC_COLOR
            : g.value.single ? SINGLE_PRINT
              : isValue && snap.showValueAreaShading ? PREV_VALUE : PREV_OUTSIDE
          box(
            prev.startTime,
            prev.startTime + width * snap.barSeconds,
            (g.highRow + 1) * prev.rowSize,
            g.lowRow * prev.rowSize,
            base,
            snap.previousProfileTransparency,
            Math.min(snap.previousProfileTransparency + 10, 100),
          )
        }
      }

      const vol = snap.volume
      if (vol) {
        const at = (row) => vol.volumes[row - vol.minRow] ?? 0
        const built = groups(vol.minRow, vol.maxRow, (lowRow, highRow) => {
          let total = 0
          for (let row = lowRow; row <= highRow; row++) total += at(row)
          return total
        })
        let groupedMax = 1
        for (const g of built) groupedMax = Math.max(groupedMax, g.value)
        const left = vol.startTime + (snap.maxProfileWidthBars + 1) * snap.barSeconds
        for (const g of built) {
          const width = Math.max(1, Math.round((g.value / groupedMax) * snap.estimatedVolumeWidthBars))
          const isValue = vol.valRow !== null && vol.vahRow !== null &&
            g.highRow >= vol.valRow && g.lowRow <= vol.vahRow
          const isPoc = vol.pocRow !== null && g.highRow >= vol.pocRow && g.lowRow <= vol.pocRow
          const base = isPoc ? POC_COLOR : isValue ? SECONDARY : NEUTRAL
          box(
            left,
            left + width * snap.barSeconds,
            (g.highRow + 1) * vol.rowSize,
            g.lowRow * vol.rowSize,
            base,
            isPoc ? 24 : 56,
            65,
          )
        }
      }

      if (snap.showProfileNames) {
        if (cur) {
          items.push({
            kind: 'label',
            at: { time: cur.startTime, price: cur.profileHigh + cur.rowSize },
            text: 'CURRENT TPO',
            color: withAlpha(ACCENT, 0.32),
          })
        }
        if (prev) {
          items.push({
            kind: 'label',
            at: { time: prev.startTime, price: prev.profileHigh + prev.rowSize },
            text: 'PREVIOUS TPO',
            color: withAlpha(PREV_VALUE, 0.34),
          })
        }
        if (vol) {
          items.push({
            kind: 'label',
            at: {
              time: vol.startTime + (snap.maxProfileWidthBars + 1) * snap.barSeconds,
              price: vol.profileHigh + vol.rowSize,
            },
            text: 'EST. VOLUME',
            color: withAlpha(SECONDARY, 0.32),
          })
        }
      }

      for (const zone of snap.zones) {
        const base = zone.repaired ? NEUTRAL : zone.touched ? POOR : SINGLE_PRINT
        const transparency = zone.repaired ? 92 : zone.touched ? 86 : 78
        box(zone.from, snap.lastTime, zone.high, zone.low, base, transparency, 42)
      }

      return items
    },

    table({ bars, values, settings }) {
      if (settings.indicatorEnabled === false || settings.showDashboard === false) return null
      if (bars.length === 0) return null
      const i = bars.length - 1
      const read = (key) => {
        const v = values[key]?.[i]
        return Number.isFinite(v) ? v : null
      }
      const tick = read('tick') ?? 0.01
      const dp = tick > 0 ? precisionForStep(tick) : 2
      const price = (v) => (v === null ? '-' : v.toFixed(dp))
      const fixed = (v, places) => (v === null ? '-' : v.toFixed(places))

      const auction = AUCTION[String(read('auction') ?? 0)] ?? 'Transition'
      const shape = SHAPE[String(read('shape') ?? -1)] ?? 'Developing'
      const valueRel = VALUE_RELATION[read('valueRel') ?? 0]
      const pocMig = POC_MIGRATION[read('pocMig') ?? 0]
      const openLoc = OPEN_LOCATION[read('openLoc') ?? 0]
      const curLoc = CURRENT_LOCATION[read('curLoc') ?? 0]
      const participant = PARTICIPANT[read('participant') ?? 0]
      const ibState = IB_STATE[read('ibState') ?? 0]
      const structureCode = read('structure') ?? 0
      const singles = read('singles') ?? 0
      const structure = structureCode === 4 ? `${singles} Single Rows` : STRUCTURE[structureCode]

      const poorHigh = read('curPoorHigh') === 1
      const poorLow = read('curPoorLow') === 1
      const auctionCode = read('auction') ?? 0
      const upward = [1, 3].includes(read('valueRel')) || [1, 2].includes(read('pocMig'))
      const downward = [2, 4].includes(read('valueRel')) || [3, 4].includes(read('pocMig'))

      const auctionColor = auctionCode === 1 || auctionCode === 2 || auctionCode === 3 ? BULLISH
        : auctionCode === -1 || auctionCode === -2 || auctionCode === -3 ? BEARISH
          : auctionCode === 4 ? ACCENT
            : auctionCode === 5 || auctionCode === 6 ? SECONDARY : NEUTRAL
      const migrationColor = upward ? BULLISH : downward ? BEARISH : NEUTRAL
      const locationColor = curLoc === 'Above Value' ? BULLISH : curLoc === 'Below Value' ? BEARISH : NEUTRAL

      const warn = read('warn') ?? 0
      const rowTicks = read('rowTicks')
      const layoutTag = settings.dashboardWithFuturesLevels === false ? 'Standalone' : 'Stacked'
      const footer = warn === 1
        ? 'Use standard intraday candles with a chart timeframe at or below the TPO block size'
        : warn === 2
          ? 'Row-density warning - increase ticks per row'
          : `RTH - ${settings.blockSizeInput ?? '30 Minutes'} - ${rowTicks === null ? '-' : rowTicks} ticks/row - ${layoutTag}`

      const fontSize = TABLE_FONT[settings.dashboardTextSize] ?? 11
      const cell = (text, bg, align = 'left', bold = false) => ({
        text,
        bgColor: bg,
        textColor: TEXT,
        align,
        bold,
      })

      /* Pine builds 3 to 4 stacked lines inside one merged cell. A chart table
       * cell draws a single line, so each card becomes four rows carrying the
       * same tint, and the row weights keep the card its original height. */
      const cardLines = (title, lines, tintColor) => {
        const tint = withAlpha(tintColor, 0.22)
        const rows = [cell(title, tint, 'left', true)]
        for (let k = 0; k < 3; k++) rows.push(cell(lines[k] ?? '', tint))
        return rows
      }

      const left = [
        cardLines('AUCTION', [auction, participant], auctionColor),
        cardLines('PROFILE SHAPE', [shape, `Skew ${fixed(read('skew'), 2)} - RF ${fixed(read('rotation'), 1)}`], ACCENT),
        cardLines('OPEN', [openLoc, `Open ${price(read('openPrice'))}`], SECONDARY),
      ]
      const right = [
        cardLines('VALUE', [valueRel, `${pocMig} POC`, `VA ${price(read('vaWidth'))}`], migrationColor),
        cardLines('STRUCTURE', [structure, `Singles ${singles} - TPO ${read('totalTpo') ?? 0}`],
          poorHigh || poorLow ? POOR : SINGLE_PRINT),
        cardLines('LOCATION', [curLoc, ibState,
          `Above/Below POC ${read('tpoAbove') ?? 0}/${read('tpoBelow') ?? 0}`], locationColor),
      ]

      const headerTint = withAlpha(ACCENT, 0.32)
      const footerTint = withAlpha(PANEL, 0.86)
      const rows = [[cell('MERIDIAN - FUTURES PROFILE', headerTint, 'center', true), cell('', headerTint)]]
      for (let card = 0; card < 3; card++) {
        for (let line = 0; line < 4; line++) rows.push([left[card][line], right[card][line]])
      }
      const footerColor = warn === 0 ? withAlpha(TEXT, 0.75) : POOR
      rows.push([
        { text: footer, bgColor: footerTint, textColor: footerColor, align: 'center' },
        { text: '', bgColor: footerTint },
      ])

      const columnWidth = Math.min(20, Math.max(8, Math.floor(Number(settings.dashboardColumnWidth)) || 11))
      const headerHeight = Math.min(10, Math.max(2, Math.floor(Number(settings.dashboardHeaderHeight)) || 4))
      const cardHeight = Math.min(14, Math.max(4, Math.floor(Number(settings.dashboardCardHeight)) || 7))
      const footerHeight = Math.min(6, Math.max(1, Math.floor(Number(settings.dashboardFooterHeight)) || 2))
      const lineWeight = cardHeight / 4
      const weights = [headerHeight]
      for (let k = 0; k < 12; k++) weights.push(lineWeight)
      weights.push(footerHeight)

      const position = settings.dashboardWithFuturesLevels === false
        ? TABLE_POSITION[settings.dashboardPosition] ?? 'top-right'
        : 'top-right'

      return {
        rows,
        options: {
          position,
          fontSize,
          widthPercent: columnWidth * 2,
          heightPercent: headerHeight + cardHeight * 3 + footerHeight,
          rowWeights: weights,
          background: withAlpha(PANEL, 0.92),
          borderColor: withAlpha(NEUTRAL, 0.18),
          borderWidth: 1,
        },
      }
    },

    alerts: [
      {
        id: 'prev-poc-test',
        title: 'Meridian - Previous TPO POC tested',
        message: 'Meridian Futures Profile: price tested the previous completed RTH TPO POC.',
        when: ({ values, settings, index }) =>
          settings.alertPreviousLevels !== false && rose(values, 'prevPocTouch', index),
      },
      {
        id: 'prev-vah-test',
        title: 'Meridian - Previous TPO VAH tested',
        message: 'Meridian Futures Profile: price tested the previous completed RTH TPO VAH.',
        when: ({ values, settings, index }) =>
          settings.alertPreviousLevels !== false && rose(values, 'prevVahTouch', index),
      },
      {
        id: 'prev-val-test',
        title: 'Meridian - Previous TPO VAL tested',
        message: 'Meridian Futures Profile: price tested the previous completed RTH TPO VAL.',
        when: ({ values, settings, index }) =>
          settings.alertPreviousLevels !== false && rose(values, 'prevValTouch', index),
      },
      {
        id: 'single-print-test',
        title: 'Meridian - Previous single-print zone tested',
        message: 'Meridian Futures Profile: price entered a previous completed RTH single-print zone.',
        when: ({ values, settings, index }) =>
          settings.alertSinglePrints !== false && rose(values, 'singleOverlap', index),
      },
      {
        id: 'poor-high-repair',
        title: 'Meridian - Poor high repaired',
        message: 'Meridian Futures Profile: price traded above the previous poor high.',
        when: ({ values, settings, index }) =>
          settings.alertPoorHighLow !== false && rose(values, 'poorHighFix', index),
      },
      {
        id: 'poor-low-repair',
        title: 'Meridian - Poor low repaired',
        message: 'Meridian Futures Profile: price traded below the previous poor low.',
        when: ({ values, settings, index }) =>
          settings.alertPoorHighLow !== false && rose(values, 'poorLowFix', index),
      },
      {
        id: 'auction-state-change',
        title: 'Meridian - Auction state changed',
        message: 'Meridian Futures Profile: the confirmed Auction Market Theory state changed.',
        when: ({ values, settings, index }) => {
          if (settings.alertAuctionChanges === false) return false
          if (index < 1) return false
          if (values.inRth?.[index] !== 1) return false
          const now = values.auction?.[index]
          const before = values.auction?.[index - 1]
          return Number.isFinite(now) && Number.isFinite(before) && now !== before
        },
      },
    ],
  })

  /* A 0-to-1 edge on a flag column. Guarded at index 0, because in JavaScript a
   * comparison against a missing value is not automatically false. */
  function rose(values, key, index) {
    if (index < 1) return false
    const col = values[key]
    if (!col) return false
    return col[index] === 1 && col[index - 1] !== 1
  }
}
