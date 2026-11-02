// src/components/TableEditor.jsx
export default function TableEditor({ columns, rows, onChange, readOnly }) {
  function setCell(i, key, value) {
    onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)))
  }
  function addRow() {
    onChange([...rows, Object.fromEntries(columns.map(c => [c.key, '']))])
  }

  return (
    <div>
      <div className="tbl-wrap">
        <table className="tbl tbl-edit">
          <thead>
            <tr>
              {columns.map(c => <th key={c.key}>{c.label}</th>)}
              {!readOnly && <th className="col-del" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c.key}>
                    <textarea
                      value={row[c.key] ?? ''}
                      disabled={readOnly}
                      onChange={e => setCell(i, c.key, e.target.value)}
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="col-del">
                    <button type="button" className="tbl-del" title="Remove row"
                      onClick={() => onChange(rows.filter((_, k) => k !== i))}>🗑</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="tbl-empty">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && <div className="tbl-add" onClick={addRow}>＋ Add row</div>}
    </div>
  )
}
