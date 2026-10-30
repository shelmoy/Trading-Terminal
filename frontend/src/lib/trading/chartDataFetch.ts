/** Preserve a broker's explanation before the SDK reduces a failed request to its name. */
export const chartDataFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (!response.ok) {
    const body: unknown = await response.clone().json().catch(() => null)
    if (body && typeof body === 'object' && 'message' in body &&
        typeof body.message === 'string' && body.message.trim()) {
      throw new Error(body.message)
    }
  }
  return response
}
