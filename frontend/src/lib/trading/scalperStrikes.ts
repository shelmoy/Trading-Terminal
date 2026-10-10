/** Resolve defaults from available contracts; manual leg choices remain independent. */
export function resolveScalperStrikes(
  rows: readonly { strike: number }[],
  atm: number | null | undefined,
  choices: { ce: string | null; pe: string | null } = { ce: null, pe: null },
): { atm: number | null; ce: string; pe: string } {
  const strikes = [...new Set(rows.map((row) => row.strike))]
    .filter((strike) => Number.isFinite(strike) && strike > 0).sort((a, b) => a - b)
  if (!strikes.length) return { atm: null, ce: '', pe: '' }
  const reference = atm != null && Number.isFinite(atm) && atm > 0
    ? atm : strikes[Math.floor(strikes.length / 2)]
  const nearest = strikes.reduce((best, strike) =>
    Math.abs(strike - reference) < Math.abs(best - reference) ? strike : best)
  const available = new Set(strikes.map(String))
  return {
    atm: nearest,
    ce: choices.ce && available.has(choices.ce) ? choices.ce : String(nearest),
    pe: choices.pe && available.has(choices.pe) ? choices.pe : String(nearest),
  }
}
