import type {
  Alert,
  Automation,
  AutomationRun,
  AutomationValidation,
  Enclosure,
  CapabilityManifest,
  CommandLogRow,
  CommandResult,
  ConnectionTest,
  DriverInfo,
  EventRow,
  Group,
  GroupCommandResult,
  MaintenanceRecord,
  Overview,
  Projector,
  ProjectorState,
  Role,
  Scene,
  TelemetryPoint,
} from './types'

const TOKEN_KEY = 'pc.token'
const USER_KEY = 'pc.user'
const PLAYER_TOKEN_KEY = 'pc.player.token'

// A player tab (/player) keeps its own credentials, so opening a player in
// an operator's browser neither borrows nor signs out their session.
let playerMode = false

export function enterPlayerMode() {
  playerMode = true
}

export function setPlayerToken(token: string | null) {
  if (token) localStorage.setItem(PLAYER_TOKEN_KEY, token)
  else localStorage.removeItem(PLAYER_TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** 428: the command is disruptive and needs explicit confirmation. */
  get needsConfirmation() {
    return this.status === 428
  }
}

export interface Session {
  username: string
  role: Role
}

export function getToken(): string | null {
  return localStorage.getItem(playerMode ? PLAYER_TOKEN_KEY : TOKEN_KEY)
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

function setSession(token: string, session: Session) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(session))
}

export function clearSession() {
  if (playerMode) return setPlayerToken(null)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

type Options = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      // Lets the audit log tell a click in this UI from a script using the API.
      'X-Client': 'ui',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  })

  if (response.status === 401) {
    clearSession()
    // Let the router show the login screen rather than silently failing.
    window.dispatchEvent(new CustomEvent('pc:unauthorized'))
    throw new ApiError(401, 'Your session has expired. Sign in again.')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let parsed: unknown = undefined
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    const detail =
      (parsed as { detail?: unknown })?.detail ?? `Request failed (${response.status})`
    throw new ApiError(
      response.status,
      typeof detail === 'string' ? detail : JSON.stringify(detail),
      parsed,
    )
  }
  return parsed as T
}

export const api = {
  // -- auth ---------------------------------------------------------------
  /** ``remember``: stay signed in for months (the phone remote) rather than a day. */
  async login(username: string, password: string, remember = false): Promise<Session> {
    const result = await request<{ access_token: string; role: Role; username: string }>(
      '/auth/login',
      { method: 'POST', body: { username, password, remember } },
    )
    const session = { username: result.username, role: result.role }
    setSession(result.access_token, session)
    return session
  },
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', {
      method: 'POST',
      body: { current_password, new_password },
    }),
  listUsers: () =>
    request<Array<{ id: number; username: string; role: Role; is_active: boolean }>>(
      '/auth/users',
    ),
  createUser: (username: string, password: string, role: Role) =>
    request('/auth/users', { method: 'POST', body: { username, password, role } }),
  deleteUser: (id: number) => request<void>(`/auth/users/${id}`, { method: 'DELETE' }),
  createServiceToken: (username: string, days: number) =>
    request<{ access_token: string; username: string; role: Role; expires_at: string }>(
      '/auth/tokens',
      { method: 'POST', body: { username, days } },
    ),

  // -- fleet --------------------------------------------------------------
  overview: () => request<Overview>('/overview'),
  drivers: () => request<{ drivers: DriverInfo[] }>('/projectors/drivers'),

  // -- projectors ---------------------------------------------------------
  listProjectors: () => request<Projector[]>('/projectors'),
  getProjector: (id: number) => request<Projector>(`/projectors/${id}`),
  createProjector: (body: Record<string, unknown>) =>
    request<Projector>('/projectors', { method: 'POST', body }),
  updateProjector: (id: number, body: Record<string, unknown>) =>
    request<Projector>(`/projectors/${id}`, { method: 'PATCH', body }),
  deleteProjector: (id: number) =>
    request<void>(`/projectors/${id}`, { method: 'DELETE' }),
  status: (id: number, refresh = false) =>
    request<ProjectorState>(`/projectors/${id}/status${refresh ? '?refresh=true' : ''}`),
  capabilities: (id: number) =>
    request<CapabilityManifest>(`/projectors/${id}/capabilities`),
  testConnection: (id: number) =>
    request<ConnectionTest>(`/projectors/${id}/test`, { method: 'POST' }),

  // -- control ------------------------------------------------------------
  power: (id: number, state: 'on' | 'off') =>
    request<CommandResult>(`/projectors/${id}/power`, {
      method: 'POST',
      body: { state, confirm: true },
    }),
  shutter: (id: number, state: 'open' | 'closed') =>
    request<CommandResult>(`/projectors/${id}/shutter`, {
      method: 'POST',
      body: { state, confirm: true },
    }),
  input: (id: number, input: string) =>
    request<CommandResult>(`/projectors/${id}/input`, {
      method: 'POST',
      body: { input, confirm: true },
    }),
  command: (id: number, capability: string, params: Record<string, unknown> = {}) =>
    request<CommandResult>(`/projectors/${id}/command`, {
      method: 'POST',
      body: { capability, params, confirm: true },
    }),

  // -- history ------------------------------------------------------------
  telemetry: (id: number, metric?: string, days = 7) =>
    request<{ points: TelemetryPoint[] }>(
      `/projectors/${id}/telemetry?days=${days}${metric ? `&metric=${metric}` : ''}`,
    ),
  commandHistory: (id: number, limit = 100) =>
    request<{ commands: CommandLogRow[] }>(`/projectors/${id}/commands?limit=${limit}`),

  // -- groups -------------------------------------------------------------
  listGroups: () => request<Group[]>('/groups'),
  createGroup: (body: Record<string, unknown>) =>
    request<Group>('/groups', { method: 'POST', body }),
  updateGroup: (id: number, body: Record<string, unknown>) =>
    request<Group>(`/groups/${id}`, { method: 'PATCH', body }),
  deleteGroup: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),
  groupCommand: (id: number, capability: string, params: Record<string, unknown> = {}) =>
    request<GroupCommandResult>(`/groups/${id}/commands`, {
      method: 'POST',
      body: { capability, params, confirm: true },
    }),
  allCommand: (capability: string, params: Record<string, unknown> = {}) =>
    request<GroupCommandResult>('/groups/all/commands', {
      method: 'POST',
      body: { capability, params, confirm: true },
    }),
  selectionCommand: (
    ids: number[],
    capability: string,
    params: Record<string, unknown> = {},
  ) =>
    request<GroupCommandResult>(
      `/groups/selection/commands?${ids.map((i) => `projector_ids=${i}`).join('&')}`,
      { method: 'POST', body: { capability, params, confirm: true } },
    ),

  // -- monitoring ---------------------------------------------------------
  events: (params: { hours?: number; severity?: string; projector_id?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.hours) query.set('hours', String(params.hours))
    if (params.severity) query.set('severity', params.severity)
    if (params.projector_id) query.set('projector_id', String(params.projector_id))
    return request<EventRow[]>(`/events?${query}`)
  },
  alerts: (state?: string) =>
    request<Alert[]>(`/alerts${state ? `?state=${state}` : ''}`),
  acknowledgeAlert: (id: number) =>
    request<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  usage: (days = 30) =>
    request<{
      note: string
      usage: Array<{ projector_id: number; day: string; estimated_on_hours: number }>
      faults: Array<{ projector_id: number; count: number }>
    }>(`/analytics/usage?days=${days}`),

  // -- automation ---------------------------------------------------------
  listAutomations: () => request<Automation[]>('/automations'),
  createAutomation: (body: Record<string, unknown>) =>
    request<Automation>('/automations', { method: 'POST', body }),
  updateAutomation: (id: number, body: Record<string, unknown>) =>
    request<Automation>(`/automations/${id}`, { method: 'PATCH', body }),
  deleteAutomation: (id: number) =>
    request<void>(`/automations/${id}`, { method: 'DELETE' }),
  runAutomation: (id: number) =>
    request<{ status: string; steps: AutomationRun['step_results']; name: string }>(
      `/automations/${id}/execute`,
      { method: 'POST', body: { capability: 'run', confirm: true } },
    ),
  automationRuns: (id: number) =>
    request<AutomationRun[]>(`/automations/${id}/runs`),
  validateAutomation: (body: Record<string, unknown>) =>
    request<AutomationValidation>('/automations/validate', { method: 'POST', body }),
  listEnclosures: () => request<Enclosure[]>('/enclosures'),

  listScenes: () => request<Scene[]>('/scenes'),
  createScene: (body: Record<string, unknown>) =>
    request<Scene>('/scenes', { method: 'POST', body }),
  deleteScene: (id: number) => request<void>(`/scenes/${id}`, { method: 'DELETE' }),
  activateScene: (id: number) =>
    request<{ name: string; total: number; failed: number; results: CommandResult[] }>(
      `/scenes/${id}/activate`,
      { method: 'POST', body: { capability: 'activate', confirm: true } },
    ),

  // -- maintenance --------------------------------------------------------
  maintenance: (projectorId?: number) =>
    request<MaintenanceRecord[]>(
      `/maintenance${projectorId ? `?projector_id=${projectorId}` : ''}`,
    ),
  addMaintenance: (body: Record<string, unknown>) =>
    request<MaintenanceRecord>('/maintenance', { method: 'POST', body }),
  maintenanceCsvUrl: () => '/api/maintenance/export.csv',

  // -- system -------------------------------------------------------------
  health: () => request<{ status: string; devices_registered: number }>('/health'),
  systemInfo: () =>
    request<{
      app: string
      polling: Record<string, number>
      devices: Array<{
        projector_id: number
        name: string
        connected: boolean
        queue_depth: number
        last_error: string | null
      }>
    }>('/system/info'),
}

/** Download a file through fetch so the Authorization header is sent.
 *  A bare <a href> would hit the API unauthenticated. */
export async function downloadCsv(path: string, filename: string) {
  const token = getToken()
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, 'Export failed')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
