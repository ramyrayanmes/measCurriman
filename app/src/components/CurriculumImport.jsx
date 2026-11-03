// src/components/CurriculumImport.jsx
import { useRef, useState } from 'react'
import { parseCurriculumDocx } from '../curriculumImport'
import { normalizeCurriculum, toStorable } from '../curriculumModel'
import { compareContents } from '../curriculumDiff'
import { useToast } from '../toastContext'

// Lets an editor fill their working copy from a Word file that follows the school template.
// Shows what would change before anything is replaced.
export default function CurriculumImport({ defaults, getCurrent, onApply }) {
  const toast = useToast()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const { content, missing } = await parseCurriculumDocx(await file.arrayBuffer())
      const imported = normalizeCurriculum(content, defaults)
      // Details that are locked in the editor always come from the course, not the file.
      const current = toStorable(getCurrent())
      const sections = compareContents(current, toStorable(imported))
      setPreview({ fileName: file.name, imported, missing, sections })
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  function apply() {
    onApply(preview.imported)
    setPreview(null)
    toast('Imported into your working copy')
  }

  const changed = preview?.sections.filter(s => s.changed) ?? []

  return (
    <>
      <input ref={input} type="file" accept=".docx" hidden onChange={onFile} />
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current.click()}>
        {busy ? 'Reading…' : '⬆ Import Word'}
      </button>

      {preview && (
        <div className="card import-preview">
          <h3>Import preview — {preview.fileName}</h3>
          <p className="muted">
            Importing replaces your working copy with the content of this file. Nothing is saved as a
            version, and the department and grade stay as they are for this course.
          </p>
          {preview.missing.length > 0 && (
            <p className="error">Sections not found in the file: {preview.missing.join(', ')}</p>
          )}
          {changed.length === 0 ? (
            <p className="muted">The file has the same content as your working copy.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Section</th><th>Now</th><th>After import</th></tr></thead>
                <tbody>
                  {changed.map(s => (
                    <tr key={s.key}>
                      <td>{s.label}</td>
                      <td>{s.left.length} line{s.left.length === 1 ? '' : 's'}</td>
                      <td>{s.right.length} line{s.right.length === 1 ? '' : 's'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="tbl-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
              Replace my working copy
            </button>
          </div>
        </div>
      )}
    </>
  )
}
