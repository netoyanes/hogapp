import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface Props {
  profile: Profile
  onComplete: () => void
}

export function UserOnboarding({ profile, onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '')
  const [address, setAddress] = useState(profile.address ?? '')
  const [saving, setSaving] = useState(false)

  const TOTAL_STEPS = 4

  async function handleFinish() {
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: fullName,
      last_name: lastName,
      birth_date: birthDate || null,
      address: address || null,
      onboarding_completed: true,
    }).eq('id', profile.id)
    setSaving(false)
    onComplete()
  }

  const ROLE_LABELS: Record<string, string> = {
    MASTER: 'Master — Full access to all systems',
    OPS_MANAGER: 'Ops Manager — Access to assigned Business Units',
    MARKETING: 'Marketing — Content and campaign access',
    TEAM: 'Team — Assigned tasks only',
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }} className="flex items-center justify-center p-4">
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', width: '100%', maxWidth: '440px' }}
        className="p-8"
      >
        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              Setup
            </span>
          </div>
          <div style={{ background: 'var(--border-default)', borderRadius: '999px', height: '4px' }}>
            <div
              style={{ background: 'var(--accent)', borderRadius: '999px', height: '4px', width: `${(step / TOTAL_STEPS) * 100}%`, transition: 'width 0.3s ease' }}
            />
          </div>
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>👋</div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Welcome to HOG APP.
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              Let's set up your profile. This takes less than a minute.
            </p>
            <button
              onClick={() => setStep(2)}
              style={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', width: '100%' }}
            >
              Get started
            </button>
          </div>
        )}

        {/* Step 2 — Personal info */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                Your details
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Help your team know who you are.</p>
            </div>
            {[
              { label: 'First name', value: fullName, onChange: setFullName, placeholder: 'Neto', required: true },
              { label: 'Last name', value: lastName, onChange: setLastName, placeholder: 'Yáñez', required: false },
              { label: 'Birth date', value: birthDate, onChange: setBirthDate, placeholder: '', type: 'date', required: false },
              { label: 'Address', value: address, onChange: setAddress, placeholder: 'City, State', required: false },
            ].map((field) => (
              <div key={field.label} className="flex flex-col gap-1.5">
                <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {field.label} {field.required && <span style={{ color: 'var(--accent)' }}>*</span>}
                </label>
                <input
                  type={('type' in field ? field.type : 'text') as string}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '14px', fontFamily: 'var(--font-ui)', outline: 'none' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>
            ))}
            <div className="flex gap-3 mt-2">
              <button onClick={() => setStep(1)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={() => setStep(3)} disabled={!fullName} style={{ flex: 1, background: fullName ? 'var(--accent)' : 'var(--bg-elevated)', color: fullName ? '#000' : 'var(--text-tertiary)', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: fullName ? 'pointer' : 'not-allowed' }}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Role */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                Your role
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Assigned by your administrator.</p>
            </div>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                {profile.role ?? 'TEAM'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>
                {ROLE_LABELS[profile.role ?? 'TEAM'] ?? 'Team access'}
              </div>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: '1.6' }}>
              Your role determines which Business Units and features are visible to you. Contact your admin if your role needs to change.
            </p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setStep(2)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={() => setStep(4)} style={{ flex: 1, background: 'var(--accent)', color: '#000', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 4 && (
          <div className="text-center">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              You're all set.
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Welcome to HOG APP, {fullName || 'there'}. Your dashboard is ready.
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              style={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', width: '100%' }}
            >
              {saving ? 'Saving…' : 'Enter HOG APP →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
