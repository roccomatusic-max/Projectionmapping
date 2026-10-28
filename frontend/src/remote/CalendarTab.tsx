import type { Session } from '@/api/client'
import { CalendarBoard } from '@/components/calendar/CalendarBoard'

/**
 * The show calendar on the phone: the same board as the Calendar page
 * (components/calendar/CalendarBoard.tsx), opening on the list of what is
 * coming up. The remote has no live feed, so the board checks every 30 seconds.
 */
export default function CalendarTab({ session }: { session: Session }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-6 pt-3">
      <header>
        <p className="text-[17px] font-semibold text-slate-50">Calendar</p>
        <p className="text-xs text-slate-500">Only the nights you add play. Tap a show to change it.</p>
      </header>
      <CalendarBoard canEdit={session.role === 'admin' || session.role === 'operator'} phone />
    </div>
  )
}
