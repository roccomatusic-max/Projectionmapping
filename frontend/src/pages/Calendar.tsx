import type { Session } from '@/api/client'
import { CalendarBoard } from '@/components/calendar/CalendarBoard'
import { CalendarIcon } from '@/components/icons'
import { PageHeader } from '@/components/ui'
import { useFleetContext } from '@/live/LiveProvider'

/** Plan shows ahead on a month, a week or a list. See components/calendar/. */
export default function Calendar({ session }: { session: Session }) {
  const { subscribe } = useFleetContext()
  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarIcon}
        title="Calendar"
        subtitle="Plan shows ahead. Pick the nights, a scene group and the times; the show starts and stops by itself."
      />
      <CalendarBoard canEdit={session.role !== 'viewer'} subscribe={subscribe} />
    </div>
  )
}
