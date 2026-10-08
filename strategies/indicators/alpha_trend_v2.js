/**
 * Alpha Trend Version 2
 *
 * Implements KivancOzbilgic's AlphaTrend running on Pure Renko Version 2 internal engine:
 * 1. Internal Renko V2 state machine constructs synthetic Renko bricks (Percentage %, Points, or dynamic ATR)
 * 2. AlphaTrend is calculated directly on the Renko series (renkoHigh, renkoLow, renkoClose, renkoTr, renkoATR, renkoMFI/RSI)
 * 3. AlphaTrend line & AlphaTrend Lag line (2 periods delayed) are plotted with ribbon fill
 * 4. BUY & SELL signals match AlphaTrend crossover/crossunder with Kivanc's O1 > K2 & O2 > K1 state filters
 * 5. Markers use tiny labels with text "BUY" and "SELL" at AlphaTrend[2] levels (exact original colors: #0022FC blue & #880e4f maroon)
 * 6. Includes optional Renko step trailing line
 *
 * Author: KivancOzbilgic / Adapted for OpenAlgo Pure Renko V2
 */

export default function ({ registerIndicator, sourceValues, sma, rsi, nulls }) {
  // Helper to calculate True Range on Renko series
  function calcRenkoTR(renkoBars) {
    const n = renkoBars.length
    const tr = new Array(n).fill(0)
    if (n === 0) return tr
    tr[0] = renkoBars[0].high - renkoBars[0].low
    for (let i = 1; i < n; i++) {
      const h = renkoBars[i].high
      const l = renkoBars[i].low
      const pc = renkoBars[i - 1].close
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    }
    return tr
  }

  // Calculate True Range on raw candle bars (for Renko ATR mode)
  function calcRawTR(bars) {
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

  // Money Flow Index (MFI) calculated on Renko HLC3 and bar volume
  function calcMFI(renkoBars, bars, period) {
    const n = renkoBars.length
    const mfi = new Array(n).fill(null)
    if (period <= 0 || n < period) return mfi

    const posFlow = new Array(n).fill(0)
    const negFlow = new Array(n).fill(0)

    for (let i = 1; i < n; i++) {
      const prevHLC = (renkoBars[i - 1].high + renkoBars[i - 1].low + renkoBars[i - 1].close) / 3.0
      const currHLC = (renkoBars[i].high + renkoBars[i].low + renkoBars[i].close) / 3.0
      const vol = bars[i].volume || 1
      const moneyFlow = currHLC * vol

      if (currHLC > prevHLC) {
        posFlow[i] = moneyFlow
      } else if (currHLC < prevHLC) {
        negFlow[i] = moneyFlow
      }
    }

    let posSum = 0
    let negSum = 0
    for (let i = 1; i <= period && i < n; i++) {
      posSum += posFlow[i]
      negSum += negFlow[i]
    }

    if (period < n) {
      mfi[period] = negSum === 0 ? 100 : 100 - 100 / (1 + posSum / negSum)
    }

    for (let i = period + 1; i < n; i++) {
      posSum += posFlow[i] - posFlow[i - period]
      negSum += negFlow[i] - negFlow[i - period]
      mfi[i] = negSum === 0 ? 100 : 100 - 100 / (1 + posSum / negSum)
    }

    return mfi
  }

  // Calculate Renko Brick Size
  function getBrickSize(refPrice, calcMode, pctSize, ptsSize, renkoAtrVal) {
    let b = 0.0
    if (calcMode === 'Percentage (%)') {
      b = refPrice * (pctSize / 100.0)
    } else if (calcMode === 'Points') {
      b = ptsSize
    } else if (calcMode === 'ATR') {
      b = Number.isFinite(renkoAtrVal) && renkoAtrVal > 0 ? renkoAtrVal : ptsSize
    }
    return Math.max(b, 0.05)
  }

  // Pine Script ta.barssince helper
  function computeBarsSince(conditionArr) {
    const n = conditionArr.length
    const result = new Array(n).fill(1e9)
    let count = 1e9
    for (let i = 0; i < n; i++) {
      if (conditionArr[i]) {
        count = 0
      } else {
        count++
      }
      result[i] = count
    }
    return result
  }

  registerIndicator({
    id: 'oa-alpha-trend-v2',
    name: 'Alpha Trend Version 2',
    category: 'Trend',
    placement: 'onchart',
    inputs: [
      {
        key: 'calcMode',
        type: 'select',
        label: 'Brick Sizing Mode',
        default: 'Percentage (%)',
        options: [
          { label: 'Percentage (%)', value: 'Percentage (%)' },
          { label: 'Points', value: 'Points' },
          { label: 'ATR', value: 'ATR' },
        ],
        group: '1. Renko V2 Brick Sizing',
        tooltip: 'Percentage (0.04% for Indices), fixed Points, or dynamic ATR.',
      },
      {
        key: 'pctSize',
        type: 'number',
        label: 'Brick Size in %',
        default: 0.04,
        min: 0.0001,
        step: 0.01,
        group: '1. Renko V2 Brick Sizing',
        tooltip: '0.04% for Nifty (~10 pts) / SENSEX (~32.4 pts).',
      },
      {
        key: 'ptsSize',
        type: 'number',
        label: 'Brick Size in Points',
        default: 10.0,
        min: 0.00001,
        step: 0.5,
        group: '1. Renko V2 Brick Sizing',
      },
      {
        key: 'renkoAtrPer',
        type: 'number',
        label: 'Renko ATR Period',
        default: 14,
        min: 1,
        max: 500,
        step: 1,
        group: '1. Renko V2 Brick Sizing',
      },
      {
        key: 'renkoAtrMult',
        type: 'number',
        label: 'Renko ATR Multiplier',
        default: 1.0,
        min: 0.1,
        max: 20,
        step: 0.1,
        group: '1. Renko V2 Brick Sizing',
      },
      {
        key: 'priceSource',
        type: 'select',
        label: 'Renko Price Source',
        default: 'Close',
        options: [
          { label: 'Close', value: 'Close' },
          { label: 'High/Low', value: 'High/Low' },
        ],
        group: '1. Renko V2 Brick Sizing',
        tooltip: 'Close: zero repaint. High/Low: evaluates candle wicks for breakout triggers.',
      },
      {
        key: 'coeff',
        type: 'number',
        label: 'AlphaTrend Multiplier',
        default: 1.0,
        min: 0.1,
        max: 20,
        step: 0.1,
        group: '2. AlphaTrend Parameters',
      },
      {
        key: 'AP',
        type: 'number',
        label: 'Common Period',
        default: 14,
        min: 1,
        max: 500,
        step: 1,
        group: '2. AlphaTrend Parameters',
      },
      {
        key: 'showsignalsk',
        type: 'boolean',
        label: 'Show Buy / Sell Signals?',
        default: true,
        group: '2. AlphaTrend Parameters',
      },
      {
        key: 'novolumedata',
        type: 'boolean',
        label: 'No Volume Data (Use RSI instead of MFI)?',
        default: false,
        group: '2. AlphaTrend Parameters',
      },
      {
        key: 'showRenkoStep',
        type: 'boolean',
        label: 'Show Renko Trailing Line?',
        default: true,
        group: '2. AlphaTrend Parameters',
      },
      {
        key: 'color',
        type: 'color',
        label: 'AlphaTrend Line',
        default: '#0022fc',
        group: '3. Visual Styling',
      },
      {
        key: 'lagColor',
        type: 'color',
        label: 'AlphaTrend Lag (2)',
        default: '#fc0400',
        group: '3. Visual Styling',
      },
      {
        key: 'risingFillColor',
        type: 'color',
        label: 'Bullish Ribbon Fill',
        default: '#00e60f',
        group: '3. Visual Styling',
      },
      {
        key: 'fallingFillColor',
        type: 'color',
        label: 'Bearish Ribbon Fill',
        default: '#80000b',
        group: '3. Visual Styling',
      },
      {
        key: 'buyColor',
        type: 'color',
        label: 'BUY Label Color',
        default: '#0022fc',
        group: '3. Visual Styling',
      },
      {
        key: 'sellColor',
        type: 'color',
        label: 'SELL Label Color',
        default: '#880e4f',
        group: '3. Visual Styling',
      },
    ],
    plots: [
      {
        key: 'alphatrend',
        type: 'line',
        title: 'AlphaTrend',
        colorKey: 'color',
        style: { lineWidth: 3 },
      },
      {
        key: 'lagged',
        type: 'line',
        title: 'AlphaTrend Lag',
        colorKey: 'lagColor',
        style: { lineWidth: 3 },
      },
      {
        key: 'renkoStep',
        type: 'step',
        title: 'Renko Trailing Level',
        style: { color: '#00897b', lineWidth: 1 },
      },
    ],
    fills: [
      {
        between: ['alphatrend', 'lagged'],
        colorUpKey: 'risingFillColor',
        colorDownKey: 'fallingFillColor',
        opacity: 0.25,
      },
    ],
    calc(bars, settings) {
      const n = bars.length
      const alphatrendArr = new Array(n).fill(null)
      const laggedArr = new Array(n).fill(null)
      const renkoStepArr = new Array(n).fill(null)
      const buySignalPriceArr = new Array(n).fill(null)
      const sellSignalPriceArr = new Array(n).fill(null)
      const isBuyArr = new Array(n).fill(false)
      const isSellArr = new Array(n).fill(false)

      if (n === 0) {
        return {
          alphatrend: alphatrendArr,
          lagged: laggedArr,
          renkoStep: renkoStepArr,
          buySignalPrice: buySignalPriceArr,
          sellSignalPrice: sellSignalPriceArr,
          isBuy: isBuyArr,
          isSell: isSellArr,
          renkoClose: new Array(n).fill(null),
          renkoDir: new Array(n).fill(0),
          streakCount: new Array(n).fill(0),
        }
      }

      const AP = Math.max(1, Math.round(Number(settings.AP) || 14))
      const coeff = Number(settings.coeff) || 1.0
      const novolumedata = Boolean(settings.novolumedata)
      const showsignalsk = settings.showsignalsk !== false
      const showRenkoStep = Boolean(settings.showRenkoStep)

      const calcMode = String(settings.calcMode || 'Percentage (%)')
      const pctSize = Number(settings.pctSize) || 0.04
      const ptsSize = Number(settings.ptsSize) || 10.0
      const renkoAtrPer = Math.max(1, Math.round(Number(settings.renkoAtrPer) || 14))
      const renkoAtrMult = Number(settings.renkoAtrMult) || 1.0
      const priceSource = String(settings.priceSource || 'Close')

      // Pre-calculate raw bar ATR for ATR sizing mode
      let rawBarAtr = null
      if (calcMode === 'ATR') {
        const rawTr = calcRawTR(bars)
        const smoothedTr = sma(rawTr, renkoAtrPer)
        rawBarAtr = smoothedTr.map((v) => (v !== null ? v * renkoAtrMult : ptsSize))
      }

      // ==========================================
      // 1. Run Pure Renko V2 State Machine
      // ==========================================
      const renkoBars = new Array(n)
      const renkoCloseArr = new Array(n).fill(null)
      const renkoDirArr = new Array(n).fill(0)
      const streakCountArr = new Array(n).fill(0)
      let renkoOpen = null
      let renkoClose = null
      let renkoDir = 0 // 1 = Bullish, -1 = Bearish
      let streakCount = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const evalHigh = priceSource === 'High/Low' ? bar.high : bar.close
        const evalLow = priceSource === 'High/Low' ? bar.low : bar.close
        const currentAtrVal = rawBarAtr ? rawBarAtr[i] : ptsSize

        if (renkoClose === null) {
          const initSize = getBrickSize(bar.close, calcMode, pctSize, ptsSize, currentAtrVal)
          renkoDir = bar.close >= bar.open ? 1 : -1
          renkoOpen = bar.open
          renkoClose = renkoDir === 1 ? bar.open + initSize : bar.open - initSize
          streakCount = 1
        } else {
          let currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)

          if (renkoDir === 1) {
            // Bullish continuation up
            let loopCount = 0
            while (evalHigh >= renkoClose + currentBSize && loopCount < 100) {
              renkoOpen = renkoClose
              renkoClose = renkoClose + currentBSize
              streakCount += 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)
              loopCount += 1
            }

            // Bearish 2-brick reversal (drops below renkoOpen - currentBSize)
            if (evalLow <= renkoOpen - currentBSize) {
              renkoDir = -1
              renkoClose = renkoOpen - currentBSize
              streakCount = 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)

              let revLoop = 0
              while (evalLow <= renkoClose - currentBSize && revLoop < 100) {
                renkoOpen = renkoClose
                renkoClose = renkoClose - currentBSize
                streakCount += 1
                currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)
                revLoop += 1
              }
            }
          } else if (renkoDir === -1) {
            // Bearish continuation down
            let loopCount = 0
            while (evalLow <= renkoClose - currentBSize && loopCount < 100) {
              renkoOpen = renkoClose
              renkoClose = renkoClose - currentBSize
              streakCount += 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)
              loopCount += 1
            }

            // Bullish 2-brick reversal (rises above renkoOpen + currentBSize)
            if (evalHigh >= renkoOpen + currentBSize) {
              renkoDir = 1
              renkoClose = renkoOpen + currentBSize
              streakCount = 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)

              let revLoop = 0
              while (evalHigh >= renkoClose + currentBSize && revLoop < 100) {
                renkoOpen = renkoClose
                renkoClose = renkoClose + currentBSize
                streakCount += 1
                currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize, currentAtrVal)
                revLoop += 1
              }
            }
          }
        }

        const rHigh = Math.max(renkoOpen, renkoClose)
        const rLow = Math.min(renkoOpen, renkoClose)
        renkoBars[i] = {
          open: renkoOpen,
          close: renkoClose,
          high: rHigh,
          low: rLow,
          dir: renkoDir,
          streak: streakCount,
        }

        renkoCloseArr[i] = renkoClose
        renkoDirArr[i] = renkoDir
        streakCountArr[i] = streakCount

        if (showRenkoStep) {
          renkoStepArr[i] = renkoClose
        }
      }

      // ==========================================
      // 2. AlphaTrend on Renko Values
      // ==========================================
      const renkoTr = calcRenkoTR(renkoBars)
      const renkoAtr = sma(renkoTr, AP)

      let momentumBull = new Array(n).fill(false)
      if (novolumedata) {
        const renkoCloseList = renkoBars.map((r) => r.close)
        const renkoRSI = rsi(renkoCloseList, AP)
        for (let i = 0; i < n; i++) {
          momentumBull[i] = renkoRSI[i] !== null && renkoRSI[i] >= 50
        }
      } else {
        const renkoMFI = calcMFI(renkoBars, bars, AP)
        for (let i = 0; i < n; i++) {
          momentumBull[i] = renkoMFI[i] !== null && renkoMFI[i] >= 50
        }
      }

      let alphaTrendVal = 0.0
      for (let i = 0; i < n; i++) {
        const currAtr = renkoAtr[i]
        if (currAtr === null || !Number.isFinite(currAtr)) {
          alphatrendArr[i] = null
          continue
        }

        const upT = renkoBars[i].low - currAtr * coeff
        const downT = renkoBars[i].high + currAtr * coeff
        const isBull = momentumBull[i]

        const prevAT = alphaTrendVal
        if (isBull) {
          alphaTrendVal = prevAT !== 0 && upT < prevAT ? prevAT : upT
        } else {
          alphaTrendVal = prevAT !== 0 && downT > prevAT ? prevAT : downT
        }
        alphatrendArr[i] = alphaTrendVal
      }

      // AlphaTrend Lag = AlphaTrend[2]
      for (let i = 2; i < n; i++) {
        laggedArr[i] = alphatrendArr[i - 2]
      }

      // ==========================================
      // 3. Buy & Sell Signals with State Tracking
      // ==========================================
      const buySignalk = new Array(n).fill(false)
      const sellSignalk = new Array(n).fill(false)

      for (let i = 1; i < n; i++) {
        const at = alphatrendArr[i]
        const lag = laggedArr[i]
        const prevAt = alphatrendArr[i - 1]
        const prevLag = laggedArr[i - 1]

        if (
          at !== null &&
          lag !== null &&
          prevAt !== null &&
          prevLag !== null &&
          Number.isFinite(at) &&
          Number.isFinite(lag) &&
          Number.isFinite(prevAt) &&
          Number.isFinite(prevLag)
        ) {
          if (at > lag && prevAt <= prevLag) {
            buySignalk[i] = true
          } else if (at < lag && prevAt >= prevLag) {
            sellSignalk[i] = true
          }
        }
      }

      // Pine Script barssince calculation
      // K1 = ta.barssince(buySignalk), K2 = ta.barssince(sellSignalk)
      // O1 = ta.barssince(buySignalk[1]), O2 = ta.barssince(sellSignalk[1])
      const buySignalkShifted = [false, ...buySignalk.slice(0, n - 1)]
      const sellSignalkShifted = [false, ...sellSignalk.slice(0, n - 1)]

      const K1 = computeBarsSince(buySignalk)
      const K2 = computeBarsSince(sellSignalk)
      const O1 = computeBarsSince(buySignalkShifted)
      const O2 = computeBarsSince(sellSignalkShifted)

      for (let i = 0; i < n; i++) {
        if (showsignalsk) {
          // BUY: buySignalk and O1 > K2
          if (buySignalk[i] && O1[i] > K2[i] && laggedArr[i] !== null) {
            isBuyArr[i] = true
            buySignalPriceArr[i] = laggedArr[i] * 0.9995
          }
          // SELL: sellSignalk and O2 > K1
          if (sellSignalk[i] && O2[i] > K1[i] && laggedArr[i] !== null) {
            isSellArr[i] = true
            sellSignalPriceArr[i] = laggedArr[i] * 1.0005
          }
        }
      }

      return {
        alphatrend: alphatrendArr,
        lagged: laggedArr,
        renkoStep: renkoStepArr,
        buySignalPrice: buySignalPriceArr,
        sellSignalPrice: sellSignalPriceArr,
        isBuy: isBuyArr,
        isSell: isSellArr,
        renkoClose: renkoCloseArr,
        renkoDir: renkoDirArr,
        streakCount: streakCountArr,
      }
    },
    markers({ bars, values, settings }) {
      if (settings.showsignalsk === false) return []
      if (!values.isBuy || !values.isSell) return []

      const buyColor = settings.buyColor || '#0022fc'
      const sellColor = settings.sellColor || '#880e4f'
      const out = []

      for (let i = 0; i < bars.length; i++) {
        if (values.isBuy[i]) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: values.buySignalPrice[i] ?? bars[i].low,
            shape: 'labelUp',
            size: 'tiny',
            color: buyColor,
            text: 'BUY',
          })
        } else if (values.isSell[i]) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: values.sellSignalPrice[i] ?? bars[i].high,
            shape: 'labelDown',
            size: 'tiny',
            color: sellColor,
            text: 'SELL',
          })
        }
      }

      return out
    },
    alerts: [
      {
        id: 'alpha-trend-v2-buy',
        title: 'AlphaTrend on Pure Renko V2 [BUY]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Renko AlphaTrend: Confirmed BUY at ${price}`
        },
        when: ({ values, index }) => {
          return values?.isBuy?.[index] === true
        },
      },
      {
        id: 'alpha-trend-v2-sell',
        title: 'AlphaTrend on Pure Renko V2 [SELL]',
        message: ({ bars, index }) => {
          const price = bars[index]?.close?.toFixed(2)
          return `Renko AlphaTrend: Confirmed SELL at ${price}`
        },
        when: ({ values, index }) => {
          return values?.isSell?.[index] === true
        },
      },
    ],
  })
}
