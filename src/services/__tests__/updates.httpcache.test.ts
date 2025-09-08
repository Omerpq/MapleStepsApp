// src/services/__tests__/updates.httpcache.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadRounds, loadFees, type LoaderResult } from '../../services/updates'

// Mock config endpoints
jest.mock('../../services/config', () => ({
  RULES_CONFIG: {
    roundsUrl: 'https://example.com/rounds.remote.json',
    feesUrl: 'https://example.com/fees.remote.json',
  },
}))

// Use AsyncStorage Jest mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// Helper to make a fetch Response-like object
const res200 = (body: any, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  headers: { get: (k: string) => headers[k] ?? null },
  json: async () => body,
})

const res304 = (headers: Record<string, string> = {}) => ({
  ok: false, // 304 is not ok but is handled explicitly
  status: 304,
  headers: { get: (k: string) => headers[k] ?? null },
  // no json() on purpose – we must not read a body on 304
})

// Reset between tests
beforeEach(async () => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2025-09-08T09:00:00Z'))
  ;(AsyncStorage as any).clear()
  ;(global.fetch as any) = jest.fn()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('Rounds: 200 -> cache; then 304 -> reuse cache and cachedAt unchanged', async () => {
  const roundDoc = {
    last_checked: '2025-09-08T08:58:00Z',
    rounds: [
      { date: '2025-09-05', category: 'General', cutoff: 510, invitations: 4200, draw_number: 325 }
    ],
  }

  // First call returns 200 with ETag/Last-Modified
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(
    res200(roundDoc, { ETag: '"abc123"', 'Last-Modified': 'Mon, 08 Sep 2025 08:58:00 GMT' })
  )
  // Second call returns 304 (no body)
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(
    res304({ ETag: '"abc123"', 'Last-Modified': 'Mon, 08 Sep 2025 08:58:00 GMT' })
  )

  const first = (await loadRounds()) as LoaderResult<any[]>
  expect(first.source).toBe('remote')
  expect(first.meta.status).toBe(200)
  expect(first.meta.etag).toBe('"abc123"')
  expect(Array.isArray(first.data)).toBe(true)
  expect(first.data.length).toBeGreaterThan(0)
  const firstCachedAt = first.cachedAt

  const second = (await loadRounds()) as LoaderResult<any[]>
  expect(second.source).toBe('cache')
  expect(second.meta.status).toBe(304)
  expect(second.cachedAt).toBe(firstCachedAt) // unchanged
  expect(second.data).toEqual(first.data)

  // Two network calls, but only one body download (200). 304 did not parse json.
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
})

test('Fees: 200 -> cache; then 304 -> reuse cache and cachedAt unchanged', async () => {
  const feesDoc = {
    last_checked: '2025-09-08T08:55:00Z',
    fees: [
      { code: 'EE_APP', label: 'Express Entry application fee (principal)', amount_cad: 950 }
    ],
  }

  ;(global.fetch as jest.Mock).mockResolvedValueOnce(
    res200(feesDoc, { ETag: '"fee123"', 'Last-Modified': 'Mon, 08 Sep 2025 08:55:00 GMT' })
  )
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(
    res304({ ETag: '"fee123"', 'Last-Modified': 'Mon, 08 Sep 2025 08:55:00 GMT' })
  )

  const first = await loadFees()
  expect(first.source).toBe('remote')
  expect(first.meta.status).toBe(200)
  const firstCachedAt = first.cachedAt

  const second = await loadFees()
  expect(second.source).toBe('cache')
  expect(second.meta.status).toBe(304)
  expect(second.cachedAt).toBe(firstCachedAt)
  expect(second.data).toEqual(first.data)

  expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
})
