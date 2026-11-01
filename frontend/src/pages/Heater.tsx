/**
 * Heaters in the projector boxes: add one with its smart plug, set when it
 * runs, see the box's temperature over time, and say where the house is
 * for the weather. The rules themselves run on the server
 * (backend/app/services/heater.py).
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, request, type Session } from '@/api/client'
import type { Projector } from '@/api/types'
import type { Player } from '@/mapping/editor/PlayersPanel'
import { Banner, ConfirmDialog, EmptyState, Modal, PageHeader, Panel, Spinner } from '@/components/ui'
import { AddIcon, AnywhereIcon, DeleteIcon, EditIcon, HeaterIcon, PlugIcon, TemperatureIcon } from '@/components/icons'
import { HeaterChart } from '@/components/heater/HeaterChart'
import { HeaterRow, useHeaters } from '@/components/heater/HeaterStatus'
import { classNames, relativeTime } from '@/lib/format'
import {
  PLUG_KINDS,
  blankHeater,
  fahrenheit,
  heaterApi,
  toC,
  toF,
  type Heater as HeaterRecord,
  type HeaterIn,
  type PlugTest,
  type UsbSensor,
  type WeatherPlace,
} from '@/lib/heater'

export default function Heater({ session }: { session: Session }) {
  const { data, error, reload, setData } = useHeaters(15000)
  const [editing, setEditing] = useState<HeaterRecord | 'new' | null>(null)
  const [removing, setRemoving] = useState<HeaterRecord | null>(null)
  const isAdmin = session.role === 'admin'
  const canControl = isAdmin || session.role === 'operator'

  const replace = (heater: HeaterRecord) =>
    setData((current) => current && { ...current, heaters: current.heaters.map((h) => (h.id === heater.id ? heater : h)) })

  return (
    <div className="space-y-4">
      <PageHeader
        icon={HeaterIcon}
        title="Heater"
        subtitle="Keeps the projector boxes above freezing: never with the projector on, never for too long."
        actions={
          isAdmin && (
            <button className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <AddIcon size={14} aria-hidden /> Add a heater
            </button>
          )
        }
      />

      {error && <Banner tone="fault">{error}</Banner>}
      {!data ? (
        <div className="panel p-6">
          <Spinner label="Loading the heaters…" />
        </div>
      ) : (
        <>
          {data.heaters.length === 0 ? (
            <Panel icon={HeaterIcon} title="No heater yet">
              <EmptyState
                title="Add the heater in a projector box"
                icon={HeaterIcon}
                action={
                  isAdmin && (
                    <button className="btn-primary" onClick={() => setEditing('new')}>
                      <AddIcon size={15} aria-hidden /> Add a heater
                    </button>
                  )
                }
              >
                You need a smart plug the heater plugs into (a Shelly Plug US is easiest), and ideally a USB temperature sensor
                in the box plugged into the mini PC (an Adafruit SHT41 Trinkey).
              </EmptyState>
            </Panel>
          ) : (
            data.heaters.map((heater) => (
              <div key={heater.id} className="space-y-4">
                <Panel
                  icon={HeaterIcon}
                  title={heater.name}
                  description={describeRules(heater)}
                  action={
                    isAdmin && (
                      <>
                        <button className="btn-default btn-sm" onClick={() => setEditing(heater)}>
                          <EditIcon size={14} aria-hidden /> Settings
                        </button>
                        <button className="btn-ghost btn-sm" aria-label={`Remove ${heater.name}`} onClick={() => setRemoving(heater)}>
                          <DeleteIcon size={14} aria-hidden />
                        </button>
                      </>
                    )
                  }
                >
                  <HeaterRow heater={heater} outside={data.outside.celsius} canControl={canControl} onChanged={replace} showName={false} />
                  {heater.plug_error && (
                    <Banner tone="fault" className="mt-3" title="The plug is not answering">
                      {heater.plug_error}
                    </Banner>
                  )}
                </Panel>
                <HeaterChart heater={heater} />
              </div>
            ))
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <WeatherPanel outside={data.outside} canEdit={isAdmin} onSaved={() => void reload()} />
            <SensorsPanel sensors={data.sensors} />
          </div>
          <SafetyPanel />
        </>
      )}

      {editing && (
        <HeaterForm
          heater={editing === 'new' ? null : editing}
          sensors={data?.sensors ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void reload()
          }}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? 'the heater'}?`}
        body="The app stops switching its plug and forgets its history. The plug stays as it is now, so unplug the heater if it is on."
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          await heaterApi.remove(removing.id).catch(() => undefined)
          setRemoving(null)
          void reload()
        }}
      />
    </div>
  )
}

function describeRules(h: HeaterRecord): string {
  const parts = [
    `On below ${fahrenheit(h.on_below_c)} inside, off at ${fahrenheit(h.off_above_c)}`,
    `never above ${fahrenheit(h.max_inside_c)}`,
    h.max_minutes_per_hour < 60 ? `at most ${h.max_minutes_per_hour} minutes at a time` : 'no time limit',
  ]
  if (h.interlock) parts.push('never with the projector on')
  if (h.warmup_minutes > 0) parts.push(`warms up ${h.warmup_minutes} minutes before the show`)
  return `${parts.join(', ')}.`
}

// -- the weather -------------------------------------------------------------------------

function WeatherPanel({
  outside,
  canEdit,
  onSaved,
}: {
  outside: { place: WeatherPlace | null; celsius: number | null; fetched_at: string | null; error: string | null }
  canEdit: boolean
  onSaved: () => void
}) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<WeatherPlace[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const search = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const found = await heaterApi.searchPlaces(query)
      setPlaces(found)
      if (found.length === 0) setError('No place by that name or ZIP code. Try the town’s name.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look that up')
    } finally {
      setBusy(false)
    }
  }
  const pick = async (place: WeatherPlace) => {
    setBusy(true)
    try {
      await heaterApi.setPlace(place)
      setPlaces(null)
      setQuery('')
      setChanging(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the place')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      icon={AnywhereIcon}
      title="The weather outside"
      description="From Open-Meteo (free, no account). Only used when there is no temperature from inside the box, and for the warm-up before a show."
    >
      <div className="space-y-3">
        {outside.place && !changing ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tnum text-2xl font-semibold text-slate-100">{fahrenheit(outside.celsius)}</p>
              <p className="text-xs text-slate-400">
                {outside.place.name}
                {outside.fetched_at && ` · checked ${relativeTime(outside.fetched_at)}`}
              </p>
            </div>
            {canEdit && (
              <button className="btn-default btn-sm" onClick={() => setChanging(true)}>
                Change place
              </button>
            )}
          </div>
        ) : canEdit ? (
          <form onSubmit={search} className="flex gap-2">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your town or ZIP code"
              aria-label="Your town or ZIP code"
            />
            <button className="btn-primary" disabled={busy || query.trim().length < 2}>
              Look up
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-400">An administrator sets where the house is.</p>
        )}
        {places && places.length > 0 && (
          <ul className="divide-y divide-white/[0.06] rounded-md border border-white/[0.06]">
            {places.map((place) => (
              <li key={`${place.latitude},${place.longitude}`}>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.04]"
                  disabled={busy}
                  onClick={() => void pick(place)}
                >
                  {place.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {outside.error && <Banner tone="warn">{outside.error}</Banner>}
        {error && <Banner tone="fault">{error}</Banner>}
      </div>
    </Panel>
  )
}

// -- USB sensors ------------------------------------------------------------------------

function SensorsPanel({ sensors }: { sensors: UsbSensor[] }) {
  return (
    <Panel
      icon={TemperatureIcon}
      title="Temperature sensors in the boxes"
      description="An Adafruit SHT41 Trinkey plugged into a mini PC, on a USB extension cable into the box. Found by itself."
    >
      {sensors.length === 0 ? (
        <p className="text-sm text-slate-400">
          None plugged in yet. Plug the sensor into the mini PC beside the projector; it shows here within a minute. Until
          then the heater goes by the projector’s own intake air, which it only reports while it answers.
        </p>
      ) : (
        <ul className="space-y-2">
          {sensors.map((sensor) => (
            <li key={sensor.player_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-200">
                {sensor.player_name}
                <span className="block text-xs text-slate-500">{sensor.name}</span>
              </span>
              <span className="tnum text-right text-slate-100">
                {fahrenheit(sensor.celsius)}
                {sensor.humidity != null && <span className="block text-xs text-slate-500">{Math.round(sensor.humidity)}% humidity</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function SafetyPanel() {
  return (
    <Panel icon={PlugIcon} title="Safety" description="The app decides when the heater gets power. These keep it safe if anything goes wrong.">
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li>Use a heater with its own thermostat and overheat shut-off. One with a plain on/off switch starts again when the plug turns on.</li>
        <li>Plug the heater straight into the smart plug, and the plug straight into a covered outdoor outlet. No extension cords or power strips.</li>
        <li>Screw the heater down, blowing across the box, not at the projector or the sensor. Leave the box a little ventilation.</li>
        <li>With no temperature from inside or outside, the heater stays off.</li>
      </ul>
    </Panel>
  )
}

// -- adding and changing a heater ------------------------------------------------------

function Degrees({
  label,
  hint,
  celsius,
  onChange,
}: {
  label: string
  hint?: ReactNode
  celsius: number
  onChange: (celsius: number) => void
}) {
  const [text, setText] = useState(String(Math.round(toF(celsius))))
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          className="input tnum w-24"
          type="number"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const value = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(value)) onChange(toC(value))
          }}
        />
        <span className="text-sm text-slate-400">°F</span>
      </div>
      {hint && <p className="mt-1 text-2xs text-slate-500">{hint}</p>}
    </div>
  )
}

function HeaterForm({
  heater,
  sensors,
  onClose,
  onSaved,
}: {
  heater: HeaterRecord | null
  sensors: UsbSensor[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<HeaterIn>(() =>
    heater
      ? {
          name: heater.name,
          plug_kind: heater.plug_kind,
          plug_address: heater.plug_address,
          plug_entity: heater.plug_entity,
          sensor_player_id: heater.sensor_player_id,
          projector_id: heater.projector_id,
          on_below_c: heater.on_below_c,
          off_above_c: heater.off_above_c,
          max_inside_c: heater.max_inside_c,
          outside_on_below_c: heater.outside_on_below_c,
          outside_off_above_c: heater.outside_off_above_c,
          max_minutes_per_hour: heater.max_minutes_per_hour,
          interlock: heater.interlock,
          warmup_minutes: heater.warmup_minutes,
        }
      : blankHeater(),
  )
  const [secret, setSecret] = useState('')
  const [projectors, setProjectors] = useState<Projector[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [test, setTest] = useState<PlugTest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<Projector[]>('/projectors').then(setProjectors).catch(() => undefined)
    request<Player[]>('/mapping/players')
      .then((list) => setPlayers(list.filter((p) => p.kind === 'player' && p.approved)))
      .catch(() => undefined)
  }, [])

  // A new heater picks the only projector and the only sensor by itself.
  useEffect(() => {
    if (heater) return
    setForm((f) => ({
      ...f,
      projector_id: f.projector_id ?? (projectors.length === 1 ? projectors[0].id : null),
      sensor_player_id: f.sensor_player_id ?? (sensors.length === 1 ? sensors[0].player_id : null),
    }))
  }, [heater, projectors, sensors])

  const set = <K extends keyof HeaterIn>(key: K, value: HeaterIn[K]) => setForm((f) => ({ ...f, [key]: value }))
  const kind = PLUG_KINDS.find((k) => k.value === form.plug_kind)!
  const reading = useMemo(() => sensors.find((s) => s.player_id === form.sensor_player_id), [sensors, form.sensor_player_id])
  const body = (): HeaterIn => ({ ...form, ...(secret !== '' ? { plug_secret: secret } : {}) })

  const check = async () => {
    setTest(null)
    setBusy(true)
    try {
      setTest(await heaterApi.testPlug({ ...body(), heater_id: heater?.id }))
    } catch (err) {
      setTest({ ok: false, on: null, model: null, message: err instanceof Error ? err.message : 'Could not check the plug' })
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (heater) await heaterApi.update(heater.id, body())
      else await heaterApi.create(body())
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the heater')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open label={heater ? `${heater.name} settings` : 'Add a heater'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-5 p-5">
        <h2 className="text-base font-semibold text-slate-100">{heater ? `${heater.name} settings` : 'Add a heater'}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Driveway box heater" required />
          </div>
          <div>
            <label className="label">Smart plug</label>
            <select className="input" value={form.plug_kind} onChange={(e) => set('plug_kind', e.target.value as HeaterIn['plug_kind'])}>
              {PLUG_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-slate-500">{kind.hint}</p>
          </div>
          <div>
            <label className="label">{form.plug_kind === 'home_assistant' ? 'Home Assistant’s address' : 'The plug’s address'}</label>
            <input
              className="input"
              value={form.plug_address}
              onChange={(e) => set('plug_address', e.target.value)}
              placeholder={form.plug_kind === 'home_assistant' ? 'homeassistant.local:8123' : '192.168.1.50'}
              required
            />
          </div>
          {form.plug_kind === 'home_assistant' && (
            <div>
              <label className="label">The plug’s entity</label>
              <input
                className="input"
                value={form.plug_entity ?? ''}
                onChange={(e) => set('plug_entity', e.target.value)}
                placeholder="switch.box_heater"
                required
              />
            </div>
          )}
          <div>
            <label className="label">{form.plug_kind === 'home_assistant' ? 'Access token' : 'Password (if you set one)'}</label>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={heater?.has_secret ? 'Saved; type to change' : form.plug_kind === 'home_assistant' ? 'Long-lived access token' : 'None'}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button type="button" className="btn-default btn-sm" disabled={busy || !form.plug_address} onClick={() => void check()}>
              <PlugIcon size={14} aria-hidden /> Check the plug
            </button>
          </div>
          {test && (
            <div className="sm:col-span-2">
              <Banner tone={test.ok ? 'ok' : 'fault'}>{test.message}</Banner>
            </div>
          )}
        </div>

        <fieldset className="space-y-3 border-t border-white/[0.06] pt-4">
          <legend className="text-sm font-semibold text-slate-200">Inside the box</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">The projector in this box</label>
              <select
                className="input"
                value={form.projector_id ?? ''}
                onChange={(e) => set('projector_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None</option>
                {projectors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-slate-500">Its intake-air reading is used when there is no USB sensor.</p>
            </div>
            <div>
              <label className="label">USB temperature sensor on</label>
              <select
                className="input"
                value={form.sensor_player_id ?? ''}
                onChange={(e) => set('sensor_player_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Find it by itself</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-slate-500">
                {reading
                  ? `Reading ${fahrenheit(reading.celsius)} now.`
                  : 'The mini PC the Trinkey is plugged into. "Find it by itself" uses the one on this projector’s mini PC, or the only one there is.'}
              </p>
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-sm text-slate-200">
            <input type="checkbox" className="mt-0.5" checked={form.interlock} onChange={(e) => set('interlock', e.target.checked)} />
            <span>
              Never heat while the projector is on
              <span className="block text-xs text-slate-500">
                Safety interlock: off while it is on, warming up or cooling down, even when switched on by hand.
              </span>
            </span>
          </label>
          {form.interlock && form.projector_id === null && (
            <Banner tone="warn">Pick the projector in this box above, so the interlock knows which one to watch.</Banner>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Degrees label="On below" celsius={form.on_below_c} onChange={(v) => set('on_below_c', v)} />
            <Degrees label="Off at" celsius={form.off_above_c} onChange={(v) => set('off_above_c', v)} />
            <Degrees
              label="Never above"
              hint="Safety limit, even when on by hand."
              celsius={form.max_inside_c}
              onChange={(v) => set('max_inside_c', v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Longest run</label>
              <select
                className="input"
                value={form.max_minutes_per_hour}
                onChange={(e) => set('max_minutes_per_hour', Number(e.target.value))}
              >
                {[10, 15, 20, 30, 40, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m === 60 ? 'No limit' : `${m} minutes`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-slate-500">Then it rests for the rest of the hour, so the box never bakes.</p>
            </div>
            <div>
              <label className="label">Warm up before the show</label>
              <select className="input" value={form.warmup_minutes} onChange={(e) => set('warmup_minutes', Number(e.target.value))}>
                {[0, 15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'Never' : `${m} minutes before`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-slate-500">
                Only when the box is below the “off at” temperature. Uses the show time from Tonight’s show and the Calendar.
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-white/[0.06] pt-4">
          <legend className="text-sm font-semibold text-slate-200">Outside, when there is no reading from inside</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Degrees label="On below" celsius={form.outside_on_below_c} onChange={(v) => set('outside_on_below_c', v)} />
            <Degrees label="Off at" celsius={form.outside_off_above_c} onChange={(v) => set('outside_off_above_c', v)} />
          </div>
        </fieldset>

        {error && <Banner tone="fault">{error}</Banner>}
        <div className={classNames('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end')}>
          <button type="button" className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {heater ? 'Save' : 'Add the heater'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
