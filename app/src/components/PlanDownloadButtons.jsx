// src/components/PlanDownloadButtons.jsx
import { useState } from 'react'
import { downloadFromEdgeFunction } from '../edgeFunctions'
import { useToast } from '../toastContext'

// Word + PDF download for a weekly plan (default) or a curriculum
// (table 'curriculum_versions' with a version id, or 'curriculum_working' with a course id).
// Auditors only get PDF (also enforced by the export function).
export default function PlanDownloadButtons({
  planId, recordId = planId, table = 'weekly_plans', isAuditor, beforeDownload,
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)

  async function download(format) {
    setBusy(format)
    try {
      if (beforeDownload) await beforeDownload()
      await downloadFromEdgeFunction(
        'export-document',
        { table, record_id: recordId, format },
        `document.${format}`
      )
      toast(`${format === 'docx' ? 'Word' : 'PDF'} downloaded`)
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(null)
  }

  return (
    <>
      {!isAuditor && (
        <button className="btn btn-ghost btn-sm" onClick={() => download('docx')} disabled={busy !== null}>
          {busy === 'docx' ? 'Preparing…' : '⬇ Word'}
        </button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => download('pdf')} disabled={busy !== null}>
        {busy === 'pdf' ? 'Preparing…' : '⬇ PDF'}
      </button>
    </>
  )
}
