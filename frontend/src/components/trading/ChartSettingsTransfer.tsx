import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportChartPreferences, importChartPreferences } from '@/lib/mobilePreferences'

export function ChartSettingsTransfer() {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const perform = (action: () => void) => { try { action() } catch (e) { setMessage(e instanceof Error ? e.message : 'Transfer failed.') } }
  return <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-medium">Transfer chart settings</h3>
    <p className="text-sm text-muted-foreground">Copy indicators, drawings and chart presets between desktop and phone. Quantities, One-Click, accounts and live prices are excluded. Import with charts closed, then reload them.</p>
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" onClick={() => perform(() => { setValue(exportChartPreferences(localStorage)); setMessage('Settings ready. Copy the text below to your other device.'); })}>Export settings</Button>
      <Button variant="outline" disabled={!value} onClick={() => perform(() => setMessage(`Imported ${importChartPreferences(value, localStorage)} settings. Reload your charts.`))}>Import pasted settings</Button>
    </div>
    <textarea aria-label="Chart settings transfer" className="w-full rounded border bg-background p-2 text-xs font-mono" rows={5} value={value} onChange={e => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
    <p role="status" className="text-sm">{message}</p>
  </section>
}
