// src/components/ListEditor.jsx
import { useRef, useState } from 'react'
import {
  MAX_DEPTH, flatten, newNode, updateText, insertAfter, removeAt, indent, unindent, move,
} from '../curriculumModel'

export default function ListEditor({ items, onChange, readOnly }) {
  const inputs = useRef(new Map())
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const rows = flatten(items)

  function focusLater(id) {
    setTimeout(() => inputs.current.get(id)?.focus(), 0)
  }

  function addAfter(path, text) {
    const node = newNode()
    onChange(insertAfter(text === undefined ? items : updateText(items, path, text), path, node))
    focusLater(node.id)
  }

  function addLast() {
    const node = newNode()
    onChange([...items, node])
    focusLater(node.id)
  }

  function onDrop(e, path) {
    e.preventDefault()
    if (drag) onChange(move(items, drag, path, over?.mode === 'nest'))
    setDrag(null)
    setOver(null)
  }

  function onDragOver(e, path) {
    if (!drag) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mode = e.clientX - rect.left > rect.width / 2 ? 'nest' : 'after'
    setOver({ key: path.join('.'), mode })
  }

  return (
    <div className="list-editor">
      <div className="list-tree">
        {rows.map(({ node, depth, path }) => {
          const key = path.join('.')
          const overClass = over?.key === key ? (over.mode === 'nest' ? ' drag-over-nest' : ' drag-over-below') : ''
          return (
            <div
              key={node.id}
              className={`li-row${overClass}${drag && drag.join('.') === key ? ' dragging' : ''}`}
              data-depth={depth}
              draggable={!readOnly}
              onDragStart={e => { setDrag(path); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => { setDrag(null); setOver(null) }}
              onDragOver={e => onDragOver(e, path)}
              onDragLeave={() => setOver(null)}
              onDrop={e => onDrop(e, path)}
            >
              {!readOnly && <span className="li-drag" title="Drag to reorder or nest">⠿</span>}
              <span className="li-depth-pip" />
              <input
                type="text"
                value={node.text}
                disabled={readOnly}
                placeholder="Enter item…"
                ref={el => { if (el) inputs.current.set(node.id, el); else inputs.current.delete(node.id) }}
                onChange={e => onChange(updateText(items, path, e.target.value))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addAfter(path) }
                  else if (e.key === 'Tab') {
                    e.preventDefault()
                    onChange(e.shiftKey ? unindent(items, path) : indent(items, path))
                    focusLater(node.id)
                  }
                }}
              />
              {!readOnly && (
                <div className="li-actions">
                  {depth < MAX_DEPTH && (
                    <button type="button" className="li-act indent-btn" title="Make child of item above"
                      onClick={() => onChange(indent(items, path))}>⇥ Sub</button>
                  )}
                  {depth > 0 && (
                    <button type="button" className="li-act indent-btn" title="Move up one level"
                      onClick={() => onChange(unindent(items, path))}>⇤ Up</button>
                  )}
                  <button type="button" className="li-act danger" title="Remove item"
                    onClick={() => onChange(removeAt(items, path))}>✕</button>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && readOnly && <div className="li-empty">No items.</div>}
      </div>
      {!readOnly && <div className="list-add" onClick={addLast}>＋ Add item</div>}
    </div>
  )
}
