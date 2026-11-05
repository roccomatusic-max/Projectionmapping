import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Session } from '@/api/client'
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronIcon,
  EnergyIcon,
  ShowHistoryIcon,
  MiniPcIcon,
  ProjectorIcon,
  RunShowIcon,
  TemperatureIcon,
  WarningIcon,
} from '@/components/icons'
import { Banner, Chip, EmptyState, PageHeader, Panel, SectionBar, Spinner, Stat, type Tone } from '@/components/ui'
import { useFleetContext } from '@/live/LiveProvider'
import { classNames } from '@/lib/format'
import {
  type EnergyReport,
  type NightsReply,
  type Season,
  type ShowNight,
  type Wrapup,
  degrees,
  historyApi,
  minutesText,
  money,
  nightLabel,
  timeOf,
} from '@/lib/history'

type Part = 'nights' | 'energy' | 'season'

const PARTS: Array<{ id: Part; label: string; hint: string }> = [
  { id: 'nights', label: 'Nights', hint: 'Every show: when it ran, what played, problems and temperatures.' },
  { id: 'energy', label: 'Energy', hint: 'Hours each projector was on and roughly what it cost, week by week.' },
  { id: 'season', label: 'Season wrap-up', hint: 'A whole season in numbers.' },
]

/** Not green or red: those mean OK and fault everywhere else. */
const PROJECTOR_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15']
const CHART_AXIS = { stroke: '#64748b', fontSize: 11 }
const TOOLTIP_STYLE = { background: '#141820', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Health → Show history: the nights, the energy report and the season wrap-up. */
export default function ShowHistory({ session }: { session: Session }) {
  const [search, setSearch] = useSearchParams()
  const part: Part = PARTS.find((p) => p.id === search.get('part'))?.id ?? 'nights'
  const setPart = (id: Part, extra: Record<string, string> = {}) =>
    setSearch(id === 'nights' ? {} : { part: id, ...extra }, { replace: true })
  const [seasons, setSeasons] = useState<Season[] | null>(null)
  const justFinished = seasons?.find((s) => s.just_finished) ?? null

  useEffect(() => {
    historyApi.seasons().then((r) => setSeasons(r.seasons)).catch(() => setSeasons([]))
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShowHistoryIcon}
        title="Show history"
        subtitle="Every show night, what the projectors used, and each season in numbers."
      />
      {justFinished && part !== 'season' && (
        <Banner
          tone="ok"
          icon={CalendarIcon}
          title={`${justFinished.name} is over: ${justFinished.nights_played} night${justFinished.nights_played === 1 ? '' : 's'} of shows.`}
          action={
            <button className="btn-default btn-sm" onClick={() => setPart('season', { season: justFinished.key })}>
              See the wrap-up
            </button>
          }
        />
      )}
      <SectionBar label="Show history sections" sections={PARTS} value={part} onChange={(id) => setPart(id)} />
      {part === 'nights' && <Nights />}
      {part === 'energy' && <Energy canEdit={session.role !== 'viewer'} />}
      {part === 'season' && (
        <SeasonWrapup
          seasons={seasons}
          picked={search.get('season')}
          onPick={(key) => setSearch({ part: 'season', season: key }, { replace: true })}
        />
      )}
    </div>
  )
}

// -- nights ---------------------------------------------------------------------------

const RANGES = [
  { days: 14, label: 'Last 2 weeks' },
  { days: 60, label: 'Last 2 months' },
  { days: 365, label: 'Last year' },
]

function useHistoryRefresh(load: () => void) {
  const { subscribe } = useFleetContext()
  useEffect(() => {
    const off = subscribe((message) => {
      if (message.type === 'show_history') load()
    })
    // A running show's hours and temperatures move on by themselves.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => {
      off()
      window.clearInterval(timer)
    }
  }, [subscribe, load])
}

function Nights() {
  const [days, setDays] = useState(60)
  const [data, setData] = useState<NightsReply | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    historyApi
      .nights(days)
      .then((reply) => {
        setData(reply)
        setError(null)
      })
      .catch((err) => setError(errorText(err, 'Could not load the show history')))
  }, [days])
  useEffect(load, [load])
  useHistoryRefresh(load)

  if (!data) return error ? <Banner tone="fault">{error}</Banner> : <Spinner label="Loading the show history…" />
  const played = data.nights.filter((n) => n.outcome === 'played' || n.outcome === 'running')
  const minutes = played.reduce((sum, n) => sum + (n.minutes ?? 0), 0)
  const problems = data.nights.reduce((sum, n) => sum + n.problems.length, 0)
  const cost = data.nights.reduce((sum, n) => sum + n.cost, 0)
  const missed = data.nights.filter((n) => n.outcome === 'missed' || n.outcome === 'failed').length

  return (
    <div className="space-y-4">
      {error && <Banner tone="fault">{error}</Banner>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Kept since {new Date(data.history_since).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}.
        </p>
        <div className="seg" role="group" aria-label="How far back">
          {RANGES.map((r) => (
            <button key={r.days} className={classNames('seg-item whitespace-nowrap', days === r.days && 'seg-item-active')} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shows played" value={played.length} tone={played.length ? 'ok' : 'idle'} />
        <Stat label="Hours of shows" value={(minutes / 60).toFixed(1)} />
        <Stat label="Problems" value={problems} tone={problems ? 'warn' : 'ok'} hint="Projectors or mini PCs dropping off, emergency stops, starts that failed, running hot." />
        <Stat label="Energy, roughly" value={money(cost, data.currency)} hint={`At ${data.currency}${data.price_per_kwh} per kWh. Change it under Energy.`} />
      </div>
      {missed > 0 && (
        <Banner tone="warn" title={`${missed} planned show${missed === 1 ? '' : 's'} did not play.`}>
          They are marked “Did not play” below with the reason.
        </Banner>
      )}
      {data.nights.length === 0 ? (
        <Panel>
          <EmptyState icon={ShowHistoryIcon} title="No shows yet">
            Each show is written down here from the moment it starts: by the show time, Start now, GO on Run the show, the phone or Home Assistant.
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-2">
          {data.nights.map((night) => (
            <NightCard key={night.id} night={night} currency={data.currency} />
          ))}
        </div>
      )}
    </div>
  )
}

const OUTCOME: Record<ShowNight['outcome'], { label: string; tone: Tone }> = {
  running: { label: 'Playing now', tone: 'ok' },
  played: { label: 'Played', tone: 'idle' },
  missed: { label: 'Did not play', tone: 'warn' },
  failed: { label: 'Could not start', tone: 'fault' },
}

function sourceText(night: ShowNight): string {
  if (night.source === 'calendar') return 'From the calendar'
  if (night.source === 'weekly') return 'Weekly show time'
  if (night.source === 'earlier') return 'From the log'
  return 'Started by hand'
}

function NightCard({ night, currency }: { night: ShowNight; currency: string }) {
  const [open, setOpen] = useState(false)
  const outcome = OUTCOME[night.outcome]
  const didPlay = night.outcome === 'played' || night.outcome === 'running'
  const times = didPlay
    ? `${timeOf(night.started_at)} to ${night.outcome === 'running' ? 'now' : night.ended_at ? timeOf(night.ended_at) : 'unknown'}`
    : night.planned_start
      ? `Planned ${timeOf(night.planned_start)} to ${timeOf(night.planned_end)}`
      : ''
  const hot = night.hottest
  return (
    <section className="panel overflow-hidden">
      <button
        className="flex w-full flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-white/[0.02]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="w-28 shrink-0">
          <p className="text-sm font-semibold text-slate-100">{nightLabel(night.night)}</p>
          <Chip tone={outcome.tone} className="mt-1">{outcome.label}</Chip>
        </div>
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-medium text-slate-100">{night.title}</p>
          <p className="tnum text-xs text-slate-400">
            {times}
            {night.minutes != null && didPlay && <> · {minutesText(night.minutes)}</>}
            {' · '}
            {sourceText(night)}
            {night.started_by && <> · started by {night.started_by}</>}
          </p>
          {!didPlay && night.message && <p className="mt-0.5 text-xs text-yellow-200/90">{night.message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {night.problems.length > 0 ? (
            <Chip tone="warn">
              <WarningIcon size={11} aria-hidden /> {night.problems.length} problem{night.problems.length === 1 ? '' : 's'}
            </Chip>
          ) : (
            didPlay && <Chip tone="ok">No problems</Chip>
          )}
          {hot && (
            <Chip tone="idle" title={`Hottest ${hot.key} reading: ${hot.projector}`}>
              <TemperatureIcon size={11} aria-hidden /> {hot.key === 'intake' ? 'Intake' : 'Peak'} {degrees(hot.celsius)}
            </Chip>
          )}
          {didPlay && night.kwh > 0 && (
            <Chip tone="idle">
              <EnergyIcon size={11} aria-hidden /> {night.kwh.toFixed(1)} kWh · {money(night.cost, currency)}
            </Chip>
          )}
          {open ? <ChevronDownIcon size={15} className="text-slate-500" /> : <ChevronIcon size={15} className="text-slate-500" />}
        </div>
      </button>
      {open && <NightDetails night={night} currency={currency} />}
    </section>
  )
}

function NightDetails({ night, currency }: { night: ShowNight; currency: string }) {
  return (
    <div className="grid gap-4 border-t border-white/[0.06] bg-panel-850/40 px-4 py-3 lg:grid-cols-3">
      <div>
        <h3 className="eyebrow mb-1.5 flex items-center gap-1.5"><RunShowIcon size={12} aria-hidden /> What played</h3>
        {night.group_name && <p className="text-sm text-slate-200">Scene group: {night.group_name}</p>}
        {night.show_name && <p className="text-xs text-slate-500">Show: {night.show_name}</p>}
        {night.timeline.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Nothing recorded.</p>
        ) : (
          <ol className="mt-1.5 space-y-0.5 text-xs">
            {night.timeline.map((entry, i) => (
              <li key={i} className="flex gap-2">
                <span className="tnum w-16 shrink-0 text-slate-500">{timeOf(entry.at)}</span>
                <span className={entry.kind === 'stop' || entry.kind === 'start' ? 'text-slate-400' : 'text-slate-200'}>{entry.label}</span>
              </li>
            ))}
          </ol>
        )}
        {night.ended_by && <p className="mt-1.5 text-xs text-slate-500">Stopped by {night.ended_by}.</p>}
      </div>
      <div>
        <h3 className="eyebrow mb-1.5 flex items-center gap-1.5"><WarningIcon size={12} aria-hidden /> Problems</h3>
        {night.problems.length === 0 ? (
          <p className="text-xs text-slate-500">None.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {night.problems.map((p, i) => (
              <li key={i}>
                <span className="tnum text-slate-500">{timeOf(p.at)}</span>{' '}
                <span className={p.severity === 'critical' ? 'text-red-300' : 'text-yellow-200'}>{p.label}</span>
                <span className="block text-slate-400">{p.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="eyebrow mb-1.5 flex items-center gap-1.5"><ProjectorIcon size={12} aria-hidden /> Projectors</h3>
        {night.projectors.length === 0 ? (
          <p className="text-xs text-slate-500">No projectors linked to this show.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1 font-medium">Projector</th>
                <th className="pb-1 font-medium">On</th>
                <th className="pb-1 font-medium" title="The hottest air intake reading; hover a row for every sensor.">Hottest</th>
                <th className="pb-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="tnum text-slate-200">
              {night.projectors.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.04]">
                  <td className="py-1 pr-2">{p.name}</td>
                  <td className="py-1 pr-2">{p.on_hours.toFixed(1)} h</td>
                  <td className="py-1 pr-2" title={Object.entries(p.temps).map(([k, c]) => `${k} ${degrees(c)}`).join(', ')}>
                    {p.temps.intake != null ? `${degrees(p.temps.intake)} intake` : p.hottest ? `${degrees(p.hottest.celsius)} ${p.hottest.key}` : '—'}
                  </td>
                  <td className="py-1 text-right">{money(p.cost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1.5 text-2xs text-slate-500">Temperatures come from Panasonic projectors' own sensors; PJLink-only projectors give none.</p>
      </div>
    </div>
  )
}

// -- energy ------------------------------------------------------------------------------

function weekLabel(start: string): string {
  const [y, m, d] = start.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function Energy({ canEdit }: { canEdit: boolean }) {
  const [weeks, setWeeks] = useState(8)
  const [report, setReport] = useState<EnergyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [measure, setMeasure] = useState<'hours' | 'cost'>('hours')
  const load = useCallback(() => {
    historyApi
      .energy(weeks)
      .then((r) => {
        setReport(r)
        setError(null)
      })
      .catch((err) => setError(errorText(err, 'Could not load the energy report')))
  }, [weeks])
  useEffect(load, [load])
  useHistoryRefresh(load)

  const rows = useMemo(
    () =>
      (report?.weeks ?? []).map((week) => {
        const row: Record<string, number | string> = { week: weekLabel(week.start) }
        for (const p of week.projectors) row[p.name] = measure === 'hours' ? p.hours : p.cost
        return row
      }),
    [report, measure],
  )

  if (!report) return error ? <Banner tone="fault">{error}</Banner> : <Spinner label="Loading the energy report…" />
  const thisWeek = report.weeks.find((w) => w.this_week)
  const lastWeek = report.weeks[report.weeks.length - 2]
  const any = report.weeks.some((w) => w.hours > 0)

  return (
    <div className="space-y-4">
      {error && <Banner tone="fault">{error}</Banner>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This week" value={money(thisWeek?.cost ?? 0, report.currency)} hint={`${thisWeek?.kwh ?? 0} kWh, Monday to Sunday`} />
        <Stat label="Last week" value={money(lastWeek?.cost ?? 0, report.currency)} hint={`${lastWeek?.kwh ?? 0} kWh`} />
        <Stat label={`Last ${weeks} weeks`} value={money(report.total_cost, report.currency)} />
        <Stat label="Energy used" value={`${report.total_kwh.toFixed(0)} kWh`} />
      </div>
      <Panel
        icon={EnergyIcon}
        title="Each projector, week by week"
        description="Hours switched on, from the projector checks every 15 seconds. Weeks run Monday to Sunday; a show past midnight counts on the night it started."
        action={
          <div className="flex flex-wrap gap-2">
            <div className="seg" role="group" aria-label="Show">
              <button className={classNames('seg-item', measure === 'hours' && 'seg-item-active')} onClick={() => setMeasure('hours')}>Hours</button>
              <button className={classNames('seg-item', measure === 'cost' && 'seg-item-active')} onClick={() => setMeasure('cost')}>Cost</button>
            </div>
            <select className="input w-auto" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="How many weeks">
              <option value={4}>4 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={13}>3 months</option>
              <option value={26}>6 months</option>
              <option value={52}>A year</option>
            </select>
          </div>
        }
      >
        {!any ? (
          <EmptyState icon={EnergyIcon} title="No hours yet">
            Hours build up while the projectors are switched on and answering the server.
          </EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows}>
              <CartesianGrid stroke="#1f2733" vertical={false} />
              <XAxis dataKey="week" {...CHART_AXIS} tickLine={false} />
              <YAxis {...CHART_AXIS} tickLine={false} axisLine={false} unit={measure === 'hours' ? ' h' : ''} tickFormatter={(v) => (measure === 'cost' ? `${report.currency}${v}` : String(v))} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                formatter={(value: number) => (measure === 'hours' ? `${value.toFixed(1)} h` : money(value, report.currency))}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {report.projectors.map((p, i) => (
                <Bar key={p.id} dataKey={p.name} stackId="a" fill={PROJECTOR_COLORS[i % PROJECTOR_COLORS.length]} radius={i === report.projectors.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1.5 font-medium">Projector</th>
                <th className="pb-1.5 font-medium">Hours on</th>
                <th className="pb-1.5 font-medium">Watts</th>
                <th className="pb-1.5 font-medium">kWh</th>
                <th className="pb-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {report.projectors.map((p, i) => (
                <tr key={p.id} className="border-t border-white/[0.05]">
                  <td className="py-1.5 pr-2 text-slate-100">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: PROJECTOR_COLORS[i % PROJECTOR_COLORS.length] }} />
                    {p.name}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-200">{p.hours.toFixed(1)}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{p.watts.toLocaleString()} W</td>
                  <td className="py-1.5 pr-2 text-slate-200">{p.kwh.toFixed(1)}</td>
                  <td className="py-1.5 text-right text-slate-100">{money(p.cost, report.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <EnergySettings report={report} canEdit={canEdit} onSaved={setReport} />
    </div>
  )
}

function EnergySettings({ report, canEdit, onSaved }: { report: EnergyReport; canEdit: boolean; onSaved: (r: EnergyReport) => void }) {
  const [price, setPrice] = useState(String(report.price_per_kwh))
  const [currency, setCurrency] = useState(report.currency)
  const [watts, setWatts] = useState<Record<string, string>>(() =>
    Object.fromEntries(report.projectors.map((p) => [String(p.id), p.watts_is_default ? '' : String(p.watts)])),
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null)

  const save = async () => {
    const value = Number(price)
    if (!Number.isFinite(value) || value < 0) {
      setNotice({ tone: 'fault', text: 'Type the price as a number, like 0.17.' })
      return
    }
    setBusy(true)
    try {
      const body = {
        price_per_kwh: value,
        currency: currency.trim() || '$',
        watts: Object.fromEntries(
          Object.entries(watts)
            .filter(([, w]) => w.trim() !== '' && Number(w) > 0)
            .map(([id, w]) => [id, Math.round(Number(w))]),
        ),
      }
      onSaved(await historyApi.saveEnergy(body))
      setNotice({ tone: 'ok', text: 'Saved. Every week and night above now uses these figures.' })
    } catch (err) {
      setNotice({ tone: 'fault', text: errorText(err, 'Saving failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      icon={EnergyIcon}
      title="Price and watts"
      description="Rough figures: each projector's full-power draw times the hours it was on. Eco lamp mode uses less, and standby (under 10 W) is not counted."
    >
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Electricity price per kWh</span>
          <div className="flex gap-1.5">
            <input className="input w-14" value={currency} maxLength={8} disabled={!canEdit} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency sign" />
            <input className="input" inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <span className="mt-1 block text-2xs text-slate-500">It is on your electric bill. The US average is about $0.17.</span>
        </label>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-400">Watts each projector draws when on</span>
          {report.projectors.map((p) => (
            <label key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-40 truncate text-slate-200">{p.name}</span>
              <input
                className="input w-28"
                inputMode="numeric"
                placeholder={String(p.default_watts)}
                value={watts[String(p.id)] ?? ''}
                disabled={!canEdit}
                onChange={(e) => setWatts((w) => ({ ...w, [String(p.id)]: e.target.value }))}
                aria-label={`${p.name} watts`}
              />
              <span className="text-xs text-slate-500">
                {p.driver === 'pjlink' || p.driver === 'panasonic_ntcontrol'
                  ? `empty uses ${p.default_watts} W, a rough guess: check the label or manual`
                  : `empty uses ${p.default_watts.toLocaleString()} W from the ${p.model} spec sheet`}
              </span>
            </label>
          ))}
        </div>
      </div>
      {notice && <Banner tone={notice.tone} className="mt-3" onDismiss={() => setNotice(null)}>{notice.text}</Banner>}
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </Panel>
  )
}

// -- season wrap-up ----------------------------------------------------------------------

function SeasonWrapup({ seasons, picked, onPick }: { seasons: Season[] | null; picked: string | null; onPick: (key: string) => void }) {
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())))
  const [to, setTo] = useState(iso(today))
  const [name, setName] = useState('')
  const [wrap, setWrap] = useState<Wrapup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const season = seasons?.find((s) => s.key === picked) ?? null
  const make = useCallback(async (start: string, end: string, title: string) => {
    setBusy(true)
    try {
      setWrap(await historyApi.wrapup(start, end, title))
      setError(null)
    } catch (err) {
      setError(errorText(err, 'Could not make the wrap-up'))
    } finally {
      setBusy(false)
    }
  }, [])

  // Keyed on the season, not the objects: the list is fetched once, and the
  // page passes a new onPick every render.
  const seasonKey = season?.key
  const firstKey = seasons?.[0]?.key
  useEffect(() => {
    if (season) void make(season.start, season.end, season.name)
  }, [seasonKey, make])
  useEffect(() => {
    if (!picked && firstKey) onPick(firstKey)
  }, [picked, firstKey])

  return (
    <div className="space-y-4">
      <Panel icon={CalendarIcon} title="Pick a season" description="Halloween runs September 1 to October 31 and Christmas November 15 to January 6. A run of nights on the calendar with a name is a season too.">
        <div className="flex flex-wrap gap-2">
          {seasons === null && <Spinner label={null} size="sm" />}
          {seasons?.map((s) => (
            <button
              key={s.key}
              className={classNames('btn-default', s.key === picked && 'ring-1 ring-sky-400/60')}
              onClick={() => onPick(s.key)}
            >
              {s.name}
              <span className="text-xs text-slate-400">{s.finished ? `${s.nights_played} nights` : 'so far'}</span>
            </button>
          ))}
          {seasons?.length === 0 && <p className="text-sm text-slate-400">No season has shows in it yet. Pick the nights yourself below.</p>}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/[0.06] pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">From</span>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">To</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-400">Name (optional)</span>
            <input className="input" value={name} placeholder="Thanksgiving week" maxLength={128} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn-default" disabled={busy || !from || !to} onClick={() => void make(from, to, name)}>
            Make the wrap-up
          </button>
        </div>
      </Panel>
      {error && <Banner tone="fault">{error}</Banner>}
      {busy && !wrap && <Spinner label="Adding it up…" />}
      {wrap && <WrapupView wrap={wrap} />}
    </div>
  )
}

function WrapupView({ wrap }: { wrap: Wrapup }) {
  const span = `${nightLabel(wrap.start, true)} to ${nightLabel(wrap.end, true)}`
  const since = new Date(wrap.history_since)
  const partial = since > new Date(`${wrap.start}T12:00:00`)
  return (
    <section className="panel overflow-hidden" aria-label="Season wrap-up">
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-sky-500/10 to-transparent px-4 py-4">
        <p className="eyebrow">Season wrap-up</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">{wrap.name}</h2>
        <p className="text-sm text-slate-400">{span}</p>
        {partial && (
          <p className="mt-1 text-xs text-slate-500">
            The server started keeping show history on {since.toLocaleDateString([], { month: 'long', day: 'numeric' })}, so earlier nights are not counted.
          </p>
        )}
      </div>
      {wrap.shows_played === 0 && wrap.nights_missed === 0 ? (
        <EmptyState icon={ShowHistoryIcon} title="No shows in these nights" />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Nights with a show" value={wrap.nights_played} tone="ok" />
            <Stat label="Hours of shows" value={wrap.show_hours.toFixed(1)} />
            <Stat label="Problems" value={wrap.problems_total} tone={wrap.problems_total ? 'warn' : 'ok'} />
            <Stat label="Energy, roughly" value={money(wrap.cost, wrap.currency)} hint={`${wrap.kwh} kWh`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2.5 text-sm">
              <Highlight icon={CalendarIcon} label="First and last show">
                {wrap.first_night ? `${nightLabel(wrap.first_night)} to ${nightLabel(wrap.last_night!)}` : '—'}
              </Highlight>
              <Highlight icon={RunShowIcon} label="Longest show">
                {wrap.longest ? `${minutesText(wrap.longest.minutes)}, ${nightLabel(wrap.longest.night)} (${wrap.longest.title})` : '—'}
                {wrap.average_minutes != null && <span className="block text-xs text-slate-500">Average {minutesText(wrap.average_minutes)} a show.</span>}
              </Highlight>
              <Highlight icon={TemperatureIcon} label="Hottest night (air intake)">
                {wrap.hottest
                  ? `${nightLabel(wrap.hottest.night)}: ${wrap.hottest.projector} reached ${degrees(wrap.hottest.celsius)} (${wrap.hottest.key})`
                  : 'No temperatures recorded.'}
              </Highlight>
              <Highlight icon={WarningIcon} label="Clean nights">
                {wrap.clean_nights} of {wrap.nights_played} nights had no problems.
                {wrap.problems.length > 0 && (
                  <span className="block text-xs text-slate-400">
                    {wrap.problems.map((p) => `${p.label} ×${p.count}`).join(' · ')}
                  </span>
                )}
              </Highlight>
              {wrap.nights_missed > 0 && (
                <Highlight icon={MiniPcIcon} label="Did not play">
                  {wrap.missed.map((m) => (
                    <span key={`${m.night}-${m.title}`} className="block text-xs text-slate-300">
                      {nightLabel(m.night)}: {m.message || 'did not start'}
                    </span>
                  ))}
                </Highlight>
              )}
              {wrap.groups.length > 0 && (
                <Highlight icon={RunShowIcon} label="What played most">
                  {wrap.groups.slice(0, 4).map((g) => `${g.name} (${g.shows})`).join(', ')}
                </Highlight>
              )}
            </div>
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-1.5 font-medium">Projector</th>
                    <th className="pb-1.5 font-medium">Hours on</th>
                    <th className="pb-1.5 font-medium">Hottest</th>
                    <th className="pb-1.5 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {wrap.projectors.map((p) => (
                    <tr key={p.id} className="border-t border-white/[0.05]">
                      <td className="py-1.5 pr-2 text-slate-100">{p.name}</td>
                      <td className="py-1.5 pr-2 text-slate-200">{p.hours.toFixed(1)}</td>
                      <td className="py-1.5 pr-2 text-slate-300">{p.hottest ? `${degrees(p.hottest.celsius)} on ${nightLabel(p.hottest.night)}` : '—'}</td>
                      <td className="py-1.5 text-right text-slate-100">{money(p.cost, wrap.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <NightStrip nights={wrap.nights} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Highlight({ icon: Icon, label, children }: { icon: typeof ShowHistoryIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <div className="text-slate-100">{children}</div>
      </div>
    </div>
  )
}

/** One square a night: blue played, yellow with problems, red did not play. */
function NightStrip({ nights }: { nights: Wrapup['nights'] }) {
  if (nights.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-400">Every show</p>
      <div className="flex flex-wrap gap-1">
        {nights.map((n, i) => {
          const bad = n.outcome === 'missed' || n.outcome === 'failed'
          return (
            <span
              key={`${n.night}-${i}`}
              title={`${nightLabel(n.night)}: ${n.title}${bad ? ' (did not play)' : `, ${minutesText(n.minutes)}`}${n.problems ? `, ${n.problems} problem${n.problems === 1 ? '' : 's'}` : ''}`}
              className={classNames(
                'h-4 w-4 rounded-sm',
                bad ? 'bg-red-500/70' : n.problems ? 'bg-yellow-400/70' : 'bg-sky-400/70',
              )}
            />
          )
        })}
      </div>
      <p className="mt-1.5 text-2xs text-slate-500">Blue: played. Yellow: played with a problem. Red: did not play.</p>
    </div>
  )
}
