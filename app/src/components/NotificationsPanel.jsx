// src/components/NotificationsPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

export default function NotificationsPanel({ userId }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)
  const panelRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return
        setNotifications(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId, reloadTick])
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function markAsRead(id) {
    const read_at = new Date().toISOString()
    await supabase.from('notifications').update({ read_at }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at } : n))
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id)
    if (unreadIds.length === 0) return
    const read_at = new Date().toISOString()
    await supabase.from('notifications').update({ read_at }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? read_at })))
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="notifications-panel" ref={panelRef}>
      <button
        className="bell-button"
        onClick={() => { setOpen(o => !o); if (!open) setReloadTick(t => t + 1) }}
        aria-label="Notifications"
      >
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
                <div key={n.id} className={`notification-item ${n.read_at ? '' : 'unread'}`}>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <span className="muted">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  {!n.read_at && (
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
