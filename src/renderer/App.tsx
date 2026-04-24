import {
  useState,
  createContext,
  useContext,
  useEffect,
  useCallback
} from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, UserCheck, Users, Globe } from 'lucide-react'
import EventsPage from './pages/Events'
import CheckInPage from './pages/CheckIn'
import AttendancePage from './pages/Attendance'
import type { Event } from '@shared/types'

type Page = 'events' | 'checkin' | 'attendance'

interface AppContextType {
  activeEvent: Event | null
  setActiveEvent: (e: Event | null) => void
  refreshEvents: () => void
}

export const AppContext = createContext<AppContextType>({
  activeEvent: null,
  setActiveEvent: () => {},
  refreshEvents: () => {}
})

export function useApp() {
  return useContext(AppContext)
}

export default function App() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<Page>('events')
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [events, setEvents] = useState<Event[]>([])

  const loadEvents = useCallback(async () => {
    const data = await window.api.events.list()
    setEvents(data)
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const handleSelectEvent = (id: string) => {
    if (!id) {
      setActiveEvent(null)
      return
    }
    const ev = events.find((e) => e.id === Number(id)) ?? null
    setActiveEvent(ev)
  }

  const toggleLang = () =>
    i18n.changeLanguage(i18n.language === 'th' ? 'en' : 'th')

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'events', label: t('nav.events'), icon: <CalendarDays size={18} /> },
    { id: 'checkin', label: t('nav.checkin'), icon: <UserCheck size={18} /> },
    { id: 'attendance', label: t('nav.attendance'), icon: <Users size={18} /> }
  ]

  return (
    <AppContext.Provider
      value={{ activeEvent, setActiveEvent, refreshEvents: loadEvents }}
    >
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h1 className="text-base font-bold text-gray-800 leading-tight mb-2">
              {t('nav.title')}
            </h1>
            <select
              value={activeEvent?.id ?? ''}
              onChange={(e) => handleSelectEvent(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
            >
              <option value="">{t('nav.select_event')}</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  page === item.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-gray-100">
            <button
              onClick={toggleLang}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
            >
              <Globe size={16} />
              {i18n.language === 'th' ? 'English' : 'ภาษาไทย'}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {page === 'events' && <EventsPage />}
          {page === 'checkin' && <CheckInPage />}
          {page === 'attendance' && <AttendancePage />}
        </main>
      </div>
    </AppContext.Provider>
  )
}
