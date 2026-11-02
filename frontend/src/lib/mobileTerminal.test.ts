import { describe, expect, it } from 'vitest'
import { isLinkedLoginDestination } from './mobileTerminal'

describe('private mobile SSO addresses', () => {
  const origin = new URL('https://terminal.example.ts.net')
  it('accepts only the two private ports on this host', () => {
    expect(isLinkedLoginDestination(new URL('https://terminal.example.ts.net:8443/auth/instance-login'), origin)).toBe(true)
    for (const value of ['http://terminal.example.ts.net:8443/auth/instance-login', 'https://evil.ts.net/auth/instance-login', 'https://terminal.example.ts.net:5000/auth/instance-login', 'https://user@terminal.example.ts.net/auth/instance-login', 'https://terminal.example.ts.net/auth/instance-login?next=evil']) {
      expect(isLinkedLoginDestination(new URL(value), origin)).toBe(false)
    }
  })
  it('keeps the existing Windows loopback routing', () => {
    expect(isLinkedLoginDestination(new URL('http://127.0.0.1:5001/auth/instance-login'), new URL('http://127.0.0.1:5000'))).toBe(true)
  })
})
