import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { calculateScores, SCORE_MAXES } from '../lib/scoring'
import { ScoreBar } from '../components/ui/ScoreBar'
import { HealthBadge } from '../components/ui/HealthBadge'
import type { BusinessUnit, RevenueTrend, EngagementLevel } from '../types'

interface Props {
  buCode: string
  onClose: () => void
  onSaved?: () => void
}

const DEFAULT_FORM = {
  publishes_per_week: 0 as 0 | 1 | 2 | 3,
  content_is_on_strategy: 'NO' as 'YES' | 'PARTIALLY' | 'NO',
  has_brand_brief: false,
  has_content_pillars: false,
  has_moodboard: false,
  has_communication_objective: false,
  has_active_assets: false,
  has_overdue_assets: false,
  revenue_trend: 'NO_DATA' as RevenueTrend,
  engagement_level: 'NO_DATA' as EngagementLevel,
  instagram_handle: '',
  facebook_page: '',
  whatsapp_number: '',
  meta_pixel_id: '',
  primary_channel: '',
  monthly_content_budget: '',
  notes: '',
}

export function BUOnboardingForm({ buCode, onClose, onSaved }: Props) {
  const [bu, setBu] = useState<BusinessUnit | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('business_units').select('*').eq('code', buCode).single()
      if (data) setBu(data)

      const buData = await supabase.from('business_units').select('id').eq('code', buCode).single()
      if (buData.data) {
        const { data: existing } = await supabase
          .from('bu_onboarding')
          .select('*')
          .eq('bu_id', buData.data.id)
          .single()
        if (existing) {
          setForm({
            publishes_per_week: existing.publishes_per_week ?? 0,
            content_is_on_strategy: existing.content_is_on_strategy ?? 'NO',
            has_brand_brief: existing.has_brand_brief ?? false,
            has_content_pillars: existing.has_content_pillars ?? false,
            has_moodboard: existing.has_moodboard ?? false,
            has_communication_objective: existing.has_communication_objective ?? false,
            has_active_assets: existing.has_active_assets ?? false,
            has_overdue_assets: existing.has_overdue_assets ?? false,
            revenue_trend: existing.revenue_trend ?? 'NO_DATA',
            engagement_level: existing.engagement_level ?? 'NO_DATA',
            instagram_handle: existing.instagram_handle ?? '',
            facebook_page: existing.facebook_page ?? '',
            whatsapp_number: existing.whatsapp_number ?? '',
            meta_pixel_id: existing.meta_pixel_id ?? '',
            primary_channel: existing.primary_channel ?? '',
            monthly_content_budget: existing.monthly_content_budget?.toString() ?? '',
            notes: existing.notes ?? '',
          })
        }
      }
    }
    load()
  }, [buCode])

  const scores = calculateScores(form)

  async function handleSave() {
    setSaving(true)
    const { data: buRow } = await supabase.from('business_units').select('id').eq('code', buCode).single()
    if (!buRow) { setSaving(false); return }

    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      bu_id: buRow.id,
      publishes_per_week: form.publishes_per_week,
      content_is_on_strategy: form.content_is_on_strategy,
      has_brand_brief: form.has_brand_brief,
      has_content_pillars: form.has_content_pillars,
      has_moodboard: form.has_moodboard,
      has_communication_objective: form.has_communication_objective,
      has_active_assets: form.has_active_assets,
      has_overdue_assets: form.has_overdue_assets,
      revenue_trend: form.revenue_trend,
      engagement_level: form.engagement_level,
      instagram_handle: form.instagram_handle || null,
      facebook_page: form.facebook_page || null,
      whatsapp_number: form.whatsapp_number || null,
      meta_pixel_id: form.meta_pixel_id || null,
      primary_channel: form.primary_channel || null,
      monthly_content_budget: form.monthly_content_budget ? parseFloat(form.monthly_content_budget) : null,
      notes: form.notes || null,
      completed_by: user?.id ?? null,
    }

    await supabase.from('bu_onboarding').upsert(payload, { onConflict: 'bu_id' })

    // Also save marketing score
    const today = new Date()
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay())
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)

    await supabase.from('marketing_scores').insert({
      bu_id: buRow.id,
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
      score_a: scores.a,
      score_b: scores.b,
      score_c: scores.c,
      score_d: scores.d,
      score_e: scores.e,
      scored_by: user?.id ?? null,
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => { onSaved?.(); onClose() }, 800)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function set<K extends keyof typeof DEFAULT_FORM>(key: K, value: typeof DEFAULT_FORM[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const sectionHeader = (label: string, pts: number) => (
    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>{label}</span>
      <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>max {pts} pts</span>
    </div>
  )

  const toggle = (key: keyof typeof DEFAULT_FORM, label: string) => (
    <label className="flex items-center gap-3 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
      <input
        type="checkbox"
        checked={form[key] as boolean}
        onChange={(e) => set(key, e.target.checked as typeof DEFAULT_FORM[typeof key])}
        style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
      />
      {label}
    </label>
  )

  const radioGroup = <T extends string>(key: keyof typeof DEFAULT_FORM, options: { value: T; label: string; pts?: number }[]) => (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-3 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          <input
            type="radio"
            name={key as string}
            value={opt.value}
            checked={form[key] === opt.value}
            onChange={() => set(key, opt.value as typeof DEFAULT_FORM[typeof key])}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span>{opt.label}</span>
          {opt.pts !== undefined && (
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginLeft: 'auto' }}>
              {opt.pts} pts
            </span>
          )}
        </label>
      ))}
    </div>
  )

  const textInput = (key: keyof typeof DEFAULT_FORM, placeholder: string) => (
    <input
      type="text"
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as typeof DEFAULT_FORM[typeof key])}
      placeholder={placeholder}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-ui)', outline: 'none', width: '100%' }}
      onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
      onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
    />
  )

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '800px', margin: 'auto', display: 'flex', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left — form */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginBottom: '2px' }}>
                {buCode} · Onboarding Score
              </div>
              <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>
                {bu?.name ?? buCode}
              </h2>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-6">
            {/* A — Content */}
            <div>
              {sectionHeader('A · Content Activity', 25)}
              <div className="flex flex-col gap-4">
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>How many pieces published this week?</p>
                  {radioGroup('publishes_per_week', [
                    { value: 0 as unknown as string, label: 'None', pts: 0 },
                    { value: 1 as unknown as string, label: '1–2 pieces', pts: 10 },
                    { value: 2 as unknown as string, label: '3+ off-strategy', pts: 12 },
                    { value: 3 as unknown as string, label: '3+ on-strategy', pts: 25 },
                  ])}
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>Is content following defined pillars?</p>
                  {radioGroup('content_is_on_strategy', [
                    { value: 'YES', label: 'Yes' },
                    { value: 'PARTIALLY', label: 'Partially' },
                    { value: 'NO', label: 'No' },
                  ])}
                </div>
              </div>
            </div>

            {/* B — Strategy */}
            <div>
              {sectionHeader('B · Strategy Documentation', 20)}
              <div className="flex flex-col gap-3">
                {toggle('has_brand_brief', 'Brand Brief complete (5 pts)')}
                {toggle('has_content_pillars', 'Content pillars defined (5 pts)')}
                {toggle('has_moodboard', 'Moodboard in Figma (5 pts)')}
                {toggle('has_communication_objective', 'Communication objective assigned (5 pts)')}
              </div>
            </div>

            {/* C — Pipeline */}
            <div>
              {sectionHeader('C · Pipeline Health', 15)}
              <div className="flex flex-col gap-3">
                {toggle('has_active_assets', 'Assets actively in Design or Development (8 pts)')}
                <label className="flex items-center gap-3 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={form.has_overdue_assets}
                    onChange={(e) => set('has_overdue_assets', e.target.checked)}
                    style={{ accentColor: '#EF4444', width: '16px', height: '16px' }}
                  />
                  Any assets overdue 48h+ without approval? <span style={{ color: '#EF4444', fontSize: '12px' }}>(−7 pts)</span>
                </label>
              </div>
            </div>

            {/* D — Revenue */}
            <div>
              {sectionHeader('D · Revenue Attribution', 30)}
              {radioGroup('revenue_trend', [
                { value: 'GROWING', label: '📈 Growing (+5% or more)', pts: 30 },
                { value: 'STABLE', label: '➖ Stable (±5%)', pts: 20 },
                { value: 'DECLINING', label: '📉 Declining (−5% to −15%)', pts: 10 },
                { value: 'FREEFALL', label: '🚨 Freefall (−15% or more)', pts: 0 },
                { value: 'NO_DATA', label: '❓ No data', pts: 0 },
              ])}
            </div>

            {/* E — Engagement */}
            <div>
              {sectionHeader('E · Audience Connection', 10)}
              {radioGroup('engagement_level', [
                { value: 'HIGH', label: '🔥 High — DMs, intentional comments, UGC', pts: 10 },
                { value: 'MEDIUM', label: '👍 Medium — Saves and shares', pts: 5 },
                { value: 'LOW', label: '😐 Low — Only likes', pts: 0 },
                { value: 'NO_DATA', label: '❓ No data', pts: 0 },
              ])}
            </div>

            {/* Additional fields */}
            <div>
              {sectionHeader('Additional Info', 0)}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'instagram_handle', label: 'Instagram', placeholder: '@handle' },
                  { key: 'facebook_page', label: 'Facebook', placeholder: 'Page URL' },
                  { key: 'whatsapp_number', label: 'WhatsApp', placeholder: '+52...' },
                  { key: 'meta_pixel_id', label: 'Meta Pixel ID', placeholder: '123456789' },
                  { key: 'primary_channel', label: 'Primary Channel', placeholder: 'Instagram / WhatsApp' },
                  { key: 'monthly_content_budget', label: 'Monthly Budget (MXN)', placeholder: '5000' },
                ].map((f) => (
                  <div key={f.key}>
                    <label style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    {textInput(f.key as keyof typeof DEFAULT_FORM, f.placeholder)}
                  </div>
                ))}
                <div className="col-span-2">
                  <label style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Notes / Context</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Any additional context..."
                    rows={3}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-ui)', outline: 'none', width: '100%', resize: 'vertical' }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right — live score preview */}
        <div
          style={{ width: '220px', background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border-subtle)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0, overflow: 'auto' }}
        >
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              LIVE PREVIEW
            </div>
            <div className="flex items-center gap-2">
              <HealthBadge status={scores.status} score={scores.total} />
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>/ 100</span>
            </div>
          </div>

          {/* Total bar */}
          <div>
            <div style={{ background: 'var(--border-default)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${scores.total}%`,
                  background: scores.status === 'HEALTHY' ? '#22C55E' : scores.status === 'ATTENTION' ? '#EAB308' : scores.status === 'AT_RISK' ? '#EF4444' : '#3A3A3A',
                  height: '100%',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Dimension scores */}
          <div className="flex flex-col gap-3">
            {([
              { key: 'a', label: 'Content', max: SCORE_MAXES.a },
              { key: 'b', label: 'Strategy', max: SCORE_MAXES.b },
              { key: 'c', label: 'Pipeline', max: SCORE_MAXES.c },
              { key: 'd', label: 'Revenue', max: SCORE_MAXES.d },
              { key: 'e', label: 'Audience', max: SCORE_MAXES.e },
            ] as const).map((dim) => (
              <ScoreBar
                key={dim.key}
                label={dim.label}
                score={scores[dim.key]}
                max={dim.max}
                animate={false}
              />
            ))}
          </div>

          {/* Score breakdown */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            {[
              { label: 'A Content', score: scores.a, max: SCORE_MAXES.a },
              { label: 'B Strategy', score: scores.b, max: SCORE_MAXES.b },
              { label: 'C Pipeline', score: scores.c, max: SCORE_MAXES.c },
              { label: 'D Revenue', score: scores.d, max: SCORE_MAXES.d },
              { label: 'E Audience', score: scores.e, max: SCORE_MAXES.e },
            ].map((row) => (
              <div key={row.label} className="flex justify-between" style={{ fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{row.label}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{row.score}/{row.max}</span>
              </div>
            ))}
            <div className="flex justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>TOTAL</span>
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700 }}>{scores.total}/100</span>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              background: saved ? 'var(--status-healthy)' : 'var(--accent)',
              color: '#000',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: saving || saved ? 'not-allowed' : 'pointer',
              marginTop: 'auto',
            }}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Score'}
          </button>
        </div>
      </div>
    </div>
  )
}
