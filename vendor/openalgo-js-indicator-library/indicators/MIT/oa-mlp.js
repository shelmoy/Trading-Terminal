/**
 * Multilayer Perceptron Predictor (MLP) - ported to openalgo-charts from Pine
 * Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/forecasts/mlp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A small 6-8-4-1 neural network trained bar by bar on six normalised price
 * features. Each bar it predicts the log return over the next five bars, and
 * the prediction is drawn back at the bar it was made for, so the line can be
 * compared against the price that actually arrived.
 */

export default function ({ registerIndicator, sma, wma, smaSeededEma, rsi, atr, nulls }) {
  // Every one of these is a var constant in the Pine source, not an input.
  const OFFSET = 5
  const NUM_INPUTS = 6
  const NODES_PER_LAYER = [8, 4, 1]
  const LEARNING_RATE = 0.0025
  const LEARNING_RATE_DECAY = 0.000015
  const MAX_GRADIENT = 5.0
  const ERROR_K = 0.7
  const USE_TANH_INPUTS = true
  const SEED = 42
  const HUBER_DELTA = 0.7

  // Pine's ta.wma(src, period / 2) uses integer division, and the HMA smoothing
  // length is math.round(math.sqrt(period)). ta.hma is not exported here.
  const hma = (values, period) => {
    const half = Math.max(1, Math.floor(period / 2))
    const root = Math.max(1, Math.round(Math.sqrt(period)))
    const fast = wma(values, half)
    const slow = wma(values, period)
    const raw = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue
      raw[i] = 2 * fast[i] - slow[i]
    }
    return wma(raw, root)
  }

  // Compresses an unbounded value into [-1, 1]. na propagates, as it does in Pine.
  const compressToRange = (x, useTanh) => {
    if (!Number.isFinite(x)) return NaN
    if (x >= 20) return 1
    if (x <= -20) return -1
    if (useTanh) {
      const ex = Math.exp(x)
      const emx = Math.exp(-x)
      return (ex - emx) / (ex + emx)
    }
    const sigmoid = 1 / (1 + Math.exp(-x))
    return 2 * sigmoid - 1
  }

  // The inverse of the tanh branch; Pine calls it with its default useTanh.
  const expandFromRange = (y) => {
    if (!Number.isFinite(y)) return NaN
    const safe = Math.max(-0.9999, Math.min(0.9999, y))
    return 0.5 * Math.log((1 + safe) / (1 - safe))
  }

  // algoType is 4 in the source: the return format is a log return.
  const transform = (referencePrice, newPrice) => {
    if (!Number.isFinite(newPrice) || !Number.isFinite(referencePrice)) return NaN
    if (referencePrice <= 0) return NaN
    const ratio = newPrice / referencePrice
    return ratio <= 0 ? NaN : Math.log(ratio)
  }

  const detransform = (referencePrice, priceReturn) => {
    if (!Number.isFinite(referencePrice) || !Number.isFinite(priceReturn)) return NaN
    if (referencePrice <= 0) return NaN
    const limited = Math.max(-5, Math.min(5, priceReturn))
    return referencePrice * Math.exp(limited)
  }

  const huberLossGradient = (predicted, actual, delta) => {
    const error = predicted - actual
    return Math.abs(error) <= delta ? error : delta * Math.sign(error)
  }

  // Xavier/Glorot initialisation, deterministic from the seed exactly as in Pine.
  const xavierInitLayer = (inputSize, outputSize, seed) => {
    const w = []
    for (let r = 0; r < inputSize; r++) w.push(new Array(outputSize).fill(0))
    const b = new Array(outputSize).fill(0)
    const limit = Math.sqrt(1 / (inputSize + outputSize))
    for (let idx = 0; idx < inputSize * outputSize; idx++) {
      const r = Math.floor(idx / outputSize)
      const c = idx % outputSize
      const scale = c === outputSize - 1 ? 0.1 : 1
      w[r][c] = scale * limit * Math.sin((r + 1) * 13.37 + (c + 1) * 42.42 + seed)
    }
    for (let c = 0; c < outputSize; c++) {
      b[c] = c === outputSize - 1 ? 0.01 : limit * Math.sin((c + 1) * 42.42 + seed)
    }
    return { w, b }
  }

  const initializeNetwork = (layers, numInputs, seed) => {
    const W = []
    const B = []
    for (let i = 0; i < layers.length; i++) {
      const inputSize = i === 0 ? numInputs : layers[i - 1]
      const layer = xavierInitLayer(inputSize, layers[i], seed)
      W.push(layer.w)
      B.push(layer.b)
    }
    return { W, B }
  }

  // Pine also records the pre-activation z matrices, but backpropagate never
  // reads them, so only the activations are carried forward here.
  const forwardPass = (inputArr, W, B) => {
    // Pine builds this with matrix.new<float>(1, numInputs), whose unset
    // elements are na, and writes only the features that are not na. So a bar
    // where any feature is still warming up carries na through the whole
    // network: the prediction is na, the plot is empty and the training guard
    // below keeps the weights untouched. Seeding with 0 instead would invent a
    // feature vector and train on it for the ~120 bars before the slowest
    // feature (the 100-period SMA of a 20-period HMA) exists.
    const inputLayer = new Array(NUM_INPUTS).fill(NaN)
    for (let i = 0; i < NUM_INPUTS; i++) {
      const value = inputArr[i]
      if (Number.isFinite(value)) inputLayer[i] = value
    }
    const aValues = [inputLayer]
    let currentA = inputLayer
    for (let layer = 0; layer < W.length; layer++) {
      const weights = W[layer]
      const biases = B[layer]
      const outSize = biases.length
      const activated = new Array(outSize).fill(0)
      for (let c = 0; c < outSize; c++) {
        let sum = 0
        for (let r = 0; r < currentA.length; r++) sum += currentA[r] * weights[r][c]
        // Pine calls activate(z) without the flag, so the hidden and output
        // layers use the scaled sigmoid while the features use tanh.
        activated[c] = compressToRange(sum + biases[c], false)
      }
      aValues.push(activated)
      currentA = activated
    }
    return { output: currentA.length > 0 ? currentA[0] : 0, aValues }
  }

  // Pine sums over the rows of next_layer_deltas, which is a single row, so the
  // weight column index stays at 0 for every term. Reproduced as written.
  const calculateDeltas = (weights, activations, nextDeltas) => {
    const rows = weights.length
    const out = new Array(rows).fill(0)
    let deltaSum = 0
    for (let k = 0; k < nextDeltas.length; k++) deltaSum += nextDeltas[k]
    for (let i = 0; i < rows; i++) {
      const errorSum = weights[i][0] * deltaSum
      const aVal = activations[i]
      out[i] = errorSum * (1 - aVal * aVal)
    }
    return out
  }

  const updateLayerWeights = (weights, activations, deltas, learningRate) => {
    const out = []
    for (let r = 0; r < weights.length; r++) {
      const row = weights[r].slice()
      const aVal = activations[r]
      for (let c = 0; c < row.length; c++) {
        const dVal = c < deltas.length ? deltas[c] : 0
        let grad = aVal * dVal
        grad = Math.max(-MAX_GRADIENT, Math.min(grad, MAX_GRADIENT))
        row[c] = row[c] - learningRate * grad
      }
      out.push(row)
    }
    return out
  }

  const updateLayerBiases = (biases, deltas, learningRate) => {
    const out = biases.slice()
    for (let j = 0; j < out.length; j++) {
      const dVal = j < deltas.length ? deltas[j] : 0
      const grad = Math.max(-MAX_GRADIENT, Math.min(dVal, MAX_GRADIENT))
      out[j] = out[j] - learningRate * grad
    }
    return out
  }

  registerIndicator({
    id: 'oa-mlp',
    name: 'Multilayer Perceptron Predictor',
    category: 'Forecasts',
    placement: 'onchart',

    inputs: [],

    plots: [
      {
        key: 'prediction',
        type: 'line',
        title: 'Historical Prediction',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars) {
      const n = bars.length
      const prediction = new Array(n).fill(NaN)
      const futurePrice = new Array(n).fill(NaN)
      if (n === 0) return { prediction: nulls(prediction), futurePrice: nulls(futurePrice) }

      const high = bars.map((bar) => bar.high)
      const low = bars.map((bar) => bar.low)
      const close = bars.map((bar) => bar.close)

      // Every feature in Pine reads a series shifted by off, which is the same
      // as reading the unshifted study at index i - off.
      const hma20 = hma(close, 20)
      const hma20Sma100 = sma(hma20, 100)
      const rsi14 = rsi(close, 14)
      const atr14 = atr(high, low, close, 14)
      const atr14Sma14 = sma(atr14, 14)
      const close20Sma = sma(close, 20)
      // Pine's ta.ema seeds from the SMA of the first period values.
      const ema5 = smaSeededEma(close, 5)
      const ema20 = smaSeededEma(close, 20)

      const safeRatio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : NaN)
      const less1 = (v) => (Number.isFinite(v) ? v - 1 : NaN)

      const calculateInputs = (j) => {
        if (j < 0) return new Array(NUM_INPUTS).fill(NaN)
        const f0 = less1(safeRatio(hma20[j], hma20Sma100[j]))
        const f1 = safeRatio(rsi14[j], 100)
        const f2 = safeRatio(atr14[j], atr14Sma14[j])
        const f3 = safeRatio(close[j], close20Sma[j])
        const momentum = j >= 10 ? close[j] - close[j - 10] : NaN
        const f4 = safeRatio(momentum, close[j])
        const f5 = less1(safeRatio(ema5[j], ema20[j]))
        return [
          compressToRange(f0, USE_TANH_INPUTS),
          compressToRange(f1, USE_TANH_INPUTS),
          compressToRange(f2, USE_TANH_INPUTS),
          compressToRange(f3, USE_TANH_INPUTS),
          compressToRange(f4, USE_TANH_INPUTS),
          compressToRange(f5, USE_TANH_INPUTS),
        ]
      }

      let W = null
      let B = null
      let activations = null
      let predictedReturn = NaN
      // Pine assigns normalized_actual_return only inside the initialisation
      // branch, so the training target is fixed for the whole run. Kept as-is.
      let actualReturn = NaN
      let smoothErrorDeriv = 0
      const predictedPrice = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        if (i <= OFFSET) continue
        const inputs = calculateInputs(i - OFFSET)

        if (i === OFFSET + 1) {
          const initial = initializeNetwork(NODES_PER_LAYER, NUM_INPUTS, SEED)
          W = initial.W
          B = initial.B
          const first = forwardPass(inputs, W, B)
          predictedReturn = first.output
          activations = first.aValues
          actualReturn = compressToRange(transform(close[i - OFFSET], close[i]), true)
        }
        if (!W || !B) continue

        // Pine trains on every bar that is not the live one. calc must stay pure
        // in (bars, settings), so every bar trains here.
        if (Number.isFinite(predictedReturn) && Number.isFinite(actualReturn) && activations) {
          const numLayers = NODES_PER_LAYER.length
          const learningRate = LEARNING_RATE / (1 + LEARNING_RATE_DECAY * i)
          const errorDerivative = huberLossGradient(predictedReturn, actualReturn, HUBER_DELTA)
          smoothErrorDeriv = ERROR_K * errorDerivative + (1 - ERROR_K) * smoothErrorDeriv

          const deltas = new Array(numLayers)
          deltas[numLayers - 1] = [smoothErrorDeriv]
          for (let layer = numLayers - 2; layer >= 0; layer--) {
            deltas[layer] = calculateDeltas(W[layer + 1], activations[layer + 1], deltas[layer + 1])
          }

          const newW = []
          const newB = []
          for (let layer = 0; layer < numLayers; layer++) {
            newW.push(updateLayerWeights(W[layer], activations[layer], deltas[layer], learningRate))
            newB.push(updateLayerBiases(B[layer], deltas[layer], learningRate))
          }
          W = newW
          B = newB
        }

        const pass = forwardPass(inputs, W, B)
        predictedReturn = pass.output
        activations = pass.aValues
        predictedPrice[i] = detransform(close[i - OFFSET], expandFromRange(predictedReturn))
      }

      // plot(..., offset = -OFFSET): the value computed on bar i is drawn back
      // on the bar it was a prediction for.
      for (let i = OFFSET; i < n; i++) {
        const value = predictedPrice[i]
        if (Number.isFinite(value)) prediction[i - OFFSET] = value
      }

      // The forward-looking label Pine draws on the live bar: the same network
      // run on the unshifted features, projected OFFSET bars ahead.
      if (W && B) {
        const last = n - 1
        const future = forwardPass(calculateInputs(last), W, B)
        const value = detransform(close[last], expandFromRange(future.output))
        if (Number.isFinite(value)) futurePrice[last] = value
      }

      return { prediction: nulls(prediction), futurePrice: nulls(futurePrice) }
    },

    markers({ bars, values }) {
      const future = values.futurePrice || []
      const out = []
      for (let i = 0; i < bars.length; i++) {
        const value = future[i]
        if (!Number.isFinite(value)) continue
        out.push({
          time: bars[i].time,
          position: 'atPrice',
          price: bars[i].high,
          shape: 'labelDown',
          color: '#4caf50',
          text: 'Predicted in ' + OFFSET + ' bars: ' + value.toFixed(2),
        })
      }
      return out
    },
  })
}
