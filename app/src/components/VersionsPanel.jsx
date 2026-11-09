// src/components/VersionsPanel.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../toastContext'
import { SECTION_LABELS, compareContents } from '../curriculumDiff'
import PlanDownloadButtons from './PlanDownloadButtons'
import { fetchAll } from '../supabasePagination'

export default function VersionsPanel({ course, userId, isAdmin, isAuditor, reviewer, canEdit, onView, onUse }) {
  const toast = useToast()
  const [data, setData] = useState({ loading: true, versions: [], officialId: null })
  const [reloadTick, setReloadTick] = useState(0)
  const [picked, setPicked] = useState([])
  const [comparing, setComparing] = useState(null)
  const [commentsFor, setCommentsFor] = useState(null)
  const reload = () => setReloadTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchAll(() => supabase.from('curriculum_versions')
        .select('id, version_number, name, content, author_id, change_note, change_summary, created_at, profiles:author_id(full_name)')
        .eq('course_id', course.id)
        .order('version_number', { ascending: false })),
      supabase.from('official_versions').select('version_id').eq('course_id', course.id).maybeSingle(),
      fetchAll(() => supabase.from('curriculum_reviews')
        .select('version_id, status, submitted_at, reviewed_at, review_note, migrated, curriculum_versions!inner(course_id)')
        .eq('curriculum_versions.course_id', course.id).order('version_id')),
      fetchAll(() => supabase.from('curriculum_review_events')
        .select('id, version_id, action, note, created_at, profiles:actor_id(full_name), curriculum_versions!inner(course_id)')
        .eq('curriculum_versions.course_id', course.id).order('id', { ascending: false })),
    ]).then(([v, o, r, events]) => {
      if (cancelled) return
      setData({
        loading: false,
        error: o.error?.message,
        versions: v,
        officialId: o.data?.version_id ?? null,
        reviews: new Map(r.map(review => [review.version_id, review])),
        reviewEvents: events,
      })
    }).catch(error => { if (!cancelled) setData({ loading: false, error: error.message }) })
    return () => { cancelled = true }
  }, [course.id, reloadTick])

  async function setOfficial(v) {
    if (!window.confirm(`Make "${v.name}" the Current Official version? Teachers will see it and be notified.`)) return
    const { error } = await supabase.rpc('set_official_version', { p_version: v.id })
    if (error) { toast(error.message, 'error'); return }
    toast(`"${v.name}" is now the Current Official version`)
    reload()
  }

  async function submitReview(v) {
    if (!window.confirm(`Submit "${v.name}" for review?`)) return
    const { error } = await supabase.rpc('submit_curriculum_review', { p_version: v.id })
    if (error) toast(error.message, 'error')
    else { toast('Version submitted for review'); reload() }
  }

  async function decideReview(v, decision) {
    const note = window.prompt(decision === 'returned'
      ? 'Explain what should be changed (required):'
      : 'Optional approval comment:', '')
    if (note === null) return
    if (decision === 'returned' && !note.trim()) { toast('A return comment is required', 'error'); return }
    const { error } = await supabase.rpc('decide_curriculum_review', {
      p_version: v.id, p_decision: decision, p_note: note.trim() || null,
    })
    if (error) toast(error.message, 'error')
    else { toast(decision === 'approved' ? 'Review approved' : 'Version returned for changes'); reload() }
  }

  async function editNote(v) {
    const next = window.prompt('Note for this version', v.change_note ?? '')
    if (next === null) return
    const { error } = await supabase.from('curriculum_versions')
      .update({ change_note: next.trim() || null }).eq('id', v.id)
    if (error) toast(error.message, 'error')
    else { toast('Note saved'); reload() }
  }

  async function remove(v) {
    if (v.id === data.officialId) {
      window.alert('This is the Current Official version. Set another version as official before deleting it.')
      return
    }
    if (!window.confirm(`PERMANENTLY delete version v${v.version_number} "${v.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('curriculum_versions').delete().eq('id', v.id)
    if (error) toast(error.message, 'error')
    else { toast('Version deleted'); setPicked(p => p.filter(id => id !== v.id)); reload() }
  }

  function togglePick(id) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2))
  }

  if (data.loading) return <p className="muted">Loading versions…</p>
  if (data.error) return <p className="error">{data.error}</p>

  if (comparing) {
    return <CompareView a={comparing[0]} b={comparing[1]} onClose={() => setComparing(null)} />
  }

  const canCompare = reviewer || isAdmin
  const byId = new Map(data.versions.map(v => [v.id, v]))

  return (
    <div>
      <div className="section-title-row" style={{ marginTop: 0 }}>
        <h3>Versions ({data.versions.length})</h3>
        {canCompare && (
          <button
            className="btn btn-primary btn-sm"
            disabled={picked.length !== 2}
            onClick={() => setComparing(picked.map(id => byId.get(id)).sort((x, y) => x.version_number - y.version_number))}
          >
            ⇄ Compare selected ({picked.length}/2)
          </button>
        )}
      </div>

      {!canEdit && !reviewer && (
        <p className="muted">You can see the Current Official version only.</p>
      )}
      {canEdit && !reviewer && (
        <p className="muted">You can see your own versions and the Current Official version.</p>
      )}
      {data.versions.length === 0 && <p className="muted">No versions yet.</p>}

      {data.versions.map(v => {
        const isOfficial = v.id === data.officialId
        const mine = v.author_id === userId
        const review = data.reviews.get(v.id)
        return (
          <div key={v.id} className={`card version-row${isOfficial ? ' is-official' : ''}`}>
            <div className="version-head">
              {canCompare && (
                <input type="checkbox" checked={picked.includes(v.id)} onChange={() => togglePick(v.id)}
                  aria-label="Select for comparison" />
              )}
              <div className="version-title">
                <strong>v{v.version_number} — {v.name}</strong>
                {isOfficial && <span className="chip chip-accent">★ Current Official</span>}
                {mine && <span className="chip">Yours</span>}
                {review && <span className="chip">Review: {review.status}{review.migrated ? ' (imported)' : ''}</span>}
                <div className="muted">
                  {v.profiles?.full_name ?? 'Unknown'} • {new Date(v.created_at).toLocaleString()}
                </div>
              </div>
              <div className="tbl-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onView(v)}>View</button>
                <PlanDownloadButtons table="curriculum_versions" recordId={v.id} isAuditor={isAuditor} />
                {canEdit && !course.archived_at && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onUse(v)}>Use as my working copy</button>
                )}
                {mine && canEdit && !course.archived_at && (!review || review.status === 'returned') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => submitReview(v)}>
                    {review ? 'Resubmit for review' : 'Submit for review'}
                  </button>
                )}
                {reviewer && review?.status === 'pending' && !course.archived_at && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => decideReview(v, 'approved')}>Approve review</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => decideReview(v, 'returned')}>Return for changes</button>
                  </>
                )}
                {reviewer && !isOfficial && !course.archived_at && (
                  <button className="btn btn-primary btn-sm" onClick={() => setOfficial(v)}>★ Set as Official</button>
                )}
                {mine && <button className="btn btn-ghost btn-sm" onClick={() => editNote(v)}>Edit note</button>}
                {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => remove(v)}>Delete</button>}
              </div>
            </div>

            <div className="summary-chips">
              {(v.change_summary ?? []).map(k => (
                <span key={k} className="chip">{k === 'first version' ? 'First version' : SECTION_LABELS[k] ?? k}</span>
              ))}
            </div>
            {v.change_note && <p className="version-note">“{v.change_note}”</p>}
            {review?.review_note && <p className="version-note">Review comment: {review.review_note}</p>}
            {data.reviewEvents.some(event => event.version_id === v.id) && (
              <details className="review-history">
                <summary>Review history</summary>
                <ul>
                  {data.reviewEvents.filter(event => event.version_id === v.id).map(event => (
                    <li key={event.id}>
                      {event.action} by {event.profiles?.full_name || 'Unknown user'} · {new Date(event.created_at).toLocaleString()}
                      {event.note && ` — ${event.note}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {isAdmin && (
              <>
                <button className="link-button" onClick={() => setCommentsFor(commentsFor === v.id ? null : v.id)}>
                  💬 Admin comments
                </button>
                {commentsFor === v.id && <VersionComments versionId={v.id} userId={userId} />}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VersionComments({ versionId, userId }) {
  const toast = useToast()
  const [comments, setComments] = useState(null)
  const [body, setBody] = useState('')
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase.from('version_comments')
      .select('id, body, created_at, profiles:author_id(full_name)')
      .eq('version_id', versionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (!cancelled) setComments(data ?? []) })
    return () => { cancelled = true }
  }, [versionId, reloadTick])

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('version_comments')
      .insert({ version_id: versionId, author_id: userId, body: body.trim() })
    if (error) { toast(error.message, 'error'); return }
    toast('Comment added')
    setBody('')
    setReloadTick(t => t + 1)
  }

  async function remove(id) {
    const { error } = await supabase.from('version_comments').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else { toast('Comment deleted'); setReloadTick(t => t + 1) }
  }

  return (
    <div className="comments-box">
      {comments === null && <p className="muted">Loading…</p>}
      {comments?.map(c => (
        <div key={c.id} className="comment">
          <div className="muted">{c.profiles?.full_name} • {new Date(c.created_at).toLocaleString()}</div>
          <div>{c.body}</div>
          <button className="link-button" onClick={() => remove(c.id)}>Delete</button>
        </div>
      ))}
      <form className="inline-form" onSubmit={add}>
        <input value={body} onChange={e => setBody(e.target.value)} placeholder="Add a comment (admins only)…" />
        <button className="btn btn-primary btn-sm" disabled={!body.trim()}>Add</button>
      </form>
    </div>
  )
}

function CompareView({ a, b, onClose }) {
  const [onlyChanged, setOnlyChanged] = useState(true)
  const sections = compareContents(a.content, b.content)
  const changedCount = sections.filter(s => s.changed).length
  const shown = onlyChanged ? sections.filter(s => s.changed) : sections

  return (
    <div>
      <div className="section-title-row" style={{ marginTop: 0 }}>
        <h3>Compare versions</h3>
        <div className="tbl-actions">
          <label className="muted">
            <input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} /> Changed sections only
          </label>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>← Back to versions</button>
        </div>
      </div>

      <div className="compare-head">
        <div><strong>v{a.version_number} — {a.name}</strong><div className="muted">{a.profiles?.full_name}</div></div>
        <div><strong>v{b.version_number} — {b.name}</strong><div className="muted">{b.profiles?.full_name}</div></div>
      </div>

      {changedCount === 0 && <p className="muted">These two versions have identical content.</p>}

      {shown.map(s => (
        <div key={s.key} className="card compare-section">
          <h4>{s.label} {s.changed && <span className="chip chip-accent">changed</span>}</h4>
          <div className="compare-cols">
            <CompareColumn lines={s.left} kind="del" />
            <CompareColumn lines={s.right} kind="add" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CompareColumn({ lines, kind }) {
  if (lines.length === 0) return <div className="compare-col muted">(empty)</div>
  return (
    <div className="compare-col">
      {lines.map((l, i) => (
        <div key={i} className={`compare-line${l.diff ? ` diff-${kind}` : ''}`}>{l.text}</div>
      ))}
    </div>
  )
}
