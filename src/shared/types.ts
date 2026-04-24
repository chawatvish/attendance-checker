export interface Event {
  id: number
  name: string
  date: string | null
  description: string | null
  created_at: string
}

export interface Attendee {
  id: number
  event_id: number
  thai_id: string
  full_name: string | null
}

export interface CheckIn {
  id: number
  event_id: number
  thai_id: string
  full_name: string | null
  dob: string | null
  checked_in_at: string
  method: 'card' | 'manual'
  is_walkin?: boolean
}

export type CheckInStatus = 'approved' | 'duplicate' | 'not_found'

export interface CardData {
  thai_id: string        // เลขบัตร (13 digits)
  thai_name: string      // ชื่อนามสกุล (TH)
  en_name: string        // ชื่อนามสกุล (EN)
  dob: string            // วันเกิด YYYY-MM-DD
  gender: string | null  // เพศ
  issuer: string | null  // หน่วยงานออกบัตร
  issue_date: string | null   // วันออกบัตร
  expire_date: string | null  // วันหมดอายุ
  religion: string | null     // ศาสนา
  address: string | null      // ที่อยู่
  card_number_back: string | null  // เลขใต้บัตร
  photo: string | null   // base64 JPEG
}

export interface CheckInResult {
  status: CheckInStatus
  card_data: CardData
  checkin?: CheckIn
  attendee?: Attendee
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface AttendanceSummary {
  total_registered: number
  /** Check-ins whose Thai ID is in the attendee list */
  registered_checkedin: number
  /** Check-ins whose Thai ID is NOT in the attendee list (walk-ins) */
  walkin_checkedin: number
  checkins: CheckIn[]
}
