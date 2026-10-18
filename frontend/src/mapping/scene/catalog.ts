/**
 * What a scene layer can be: its styles, what its dials mean, and defaults.
 *
 * Every layer stores the same few dials (size, speed, amount, fade) from 0 to
 * 1; each type gives them a meaning and a label. Objects can also move by
 * themselves, change by themselves, and do something when a person comes
 * near them (motion, change, near). The server keeps the same list for
 * "Describe a scene" (backend/app/services/scene_ai.py).
 */

import type { Change, LayerBlend, LayerTarget, LayerType, Motion, NearAction, ReactsTo, SceneLayer } from '../types'

export type Dial = 'size' | 'speed' | 'amount' | 'fade'

export interface LayerKind {
  type: LayerType
  label: string
  /** One line for the "Add layer" menu. */
  about: string
  /** Backdrops cover areas and are left out of the Add menu: scenes are
   *  built from reactive objects. Older scenes can still have them. */
  group: 'people' | 'objects' | 'backdrop'
  styles: Array<{ id: string; label: string }>
  /** Label per dial; a dial without one is hidden for this type. */
  dials: Partial<Record<Dial, string>>
  /** What this type can do by itself and near people; none means no choice. */
  motions?: Motion[]
  changes?: Change[]
  nears?: NearAction[]
  /** What older scenes (saved before motion, change and near existed) did. */
  legacy?: { motion?: Motion; change?: Change; near?: NearAction }
  defaults: Partial<SceneLayer>
}

// The shader numbers these in this order (shaders.ts); add new ones at the end.
export const MOTIONS: Array<{ id: Motion; label: string }> = [
  { id: 'none', label: 'Stays put' },
  { id: 'bob', label: 'Bobs up and down' },
  { id: 'sway', label: 'Sways' },
  { id: 'spin', label: 'Spins' },
  { id: 'drift', label: 'Drifts around' },
  { id: 'bounce', label: 'Bounces' },
  { id: 'orbit', label: 'Circles' },
  { id: 'rise', label: 'Floats up' },
  { id: 'flutter', label: 'Flutters' },
]

export const CHANGES: Array<{ id: Change; label: string }> = [
  { id: 'none', label: 'Stays the same' },
  { id: 'pulse', label: 'Pulses' },
  { id: 'twinkle', label: 'Twinkles' },
  { id: 'colour', label: 'Shifts colour' },
  { id: 'flicker', label: 'Flickers like a flame' },
  { id: 'blink', label: 'Blinks' },
]

export const NEARS: Array<{ id: NearAction; label: string }> = [
  { id: 'none', label: 'Nothing' },
  { id: 'light', label: 'Lights up' },
  { id: 'grow', label: 'Grows' },
  { id: 'shrink', label: 'Shrinks' },
  { id: 'colour', label: 'Changes to the second colour' },
  { id: 'spin', label: 'Spins round' },
  { id: 'flee', label: 'Runs away' },
  { id: 'follow', label: 'Follows them' },
  { id: 'jump', label: 'Jumps' },
  { id: 'dance', label: 'Dances' },
  { id: 'appear', label: 'Appears' },
  { id: 'hide', label: 'Disappears' },
  { id: 'burst', label: 'Pops' },
]

const ALL_MOTIONS = MOTIONS.map((m) => m.id)
const ALL_CHANGES = CHANGES.map((c) => c.id)
const ALL_NEARS = NEARS.map((n) => n.id)
/** What any area or line can do near people: change how it looks there. */
const AREA_NEARS: NearAction[] = ['none', 'light', 'colour', 'appear', 'hide']
const AREA_CHANGES: Change[] = ['none', 'pulse', 'twinkle', 'colour', 'flicker']

export const LAYER_KINDS: LayerKind[] = [
  // -- follow people -------------------------------------------------------------
  {
    type: 'glow',
    label: 'Glow',
    about: 'A pool of light around each person',
    group: 'people',
    styles: [
      { id: 'soft', label: 'Soft' },
      { id: 'halo', label: 'Halo' },
      { id: 'flame', label: 'Flame' },
    ],
    dials: { size: 'Size', amount: 'Brightness', speed: 'Pulse', fade: 'Softness' },
    defaults: { blend: 'add', color: '#ffd27a', color2: '#ff6a3d', size: 0.45, amount: 0.7, speed: 0.3 },
  },
  {
    type: 'ripples',
    label: 'Ripples',
    about: 'Rings spreading out from each person',
    group: 'people',
    styles: [
      { id: 'rings', label: 'Rings' },
      { id: 'sonar', label: 'Sonar' },
      { id: 'water', label: 'Water' },
    ],
    dials: { size: 'Reach', amount: 'Brightness', speed: 'Speed', fade: 'Ring width' },
    defaults: { blend: 'add', color: '#5eead4', color2: '#3b82f6', size: 0.5, amount: 0.6 },
  },
  {
    type: 'trails',
    label: 'Trails',
    about: 'People paint light as they walk',
    group: 'people',
    styles: [
      { id: 'paint', label: 'Paint' },
      { id: 'smoke', label: 'Smoke' },
      { id: 'neon', label: 'Neon' },
    ],
    dials: { size: 'Brush', amount: 'Brightness', fade: 'Lasts', speed: 'Drift' },
    defaults: { blend: 'add', color: '#a78bfa', color2: '#f472b6', size: 0.4, amount: 0.7, fade: 0.6 },
  },
  {
    type: 'particles',
    label: 'Particles',
    about: 'Sparks, swarms and fireflies around people',
    group: 'people',
    styles: [
      { id: 'sparks', label: 'Sparks from people' },
      { id: 'swarm', label: 'Swarm to people' },
      { id: 'scatter', label: 'Flee from people' },
      { id: 'fireflies', label: 'Fireflies' },
    ],
    dials: { size: 'Size', amount: 'How many', speed: 'Speed', fade: 'Twinkle' },
    defaults: { blend: 'add', color: '#fde68a', color2: '#fb923c', size: 0.35, amount: 0.5 },
  },
  {
    type: 'shadows',
    label: 'Shadows',
    about: 'A shadow or glowing figure where each person stands',
    group: 'people',
    styles: [
      { id: 'shadow', label: 'Shadow' },
      { id: 'silhouette', label: 'Glowing outline' },
      { id: 'giant', label: 'Giant shadow' },
    ],
    dials: { size: 'Size', amount: 'Strength', fade: 'Softness' },
    defaults: { blend: 'normal', color: '#000000', color2: '#38bdf8', size: 0.5, amount: 0.85, fade: 0.3 },
  },
  {
    type: 'reveal',
    label: 'Reveal',
    about: 'Covers what is below; people uncover it',
    group: 'people',
    styles: [
      { id: 'soft', label: 'Soft' },
      { id: 'circle', label: 'Sharp circle' },
    ],
    dials: { size: 'Opening', amount: 'Cover', fade: 'Stays open' },
    defaults: { blend: 'normal', color: '#000000', size: 0.5, amount: 0.95, fade: 0.3 },
  },
  {
    type: 'distort',
    label: 'Bend the video',
    about: "Bends the cue's video around people",
    group: 'people',
    styles: [
      { id: 'ripple', label: 'Ripple' },
      { id: 'swirl', label: 'Swirl' },
      { id: 'bulge', label: 'Bulge' },
    ],
    dials: { size: 'Reach', amount: 'Strength', speed: 'Speed' },
    defaults: { blend: 'normal', size: 0.5, amount: 0.5 },
  },
  // -- reactive objects -------------------------------------------------------------
  {
    type: 'shapes',
    label: 'Objects',
    about: 'Ghosts, hearts, lanterns, gumdrops… that move, change and react to people',
    group: 'objects',
    // The shader numbers these in this order; add new ones at the end.
    styles: [
      { id: 'gumdrops', label: 'Gumdrops' },
      { id: 'peppermints', label: 'Peppermints' },
      { id: 'stars', label: 'Stars' },
      { id: 'snowflakes', label: 'Snowflakes' },
      { id: 'ornaments', label: 'Ornaments' },
      { id: 'hearts', label: 'Hearts' },
      { id: 'pumpkins', label: 'Jack-o’-lanterns' },
      { id: 'ghosts', label: 'Ghosts' },
      { id: 'bats', label: 'Bats' },
      { id: 'spiders', label: 'Spiders' },
      { id: 'eyes', label: 'Glowing eyes (watch people)' },
      { id: 'candy-canes', label: 'Candy canes' },
      { id: 'presents', label: 'Presents' },
      { id: 'trees', label: 'Christmas trees' },
      { id: 'bells', label: 'Bells' },
      { id: 'candles', label: 'Candles' },
      { id: 'shamrocks', label: 'Shamrocks' },
      { id: 'eggs', label: 'Easter eggs' },
      { id: 'flowers', label: 'Flowers' },
      { id: 'butterflies', label: 'Butterflies' },
      { id: 'bunnies', label: 'Bunnies' },
      { id: 'balloons', label: 'Balloons' },
      { id: 'lanterns', label: 'Paper lanterns' },
      { id: 'diyas', label: 'Diya lamps' },
      { id: 'star-of-david', label: 'Stars of David' },
      { id: 'fireworks', label: 'Fireworks' },
      { id: 'fish', label: 'Fish' },
      { id: 'bubbles', label: 'Bubbles' },
      { id: 'leaves', label: 'Leaves' },
      { id: 'moons', label: 'Moons' },
      { id: 'notes', label: 'Music notes' },
      { id: 'snowmen', label: 'Snowmen' },
      { id: 'coins', label: 'Gold coins' },
    ],
    dials: { size: 'Size', amount: 'How many', speed: 'Speed' },
    motions: ALL_MOTIONS,
    changes: ALL_CHANGES,
    nears: ALL_NEARS,
    legacy: { motion: 'bob', change: 'none', near: 'none' },
    defaults: {
      blend: 'normal', color: '#ef4444', color2: '#22c55e', size: 0.4, amount: 0.4, speed: 0.3,
      target: 'walls', reacts_to: 'always', motion: 'bob', change: 'none', near: 'light', reach: 0.5,
    },
  },
  {
    type: 'lights',
    label: 'String lights',
    about: 'Bulbs along the edges that twinkle, chase and answer people',
    group: 'objects',
    styles: [
      { id: 'twinkle', label: 'Twinkle' },
      { id: 'chase', label: 'Chase' },
      { id: 'steady', label: 'Steady' },
      { id: 'multicolor', label: 'Multicolour' },
    ],
    dials: { size: 'Bulb size', amount: 'How close', speed: 'Speed' },
    changes: AREA_CHANGES,
    nears: AREA_NEARS,
    defaults: {
      // Bulbs paint over what is under them, so they still show on white trim.
      blend: 'normal', color: '#ffcf6b', color2: '#ff4d4d', size: 0.4, amount: 0.5,
      target: 'roof', reacts_to: 'always', change: 'none', near: 'light', reach: 0.5,
    },
  },
  {
    type: 'outline',
    label: 'Trim',
    about: 'Icing, neon or a line along the edges',
    group: 'objects',
    styles: [
      { id: 'icing', label: 'Icing' },
      { id: 'neon', label: 'Neon' },
      { id: 'solid', label: 'Solid' },
      { id: 'candy', label: 'Candy cane' },
    ],
    dials: { size: 'Width', amount: 'Brightness', speed: 'Shimmer', fade: 'Glow' },
    changes: AREA_CHANGES,
    nears: AREA_NEARS,
    defaults: {
      blend: 'normal', color: '#ffffff', color2: '#ef4444', size: 0.4, amount: 0.9,
      target: 'building', reacts_to: 'always', change: 'none', near: 'light', reach: 0.5,
    },
  },
  {
    type: 'falling',
    label: 'Falling',
    about: 'Snow, rain, leaves or confetti that people push aside',
    group: 'objects',
    styles: [
      { id: 'snow', label: 'Snow' },
      { id: 'rain', label: 'Rain' },
      { id: 'leaves', label: 'Leaves' },
      { id: 'confetti', label: 'Confetti' },
      { id: 'sparkles', label: 'Sparkles' },
    ],
    dials: { size: 'Size', amount: 'How many', speed: 'Fall speed', fade: 'Sway' },
    nears: ['none', 'flee', 'follow', 'light', 'colour', 'appear', 'hide'],
    legacy: { near: 'flee' },
    defaults: {
      blend: 'add', color: '#ffffff', color2: '#bfdbfe', size: 0.35, amount: 0.5, speed: 0.3, fade: 0.5,
      reacts_to: 'always', near: 'flee', reach: 0.4,
    },
  },
  {
    type: 'field',
    label: 'Light field',
    about: 'Dots or lines that bend away from people',
    group: 'objects',
    styles: [
      { id: 'dots', label: 'Dots' },
      { id: 'lines', label: 'Lines' },
      { id: 'grid', label: 'Grid' },
    ],
    dials: { size: 'Spacing', amount: 'Push', speed: 'Shimmer' },
    changes: AREA_CHANGES,
    nears: AREA_NEARS,
    defaults: { blend: 'add', color: '#67e8f9', color2: '#f0abfc', size: 0.35, amount: 0.6, reacts_to: 'always', reach: 0.5 },
  },
  // -- backdrops (not in the Add menu) ------------------------------------------------
  {
    type: 'texture',
    label: 'Material',
    about: 'Makes surfaces look like gingerbread, brick, snow…',
    group: 'backdrop',
    styles: [
      { id: 'gingerbread', label: 'Gingerbread' },
      { id: 'brick', label: 'Brick' },
      { id: 'wood', label: 'Wood' },
      { id: 'stone', label: 'Stone' },
      { id: 'snow', label: 'Snow' },
      { id: 'ice', label: 'Ice' },
      { id: 'candy', label: 'Candy stripes' },
      { id: 'window-glow', label: 'Window glow' },
      { id: 'starry', label: 'Starry sky' },
      { id: 'plain', label: 'Plain colour' },
    ],
    dials: { size: 'Scale', amount: 'Detail', speed: 'Animation' },
    changes: AREA_CHANGES,
    nears: AREA_NEARS,
    defaults: {
      blend: 'normal', color: '#a0612e', color2: '#5c3317', size: 0.4, amount: 0.6, speed: 0.3,
      target: 'walls', reacts_to: 'always',
    },
  },
  {
    type: 'wash',
    label: 'Colour wash',
    about: 'Colour, gradients or aurora over an area',
    group: 'backdrop',
    styles: [
      { id: 'solid', label: 'Solid' },
      { id: 'gradient', label: 'Moving gradient' },
      { id: 'aurora', label: 'Aurora' },
      { id: 'pulse', label: 'Pulse' },
    ],
    dials: { size: 'Scale', amount: 'Brightness', speed: 'Movement' },
    changes: AREA_CHANGES,
    nears: AREA_NEARS,
    defaults: { blend: 'add', color: '#1d4ed8', color2: '#9333ea', size: 0.5, amount: 0.5, speed: 0.3 },
  },
  {
    type: 'picture',
    label: 'Picture',
    about: 'A picture of the house from the media library, such as one painted by AI',
    group: 'backdrop',
    styles: [
      { id: 'still', label: 'Still' },
      { id: 'glow', label: 'Gently glowing' },
    ],
    dials: { amount: 'Brightness', speed: 'Glow speed' },
    nears: AREA_NEARS,
    defaults: { blend: 'normal', target: 'building', reacts_to: 'always', amount: 0.5, speed: 0.3 },
  },
  {
    type: 'countdown',
    label: 'Christmas countdown',
    about: 'Days until Christmas with a ribbon and a ticking clock; colour is the ribbon, second colour the glow',
    group: 'objects',
    styles: [
      { id: 'gold', label: 'Gold and holly' },
      { id: 'frost', label: 'Frosted' },
      { id: 'candy', label: 'Candy cane' },
      { id: 'marquee', label: 'Marquee lights' },
    ],
    dials: { size: 'Size', fade: 'Height', speed: 'Shine speed', amount: 'Sparkle' },
    nears: ['none', 'light', 'grow', 'jump'],
    defaults: {
      blend: 'normal', color: '#b3122a', color2: '#ffcf70', size: 0.75, fade: 0.5, speed: 0.4, amount: 0.6,
      target: 'building', reacts_to: 'always', near: 'light', reach: 0.5,
    },
  },
]

export const KIND = Object.fromEntries(LAYER_KINDS.map((k) => [k.type, k])) as Record<LayerType, LayerKind>

/** The layer's motion, with older scenes doing what they always did. */
export function motionOf(layer: SceneLayer): Motion {
  const kind = KIND[layer.type]
  if (!kind?.motions) return 'none'
  return layer.motion ?? kind.legacy?.motion ?? 'none'
}

export function changeOf(layer: SceneLayer): Change {
  const kind = KIND[layer.type]
  if (!kind?.changes) return 'none'
  return layer.change ?? kind.legacy?.change ?? 'none'
}

export function nearOf(layer: SceneLayer): NearAction {
  const kind = KIND[layer.type]
  if (!kind?.nears) return 'none'
  return layer.near ?? kind.legacy?.near ?? 'none'
}

export const TARGETS: Array<{ id: LayerTarget; label: string }> = [
  { id: 'everywhere', label: 'Everywhere' },
  { id: 'building', label: 'Whole building' },
  { id: 'walls', label: 'Walls' },
  { id: 'roof', label: 'Roof' },
  { id: 'windows', label: 'Windows' },
  { id: 'doors', label: 'Doors' },
  { id: 'outside', label: 'Around the building' },
]

export const REACTIONS: Array<{ id: ReactsTo; label: string; hint: string }> = [
  { id: 'presence', label: 'Someone there', hint: 'Strongest while a person is in view' },
  { id: 'movement', label: 'Movement', hint: 'Stronger the faster people move' },
  { id: 'count', label: 'Number of people', hint: 'Stronger with more people (four or more is full)' },
  { id: 'closeness', label: 'Closeness', hint: 'Stronger as people come closer to the camera' },
  { id: 'always', label: 'Always on', hint: 'Ignores people' },
]

export const BLENDS: Array<{ id: LayerBlend; label: string }> = [
  { id: 'add', label: 'Add light' },
  { id: 'screen', label: 'Soft light' },
  { id: 'normal', label: 'Paint over' },
]

let counter = 0

function layerId() {
  counter = (counter + 1) % 1000
  return `${Date.now().toString(36).slice(-5)}${counter.toString(36)}`
}

export function newLayer(type: LayerType, patch: Partial<SceneLayer> = {}): SceneLayer {
  const kind = KIND[type]
  return {
    id: layerId(),
    type,
    name: '',
    enabled: true,
    opacity: 1,
    blend: 'add',
    color: '#38bdf8',
    color2: '#f472b6',
    size: 0.5,
    speed: 0.5,
    amount: 0.5,
    fade: 0.5,
    style: kind.styles[0].id,
    target: 'everywhere',
    reacts_to: kind.group === 'people' ? 'presence' : 'always',
    reaction: 0.7,
    motion: kind.motions ? 'none' : null,
    change: kind.changes ? 'none' : null,
    near: kind.nears ? 'none' : null,
    reach: 0.5,
    ...kind.defaults,
    ...patch,
  }
}

/** A layer with every field present and a style this type knows. */
export function normaliseLayer(layer: Partial<SceneLayer> & { type: LayerType }): SceneLayer {
  const base = newLayer(layer.type)
  const merged = { ...base, ...layer }
  if (!KIND[layer.type]?.styles.some((s) => s.id === merged.style)) merged.style = base.style
  return merged
}

export function layerLabel(layer: SceneLayer) {
  const kind = KIND[layer.type]
  if (layer.name) return layer.name
  const style = kind?.styles.find((s) => s.id === layer.style)
  return style && kind.styles.length > 1 ? `${kind.label} · ${style.label}` : kind?.label ?? layer.type
}

// -- starting points ---------------------------------------------------------------------

export interface Starter {
  name: string
  /** Heading the starter is listed under. */
  occasion: 'Winter holidays' | 'Through the year' | 'Celebrations' | 'Just for fun'
  description: string
  layers: Array<Partial<SceneLayer> & { type: LayerType }>
}

type L = Partial<SceneLayer> & { type: LayerType }
const objects = (style: string, patch: Partial<SceneLayer>): L => ({ type: 'shapes', style, motion: 'none', change: 'none', ...patch })
const sparks = (color: string, color2: string): L => ({
  type: 'particles', name: 'Sparkles from people', style: 'sparks', color, color2, amount: 0.4,
  reacts_to: 'movement', reaction: 0.6,
})

/**
 * Complete scenes to start from, without an API key. Only objects, each
 * reacting to people; nothing covers the building, so the house itself
 * stays as it is between them.
 */
export const STARTERS: Starter[] = [
  // -- winter holidays -------------------------------------------------------------
  {
    name: 'Gingerbread house',
    occasion: 'Winter holidays',
    description: 'Icing and roof lights that brighten as people pass; gumdrops jump, peppermints grow, window candles glow and snow scatters.',
    layers: [
      { type: 'outline', name: 'Icing', style: 'icing', target: 'building', color: '#ffffff', size: 0.45, near: 'light' },
      { type: 'lights', name: 'Roof lights', style: 'multicolor', target: 'roof', size: 0.45, amount: 0.55, speed: 0.4, near: 'light' },
      objects('gumdrops', { name: 'Gumdrops', target: 'walls', color: '#ef4444', color2: '#22c55e', size: 0.3, amount: 0.3, motion: 'bob', near: 'jump' }),
      objects('peppermints', { name: 'Peppermints', target: 'walls', color: '#ef4444', size: 0.25, amount: 0.18, motion: 'spin', near: 'grow' }),
      objects('candles', { name: 'Window candles', target: 'windows', color: '#fef3c7', color2: '#f59e0b', size: 0.2, amount: 0.9, change: 'flicker', near: 'light' }),
      objects('candy-canes', { name: 'Candy canes', target: 'outside', color: '#ef4444', size: 0.35, amount: 0.12, motion: 'sway', near: 'dance' }),
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.45, speed: 0.25, near: 'flee' },
      sparks('#fff7c2', '#ffd166'),
    ],
  },
  {
    name: 'Christmas',
    occasion: 'Winter holidays',
    description: 'Multicolour lights that change colour near people, swaying ornaments that spin, twinkling roof stars, dancing bells and presents that jump.',
    layers: [
      { type: 'lights', name: 'Christmas lights', style: 'multicolor', target: 'building', size: 0.45, amount: 0.5, speed: 0.4, color2: '#ffffff', near: 'colour' },
      objects('ornaments', { name: 'Ornaments', target: 'walls', color: '#dc2626', color2: '#16a34a', size: 0.3, amount: 0.25, motion: 'sway', near: 'spin' }),
      objects('stars', { name: 'Roof stars', target: 'roof', color: '#fde047', color2: '#fff7c2', size: 0.25, amount: 0.3, change: 'twinkle', near: 'light' }),
      objects('bells', { name: 'Bells', target: 'doors', color: '#facc15', color2: '#b45309', size: 0.3, amount: 0.6, motion: 'sway', near: 'dance' }),
      objects('presents', { name: 'Presents', target: 'outside', color: '#dc2626', color2: '#fde047', size: 0.35, amount: 0.15, near: 'jump' }),
      objects('trees', { name: 'Trees', target: 'outside', color: '#15803d', color2: '#fde047', size: 0.55, amount: 0.1, change: 'twinkle', near: 'light' }),
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.35, speed: 0.25, near: 'flee' },
    ],
  },
  {
    name: 'Christmas countdown',
    occasion: 'Winter holidays',
    description: 'Days until Christmas in gold with a ribbon, holly and a ticking clock. The gold lights up and sparkles as people walk up, and snow parts around them.',
    layers: [
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.4, speed: 0.22, size: 0.3, near: 'flee' },
      { type: 'countdown', name: 'Countdown', style: 'gold', target: 'building', size: 0.8, near: 'light' },
      sparks('#fff7c2', '#ffd166'),
    ],
  },
  {
    name: 'Winter lights',
    occasion: 'Winter holidays',
    description: 'Chasing white lights, spinning snowflakes that grow as people come close, snowmen that dance, and snow that parts around people.',
    layers: [
      { type: 'lights', name: 'White lights', style: 'chase', target: 'building', color: '#fff7e0', color2: '#93c5fd', speed: 0.5, near: 'colour' },
      objects('snowflakes', { name: 'Snowflakes', target: 'walls', color: '#e0f2fe', size: 0.3, amount: 0.3, motion: 'spin', near: 'grow' }),
      objects('snowmen', { name: 'Snowmen', target: 'outside', color: '#f8fafc', color2: '#1e3a8a', size: 0.5, amount: 0.12, near: 'dance' }),
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.6, speed: 0.3, near: 'flee' },
      { type: 'glow', name: 'Warm glow', style: 'soft', color: '#ffb36b', color2: '#ff6a3d', size: 0.4, amount: 0.5 },
    ],
  },
  {
    name: 'Hanukkah',
    occasion: 'Winter holidays',
    description: 'Blue and white: twinkling Stars of David that light up near people, candles that grow, lights that change colour, and falling sparkles.',
    layers: [
      { type: 'lights', name: 'Blue and white lights', style: 'twinkle', target: 'building', color: '#60a5fa', color2: '#ffffff', speed: 0.4, near: 'colour' },
      objects('star-of-david', { name: 'Stars of David', target: 'walls', color: '#93c5fd', color2: '#ffffff', size: 0.35, amount: 0.25, change: 'twinkle', near: 'light' }),
      objects('candles', { name: 'Candles', target: 'windows', color: '#dbeafe', color2: '#fbbf24', size: 0.25, amount: 0.8, change: 'flicker', near: 'grow' }),
      { type: 'falling', name: 'Sparkles', style: 'sparkles', color: '#dbeafe', color2: '#ffffff', amount: 0.3, speed: 0.2, near: 'flee' },
    ],
  },
  // -- through the year ----------------------------------------------------------------
  {
    name: 'New Year’s Eve',
    occasion: 'Through the year',
    description: 'Fireworks that brighten near people, twinkling gold stars, chasing gold lights and confetti that gets busier with a crowd.',
    layers: [
      objects('fireworks', { name: 'Fireworks', target: 'outside', color: '#facc15', color2: '#f472b6', size: 0.6, amount: 0.25, speed: 0.5, near: 'light' }),
      objects('stars', { name: 'Gold stars', target: 'walls', color: '#fde047', color2: '#ffffff', size: 0.25, amount: 0.25, change: 'twinkle', near: 'spin' }),
      { type: 'lights', name: 'Gold lights', style: 'chase', target: 'building', color: '#fcd34d', color2: '#ffffff', speed: 0.6, near: 'light' },
      { type: 'falling', name: 'Confetti', style: 'confetti', color: '#facc15', color2: '#e5e7eb', amount: 0.5, speed: 0.35, near: 'flee', reacts_to: 'count', reaction: 0.6 },
    ],
  },
  {
    name: 'Lunar New Year',
    occasion: 'Through the year',
    description: 'Red lanterns that sway and light up, fireworks, spinning gold coins that jump, and red and gold lights.',
    layers: [
      objects('lanterns', { name: 'Lanterns', target: 'outside', color: '#dc2626', color2: '#facc15', size: 0.45, amount: 0.25, motion: 'sway', near: 'light' }),
      objects('fireworks', { name: 'Fireworks', target: 'outside', color: '#facc15', color2: '#ef4444', size: 0.55, amount: 0.12, speed: 0.4, near: 'grow' }),
      objects('coins', { name: 'Gold coins', target: 'walls', color: '#fbbf24', size: 0.25, amount: 0.2, motion: 'spin', near: 'jump' }),
      { type: 'lights', name: 'Red and gold lights', style: 'chase', target: 'building', color: '#ef4444', color2: '#facc15', near: 'colour' },
    ],
  },
  {
    name: 'Valentine’s Day',
    occasion: 'Through the year',
    description: 'Pulsing hearts that grow near people, roses that open up, pink twinkle lights and heart-coloured sparkles.',
    layers: [
      { type: 'lights', name: 'Pink lights', style: 'twinkle', target: 'building', color: '#f9a8d4', color2: '#ffffff', speed: 0.4, near: 'light' },
      objects('hearts', { name: 'Hearts', target: 'walls', color: '#ef4444', color2: '#f472b6', size: 0.35, amount: 0.3, motion: 'bob', change: 'pulse', near: 'grow' }),
      objects('flowers', { name: 'Roses', target: 'outside', color: '#e11d48', color2: '#fde047', size: 0.35, amount: 0.2, motion: 'sway', near: 'grow' }),
      sparks('#fbcfe8', '#f43f5e'),
    ],
  },
  {
    name: 'St Patrick’s Day',
    occasion: 'Through the year',
    description: 'Swaying shamrocks that spin as people pass, gold coins that jump, green and gold lights, and confetti.',
    layers: [
      objects('shamrocks', { name: 'Shamrocks', target: 'walls', color: '#22c55e', color2: '#15803d', size: 0.35, amount: 0.3, motion: 'sway', near: 'spin' }),
      objects('coins', { name: 'Gold coins', target: 'outside', color: '#fbbf24', size: 0.25, amount: 0.2, motion: 'spin', near: 'jump' }),
      { type: 'lights', name: 'Green lights', style: 'chase', target: 'building', color: '#4ade80', color2: '#facc15', near: 'colour' },
      { type: 'falling', name: 'Confetti', style: 'confetti', color: '#22c55e', color2: '#facc15', amount: 0.35, speed: 0.3, near: 'flee' },
    ],
  },
  {
    name: 'Easter',
    occasion: 'Through the year',
    description: 'Bobbing eggs that jump, flowers that grow, butterflies that follow people and bunnies that hop.',
    layers: [
      objects('eggs', { name: 'Eggs', target: 'walls', color: '#f9a8d4', color2: '#93c5fd', size: 0.3, amount: 0.3, motion: 'bob', near: 'jump' }),
      objects('flowers', { name: 'Flowers', target: 'outside', color: '#fcd34d', color2: '#f472b6', size: 0.3, amount: 0.25, motion: 'sway', near: 'grow' }),
      objects('butterflies', { name: 'Butterflies', target: 'everywhere', color: '#c084fc', color2: '#fde047', size: 0.25, amount: 0.12, motion: 'flutter', near: 'follow', reach: 0.7 }),
      objects('bunnies', { name: 'Bunnies', target: 'outside', color: '#f8fafc', color2: '#f9a8d4', size: 0.4, amount: 0.1, near: 'jump' }),
    ],
  },
  {
    name: 'Fourth of July',
    occasion: 'Through the year',
    description: 'Fireworks that pop when people come near, red and blue stars that spin, red-white-blue lights and sparks from people.',
    layers: [
      objects('fireworks', { name: 'Fireworks', target: 'outside', color: '#ef4444', color2: '#3b82f6', size: 0.6, amount: 0.25, speed: 0.5, near: 'burst' }),
      objects('stars', { name: 'Stars', target: 'walls', color: '#3b82f6', color2: '#ef4444', size: 0.3, amount: 0.3, change: 'twinkle', near: 'spin' }),
      { type: 'lights', name: 'Red, white and blue', style: 'chase', target: 'building', color: '#ef4444', color2: '#ffffff', speed: 0.5, near: 'colour' },
      sparks('#ffffff', '#60a5fa'),
    ],
  },
  {
    name: 'Halloween',
    occasion: 'Through the year',
    description: 'Glowing eyes in the windows that watch people, ghosts that vanish when you come close, bats that flee, spiders that drop, flickering jack-o’-lanterns and giant shadows.',
    layers: [
      { type: 'outline', name: 'Purple edge', style: 'neon', target: 'roof', color: '#a855f7', color2: '#22c55e', size: 0.25, fade: 0.7, near: 'colour' },
      objects('eyes', { name: 'Eyes', target: 'windows', color: '#a3e635', color2: '#facc15', size: 0.3, amount: 0.8, change: 'blink', near: 'grow' }),
      objects('pumpkins', { name: 'Jack-o’-lanterns', target: 'walls', color: '#f97316', color2: '#65a30d', size: 0.35, amount: 0.2, change: 'flicker', near: 'light' }),
      objects('ghosts', { name: 'Ghosts', target: 'outside', color: '#e0f2fe', color2: '#1e293b', size: 0.45, amount: 0.2, motion: 'drift', near: 'hide' }),
      objects('bats', { name: 'Bats', target: 'outside', color: '#7c3aed', color2: '#facc15', size: 0.3, amount: 0.15, motion: 'flutter', near: 'flee' }),
      objects('spiders', { name: 'Spiders', target: 'roof', color: '#a855f7', color2: '#ef4444', size: 0.25, amount: 0.25, motion: 'bob', near: 'jump' }),
      { type: 'shadows', name: 'Giant shadows', style: 'giant', color: '#000000', amount: 0.8 },
    ],
  },
  {
    name: 'Diwali',
    occasion: 'Through the year',
    description: 'Rows of flickering diya lamps that brighten near people, glowing lanterns that grow, fireworks and golden sparks.',
    layers: [
      objects('diyas', { name: 'Diyas', target: 'walls', color: '#d97706', color2: '#fde047', size: 0.25, amount: 0.35, change: 'flicker', near: 'light' }),
      objects('lanterns', { name: 'Lanterns', target: 'outside', color: '#f97316', color2: '#facc15', size: 0.4, amount: 0.2, motion: 'sway', near: 'grow' }),
      objects('fireworks', { name: 'Fireworks', target: 'outside', color: '#facc15', color2: '#ec4899', size: 0.55, amount: 0.12, speed: 0.4, near: 'light' }),
      { type: 'lights', name: 'Gold lights', style: 'twinkle', target: 'building', color: '#fbbf24', color2: '#fde68a', near: 'light' },
      sparks('#fde68a', '#f59e0b'),
    ],
  },
  {
    name: 'Autumn harvest',
    occasion: 'Through the year',
    description: 'Leaves that blow away from people, jack-o’-lanterns that light up, warm lights and falling leaves (Thanksgiving or any autumn night).',
    layers: [
      { type: 'lights', name: 'Warm lights', style: 'steady', target: 'roof', color: '#fdba74', color2: '#fde68a', near: 'light' },
      objects('leaves', { name: 'Leaves', target: 'walls', color: '#ea580c', color2: '#facc15', size: 0.3, amount: 0.35, motion: 'sway', near: 'flee' }),
      objects('pumpkins', { name: 'Pumpkins', target: 'outside', color: '#f97316', color2: '#65a30d', size: 0.4, amount: 0.12, change: 'flicker', near: 'light' }),
      { type: 'falling', name: 'Falling leaves', style: 'leaves', color: '#f97316', color2: '#facc15', amount: 0.3, speed: 0.25, near: 'flee' },
    ],
  },
  // -- celebrations -------------------------------------------------------------------
  {
    name: 'Birthday',
    occasion: 'Celebrations',
    description: 'Balloons that pop when people reach them, presents that jump, candles people blow out by walking up, and confetti.',
    layers: [
      objects('balloons', { name: 'Balloons', target: 'outside', color: '#ef4444', color2: '#3b82f6', size: 0.45, amount: 0.25, motion: 'bob', near: 'burst' }),
      objects('presents', { name: 'Presents', target: 'walls', color: '#8b5cf6', color2: '#fde047', size: 0.3, amount: 0.2, near: 'jump' }),
      objects('candles', { name: 'Candles', target: 'roof', color: '#f9a8d4', color2: '#fbbf24', size: 0.25, amount: 0.5, change: 'flicker', near: 'hide' }),
      { type: 'falling', name: 'Confetti', style: 'confetti', amount: 0.45, speed: 0.35, near: 'flee' },
    ],
  },
  {
    name: 'Wedding',
    occasion: 'Celebrations',
    description: 'Soft white lights, pulsing hearts that grow near guests, flowers, and white butterflies that follow people.',
    layers: [
      { type: 'lights', name: 'White lights', style: 'twinkle', target: 'building', color: '#fff7ed', color2: '#fde68a', speed: 0.3, near: 'light' },
      objects('hearts', { name: 'Hearts', target: 'walls', color: '#fecdd3', color2: '#fde68a', size: 0.3, amount: 0.2, change: 'pulse', near: 'grow' }),
      objects('flowers', { name: 'Flowers', target: 'outside', color: '#ffffff', color2: '#fde68a', size: 0.3, amount: 0.25, motion: 'sway', near: 'grow' }),
      objects('butterflies', { name: 'Butterflies', target: 'everywhere', color: '#ffffff', color2: '#fde68a', size: 0.22, amount: 0.1, motion: 'flutter', near: 'follow', reach: 0.7 }),
    ],
  },
  {
    name: 'Party',
    occasion: 'Celebrations',
    description: 'Neon trim that shifts colour, music notes that dance near people, confetti, and neon trails; more people make it brighter.',
    layers: [
      { type: 'outline', name: 'Neon', style: 'neon', target: 'building', color: '#22d3ee', color2: '#f472b6', size: 0.3, fade: 0.8, change: 'colour', near: 'light' },
      objects('notes', { name: 'Music notes', target: 'walls', color: '#f472b6', color2: '#22d3ee', size: 0.3, amount: 0.3, motion: 'bounce', near: 'dance', reacts_to: 'count', reaction: 0.5 }),
      { type: 'falling', name: 'Confetti', style: 'confetti', amount: 0.5, speed: 0.35, near: 'flee' },
      { type: 'trails', name: 'Trails', style: 'neon', color: '#facc15', color2: '#22d3ee', size: 0.4 },
    ],
  },
  // -- just for fun ------------------------------------------------------------------
  {
    name: 'Underwater',
    occasion: 'Just for fun',
    description: 'Fish that dart away from people, bubbles that pop when touched, glowing plankton and ripples where people walk.',
    layers: [
      objects('fish', { name: 'Fish', target: 'everywhere', color: '#fb923c', color2: '#fde047', size: 0.35, amount: 0.15, motion: 'drift', near: 'flee', reach: 0.6 }),
      objects('bubbles', { name: 'Bubbles', target: 'everywhere', color: '#a5f3fc', color2: '#ffffff', size: 0.2, amount: 0.25, motion: 'rise', near: 'burst' }),
      { type: 'particles', name: 'Plankton', style: 'fireflies', color: '#67e8f9', color2: '#a5f3fc', amount: 0.5, size: 0.25, reacts_to: 'always' },
      { type: 'ripples', name: 'Ripples', style: 'rings', color: '#5eead4', color2: '#3b82f6', size: 0.5, amount: 0.5 },
    ],
  },
  {
    name: 'Shadow play',
    occasion: 'Just for fun',
    description: 'A field of light dots that bends around people and lights up, with glowing silhouettes.',
    layers: [
      { type: 'field', name: 'Light field', style: 'dots', color: '#67e8f9', color2: '#f0abfc', amount: 0.7, size: 0.3, near: 'colour' },
      { type: 'shadows', name: 'Silhouettes', style: 'silhouette', blend: 'add', color: '#f0abfc', color2: '#c084fc', amount: 0.8, fade: 0.35 },
      { type: 'glow', name: 'Halo', style: 'halo', color: '#a78bfa', color2: '#22d3ee', amount: 0.3, size: 0.7 },
    ],
  },
]
