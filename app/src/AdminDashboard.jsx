// src/AdminDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import SubjectsManager from './components/SubjectsManager'
import UsersManager from './components/UsersManager'
import ContentManager from './components/ContentManager'

export default function AdminDashboard({ userId }) {
  const [tab, setTab] = useState('content')

  return (
    <div className="admin-dashboard">
      <nav className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>Content</button>
        <button className={tab === 'subjects' ? 'active' : ''} onClick={() => setTab('subjects')}>Subjects</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
      </nav>
      <div className="tab-content">
        {tab === 'content' && <AllContent userId={userId} />}
        {tab === 'subjects' && <SubjectsManager />}
        {tab === 'users' && <UsersManager />}
      </div>
    </div>
  )
}

function AllContent({ userId }) {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('subjects').select('*').order('name', { ascending: true })
      .then(({ data }) => { setSubjects(data ?? []); setLoading(false) })
  }, [])

  if (loading) return <p>Loading…</p>
  if (subjects.length === 0) return <p>No subjects created yet — add one in the Subjects tab first.</p>

  return <ContentManager subjects={subjects} userId={userId} canRestore={true} />
}
