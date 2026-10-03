/**
 * Pure Renko Reversal Engine [Percent & Points]
 *
 * Implements dynamic percentage and fixed point Renko brick sizing with
 * 2-brick reversal detection, trailing step line, reversal and continuation levels,
 * horizontal S/R shelves, signal labels, and telemetry dashboard table.
 */

export default function ({ registerIndicator }) {
  const COLOR_BULLISH = '#2e7d32'
  const COLOR_BEARISH = '#d32f2f'
  const COLOR_REV_BULLISH = 'rgba(76, 175, 80, 0.6)'
  const COLOR_REV_BEARISH = 'rgba(244, 67, 54, 0.6)'
  const COLOR_CONT_BULLISH = 'rgba(129, 199, 132, 0.4)'
  const COLOR_CONT_BEARISH = 'rgba(255, 138, 128, 0.4)'

  function getBrickSize(refPrice, calcMode, pctSize, ptsSize) {
    let b = 0.0
    if (calcMode === 'Percentage (%)') {
      b = refPrice * (pctSize / 100.0)
    } else {
      b = ptsSize
    }
    return Math.max(b, 0.05)
  }

  function computeRenko(bars, settings) {
    const n = bars.length
    const renkoCloseArr = new Array(n).fill(null)
    const renkoOpenArr = new Array(n).fill(null)
    const revPriceArr = new Array(n).fill(null)
    const contPriceArr = new Array(n).fill(null)

    // Signals and state info recorded per bar
    const buySignals = new Array(n).fill(false)
    const sellSignals = new Array(n).fill(false)
    const renkoDirArr = new Array(n).fill(0)
    const streakCountArr = new Array(n).fill(0)
    const activeBSizeArr = new Array(n).fill(0)

    if (n === 0) {
      return {
        renkoClose: renkoCloseArr,
        revPrice: revPriceArr,
        contPrice: contPriceArr,
        renkoOpen: renkoOpenArr,
        buySignals,
        sellSignals,
        renkoDir: renkoDirArr,
        streakCount: streakCountArr,
        activeBSize: activeBSizeArr,
      }
    }

    const calcMode = String(settings.calcMode || 'Percentage (%)')
    const pctSize = Number(settings.pctSize) || 0.04
    const ptsSize = Number(settings.ptsSize) || 10.0
    const priceSource = String(settings.priceSource || 'Close')
    const showSteps = settings.showSteps !== false
    const showTriggers = settings.showTriggers !== false

    let renkoOpen = null
    let renkoClose = null
    let renkoDir = 0 // 1 = Bullish, -1 = Bearish
    let streakCount = 0

    for (let i = 0; i < n; i++) {
      const bar = bars[i]
      const evalHigh = priceSource === 'High/Low' ? bar.high : bar.close
      const evalLow = priceSource === 'High/Low' ? bar.low : bar.close

      let buySignal = false
      let sellSignal = false

      if (renkoClose === null) {
        const initSize = getBrickSize(bar.close, calcMode, pctSize, ptsSize)
        renkoDir = bar.close >= bar.open ? 1 : -1
        renkoOpen = bar.open
        renkoClose = renkoDir === 1 ? bar.open + initSize : bar.open - initSize
        streakCount = 1
      } else {
        let currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)

        if (renkoDir === 1) {
          // Bullish: Check Continuation Up
          let loopCount = 0
          while (evalHigh >= renkoClose + currentBSize && loopCount < 100) {
            renkoOpen = renkoClose
            renkoClose = renkoClose + currentBSize
            streakCount += 1
            currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)
            loopCount += 1
          }

          // Bullish: Check Bearish Reversal (2-Brick Drop: below previous brick's open)
          if (evalLow <= renkoOpen - currentBSize) {
            renkoDir = -1
            sellSignal = true
            renkoClose = renkoOpen - currentBSize
            streakCount = 1
            currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)

            let revLoop = 0
            while (evalLow <= renkoClose - currentBSize && revLoop < 100) {
              renkoOpen = renkoClose
              renkoClose = renkoClose - currentBSize
              streakCount += 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)
              revLoop += 1
            }
          }
        } else if (renkoDir === -1) {
          // Bearish: Check Continuation Down
          let loopCount = 0
          while (evalLow <= renkoClose - currentBSize && loopCount < 100) {
            renkoOpen = renkoClose
            renkoClose = renkoClose - currentBSize
            streakCount += 1
            currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)
            loopCount += 1
          }

          // Bearish: Check Bullish Reversal (2-Brick Rise: above previous brick's open)
          if (evalHigh >= renkoOpen + currentBSize) {
            renkoDir = 1
            buySignal = true
            renkoClose = renkoOpen + currentBSize
            streakCount = 1
            currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)

            let revLoop = 0
            while (evalHigh >= renkoClose + currentBSize && revLoop < 100) {
              renkoOpen = renkoClose
              renkoClose = renkoClose + currentBSize
              streakCount += 1
              currentBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)
              revLoop += 1
            }
          }
        }
      }

      const activeBSize = getBrickSize(renkoClose, calcMode, pctSize, ptsSize)
      const contPrice = renkoDir === 1 ? renkoClose + activeBSize : renkoClose - activeBSize
      const revPrice = renkoDir === 1 ? renkoOpen - activeBSize : renkoOpen + activeBSize

      renkoCloseArr[i] = showSteps ? renkoClose : null
      renkoOpenArr[i] = renkoOpen
      revPriceArr[i] = showTriggers ? revPrice : null
      contPriceArr[i] = showTriggers ? contPrice : null

      buySignals[i] = buySignal
      sellSignals[i] = sellSignal
      renkoDirArr[i] = renkoDir
      streakCountArr[i] = streakCount
      activeBSizeArr[i] = activeBSize
    }

    return {
      renkoClose: renkoCloseArr,
      revPrice: revPriceArr,
      contPrice: contPriceArr,
      renkoOpen: renkoOpenArr,
      buySignals,
      sellSignals,
      renkoDir: renkoDirArr,
      streakCount: streakCountArr,
      activeBSize: activeBSizeArr,
    }
  }

  function markerPad(bars) {
    let sum = 0
    let count = 0
    for (let i = 0; i < bars.length; i++) {
      const range = bars[i].high - bars[i].low
      if (Number.isFinite(range) && range > 0) {
        sum += range
        count++
      }
    }
    const mean = count > 0 ? sum / count : 0
    const last = bars.length > 0 ? Math.abs(bars[bars.length - 1].close) : 0
    return Math.max(mean * 0.5, last * 0.0005)
  }

  registerIndicator({
    id: 'oa-pure-renko',
    name: 'Pure Renko Reversal Engine',
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
        ],
        group: '1. Brick Sizing Configuration',
        tooltip: 'Choose dynamic percentage of price or fixed price points.',
      },
      {
        key: 'pctSize',
        type: 'number',
        label: 'Brick Size in %',
        default: 0.04,
        min: 0.0001,
        step: 0.01,
        group: '1. Brick Sizing Configuration',
        tooltip: 'Percentage of price per brick (e.g. 0.04% for Nifty ~9.3 pts).',
      },
      {
        key: 'ptsSize',
        type: 'number',
        label: 'Brick Size in Points',
        default: 10.0,
        min: 0.00001,
        step: 0.5,
        group: '1. Brick Sizing Configuration',
        tooltip: 'Used when Points mode is selected.',
      },
      {
        key: 'priceSource',
        type: 'select',
        label: 'Price Calculation Source',
        default: 'Close',
        options: [
          { label: 'Close', value: 'Close' },
          { label: 'High/Low', value: 'High/Low' },
        ],
        group: '1. Brick Sizing Configuration',
        tooltip: 'Close: zero repaint. High/Low: evaluates candle wicks for breakout triggers.',
      },
      {
        key: 'showLabels',
        type: 'boolean',
        label: 'Show Buy / Sell Labels',
        default: true,
        group: '2. Visual Display & Levels',
      },
      {
        key: 'showSteps',
        type: 'boolean',
        label: 'Show Renko Trailing Step Line',
        default: true,
        group: '2. Visual Display & Levels',
      },
      {
        key: 'showTriggers',
        type: 'boolean',
        label: 'Show Next Reversal & Continuation Levels',
        default: true,
        group: '2. Visual Display & Levels',
      },
      {
        key: 'showShelves',
        type: 'boolean',
        label: 'Show Horizontal S/R Shelves',
        default: true,
        group: '2. Visual Display & Levels',
      },
      {
        key: 'showTable',
        type: 'boolean',
        label: 'Show Real-Time Telemetry Dashboard',
        default: true,
        group: '2. Visual Display & Levels',
      },
    ],
    plots: [
      {
        key: 'renkoClose',
        type: 'step',
        title: 'Renko Trailing Step',
        style: { color: COLOR_BULLISH, lineWidth: 2 },
        colorBy: ({ index, values }) => {
          if (!values.renkoDir) return COLOR_BULLISH
          return values.renkoDir[index] === 1 ? COLOR_BULLISH : COLOR_BEARISH
        },
      },
      {
        key: 'revPrice',
        type: 'line-markers',
        title: 'Reversal Trigger Price',
        style: { color: COLOR_REV_BEARISH, lineWidth: 1 },
      },
      {
        key: 'contPrice',
        type: 'line',
        title: 'Continuation Trigger Price',
        style: { color: COLOR_CONT_BULLISH, lineWidth: 1 },
      },
    ],
    calc(bars, settings) {
      return computeRenko(bars, settings)
    },
    markers({ bars, values, settings }) {
      if (settings.showLabels === false) return []
      if (!values.buySignals || !values.sellSignals) return []

      const pad = markerPad(bars)
      const out = []

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const rClose = values.renkoClose[i] !== null ? values.renkoClose[i].toFixed(2) : ''
        if (values.buySignals[i]) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.low - pad,
            shape: 'labelUp',
            size: 'small',
            color: COLOR_BULLISH,
            text: `BUY\n${rClose}`,
          })
        }
        if (values.sellSignals[i]) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.high + pad,
            shape: 'labelDown',
            size: 'small',
            color: COLOR_BEARISH,
            text: `SELL\n${rClose}`,
          })
        }
      }
      return out
    },
    draws({ bars, values, settings }) {
      if (settings.showShelves === false) return []
      if (!values.buySignals || !values.sellSignals) return []

      const n = bars.length
      if (n === 0) return []

      // Find the last buy or sell signal to project the last horizontal S/R shelf
      let lastSigIndex = -1
      let lastSigSide = ''
      for (let i = n - 1; i >= 0; i--) {
        if (values.buySignals[i]) {
          lastSigIndex = i
          lastSigSide = 'buy'
          break
        }
        if (values.sellSignals[i]) {
          lastSigIndex = i
          lastSigSide = 'sell'
          break
        }
      }

      if (lastSigIndex === -1) return []

      const shelfPrice = values.renkoClose[lastSigIndex]
      if (shelfPrice === null || !Number.isFinite(shelfPrice)) return []

      const startTime = bars[lastSigIndex].time
      // Shelf extends for 20 bars forward or past last bar
      const avgInterval =
        n > 1 ? (bars[n - 1].time - bars[0].time) / (n - 1) : 60
      const toIndex = Math.min(n - 1, lastSigIndex + 20)
      const endTime =
        lastSigIndex + 20 < n
          ? bars[toIndex].time
          : bars[n - 1].time + (lastSigIndex + 20 - (n - 1)) * avgInterval

      return [
        {
          kind: 'line',
          from: { time: startTime, price: shelfPrice },
          to: { time: endTime, price: shelfPrice },
          color: lastSigSide === 'buy' ? '#4caf50' : '#f43f5e',
          lineWidth: 2,
        },
      ]
    },
    table({ bars, values, settings }) {
      if (settings.showTable === false) return null
      const n = bars.length
      if (n === 0) return null

      const lastIdx = n - 1

      const calcMode = String(settings.calcMode || 'Percentage (%)')
      const pctSize = Number(settings.pctSize) || 0.04
      const ptsSize = Number(settings.ptsSize) || 10.0

      const renkoDir = values.renkoDir ? values.renkoDir[lastIdx] : 0
      const streakCount = values.streakCount ? values.streakCount[lastIdx] : 0
      const activeBSize = values.activeBSize ? values.activeBSize[lastIdx] : 0
      const renkoOpen = values.renkoOpen ? values.renkoOpen[lastIdx] : 0
      const renkoClose = values.renkoClose ? values.renkoClose[lastIdx] : 0
      const contPrice = values.contPrice ? values.contPrice[lastIdx] : 0
      const revPrice = values.revPrice ? values.revPrice[lastIdx] : 0

      const modeText =
        calcMode === 'Percentage (%)' ? `${pctSize}% Mode` : `${ptsSize} Pts Mode`
      const dirText =
        renkoDir === 1
          ? `BULLISH (${streakCount} bricks)`
          : `BEARISH (${streakCount} bricks)`
      const dirColor = renkoDir === 1 ? '#4caf50' : '#f44336'

      const ptsEquiv = Number(activeBSize).toFixed(2)
      const pctEquiv =
        renkoClose && renkoClose > 0
          ? ((activeBSize / renkoClose) * 100.0).toFixed(3)
          : '0.000'

      const openStr = Number(renkoOpen || 0).toFixed(2)
      const closeStr = Number(renkoClose || 0).toFixed(2)
      const contStr = Number(contPrice || 0).toFixed(2)
      const revStr = Number(revPrice || 0).toFixed(2)

      const headerTitleBg = 'rgba(15, 23, 42, 0.94)'
      const headerBadgeBg = 'rgba(30, 41, 59, 0.94)'
      const rowLabelBg = 'rgba(15, 23, 42, 0.88)'
      const rowValueBg = 'rgba(15, 23, 42, 0.82)'
      const labelColor = '#94a3b8'
      const valueColor = '#f8fafc'

      const renkoDirText = renkoDir === 1 ? `▲ BULLISH (${streakCount} bricks)` : `▼ BEARISH (${streakCount} bricks)`
      const renkoDirColor = renkoDir === 1 ? '#10b981' : '#f43f5e'
      const renkoCellBg = renkoDir === 1 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)'

      return {
        rows: [
          [
            { text: '  Pure Renko Engine', bgColor: headerTitleBg, textColor: '#f8fafc', bold: true, align: 'left', fontSize: 11 },
            { text: `${modeText} `, bgColor: headerBadgeBg, textColor: '#fbbf24', bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Renko State', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${renkoDirText} `, bgColor: renkoCellBg, textColor: renkoDirColor, bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Active Brick Size', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${ptsEquiv} pts (${pctEquiv}%) `, bgColor: rowValueBg, textColor: valueColor, bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Last Brick Open/Close', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${openStr} → ${closeStr} `, bgColor: rowValueBg, textColor: valueColor, bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Continuation Target', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${contStr} `, bgColor: 'rgba(16, 185, 129, 0.14)', textColor: '#10b981', bold: true, align: 'right', fontSize: 11 },
          ],
          [
            { text: '  Reversal Flip Price', bgColor: rowLabelBg, textColor: labelColor, align: 'left', fontSize: 11 },
            { text: `${revStr} `, bgColor: 'rgba(244, 63, 94, 0.14)', textColor: '#f43f5e', bold: true, align: 'right', fontSize: 11 },
          ],
        ],
        options: {
          position: 'top-right',
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
        id: 'renko-buy',
        title: 'Renko Bullish Reversal [BUY]',
        message: ({ bars, values, index }) => {
          const rClose = values.renkoClose?.[index]?.toFixed(2) || bars[index]?.close?.toFixed(2)
          return `Pure Renko BUY: Bullish Reversal Brick Confirmed at ${rClose}`
        },
        when: ({ values, index }) => {
          return values?.buySignals?.[index] === true
        },
      },
      {
        id: 'renko-sell',
        title: 'Renko Bearish Reversal [SELL]',
        message: ({ bars, values, index }) => {
          const rClose = values.renkoClose?.[index]?.toFixed(2) || bars[index]?.close?.toFixed(2)
          return `Pure Renko SELL: Bearish Reversal Brick Confirmed at ${rClose}`
        },
        when: ({ values, index }) => {
          return values?.sellSignals?.[index] === true
        },
      },
      {
        id: 'renko-flip',
        title: 'Any Renko Trend Flip',
        message: ({ bars, values, index }) => {
          const rClose = values.renkoClose?.[index]?.toFixed(2) || bars[index]?.close?.toFixed(2)
          return `Pure Renko: Direction Flip Confirmed at ${rClose}`
        },
        when: ({ values, index }) => {
          return values?.buySignals?.[index] === true || values?.sellSignals?.[index] === true
        },
      },
    ],
  })
}
