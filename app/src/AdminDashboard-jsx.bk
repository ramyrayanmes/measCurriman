// src/AdminDashboard.jsx
import { useState } from 'react'
import SubjectsManager from './components/SubjectsManager'
import UsersManager from './components/UsersManager'

export default function AdminDashboard() {
  const [tab, setTab] = useState('subjects')

  return (
    <div className="admin-dashboard">
      <nav className="tabs">
        <button className={tab === 'subjects' ? 'active' : ''} onClick={() => setTab('subjects')}>Subjects</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
      </nav>
      <div className="tab-content">
        {tab === 'subjects' && <SubjectsManager />}
        {tab === 'users' && <UsersManager />}
      </div>
    </div>
  )
}
