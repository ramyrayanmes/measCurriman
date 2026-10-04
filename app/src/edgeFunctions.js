// src/edgeFunctions.js
import { supabase } from './supabaseClient'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// Calls an Edge Function and returns parsed JSON. Throws on error.
export async function callEdgeFunctionJson(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

// Calls an Edge Function that returns a file, and triggers a browser download.
export async function downloadFromEdgeFunction(name, body, fallbackFileName) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || `Request failed (${res.status})`)
  }

  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="(.+)"/)
  const fileName = match ? match[1] : fallbackFileName

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
