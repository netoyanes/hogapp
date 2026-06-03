import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, ExternalLink, Trash2, FileCode, X, Maximize2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import type { BusinessUnit } from '../types'

interface Report {
  id: string
  name: string
  file_url: string
  file_path: string
  bu_id: string | null
  uploaded_by: string | null
  file_size: number | null
  created_at: string
  uploaderName?: string
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  userRole?: string
}

export function Reports({ userRole: _userRole }: Props) {
  const [reports, setReports] = useState<Report[]>([])
  const [buses, setBuses] = useState<BusinessUnit[]>([])
  const [buFilter, setBuFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadBu, setUploadBu] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [preview, setPreview] = useState<Report | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const load = useCallback(async () => {
    const [{ data: rpts }, { data: bus }, { data: profiles }] = await Promise.all([
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
      supabase.from('business_units').select('*').order('code'),
      supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null),
    ])
    setBuses(bus ?? [])
    const pm: Record<string, string> = {}
    profiles?.forEach(p => { pm[p.id] = p.full_name ?? p.email ?? 'Unknown' })
    setReports((rpts ?? []).map(r => ({ ...r, uploaderName: r.uploaded_by ? pm[r.uploaded_by] : undefined })))
  }, [])

  useEffect(() => { load() }, [load])

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      alert('Only HTML files are supported.')
      return
    }
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const path = `reports/${Date.now()}-${file.name.replace(/\s+/g, '_')}`

    const { error } = await supabase.storage.from('reports').upload(path, file, {
      contentType: 'text/html',
      upsert: false,
    })
    if (error) { alert(`Upload failed: ${error.message}`); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(path)
    await supabase.from('reports').insert({
      name: file.name.replace(/\.(html|htm)$/i, ''),
      file_url: urlData.publicUrl,
      file_path: path,
      bu_id: uploadBu || null,
      uploaded_by: user?.id ?? null,
      file_size: file.size,
    })
    await load()
    setUploading(false)
  }

  async function deleteReport(report: Report) {
    if (!confirm(`Delete "${report.name}"?`)) return
    if (preview?.id === report.id) setPreview(null)
    await supabase.storage.from('reports').remove([report.file_path])
    await supabase.from('reports').delete().eq('id', report.id)
    setReports(prev => prev.filter(r => r.id !== report.id))
  }

  async function saveRename(id: string) {
    if (!renameVal.trim()) return
    await supabase.from('reports').update({ name: renameVal.trim() }).eq('id', id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, name: renameVal.trim() } : r))
    if (preview?.id === id) setPreview(prev => prev ? { ...prev, name: renameVal.trim() } : null)
    setRenamingId(null)
  }

  const filtered = reports.filter(r => !buFilter || r.bu_id === buFilter)

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-ui)',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Reports</h1>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{filtered.length} report{filtered.length !== 1 ? 's' : ''} · HTML files</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={buFilter} onChange={e => setBuFilter(e.target.value)} style={selStyle}>
                <option value="">All BUs</option>
                {buses.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
              </select>
              <select value={uploadBu} onChange={e => setUploadBu(e.target.value)} style={selStyle}>
                <option value="">No BU tag</option>
                {buses.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
              </select>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)', opacity: uploading ? 0.6 : 1 }}
              >
                <Upload size={13} />
                {uploading ? 'Uploading…' : 'Upload HTML'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: '10px',
              padding: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              background: dragOver ? 'var(--accent-bg)' : 'transparent',
              transition: 'all 0.15s',
              marginBottom: filtered.length > 0 ? '20px' : '0',
            }}
          >
            <Upload size={16} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)' }} />
            <span style={{ fontSize: '13px', color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)' }}>
              {uploading ? 'Uploading…' : 'Drop an HTML file here or click to browse'}
            </span>
          </div>

          {/* Report cards */}
          {filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filtered.map(report => {
                const bu = buses.find(b => b.id === report.bu_id)
                return (
                  <div
                    key={report.id}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                  >
                    {/* Icon + name */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#3B82F610', border: '1px solid #3B82F630', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileCode size={18} style={{ color: '#3B82F6' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {renamingId === report.id ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={() => saveRename(report.id)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRename(report.id); if (e.key === 'Escape') setRenamingId(null) }}
                            style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: '5px', padding: '3px 7px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)', boxSizing: 'border-box' }}
                          />
                        ) : (
                          <button
                            onClick={() => { setRenamingId(report.id); setRenameVal(report.name) }}
                            title="Click to rename"
                            style={{ background: 'none', border: 'none', cursor: 'text', padding: 0, textAlign: 'left', width: '100%' }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.name}</span>
                          </button>
                        )}
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {report.uploaderName && ` · ${report.uploaderName}`}
                          {report.file_size && ` · ${fmtSize(report.file_size)}`}
                        </div>
                      </div>
                    </div>

                    {/* BU tag */}
                    {bu && (
                      <span style={{ alignSelf: 'flex-start', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 7px' }}>
                        {bu.code}
                      </span>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                      <button
                        onClick={() => setPreview(report)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px', background: 'var(--accent)', color: '#000', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                      >
                        <Maximize2 size={12} />
                        Preview
                      </button>
                      <a
                        href={report.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new tab"
                        style={{ padding: '7px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                      >
                        <ExternalLink size={13} />
                      </a>
                      <button
                        onClick={() => deleteReport(report)}
                        title="Delete"
                        style={{ padding: '7px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filtered.length === 0 && !uploading && (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '12px' }}>
              No reports yet. Upload an HTML file to get started.
            </p>
          )}
        </div>
      </div>

      {/* Internal HTML viewer */}
      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Viewer toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 16px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#3B82F610', border: '1px solid #3B82F630', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileCode size={14} style={{ color: '#3B82F6' }} />
            </div>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview.name}
            </span>
            {preview.file_size && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {fmtSize(preview.file_size)}
              </span>
            )}
            <a
              href={preview.file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '11px', textDecoration: 'none', flexShrink: 0 }}
            >
              <ExternalLink size={11} />
              New tab
            </a>
            <button
              onClick={() => setPreview(null)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* iframe */}
          <HtmlFrame
            url={preview.file_url}
            title={preview.name}
            style={{ flex: 1, border: 'none', background: '#fff', width: '100%' }}
          />
        </div>
      )}
    </>
  )
}
