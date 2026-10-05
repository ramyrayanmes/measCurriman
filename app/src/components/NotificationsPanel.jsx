// src/components/NotificationsPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

export default function NotificationsPanel({ userId }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const panelRef = useRef(null)

  async function loadNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadNotifications() }, [userId])

  // Close the dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function markAsRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="notifications-panel" ref={panelRef}>
      <button className="bell-button" onClick={() => setOpen(o => !o)}>
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notifications-dropdown">
          <div className="notifications-dropdown-header">
            <strong>Notifications</strong>
            <button onClick={markAllAsRead} className="link-button">Mark all read</button>
          </div>

          {loading ? <p className="muted">Loading…</p> : (
            <>
              {notifications.map(n => (
                <div key={n.id} className={`notification-item ${n.is_read ? '' : 'unread'}`}>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <span className="muted">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  {!n.is_read && (
                    <button onClick={() => markAsRead(n.id)} className="link-button">Mark read</button>
                  )}
                </div>
              ))}
              {notifications.length === 0 && <p className="muted">No notifications yet.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
