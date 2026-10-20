import type { AlertChartHost, AlertSource, IndicatorApi } from 'openalgo-charts'

type Study = Pick<IndicatorApi, 'id' | 'indicatorId' | 'visible' | 'values'>

/** Resolve the actual emitting instance, never another copy of the same study. */
export function activeSignalStudy(
  studies: readonly Study[],
  event: { instanceId?: unknown; indicatorId?: unknown; sourceValues?: unknown }
): Study | undefined {
  const candidates =
    typeof event.instanceId === 'string'
      ? studies.filter((study) => study.id === event.instanceId)
      : typeof event.indicatorId === 'string' && event.sourceValues !== undefined
        ? studies.filter(
            (study) =>
              study.indicatorId === event.indicatorId && study.values() === event.sourceValues
          )
        : []
  if (candidates.length !== 1) return undefined
  const study = candidates[0]
  if (typeof event.indicatorId === 'string' && study.indicatorId !== event.indicatorId)
    return undefined
  return study.visible() ? study : undefined
}

/** Price alerts are independent; study and study-pane drawing alerts follow their owner. */
export function alertSourceActive(studies: readonly Study[], source: AlertSource): boolean {
  const owner =
    source.kind === 'indicator'
      ? source.instanceId
      : source.kind === 'drawing'
        ? source.input?.instanceId
        : undefined
  return owner === undefined || studies.some((study) => study.id === owner && study.visible())
}

/**
 * Keep hidden studies resolvable on restore, but expose no values for alert
 * evaluation. A hidden once-only alert must stay armed rather than be consumed
 * and merely have its notification discarded. Series and identity stay intact.
 */
export function activeIndicatorAlertHost(
  chart: Omit<AlertChartHost, 'indicators'> & { indicators(): readonly IndicatorApi[] }
): AlertChartHost {
  const indicators = () =>
    chart.indicators().map((study) => ({
      id: study.id,
      indicatorId: study.indicatorId,
      paneIndex: study.paneIndex,
      series: (key: string) => study.series(key),
      values: () => (study.visible() ? study.values() : {}),
    }))
  return new Proxy(chart, {
    get(target, key) {
      if (key === 'indicators') return indicators
      // SDK methods must retain the real chart as `this`.
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
