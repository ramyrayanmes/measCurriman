// src/components/PlanDownloadButtons.jsx
import { useState } from 'react'
import { downloadFromEdgeFunction } from '../edgeFunctions'
import { useToast } from '../toastContext'

// Word + PDF for a weekly plan. Auditors only get PDF (also enforced by the export function).
export default function PlanDownloadButtons({ planId, isAuditor }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)

  async function download(format) {
    setBusy(format)
    try {
      await downloadFromEdgeFunction(
        'export-document',
        { table: 'weekly_plans', record_id: planId, format },
        `plan.${format}`
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
