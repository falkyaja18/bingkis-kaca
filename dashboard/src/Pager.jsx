import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Shared pagination bar with range text, numbered pills, ellipsis, and prev/next buttons. */
export default function Pager({ total, page, perPage = 10, onChange }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const pg = Math.min(page, pages)
  const start = total ? (pg - 1) * perPage + 1 : 0
  const end = total ? Math.min(total, pg * perPage) : 0

  const tokens = useMemo(() => {
    if (total === 0) return []
    if (pages <= 4) return Array.from({ length: pages }, (_, i) => i + 1)
    const out = [1]
    if (pg > 3) out.push('...')
    for (let n = Math.max(2, pg - 1); n <= Math.min(pages - 1, pg + 1); n++) out.push(n)
    if (pg < pages - 2) out.push('...')
    out.push(pages)
    return out
  }, [total, pg, pages])

  return (
    <div className="trx-pager">
      <span>{`${start} - ${end} dari ${total} data`}</span>
      <div className="pgs">
        <button type="button" disabled={total === 0 || pg <= 1} onClick={() => onChange(pg - 1)}>
          <ChevronLeft size={15} /> Sebelumnya
        </button>
        {tokens.map((tok, i) => tok === '...' ? (
          <span key={`e${i}`} className="pgdots">…</span>
        ) : (
          <button
            type="button"
            key={tok}
            className={tok === pg ? 'pgn' : 'pgnum'}
            onClick={() => onChange(tok)}
            aria-current={tok === pg ? 'page' : undefined}
          >
            {tok}
          </button>
        ))}
        <button type="button" disabled={total === 0 || pg >= pages} onClick={() => onChange(pg + 1)}>
          Berikutnya <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

