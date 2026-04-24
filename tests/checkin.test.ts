/**
 * Check-in status logic tests
 * Tests the core business logic: approved / duplicate / not_found
 */
import Database from 'better-sqlite3'
import type { CardData } from '../src/shared/types'

type DB = ReturnType<typeof Database>
type CheckInStatus = 'approved' | 'duplicate' | 'not_found'

// ── Inline helpers (same logic as src/main/ipc/checkins.ts) ──────────────────

function buildDb(): DB {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE attendees (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, thai_id TEXT NOT NULL, full_name TEXT, UNIQUE(event_id, thai_id));
    CREATE TABLE checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, thai_id TEXT NOT NULL, full_name TEXT, dob TEXT, checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, method TEXT CHECK(method IN ('card','manual')), UNIQUE(event_id, thai_id));
  `)
  return db
}

function setup(db: DB) {
  const ev = db.prepare('INSERT INTO events (name) VALUES (?)').run('Test Event')
  const eventId = ev.lastInsertRowid as number
  db.prepare('INSERT INTO attendees (event_id, thai_id, full_name) VALUES (?, ?, ?)').run(eventId, '1100100000001', 'สมชาย ใจดี')
  db.prepare('INSERT INTO attendees (event_id, thai_id, full_name) VALUES (?, ?, ?)').run(eventId, '1100100000002', 'สมหญิง รักไทย')
  return eventId
}

function processCheckin(db: DB, eventId: number, thaiId: string): { status: CheckInStatus } {
  const attendee = db.prepare('SELECT * FROM attendees WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId)
  const existing = db.prepare('SELECT * FROM checkins WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId)
  if (existing) return { status: 'duplicate' }
  return { status: attendee ? 'approved' : 'not_found' }
}

function confirmCheckin(db: DB, eventId: number, cardData: CardData, method: 'card' | 'manual') {
  const existing = db.prepare('SELECT * FROM checkins WHERE event_id = ? AND thai_id = ?').get(eventId, cardData.thai_id)
  if (existing) return { status: 'duplicate' as CheckInStatus, checkin: existing }
  const r = db.prepare('INSERT INTO checkins (event_id, thai_id, full_name, dob, method) VALUES (?, ?, ?, ?, ?)').run(
    eventId, cardData.thai_id, cardData.thai_name || null, cardData.dob || null, method
  )
  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ?').get(r.lastInsertRowid)
  const attendee = db.prepare('SELECT * FROM attendees WHERE event_id = ? AND thai_id = ?').get(eventId, cardData.thai_id)
  return { status: (attendee ? 'approved' : 'not_found') as CheckInStatus, checkin }
}

function makeCard(thaiId: string, overrides: Partial<CardData> = {}): CardData {
  return {
    thai_id: thaiId,
    thai_name: 'สมชาย ใจดี',
    en_name: 'Somchai Jaidee',
    dob: '1990-01-01',
    gender: null,
    issuer: null,
    issue_date: null,
    expire_date: null,
    religion: null,
    address: null,
    card_number_back: null,
    photo: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Check-in status — processCheckin', () => {
  let db: DB
  let eventId: number

  beforeEach(() => { db = buildDb(); eventId = setup(db) })
  afterEach(() => { db.close() })

  it('returns "approved" for registered attendee not yet checked in', () => {
    const result = processCheckin(db, eventId, '1100100000001')
    expect(result.status).toBe('approved')
  })

  it('returns "not_found" for unregistered ID', () => {
    const result = processCheckin(db, eventId, '9999999999999')
    expect(result.status).toBe('not_found')
  })

  it('returns "duplicate" if already checked in', () => {
    db.prepare('INSERT INTO checkins (event_id, thai_id, method) VALUES (?, ?, ?)').run(eventId, '1100100000001', 'card')
    const result = processCheckin(db, eventId, '1100100000001')
    expect(result.status).toBe('duplicate')
  })

  it('correctly distinguishes between two attendees', () => {
    db.prepare('INSERT INTO checkins (event_id, thai_id, method) VALUES (?, ?, ?)').run(eventId, '1100100000001', 'card')
    expect(processCheckin(db, eventId, '1100100000001').status).toBe('duplicate')
    expect(processCheckin(db, eventId, '1100100000002').status).toBe('approved')
  })
})

describe('Check-in status — confirmCheckin', () => {
  let db: DB
  let eventId: number

  beforeEach(() => { db = buildDb(); eventId = setup(db) })
  afterEach(() => { db.close() })

  it('writes check-in record and returns approved status', () => {
    const result = confirmCheckin(db, eventId, makeCard('1100100000001'), 'card')
    expect(result.status).toBe('approved')
    expect(result.checkin).toBeDefined()
    expect((result.checkin as any).thai_id).toBe('1100100000001')
    expect((result.checkin as any).method).toBe('card')
  })

  it('writes check-in with dob from card data', () => {
    const result = confirmCheckin(db, eventId, makeCard('1100100000001', { dob: '1985-03-22' }), 'card')
    expect((result.checkin as any).dob).toBe('1985-03-22')
  })

  it('returns "not_found" status but still writes check-in for walk-in', () => {
    const result = confirmCheckin(db, eventId, makeCard('9999999999999'), 'manual')
    expect(result.status).toBe('not_found')
    expect(result.checkin).toBeDefined()
    // Verify it was actually written to DB
    const ci = db.prepare('SELECT * FROM checkins WHERE thai_id = ?').get('9999999999999') as any
    expect(ci).not.toBeNull()
    expect(ci.method).toBe('manual')
  })

  it('returns "duplicate" without creating a second record', () => {
    confirmCheckin(db, eventId, makeCard('1100100000001'), 'card')
    const result = confirmCheckin(db, eventId, makeCard('1100100000001'), 'manual')
    expect(result.status).toBe('duplicate')
    const count = (db.prepare('SELECT COUNT(*) as c FROM checkins WHERE thai_id = ?').get('1100100000001') as any).c
    expect(count).toBe(1)
  })

  it('records manual entry method correctly', () => {
    const result = confirmCheckin(db, eventId, makeCard('1100100000002'), 'manual')
    expect((result.checkin as any).method).toBe('manual')
  })

  it('records thai_name from card data as full_name', () => {
    const card = makeCard('1100100000001', { thai_name: 'นภา มีสุข' })
    const result = confirmCheckin(db, eventId, card, 'card')
    expect((result.checkin as any).full_name).toBe('นภา มีสุข')
  })

  it('check-ins are isolated per event', () => {
    const ev2 = (db.prepare('INSERT INTO events (name) VALUES (?)').run('Event 2')).lastInsertRowid as number
    db.prepare('INSERT INTO attendees (event_id, thai_id, full_name) VALUES (?, ?, ?)').run(ev2, '1100100000001', 'Person')

    confirmCheckin(db, eventId, makeCard('1100100000001'), 'card')
    // Same person in event 2 should still be "approved" not "duplicate"
    const result = processCheckin(db, ev2, '1100100000001')
    expect(result.status).toBe('approved')
  })
})

describe('Check-in — CSV export format', () => {
  let db: DB
  let eventId: number

  beforeEach(() => {
    db = buildDb()
    eventId = setup(db)
    confirmCheckin(db, eventId, makeCard('1100100000001', { thai_name: 'สมชาย ใจดี', dob: '1990-05-20' }), 'card')
    confirmCheckin(db, eventId, makeCard('1100100000002', { thai_name: 'สมหญิง รักไทย' }), 'manual')
  })
  afterEach(() => { db.close() })

  it('retrieves all check-ins for export', () => {
    const checkins = db.prepare('SELECT * FROM checkins WHERE event_id = ? ORDER BY checked_in_at').all(eventId) as any[]
    expect(checkins).toHaveLength(2)
  })

  it('export data contains required fields', () => {
    const checkins = db.prepare('SELECT * FROM checkins WHERE event_id = ?').all(eventId) as any[]
    for (const ci of checkins) {
      expect(ci).toHaveProperty('thai_id')
      expect(ci).toHaveProperty('full_name')
      expect(ci).toHaveProperty('checked_in_at')
      expect(ci).toHaveProperty('method')
    }
  })
})
