/**
 * Every place in the app, in one list.
 *
 * The sidebar, the phone's More sheet and the "Go to" search all read this,
 * so a page is named and described the same way wherever it is reached.
 * `hint` is one plain sentence on what the page is for.
 */

import {
  AlertsIcon,
  AutomationIcon,
  CameraIcon,
  ControlIcon,
  DashboardIcon,
  EditorIcon,
  GroupsIcon,
  LogsIcon,
  MiniPcIcon,
  MonitoringIcon,
  PhoneIcon,
  ProjectorIcon,
  RunShowIcon,
  ScenesIcon,
  SettingsIcon,
  type LucideIcon,
} from '../icons'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  hint: string
  /** Match this path exactly (the dashboard), not as a prefix. */
  end?: boolean
  badge?: 'offline' | 'alerts' | 'players'
  /** Extra words the "Go to" search matches on. */
  keywords?: string
}

export interface NavSection {
  section: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    section: 'Overview',
    items: [
      {
        to: '/',
        label: 'Dashboard',
        icon: DashboardIcon,
        end: true,
        hint: 'What the show and every projector are doing right now.',
        keywords: 'home overview status',
      },
    ],
  },
  {
    section: 'Mapping show',
    items: [
      {
        to: '/mapping/run',
        label: 'Run the show',
        icon: RunShowIcon,
        hint: 'GO, pause, stop, blackout and the cue list.',
        keywords: 'go play pause stop blackout cues remote transport',
      },
      {
        to: '/mapping/editor',
        label: 'Editor',
        icon: EditorIcon,
        hint: 'Cues, media, where each projector lands, warp and blends.',
        keywords: 'cues media canvas outputs warp corner pin mesh mask blend elements countdown saved maps',
      },
      {
        to: '/mapping/scenes',
        label: 'Scenes',
        icon: ScenesIcon,
        hint: 'Light effects that react to people walking past.',
        keywords: 'reactive effects halloween christmas objects house parts paint',
      },
      {
        to: '/mapping/camera',
        label: 'Camera',
        icon: CameraIcon,
        hint: 'Line the projectors up with the building and track people.',
        keywords: 'calibrate calibration patterns correct depth tracking remove undo calibration',
      },
      {
        to: '/mapping/players',
        label: 'Players',
        icon: MiniPcIcon,
        badge: 'players',
        hint: 'The mini PCs beside the projectors, and their cameras.',
        keywords: 'mini pc minipc pair pairing approve install player',
      },
    ],
  },
  {
    section: 'Projectors',
    items: [
      {
        to: '/projectors',
        label: 'Projectors',
        icon: ProjectorIcon,
        badge: 'offline',
        hint: 'Every projector: power, shutter, input, condition. Add or edit one here.',
        keywords: 'add edit power shutter input lamp temperature',
      },
      {
        to: '/control',
        label: 'Control Center',
        icon: ControlIcon,
        hint: 'Pick several projectors and power or shutter them together.',
        keywords: 'bulk several all power on off shutters',
      },
      {
        to: '/groups',
        label: 'Groups',
        icon: GroupsIcon,
        hint: 'Name a set of projectors so one press reaches all of them.',
      },
    ],
  },
  {
    section: 'Health',
    items: [
      {
        to: '/alerts',
        label: 'Alerts',
        icon: AlertsIcon,
        badge: 'alerts',
        hint: 'Problems the projectors reported, and what to do about them.',
        keywords: 'faults warnings errors problems',
      },
      {
        to: '/monitoring',
        label: 'Monitoring',
        icon: MonitoringIcon,
        hint: 'Lamp hours, hours switched on, enclosures and upkeep records.',
        keywords: 'lamp hours maintenance enclosure charts history',
      },
      {
        to: '/logs',
        label: 'Logs',
        icon: LogsIcon,
        hint: 'Every command sent and what each projector answered.',
        keywords: 'history commands events',
      },
    ],
  },
  {
    section: 'Setup',
    items: [
      {
        to: '/phone',
        label: 'Phone remote',
        icon: PhoneIcon,
        hint: 'Put the show remote on your iPhone’s Home Screen.',
        keywords: 'iphone qr tailscale home screen',
      },
      {
        to: '/automation',
        label: 'Automation',
        icon: AutomationIcon,
        hint: 'Start-up and shut-down sequences, on a timer or by hand.',
        keywords: 'schedule timer startup shutdown sequence',
      },
      {
        to: '/settings',
        label: 'Settings',
        icon: SettingsIcon,
        hint: 'App updates, your password, AI keys, users.',
        keywords: 'updates password account users tokens keys anthropic openai',
      },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV.flatMap((section) => section.items)

/** The page a path belongs to: the longest matching prefix wins. */
export function navItemFor(pathname: string): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of NAV_ITEMS) {
    const hit = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
    if (hit && (!best || item.to.length > best.to.length)) best = item
  }
  return best
}

/**
 * Parts of pages the "Go to" search can open directly: a tab or section
 * that has its own address.
 */
export interface Place {
  to: string
  label: string
  /** The page it is on, shown beside it. */
  where: string
  hint: string
  icon: LucideIcon
  keywords?: string
}

export const PLACES: Place[] = [
  { to: '/projectors?add=1', label: 'Add a projector', where: 'Projectors', icon: ProjectorIcon,
    hint: 'Type in its address and pick its make to start controlling it.', keywords: 'new register ip address' },
  { to: '/mapping/editor', label: 'Cues and media', where: 'Editor', icon: EditorIcon,
    hint: 'The list GO plays, and uploading videos and pictures.', keywords: 'cue fade loop auto upload video picture library' },
  { to: '/mapping/editor?part=projectors', label: 'Projectors on the picture', where: 'Editor', icon: EditorIcon,
    hint: 'Where each projector lands, warp, masks, blends and colour.', keywords: 'warp corner pin mesh mask blend colour color output window identify test pattern add output' },
  { to: '/mapping/editor?part=elements', label: 'Elements', where: 'Editor', icon: EditorIcon,
    hint: 'Objects and the countdown on a cue; a picture of its own on one projector.', keywords: 'countdown objects place pictures on each projector' },
  { to: '/mapping/editor?part=maps', label: 'Saved maps and show settings', where: 'Editor', icon: EditorIcon,
    hint: 'Keep or reuse the lined-up projectors; rename, resize or delete the show.', keywords: 'save map load rename delete canvas size' },
  { to: '/mapping/scenes?part=projectors', label: 'Scenes on each projector', where: 'Scenes', icon: ScenesIcon,
    hint: 'A different scene, or none, on one projector in a cue.' },
  { to: '/mapping/scenes?part=house', label: 'House parts', where: 'Scenes', icon: ScenesIcon,
    hint: 'Trace the walls, roof, windows and doors.', keywords: 'trace walls roof windows doors surfaces' },
  { to: '/mapping/scenes?part=paint', label: 'Paint the house', where: 'Scenes', icon: ScenesIcon,
    hint: 'An AI repaints a photo of your house as you describe it.', keywords: 'openai ai picture' },
  { to: '/settings', label: 'App updates and password', where: 'Settings', icon: SettingsIcon,
    hint: 'Check for a new version, install it, change your password.', keywords: 'update version install account' },
  { to: '/settings?part=ai', label: 'AI keys', where: 'Settings', icon: SettingsIcon,
    hint: 'Optional Anthropic and OpenAI keys for describing and painting scenes.', keywords: 'anthropic openai claude key api' },
  { to: '/settings?part=homeassistant', label: 'Home Assistant', where: 'Settings', icon: SettingsIcon,
    hint: 'Connect Home Assistant: one line to paste, then Submit.', keywords: 'home assistant hass ha integration smart home hacs key' },
  { to: '/settings?part=people', label: 'Users and tokens', where: 'Settings', icon: SettingsIcon,
    hint: 'Who can sign in, and tokens for scripts and sensors.', keywords: 'user add viewer operator admin token' },
  { to: '/settings?part=technical', label: 'Technical details', where: 'Settings', icon: SettingsIcon,
    hint: 'How often projectors are checked, open connections, what each make supports.', keywords: 'polling poll drivers connections queue' },
]
