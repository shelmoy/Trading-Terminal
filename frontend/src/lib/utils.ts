import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize a value for CSV export to prevent formula injection.
 * Prefixes dangerous characters (=, +, -, @) with a single quote.
 */
export function sanitizeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Prefix dangerous formula characters with a single quote
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`
  }
  // Escape quotes and wrap in quotes if contains comma
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Returns a currency formatter bound to the active broker.
 * - deltaexchange → USD ($)
 * - all other brokers  → INR (₹)
 */
export function makeFormatCurrency(broker?: string | null): (value: number) => string {
  const isUSD = broker === 'deltaexchange'
  return (value: number) =>
    isUSD
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
        }).format(value)
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          minimumFractionDigits: 2,
        }).format(value)
}

/**
 * Format number in Indian units (Cr/L/decimals).
 */
export function formatIndianNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '0.00'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '0.00'

  const isNegative = num < 0
  const absNum = Math.abs(num)

  let formatted: string
  if (absNum >= 10000000) {
    formatted = `${(absNum / 10000000).toFixed(2)}Cr`
  } else if (absNum >= 100000) {
    formatted = `${(absNum / 100000).toFixed(2)}L`
  } else {
    formatted = absNum.toFixed(2)
  }

  return isNegative ? `-${formatted}` : formatted
}

