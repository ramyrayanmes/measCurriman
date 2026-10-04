// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
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

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!error) setProfile(data)
      })
  }, [session])

  if (loading) return <p>Loading…</p>

  return session ? (
    <Dashboard session={session} profile={profile} />
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
      <h1>Curriculum Portal</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function Dashboard({ session, profile }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="dashboard-container">
      <h1>Curriculum Portal</h1>
      <p>Signed in as <strong>{session.user.email}</strong></p>
      <p>Role: <strong>{profile?.role ?? 'loading…'}</strong></p>
      <p>Name: <strong>{profile?.full_name ?? 'loading…'}</strong></p>
      <button onClick={handleSignOut}>Sign out</button>
      <hr />
      <p><em>The rest of the portal (subjects, curricula, lesson plans) builds out from here.</em></p>
    </div>
  )
}
