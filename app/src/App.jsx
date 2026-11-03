// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell'
import Brand from './components/Brand'
import { LOGO_URL } from './branding'
import { APP_NAME, APP_VERSION, SCHOOL_NAME } from './version'
import './App.css'

export default function App() {
  useEffect(() => {
    document.title = `${APP_NAME} v${APP_VERSION} — MEAS`
  }, [])

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  const [loadedProfile, setLoadedProfile] = useState(null) // { userId, data, error }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('full_name, role, email, active')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!cancelled) setLoadedProfile({ userId, data, error: error?.message ?? null })
      })
    return () => { cancelled = true }
  }, [userId])

  const current = loadedProfile?.userId === userId ? loadedProfile : null
  const profile = current?.data ?? null
  const profileError = current?.error ?? null

  if (loading) return <p className="loading-screen">Loading…</p>

  return session ? (
    <ProfileGate session={session} profile={profile} profileError={profileError} />
  ) : (
    <Login />
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <div className="login-container">
      <img src={LOGO_URL} alt="MEAS" className="login-logo" />
      <h1 className="login-title"><Brand /></h1>
      <p className="login-sub">{SCHOOL_NAME}</p>
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function ProfileGate({ session, profile, profileError }) {
  const inactive = profile?.active === false

  if (inactive) {
    return (
      <div className="welcome">
        <span className="wi">🚫</span>
        <h2>Account inactive</h2>
        <p>Your account has been deactivated. Please contact an administrator.</p>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }
  if (profile) return <Shell session={session} profile={profile} />

  return (
    <div className="welcome">
      <span className="wi">{profileError ? '⚠️' : '⏳'}</span>
      {profileError ? (
        <>
          <h2>Couldn't load your profile</h2>
          <p className="error">{profileError}</p>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </>
      ) : (
        <p>Loading your profile…</p>
      )}
    </div>
  )
}
