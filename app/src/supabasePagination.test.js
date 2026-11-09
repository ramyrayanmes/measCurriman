import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAll } from './supabasePagination.js'

test('fetches all pages in order', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => index)
  const pages = []
  const result = await fetchAll(() => ({
    range: async (start, end) => {
      pages.push([start, end])
      return { data: rows.slice(start, end + 1), error: null }
    },
  }))
  assert.deepEqual(result, rows)
  assert.deepEqual(pages, [[0, 999], [1000, 1999]])
})

test('does not silently return partial results on a query error', async () => {
  await assert.rejects(fetchAll(() => ({
    range: async () => ({ data: null, error: new Error('query failed') }),
  })), /query failed/)
})
