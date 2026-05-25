export type UserRole = "MASTER" | "C_LEVEL" | "OPS_MANAGER" | "MARKETING" | "TEAM"

export type HealthStatus = "HEALTHY" | "ATTENTION" | "AT_RISK" | "NO_DATA"

export type RevenueTrend = "GROWING" | "STABLE" | "DECLINING" | "FREEFALL" | "NO_DATA"

export type EngagementLevel = "HIGH" | "MEDIUM" | "LOW" | "NO_DATA"

export type TaskType = "MAINTENANCE" | "HARDWARE" | "REPORT" | "CONTENT" | "PROJECT"

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "PROOF_SUBMITTED" | "APPROVED" | "REVISION"

export type TaskPriority = "HIGH" | "MEDIUM" | "LOW"

export type DeadlineType = "HARD" | "SOFT"

export interface Profile {
  id: string
  full_name: string | null
  last_name: string | null
  email: string | null
  role: UserRole | null
  address: string | null
  birth_date: string | null
  avatar_url: string | null
  onboarding_completed: boolean
  created_at: string
}

export interface BusinessUnit {
  id: string
  code: string
  name: string
  category: string | null
  location: string | null
  brief: string | null
  tone_of_voice: string | null
  content_strategy: string | null
  project_phase: string | null
  revenue_health: string | null
  communication_objective: string | null
  figma_link: string | null
  drive_link: string | null
  created_at: string
  updated_at: string
}

export interface MarketingScore {
  id: string
  bu_id: string
  week_start: string
  week_end: string
  score_a: number
  score_b: number
  score_c: number
  score_d: number
  score_e: number
  total_score: number
  health_status: HealthStatus
  notes: string | null
  scored_by: string | null
  created_at: string
}

export interface BUOnboarding {
  id: string
  bu_id: string
  publishes_per_week: number
  content_is_on_strategy: "YES" | "PARTIALLY" | "NO"
  has_brand_brief: boolean
  has_content_pillars: boolean
  has_moodboard: boolean
  has_communication_objective: boolean
  has_active_assets: boolean
  has_overdue_assets: boolean
  revenue_trend: RevenueTrend
  engagement_level: EngagementLevel
  instagram_handle: string | null
  facebook_page: string | null
  whatsapp_number: string | null
  meta_pixel_id: string | null
  primary_channel: string | null
  monthly_content_budget: number | null
  notes: string | null
  completed_by: string | null
  completed_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  type: TaskType
  bu_id: string | null
  priority: TaskPriority
  status: TaskStatus
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  proof_required: boolean
  deadline_type: DeadlineType
  estimated_hours: number | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ScoreInput {
  publishes_per_week: 0 | 1 | 2 | 3
  has_brand_brief: boolean
  has_content_pillars: boolean
  has_moodboard: boolean
  has_communication_objective: boolean
  has_active_assets: boolean
  has_overdue_assets: boolean
  revenue_trend: RevenueTrend
  engagement_level: EngagementLevel
}

export interface ScoreResult {
  a: number
  b: number
  c: number
  d: number
  e: number
  total: number
  status: HealthStatus
}
