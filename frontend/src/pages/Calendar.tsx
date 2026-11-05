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
        subtitle="Add a show to each night you want one: a scene group and the times. Only those nights play; the rest stay dark."
      />
      <CalendarBoard canEdit={session.role !== 'viewer'} subscribe={subscribe} />
    </div>
  )
}
