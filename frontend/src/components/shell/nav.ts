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
  CalendarIcon,
  CameraIcon,
  ControlIcon,
  DashboardIcon,
  DesignerIcon,
  CuesIcon,
  SetupIcon,
  GroupsIcon,
  HeaterIcon,
  ShowHistoryIcon,
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
  /** Other addresses that are tabs of this page, so the menu marks it there too. */
  also?: string[]
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
        to: '/mapping/setup',
        label: 'Set up',
        icon: SetupIcon,
        also: ['/mapping/editor'],
        hint: 'Once for the house: your projectors on the picture, lining them up, your house, saved maps.',
        keywords: 'projectors outputs resolution size shape side by side overlap apart warp corner pin mesh mask blend colour house parts photo trace paint saved maps canvas',
      },
      {
        to: '/mapping/cues',
        label: 'Cues',
        icon: CuesIcon,
        hint: 'The list GO plays, and the videos and pictures it uses.',
        keywords: 'cues media upload video picture library fade loop auto',
      },
      {
        to: '/mapping/designer',
        label: 'Show designer',
        icon: DesignerIcon,
        hint: 'Build a cue: its timeline, its elements, and what each projector plays.',
        keywords: 'timeline video editor show design keyframes moves clips tracks sound music audio gif animation sequence story elements countdown sleigh santa tracker weather message board each projector own picture',
      },
      {
        to: '/mapping/scenes',
        label: 'Scenes',
        icon: ScenesIcon,
        hint: 'Ready-made looks that react to people walking past.',
        keywords: 'reactive effects halloween christmas objects make change',
      },
      {
        to: '/mapping/run',
        label: 'Run the show',
        icon: RunShowIcon,
        hint: 'GO, pause, stop, blackout and the cue list.',
        keywords: 'go play pause stop blackout cues remote transport',
      },
      {
        to: '/calendar',
        label: 'Calendar',
        icon: CalendarIcon,
        hint: 'Plan shows ahead: which scene group plays on which nights, and when.',
        keywords: 'schedule scheduling plan planner dates month week holiday no show tonight',
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
    section: 'Projectors and health',
    items: [
      {
        to: '/projectors',
        label: 'Projectors',
        icon: ProjectorIcon,
        badge: 'offline',
        also: ['/control', '/groups'],
        hint: 'Every projector: power, shutter, input, condition; control several at once, and groups.',
        keywords: 'add edit power shutter input lamp temperature control center bulk several groups',
      },
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
        also: ['/heater', '/logs'],
        hint: 'Temperatures, lamp hours and upkeep; the box heater; the log of every command.',
        keywords: 'lamp hours maintenance enclosure charts history heater box log logs commands events',
      },
      {
        to: '/history',
        label: 'Show history',
        icon: ShowHistoryIcon,
        hint: 'Every show night, energy used and cost, and a wrap-up of each season.',
        keywords: 'nights log energy electricity cost kwh watts season wrap-up summary halloween christmas report',
      },
    ],
  },
  {
    section: 'Setup',
    items: [
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
        hint: 'App updates, your password, backups, AI keys, users.',
        keywords: 'updates password account users tokens keys anthropic openai backup restore setup guide print',
      },
    ],
  },
]

/**
 * Pages that share one menu entry, each a tab with its own address, so old
 * links and bookmarks still land on the right tab.
 */
export interface PageGroupTab {
  to: string
  label: string
  hint: string
}

export interface PageGroupDef {
  title: string
  icon: LucideIcon
  tabs: PageGroupTab[]
}

export const PAGE_GROUPS = {
  projectors: {
    title: 'Projectors',
    icon: ProjectorIcon,
    tabs: [
      { to: '/projectors', label: 'All projectors', hint: 'Every projector: power, shutter, input, condition. Add or edit one here.' },
      { to: '/control', label: 'Control several', hint: 'Pick several projectors and power or shutter them together.' },
      { to: '/groups', label: 'Groups', hint: 'Name a set of projectors so one press reaches all of them.' },
    ],
  },
  monitoring: {
    title: 'Monitoring',
    icon: MonitoringIcon,
    tabs: [
      { to: '/monitoring', label: 'Temperatures and lamps', hint: 'Temperatures, lamp hours, hours switched on, enclosures and upkeep records.' },
      { to: '/heater', label: 'Box heater', hint: 'The heater in a projector box: on when it gets cold, never with the projector on.' },
      { to: '/logs', label: 'Log', hint: 'Every command sent and what each projector answered.' },
    ],
  },
} satisfies Record<string, PageGroupDef>

export type PageGroupId = keyof typeof PAGE_GROUPS

export const NAV_ITEMS: NavItem[] = NAV.flatMap((section) => section.items)

/** The page a path belongs to: the longest matching prefix wins. */
export function navItemFor(pathname: string): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of NAV_ITEMS) {
    const hit = item.end ? pathname === item.to : [item.to, ...(item.also ?? [])].some((to) => pathname === to || pathname.startsWith(`${to}/`))
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
  { to: '/mapping/setup', label: 'Your projectors', where: 'Set up', icon: SetupIcon,
    hint: 'Each projector’s box on the house picture at its own resolution; lay them out, warp, masks, blends, colour.',
    keywords: 'resolution size shape stretched side by side overlap apart warp corner pin mesh mask blend colour color output window identify test pattern add projector output' },
  { to: '/mapping/setup?part=photo', label: 'Start from a photo', where: 'Set up → Your house', icon: SetupIcon,
    hint: 'Snap the house; Claude finds the walls, roof, windows and doors and makes a scene for them.',
    keywords: 'photo picture camera trace ai claude house parts' },
  { to: '/mapping/setup?part=house', label: 'House parts', where: 'Set up → Your house', icon: SetupIcon,
    hint: 'Trace the walls, roof, windows and doors.', keywords: 'trace walls roof windows doors surfaces straighten' },
  { to: '/mapping/setup?part=paint', label: 'Paint the house', where: 'Set up → Your house', icon: SetupIcon,
    hint: 'An AI repaints a photo of your house as you describe it.', keywords: 'openai ai picture' },
  { to: '/mapping/setup?part=maps', label: 'Saved maps and show settings', where: 'Set up', icon: SetupIcon,
    hint: 'Keep or reuse the lined-up projectors; rename the show, change its shape or delete it.', keywords: 'save map load rename delete canvas size shape' },
  { to: '/mapping/cues', label: 'Cues and media', where: 'Cues', icon: CuesIcon,
    hint: 'The list GO plays, and uploading videos and pictures.', keywords: 'cue fade loop auto upload video picture library' },
  { to: '/mapping/designer?part=elements', label: 'Elements on a cue', where: 'Show designer', icon: DesignerIcon,
    hint: 'Objects, flying things, live boards and countdowns on one cue or on every cue.', keywords: 'countdown objects sleigh reindeer train santa tracker weather message board place' },
  { to: '/mapping/designer?part=projectors', label: 'Each projector, cue by cue', where: 'Show designer', icon: DesignerIcon,
    hint: 'A picture or a scene of its own, or nothing, on one projector in one cue.', keywords: 'scenes on each projector pictures on each projector own picture separate different' },
  { to: '/mapping/scenes', label: 'Make a scene', where: 'Scenes', icon: ScenesIcon,
    hint: 'Step by step: pick the projector it goes on, pick how it looks, put things in place, put it on the house.',
    keywords: 'new scene create starter ready-made put on projector roof driveway where wizard' },
  { to: '/mapping/scenes?part=edit', label: 'Change a scene', where: 'Scenes', icon: ScenesIcon,
    hint: 'Every setting of a scene you made: its layers, colours, how things move and react.', keywords: 'edit layers duplicate delete video' },
  { to: '/control', label: 'Control several', where: 'Projectors', icon: ControlIcon,
    hint: 'Pick several projectors and power or shutter them together.', keywords: 'control center bulk several all power on off shutters full screen' },
  { to: '/groups', label: 'Groups', where: 'Projectors', icon: GroupsIcon,
    hint: 'Name a set of projectors so one press reaches all of them.', keywords: 'group area set' },
  { to: '/heater', label: 'Box heater', where: 'Monitoring', icon: HeaterIcon,
    hint: 'The heater in a projector box: on when it gets cold, never with the projector on.',
    keywords: 'heater heating freezing cold winter enclosure box smart plug shelly temperature warm up weather' },
  { to: '/logs', label: 'Log', where: 'Monitoring', icon: LogsIcon,
    hint: 'Every command sent and what each projector answered.', keywords: 'logs history commands events' },
  { to: '/history?part=energy', label: 'Energy report', where: 'Show history', icon: ShowHistoryIcon,
    hint: 'Hours each projector was on and roughly what it cost, week by week.', keywords: 'electricity cost kwh watts price bill power' },
  { to: '/history?part=season', label: 'Season wrap-up', where: 'Show history', icon: ShowHistoryIcon,
    hint: 'Nights played, hours, the hottest night and problems for a whole season.', keywords: 'summary halloween christmas report season' },
  { to: '/settings', label: 'App updates and password', where: 'Settings', icon: SettingsIcon,
    hint: 'Check for a new version, install it, change your password.', keywords: 'update version install account' },
  { to: '/settings?part=phone', label: 'Phone remote', where: 'Settings', icon: PhoneIcon,
    hint: 'Put the show remote on your iPhone’s Home Screen.', keywords: 'iphone qr tailscale home screen remote' },
  { to: '/settings?part=phone', label: 'Phone alerts', where: 'Settings', icon: SettingsIcon,
    hint: 'A notification on your phone when a projector runs hot, a mini PC goes offline or the show does not start.',
    keywords: 'notification push ntfy pushover iphone text alert sms' },
  { to: '/settings?part=backup', label: 'Back up and restore', where: 'Settings', icon: SettingsIcon,
    hint: 'Save everything to one file, or put a backup back on this or a new server.', keywords: 'backup restore save export import copy new server nightly' },
  { to: '/setup-guide', label: 'Setup guide printout', where: 'Settings', icon: SettingsIcon,
    hint: 'One page with every address, version and install line, to print or save as a PDF.', keywords: 'print pdf paper guide addresses ip install line emergency 6:40' },
  { to: '/settings?part=ai', label: 'AI keys', where: 'Settings', icon: SettingsIcon,
    hint: 'Optional Anthropic and OpenAI keys for describing and painting scenes.', keywords: 'anthropic openai claude key api' },
  { to: '/settings?part=homeassistant', label: 'Home Assistant', where: 'Settings', icon: SettingsIcon,
    hint: 'Connect Home Assistant: one line to paste, then Submit.', keywords: 'home assistant hass ha integration smart home hacs key' },
  { to: '/settings?part=people', label: 'Users and tokens', where: 'Settings', icon: SettingsIcon,
    hint: 'Who can sign in, and tokens for scripts and sensors.', keywords: 'user add viewer operator admin token' },
  { to: '/settings?part=technical', label: 'Technical details', where: 'Settings', icon: SettingsIcon,
    hint: 'How often projectors are checked, open connections, what each make supports.', keywords: 'polling poll drivers connections queue' },
]
