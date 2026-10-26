/**
 * The element library: everything that can be added to a scene, one entry
 * each, with the holidays it suits and words to find it by. The Editor's
 * "Add an element" search (editor/ElementLibrary.tsx) shows this list.
 *
 * Most entries are a style of a layer type straight from the catalog (a
 * witch, a flock of bats, skulls…). A few are versions of one drawing that
 * mean something different: other kinds of bird (cardinals, blue jays,
 * crows for Halloween) or fireworks in a holiday's colours. `drawing` says
 * which picture an entry is, so the count of distinct pictures can be told
 * apart from the count of entries. Every element reacts to people in a way
 * that suits it, or shows something real.
 */

import type { LayerType, SceneLayer } from '../types'
import { COUNTDOWN_COLORS, COUNTDOWN_PRESETS, INFO_LOOKS, KIND, MOVER_LOOKS, newLayer, STARTERS } from './catalog'
import { moverWalks } from './movers'

export type Occasion =
  | 'halloween' | 'thanksgiving' | 'christmas' | 'winter' | 'new-year' | 'valentines' | 'st-patricks' | 'easter'
  | 'spring' | 'fourth-of-july' | 'summer' | 'autumn' | 'birthday' | 'party' | 'hanukkah' | 'diwali' | 'sea'
  | 'driveway' | 'any'

export const OCCASIONS: Array<{ id: Occasion; label: string; words: string }> = [
  { id: 'halloween', label: 'Halloween', words: 'spooky scary october trick treat' },
  { id: 'thanksgiving', label: 'Thanksgiving', words: 'fall harvest november' },
  { id: 'christmas', label: 'Christmas', words: 'xmas santa holiday december' },
  { id: 'winter', label: 'Winter', words: 'snow cold ice' },
  { id: 'new-year', label: 'New Year’s', words: 'new years eve nye midnight january' },
  { id: 'valentines', label: 'Valentine’s', words: 'valentines love february' },
  { id: 'st-patricks', label: 'St Patrick’s', words: 'st patricks paddy irish luck march green' },
  { id: 'easter', label: 'Easter', words: 'april spring' },
  { id: 'spring', label: 'Spring', words: 'garden may' },
  { id: 'fourth-of-july', label: 'Fourth of July', words: '4th july independence usa america patriotic' },
  { id: 'summer', label: 'Summer', words: 'sun beach' },
  { id: 'autumn', label: 'Autumn', words: 'fall leaves' },
  { id: 'birthday', label: 'Birthdays', words: 'birthday party cake' },
  { id: 'party', label: 'Parties', words: 'celebrate celebration fun' },
  { id: 'hanukkah', label: 'Hanukkah', words: 'chanukah' },
  { id: 'diwali', label: 'Diwali', words: 'festival of lights' },
  { id: 'sea', label: 'Under the sea', words: 'ocean water underwater' },
  { id: 'driveway', label: 'On the driveway', words: 'ground path floor' },
  { id: 'any', label: 'Any time', words: '' },
]

/** Most layers one scene holds (the server's limit too). */
export const MAX_LAYERS = 12

export type ElementKind = 'fly' | 'walk' | 'object' | 'info' | 'countdown' | 'snow'

export const ELEMENT_KINDS: Array<{ id: ElementKind; label: string; words: string }> = [
  { id: 'fly', label: 'Flying and floating', words: 'fly flies flying float path moving' },
  { id: 'walk', label: 'Walking', words: 'walk walks walking characters path moving' },
  { id: 'object', label: 'Objects', words: 'object objects placed' },
  { id: 'info', label: 'Live info', words: 'info board data live sign' },
  { id: 'countdown', label: 'Countdowns', words: 'countdown days until' },
  { id: 'snow', label: 'Snow', words: 'snow ledge sill' },
]

export interface LibraryItem {
  /** Unique: the layer type and style, plus the version for versions. */
  id: string
  name: string
  kind: ElementKind
  occasions: Occasion[]
  /** More words to find it by. */
  words: string
  /** The picture it uses: "type:style". */
  drawing: string
  type: LayerType
  style: string
  /** A new layer of it, ready to add to a scene. */
  make: () => SceneLayer
}

// -- what each style suits ---------------------------------------------------------------------

const SHAPE_TAGS: Record<string, [Occasion[], string]> = {
  gumdrops: [['christmas', 'party'], 'candy sweets'],
  peppermints: [['christmas', 'winter'], 'candy sweets mint'],
  stars: [['christmas', 'fourth-of-july', 'any'], 'twinkle night'],
  snowflakes: [['winter', 'christmas'], 'snow ice'],
  ornaments: [['christmas'], 'baubles balls tree'],
  hearts: [['valentines'], 'love'],
  pumpkins: [['halloween', 'autumn', 'thanksgiving'], 'jack o lantern carved'],
  ghosts: [['halloween'], 'spirit boo'],
  bats: [['halloween'], 'vampire'],
  spiders: [['halloween'], 'web creepy'],
  eyes: [['halloween'], 'watching creepy monster'],
  'candy-canes': [['christmas'], 'candy sweets'],
  presents: [['christmas', 'birthday'], 'gifts boxes'],
  trees: [['christmas', 'winter'], 'pine fir'],
  bells: [['christmas'], 'jingle'],
  candles: [['christmas', 'hanukkah'], 'flame light'],
  shamrocks: [['st-patricks'], 'clover luck green'],
  eggs: [['easter', 'spring'], 'painted'],
  flowers: [['spring', 'easter', 'summer'], 'garden bloom'],
  butterflies: [['spring', 'summer'], 'garden'],
  bunnies: [['easter', 'spring'], 'rabbit'],
  balloons: [['birthday', 'party'], ''],
  lanterns: [['party', 'any'], 'chinese lunar paper'],
  diyas: [['diwali'], 'lamp oil flame'],
  'star-of-david': [['hanukkah'], 'jewish'],
  fireworks: [['new-year', 'fourth-of-july', 'party'], 'bursts'],
  fish: [['sea', 'summer'], 'swim'],
  bubbles: [['sea', 'party', 'summer'], ''],
  leaves: [['autumn', 'thanksgiving'], 'fall'],
  moons: [['halloween', 'any'], 'night crescent'],
  notes: [['party', 'any'], 'music song'],
  snowmen: [['winter', 'christmas'], 'frosty'],
  coins: [['st-patricks'], 'gold money treasure'],
  footprints: [['driveway', 'halloween'], 'steps tracks'],
  'welcome-mat': [['driveway', 'any'], 'welcome door'],
  'runway-arrows': [['driveway', 'christmas'], 'landing strip arrows santa'],
  'crawling-spiders': [['driveway', 'halloween'], 'creepy crawly'],
  gingerbread: [['christmas'], 'cookie man'],
  stockings: [['christmas'], 'fireplace'],
  wreaths: [['christmas', 'winter'], 'door'],
  'santa-hats': [['christmas'], 'hat'],
  reindeer: [['christmas'], 'rudolph deer'],
  poinsettias: [['christmas'], 'flower'],
  holly: [['christmas', 'winter'], 'berries'],
  mittens: [['winter', 'christmas'], 'gloves'],
  turkeys: [['thanksgiving', 'autumn'], 'gobble'],
  'candy-corn': [['halloween', 'autumn'], 'candy sweets'],
  skulls: [['halloween'], 'skeleton bones day of the dead'],
  tombstones: [['halloween'], 'graveyard grave rip cemetery'],
  cauldrons: [['halloween'], 'witch brew potion pot'],
  'witch-hats': [['halloween'], 'witch hat'],
  acorns: [['autumn', 'thanksgiving'], 'oak nut'],
  pies: [['thanksgiving', 'autumn'], 'pumpkin pie dessert'],
  'party-hats': [['new-year', 'birthday', 'party'], 'hat'],
  champagne: [['new-year', 'party'], 'glass toast cheers drink'],
  flags: [['fourth-of-july'], 'usa american stars stripes'],
  cupcakes: [['birthday', 'party'], 'cake candle dessert'],
  chicks: [['easter', 'spring'], 'baby bird hatching egg'],
  'pots-of-gold': [['st-patricks'], 'leprechaun treasure coins'],
  rainbows: [['st-patricks', 'spring', 'any'], 'rainbow colours colors'],
}

/** Colours and behaviour for objects no ready-made scene uses yet. */
const SHAPE_LOOKS: Record<string, Partial<SceneLayer>> = {
  'candy-corn': { color: '#f97316', color2: '#facc15', motion: 'bob', near: 'jump' },
  skulls: { color: '#f5f5f0', color2: '#22c55e', change: 'pulse', near: 'grow' },
  tombstones: { color: '#94a3b8', color2: '#4d7c0f', near: 'light' },
  cauldrons: { color: '#84cc16', color2: '#f97316', near: 'light' },
  'witch-hats': { color: '#4c1d95', color2: '#22c55e', motion: 'sway', near: 'spin' },
  acorns: { color: '#a16207', color2: '#78350f', motion: 'sway', near: 'jump' },
  pies: { color: '#ea8a2e', color2: '#c2853f', near: 'grow' },
  'party-hats': { color: '#ec4899', color2: '#3b82f6', motion: 'bob', near: 'jump' },
  champagne: { color: '#fde68a', color2: '#ffffff', motion: 'sway', near: 'dance' },
  flags: { color: '#dc2626', color2: '#1d4ed8', near: 'light' },
  cupcakes: { color: '#f9a8d4', color2: '#38bdf8', motion: 'bob', near: 'grow' },
  chicks: { color: '#fde047', color2: '#f8fafc', motion: 'bob', near: 'jump' },
  'pots-of-gold': { color: '#fbbf24', color2: '#16a34a', change: 'twinkle', near: 'light' },
  rainbows: { color: '#ffffff', color2: '#ffffff', near: 'grow' },
}

const MOVER_TAGS: Record<string, [Occasion[], string]> = {
  sleigh: [['christmas'], 'santa reindeer rudolph flying'],
  train: [['christmas'], 'toy train presents'],
  birds: [['winter', 'spring', 'christmas'], 'cardinals flock'],
  bats: [['halloween'], 'flock vampire'],
  elves: [['christmas'], 'santa helpers'],
  penguins: [['christmas', 'winter'], 'waddle'],
  'shooting-stars': [['any', 'christmas', 'new-year'], 'comet sky night wish'],
  ghosts: [['halloween'], 'boo spirit'],
  witch: [['halloween'], 'broom broomstick cackle'],
  ufo: [['halloween', 'any'], 'alien flying saucer space spaceship beam'],
  skeletons: [['halloween'], 'bones dance dancing day of the dead'],
  zombies: [['halloween'], 'undead walking dead monster'],
  'black-cats': [['halloween'], 'cat kitty'],
  turkeys: [['thanksgiving', 'autumn'], 'gobble'],
  cupid: [['valentines'], 'love arrow angel heart'],
  leprechauns: [['st-patricks'], 'irish jig dance'],
  bunnies: [['easter', 'spring'], 'rabbit hop hopping'],
  eagles: [['fourth-of-july'], 'bald eagle usa america bird'],
  rockets: [['new-year', 'fourth-of-july', 'party'], 'fireworks firework burst bang'],
  balloons: [['birthday', 'party', 'any'], 'float floating'],
  butterflies: [['spring', 'summer'], 'monarch garden'],
  fish: [['sea', 'summer'], 'clownfish swimming school'],
}

const INFO_TAGS: Record<string, [Occasion[], string]> = {
  santa: [['christmas'], 'santa tracker map norad christmas eve'],
  weather: [['any'], 'temperature forecast'],
  days: [['any', 'birthday'], 'countdown days until date'],
  message: [['any', 'birthday', 'party', 'christmas'], 'message sign scrolling text words greeting'],
  clock: [['any', 'new-year'], 'time clock date'],
  moon: [['halloween', 'any'], 'moon phase full moon night sky'],
  holiday: [['any', 'thanksgiving', 'christmas', 'valentines', 'st-patricks', 'easter', 'fourth-of-july', 'halloween'], 'next holiday countdown days until'],
  'new-year': [['new-year'], 'countdown midnight new years eve'],
}

// -- versions of one drawing with their own colours ----------------------------------------------

interface Version {
  type: LayerType
  style: string
  id: string
  name: string
  occasions: Occasion[]
  words: string
  look: Partial<SceneLayer>
}

const VERSIONS: Version[] = [
  { type: 'movers', style: 'birds', id: 'blue-jays', name: 'Blue jays', occasions: ['winter', 'spring'], words: 'flock birds', look: { color: '#2563eb', color2: '#e5e7eb' } },
  { type: 'movers', style: 'birds', id: 'goldfinches', name: 'Goldfinches', occasions: ['spring', 'summer'], words: 'flock birds yellow', look: { color: '#facc15', color2: '#f97316' } },
  { type: 'movers', style: 'birds', id: 'doves', name: 'White doves', occasions: ['christmas', 'valentines', 'any'], words: 'flock birds peace wedding', look: { color: '#f8fafc', color2: '#fbbf24' } },
  { type: 'movers', style: 'birds', id: 'bluebirds', name: 'Bluebirds', occasions: ['spring'], words: 'flock birds', look: { color: '#38bdf8', color2: '#fb923c' } },
  { type: 'movers', style: 'birds', id: 'crows', name: 'Crows', occasions: ['halloween', 'autumn'], words: 'flock birds ravens spooky', look: { color: '#1f2937', color2: '#a3e635' } },
  { type: 'movers', style: 'bats', id: 'vampire', name: 'Vampire bats (red eyes)', occasions: ['halloween'], words: 'flock dracula', look: { color: '#18181b', color2: '#ef4444' } },
  { type: 'movers', style: 'rockets', id: 'gold', name: 'Gold and silver fireworks', occasions: ['new-year', 'party'], words: 'rockets bursts', look: { color: '#fbbf24', color2: '#e5e7eb' } },
  { type: 'movers', style: 'rockets', id: 'green', name: 'Green and gold fireworks', occasions: ['st-patricks'], words: 'rockets', look: { color: '#22c55e', color2: '#facc15' } },
  { type: 'movers', style: 'rockets', id: 'pink', name: 'Pink and purple fireworks', occasions: ['valentines', 'birthday', 'party'], words: 'rockets', look: { color: '#ec4899', color2: '#a855f7' } },
  { type: 'movers', style: 'rockets', id: 'halloween', name: 'Orange and green fireworks', occasions: ['halloween'], words: 'rockets', look: { color: '#f97316', color2: '#84cc16' } },
  { type: 'movers', style: 'balloons', id: 'hearts', name: 'Red and pink balloons', occasions: ['valentines'], words: 'float love', look: { color: '#dc2626', color2: '#f472b6' } },
  { type: 'movers', style: 'balloons', id: 'usa', name: 'Red, white and blue balloons', occasions: ['fourth-of-july'], words: 'float usa', look: { color: '#dc2626', color2: '#1d4ed8' } },
  { type: 'movers', style: 'balloons', id: 'halloween', name: 'Orange and black balloons', occasions: ['halloween'], words: 'float', look: { color: '#f97316', color2: '#1f2937' } },
  { type: 'movers', style: 'butterflies', id: 'blue', name: 'Blue butterflies', occasions: ['spring', 'summer'], words: 'morpho', look: { color: '#3b82f6', color2: '#e0f2fe' } },
  { type: 'movers', style: 'fish', id: 'blue-tang', name: 'Blue tang fish', occasions: ['sea', 'summer'], words: 'swimming school', look: { color: '#2563eb', color2: '#facc15' } },
  { type: 'movers', style: 'fish', id: 'goldfish', name: 'Goldfish', occasions: ['sea', 'summer'], words: 'swimming school', look: { color: '#f59e0b', color2: '#fde68a' } },
  { type: 'shapes', style: 'hearts', id: 'pink', name: 'Pink hearts', occasions: ['valentines'], words: 'love', look: { color: '#f472b6', color2: '#fbcfe8' } },
  { type: 'shapes', style: 'stars', id: 'usa', name: 'Red, white and blue stars', occasions: ['fourth-of-july'], words: 'patriotic', look: { color: '#dc2626', color2: '#2563eb' } },
  { type: 'shapes', style: 'stars', id: 'gold', name: 'Gold stars', occasions: ['christmas', 'new-year'], words: 'twinkle', look: { color: '#fbbf24', color2: '#fde68a', change: 'twinkle' } },
  { type: 'shapes', style: 'party-hats', id: 'gold', name: 'Gold and silver party hats', occasions: ['new-year'], words: 'hat', look: { color: '#fbbf24', color2: '#cbd5e1' } },
  { type: 'shapes', style: 'ornaments', id: 'blue', name: 'Blue and silver Hanukkah ornaments', occasions: ['hanukkah'], words: 'baubles', look: { color: '#3b82f6', color2: '#e5e7eb' } },
]

// -- building the list ---------------------------------------------------------------------------

/** How the ready-made scenes colour an object and make it react, so a new one looks right at once. */
export function starterLook(style: string): Partial<SceneLayer> {
  const used = STARTERS.flatMap((s) => s.layers).find((l) => l.type === 'shapes' && l.style === style)
  if (!used) return SHAPE_LOOKS[style] ?? {}
  const { color, color2, change, near, reacts_to } = used
  return Object.fromEntries(Object.entries({ color, color2, change, near, reacts_to }).filter(([, v]) => v != null))
}

function infoLayer(style: string, name: string): SceneLayer {
  return newLayer('info', {
    ...INFO_LOOKS[style], style, name,
    size: style === 'message' ? 0.5 : 0.6, pins: [{ x: 0.5, y: style === 'message' ? 0.3 : 0.42, size: 1, rotation: 0 }],
  })
}

function build(): LibraryItem[] {
  const items: LibraryItem[] = []
  for (const s of KIND.movers.styles) {
    const [occasions, words] = MOVER_TAGS[s.id] ?? [['any'], '']
    items.push({
      id: `movers:${s.id}`, name: s.label, kind: moverWalks(s.id) ? 'walk' : 'fly', occasions, words,
      drawing: `movers:${s.id}`, type: 'movers', style: s.id,
      // An empty path: it flies or walks on a path of its own until points are clicked.
      make: () => newLayer('movers', { ...MOVER_LOOKS[s.id], style: s.id, name: s.label, pins: [] }),
    })
  }
  for (const s of KIND.shapes.styles) {
    const [occasions, words] = SHAPE_TAGS[s.id] ?? [['any'], '']
    items.push({
      id: `shapes:${s.id}`, name: s.label, kind: 'object', occasions, words,
      drawing: `shapes:${s.id}`, type: 'shapes', style: s.id,
      make: () => newLayer('shapes', { ...starterLook(s.id), style: s.id, name: s.label, pins: [] }),
    })
  }
  for (const v of VERSIONS) {
    const kind: ElementKind = v.type === 'shapes' ? 'object' : moverWalks(v.style) ? 'walk' : 'fly'
    const base = v.type === 'movers' ? MOVER_LOOKS[v.style] : starterLook(v.style)
    items.push({
      id: `${v.type}:${v.style}:${v.id}`, name: v.name, kind, occasions: v.occasions, words: v.words,
      drawing: `${v.type}:${v.style}`, type: v.type, style: v.style,
      make: () => newLayer(v.type, { ...base, ...v.look, style: v.style, name: v.name, pins: [] }),
    })
  }
  for (const s of KIND.info.styles) {
    const [occasions, words] = INFO_TAGS[s.id] ?? [['any'], '']
    items.push({
      id: `info:${s.id}`, name: s.label, kind: 'info', occasions, words,
      drawing: `info:${s.id}`, type: 'info', style: s.id, make: () => infoLayer(s.id, s.label),
    })
  }
  for (const p of COUNTDOWN_PRESETS) {
    items.push({
      id: `countdown:${p.id}`, name: p.label, kind: 'countdown', occasions: [p.id as Occasion], words: 'days until clock',
      drawing: `countdown:${p.style}`, type: 'countdown', style: p.style,
      make: () => newLayer('countdown', {
        ...COUNTDOWN_COLORS[p.style], style: p.style, name: p.label, pins: [{ x: 0.5, y: 0.42, size: 1, rotation: 0 }],
      }),
    })
  }
  items.push(
    {
      id: 'snowcap:windows', name: 'Snow on window sills', kind: 'snow', occasions: ['winter', 'christmas'], words: 'ledge settle melt',
      drawing: 'snowcap:soft', type: 'snowcap', style: 'soft',
      make: () => newLayer('snowcap', { name: 'Snow on the sills', target: 'windows' }),
    },
    {
      id: 'snowcap:roof', name: 'Snow on the roof', kind: 'snow', occasions: ['winter', 'christmas'], words: 'ledge settle melt',
      drawing: 'snowcap:soft', type: 'snowcap', style: 'soft',
      make: () => newLayer('snowcap', { name: 'Snow on the roof', target: 'roof' }),
    },
  )
  return items
}

export const LIBRARY: LibraryItem[] = build()

/** How many different pictures the library has (versions share one). */
export const LIBRARY_DRAWINGS = new Set(LIBRARY.map((i) => i.drawing)).size

const OCCASION = Object.fromEntries(OCCASIONS.map((o) => [o.id, o])) as Record<Occasion, (typeof OCCASIONS)[number]>
const KIND_OF = Object.fromEntries(ELEMENT_KINDS.map((k) => [k.id, k])) as Record<ElementKind, (typeof ELEMENT_KINDS)[number]>

function haystack(item: LibraryItem): string {
  return [
    item.name, item.words, item.style.replace(/-/g, ' '), KIND_OF[item.kind].label, KIND_OF[item.kind].words,
    ...item.occasions.flatMap((o) => [OCCASION[o].label, OCCASION[o].words]),
  ].join(' ').toLowerCase().replace(/[’']/g, '')
}

const HAYSTACKS = new Map(LIBRARY.map((i) => [i.id, haystack(i)]))

/** The elements matching every word typed, for an occasion and kind (null for all), best first. */
export function searchLibrary(query: string, occasion: Occasion | null, kind: ElementKind | null): LibraryItem[] {
  const words = query.toLowerCase().replace(/[’']/g, '').split(/\s+/).filter(Boolean)
  const found: Array<[LibraryItem, number]> = []
  for (const item of LIBRARY) {
    if (occasion && !item.occasions.includes(occasion)) continue
    if (kind && item.kind !== kind) continue
    const hay = HAYSTACKS.get(item.id)!
    if (!words.every((w) => hay.includes(w) || (w.endsWith('s') && hay.includes(w.slice(0, -1))))) continue
    // Words in the name first, then the rest.
    const name = item.name.toLowerCase()
    const score = words.reduce((n, w) => n + (name.includes(w) ? 2 : 0) + (name.startsWith(w) ? 1 : 0), 0)
    found.push([item, score])
  }
  return found.sort((a, b) => b[1] - a[1]).map(([item]) => item)
}
