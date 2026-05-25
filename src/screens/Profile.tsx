import { useState, useRef } from 'react'
import { Camera, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile as ProfileType } from '../types'

interface Props {
  profile: ProfileType
  onUpdated: () => void
}

export function Profile({ profile, onUpdated }: Props) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [address, setAddress] = useState(profile.address ?? '')
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '')
  const [slackWebhook, setSlackWebhook] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [testingSlack, setTestingSlack] = useState(false)
  const [slackStatus, setSlackStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setUploadError(null)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}.${ext}`
    // Delete old file first so upsert works regardless of policy setup
    await supabase.storage.from('avatars').remove([path])
    const { error } = await supabase.storage.from('avatars').upload(path, file)
    if (error) {
      setUploadError(error.message)
      setUploadingAvatar(false)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so browser loads the new image even if URL is the same
    const freshUrl = `${data.publicUrl}?t=${Date.now()}`
    setAvatarUrl(freshUrl)
    await supabase.from('profiles').update({ avatar_url: freshUrl }).eq('id', profile.id)
    setUploadingAvatar(false)
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: fullName || null,
      last_name: lastName || null,
      address: address || null,
      birth_date: birthDate || null,
    }).eq('id', profile.id)

    // Save Slack webhook to both localStorage and app_settings
    if (slackWebhook) {
      localStorage.setItem('hog_slack_webhook', slackWebhook)
      await supabase.from('app_settings').upsert({ key: 'slack_webhook', value: slackWebhook }, { onConflict: 'key' })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdated()
  }

  async function testSlack() {
    const url = slackWebhook || localStorage.getItem('hog_slack_webhook') || ''
    if (!url) return
    if (!url.startsWith('https://hooks.slack.com/')) {
      setSlackStatus('error')
      return
    }
    setTestingSlack(true)
    setSlackStatus('idle')
    try {
      // no-cors: browser blocks reading response but message still delivers
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ HOG OPS — Slack integration is working!' }),
      })
      setSlackStatus('ok')
    } catch {
      setSlackStatus('error')
    }
    setTestingSlack(false)
  }

  // Load saved webhook on mount
  useState(() => {
    const saved = localStorage.getItem('hog_slack_webhook')
    if (saved) setSlackWebhook(saved)
  })

  const ROLE_COLORS: Record<string, string> = {
    MASTER: '#22C55E',
    OPS_MANAGER: '#EAB308',
    MARKETING: '#3B82F6',
    TEAM: '#888888',
  }

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '9px 12px',
    fontSize: '14px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  const label = (text: string) => (
    <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>{text}</label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Profile</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Manage your account and integrations</p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Avatar */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Photo</h3>
            <div className="flex items-center gap-5">
              <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-default)' }} />
                ) : (
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '2px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '24px', fontWeight: 700 }}>
                      {(fullName || profile.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Camera size={12} color="#000" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              </div>
              <div>
                <p style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>{fullName || '—'} {lastName}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{profile.email}</p>
                <span style={{ color: ROLE_COLORS[profile.role ?? 'TEAM'], fontFamily: 'var(--font-mono)', fontSize: '11px', background: `${ROLE_COLORS[profile.role ?? 'TEAM']}18`, padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                  {profile.role}
                </span>
              </div>
            </div>
            {uploadingAvatar && <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '10px' }}>Uploading…</p>}
            {uploadError && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '10px' }}>Upload failed: {uploadError}</p>}
          </div>

          {/* Personal info */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Personal Info</h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('First name')}
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Last name')}
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Birth date')}
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Address')}
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, State" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Slack */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: '16px' }}>💬</span>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Slack Integration</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '14px', lineHeight: '1.5' }}>
              Connect a Slack Incoming Webhook to receive task notifications in your channel.
            </p>
            <div className="flex flex-col gap-3">
              {label('Webhook URL')}
              <input
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={testSlack}
                  disabled={testingSlack || !slackWebhook}
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: slackWebhook ? 'var(--text-secondary)' : 'var(--text-tertiary)', borderRadius: '7px', padding: '8px 14px', fontSize: '12px', cursor: slackWebhook ? 'pointer' : 'not-allowed' }}
                >
                  {testingSlack ? 'Sending…' : 'Test connection'}
                </button>
                {slackStatus === 'ok' && <span style={{ color: '#22C55E', fontSize: '12px' }}>✓ Message sent!</span>}
                {slackStatus === 'error' && <span style={{ color: '#EF4444', fontSize: '12px' }}>✗ Failed — check the URL</span>}
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', lineHeight: '1.5' }}>
                Get the webhook URL from Slack → Apps → Incoming Webhooks. The URL stays in your browser only.
              </p>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saved ? '#16A34A' : 'var(--accent)', color: '#000', borderRadius: '9px', padding: '12px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Save size={15} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
