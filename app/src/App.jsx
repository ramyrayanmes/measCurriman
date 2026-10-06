// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import AdminDashboard from './AdminDashboard'
import TeacherDashboard from './TeacherDashboard'
import AuditorDashboard from './AuditorDashboard'
import NotificationsPanel from './components/NotificationsPanel'
import ChangePasswordPanel from './components/ChangePasswordPanel'
import StageHeadDashboard from './StageHeadDashboard'
import { roleLabel } from './stageUtils'
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
      .select('full_name, role, email')
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

function Dashboard({ session, profile }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="dashboard-shell">
      <header className="top-bar">
        <h1>Curriculum Portal</h1>
        <div className="top-bar-user">
          {profile?.role === 'admin' && <NotificationsPanel userId={session.user.id} />}
          <span>{profile?.full_name ?? session.user.email} ({profile?.role ? roleLabel(profile.role) : '…'})</span>
          <ChangePasswordPanel />
          <button onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main>
        {profile?.role === 'admin' && <AdminDashboard userId={session.user.id} />}
        {profile?.role === 'teacher' && <TeacherDashboard userId={session.user.id} />}
        {profile?.role === 'auditor' && <AuditorDashboard userId={session.user.id} />}
        {profile?.role?.startsWith('head_') && <StageHeadDashboard userId={session.user.id} role={profile.role} />}
        {!profile && <p>Loading your profile…</p>}
      </main>
    </div>
  )
}
