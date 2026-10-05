// src/components/ChangePasswordPanel.jsx
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function ChangePasswordPanel() {
  const [open, setOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (error) { setError(error.message); return }
    setSuccess(true)
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="notifications-panel" ref={panelRef}>
      <button className="link-button" onClick={() => setOpen(o => !o)}>Change password</button>

      {open && (
        <div className="notifications-dropdown">
          <form onSubmit={handleSubmit} className="curriculum-form">
            <label>
              New password
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </label>
            {error && <p className="error">{error}</p>}
            {success && <p className="success">Password updated.</p>}
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
