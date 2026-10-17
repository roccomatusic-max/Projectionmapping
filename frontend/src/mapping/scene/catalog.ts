/**
 * What a scene layer can be: its styles, what its dials mean, and defaults.
 *
 * Every layer stores the same few dials (size, speed, amount, fade) from 0 to
 * 1; each type gives them a meaning and a label. The server keeps the same
 * list for "Describe a scene" (backend/app/services/scene_ai.py).
 */

import type { LayerBlend, LayerTarget, LayerType, ReactsTo, SceneLayer } from '../types'

export type Dial = 'size' | 'speed' | 'amount' | 'fade'

export interface LayerKind {
  type: LayerType
  label: string
  /** One line for the "Add layer" menu. */
  about: string
  group: 'people' | 'look'
  styles: Array<{ id: string; label: string }>
  /** Label per dial; a dial without one is hidden for this type. */
  dials: Partial<Record<Dial, string>>
  defaults: Partial<SceneLayer>
}

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
  // -- the look --------------------------------------------------------------------
  {
    type: 'texture',
    label: 'Material',
    about: 'Makes surfaces look like gingerbread, brick, snow…',
    group: 'look',
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
    defaults: {
      blend: 'normal', color: '#a0612e', color2: '#5c3317', size: 0.4, amount: 0.6, speed: 0.3,
      target: 'walls', reacts_to: 'always',
    },
  },
  {
    type: 'outline',
    label: 'Trim',
    about: 'Icing, neon or a line along the edges',
    group: 'look',
    styles: [
      { id: 'icing', label: 'Icing' },
      { id: 'neon', label: 'Neon' },
      { id: 'solid', label: 'Solid' },
      { id: 'candy', label: 'Candy cane' },
    ],
    dials: { size: 'Width', amount: 'Brightness', speed: 'Shimmer', fade: 'Glow' },
    defaults: {
      blend: 'normal', color: '#ffffff', color2: '#ef4444', size: 0.4, amount: 0.9,
      target: 'building', reacts_to: 'always',
    },
  },
  {
    type: 'lights',
    label: 'String lights',
    about: 'Bulbs along the edges that twinkle or chase',
    group: 'look',
    styles: [
      { id: 'twinkle', label: 'Twinkle' },
      { id: 'chase', label: 'Chase' },
      { id: 'steady', label: 'Steady' },
      { id: 'multicolor', label: 'Multicolour' },
    ],
    dials: { size: 'Bulb size', amount: 'How close', speed: 'Speed' },
    defaults: {
      // Bulbs paint over what is under them, so they still show on white trim.
      blend: 'normal', color: '#ffcf6b', color2: '#ff4d4d', size: 0.4, amount: 0.5,
      target: 'roof', reacts_to: 'always',
    },
  },
  {
    type: 'falling',
    label: 'Falling',
    about: 'Snow, rain, leaves or confetti; people push it aside',
    group: 'look',
    styles: [
      { id: 'snow', label: 'Snow' },
      { id: 'rain', label: 'Rain' },
      { id: 'leaves', label: 'Leaves' },
      { id: 'confetti', label: 'Confetti' },
      { id: 'sparkles', label: 'Sparkles' },
    ],
    dials: { size: 'Size', amount: 'How many', speed: 'Fall speed', fade: 'Sway' },
    defaults: {
      blend: 'add', color: '#ffffff', color2: '#bfdbfe', size: 0.35, amount: 0.5, speed: 0.3, fade: 0.5,
      reacts_to: 'always',
    },
  },
  {
    type: 'shapes',
    label: 'Decorations',
    about: 'Gumdrops, stars, ornaments, pumpkins scattered on surfaces',
    group: 'look',
    styles: [
      { id: 'gumdrops', label: 'Gumdrops' },
      { id: 'peppermints', label: 'Peppermints' },
      { id: 'stars', label: 'Stars' },
      { id: 'snowflakes', label: 'Snowflakes' },
      { id: 'ornaments', label: 'Ornaments' },
      { id: 'hearts', label: 'Hearts' },
      { id: 'pumpkins', label: 'Pumpkins' },
    ],
    dials: { size: 'Size', amount: 'How many', speed: 'Bob' },
    defaults: {
      blend: 'normal', color: '#ef4444', color2: '#22c55e', size: 0.4, amount: 0.4, speed: 0.3,
      target: 'walls', reacts_to: 'always',
    },
  },
  {
    type: 'wash',
    label: 'Colour wash',
    about: 'Colour, gradients or aurora over an area',
    group: 'look',
    styles: [
      { id: 'solid', label: 'Solid' },
      { id: 'gradient', label: 'Moving gradient' },
      { id: 'aurora', label: 'Aurora' },
      { id: 'pulse', label: 'Pulse' },
    ],
    dials: { size: 'Scale', amount: 'Brightness', speed: 'Movement' },
    defaults: { blend: 'add', color: '#1d4ed8', color2: '#9333ea', size: 0.5, amount: 0.5, speed: 0.3 },
  },
  {
    type: 'field',
    label: 'Light field',
    about: 'Dots or lines that bend away from people',
    group: 'look',
    styles: [
      { id: 'dots', label: 'Dots' },
      { id: 'lines', label: 'Lines' },
      { id: 'grid', label: 'Grid' },
    ],
    dials: { size: 'Spacing', amount: 'Push', speed: 'Shimmer' },
    defaults: { blend: 'add', color: '#67e8f9', color2: '#f0abfc', size: 0.35, amount: 0.6, reacts_to: 'always' },
  },
  {
    type: 'picture',
    label: 'Picture',
    about: 'A picture of the house from the media library, such as one painted by AI',
    group: 'look',
    styles: [
      { id: 'still', label: 'Still' },
      { id: 'glow', label: 'Gently glowing' },
    ],
    dials: { amount: 'Brightness', speed: 'Glow speed' },
    defaults: { blend: 'normal', target: 'building', reacts_to: 'always', amount: 0.5, speed: 0.3 },
  },
]

export const KIND = Object.fromEntries(LAYER_KINDS.map((k) => [k.type, k])) as Record<LayerType, LayerKind>

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
  description: string
  layers: Array<Partial<SceneLayer> & { type: LayerType }>
}

/** Complete scenes to start from, without an API key. */
export const STARTERS: Starter[] = [
  {
    name: 'Gingerbread house',
    description: 'Gingerbread walls, frosted roof with icing, gumdrops, warm windows, string lights and snow. People leave sparkles.',
    layers: [
      { type: 'texture', name: 'Gingerbread walls', style: 'gingerbread', target: 'walls', color: '#a0612e', color2: '#5c3317', size: 0.35, amount: 0.7 },
      { type: 'texture', name: 'Frosted roof', style: 'snow', target: 'roof', color: '#f8fafc', color2: '#bcd3f5', size: 0.4, amount: 0.5 },
      { type: 'texture', name: 'Candle windows', style: 'window-glow', target: 'windows', color: '#ffb347', color2: '#ff7b1c', speed: 0.4 },
      { type: 'texture', name: 'Candy door', style: 'candy', target: 'doors', color: '#ef4444', color2: '#fff7ed', size: 0.3, speed: 0.1 },
      { type: 'shapes', name: 'Gumdrops', style: 'gumdrops', target: 'walls', color: '#ef4444', color2: '#22c55e', size: 0.3, amount: 0.35 },
      { type: 'outline', name: 'Icing', style: 'icing', target: 'building', color: '#ffffff', size: 0.45 },
      { type: 'lights', name: 'Roof lights', style: 'multicolor', target: 'roof', size: 0.45, amount: 0.55, speed: 0.4 },
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.45, speed: 0.25 },
      { type: 'particles', name: 'Sparkles from people', style: 'sparks', color: '#fff7c2', color2: '#ffd166', amount: 0.4, reacts_to: 'movement', reaction: 0.6 },
    ],
  },
  {
    name: 'Haunted house',
    description: 'Dark stone, flickering green windows, bats of shadow and fog; people cast giant shadows.',
    layers: [
      { type: 'texture', name: 'Old stone', style: 'stone', target: 'building', color: '#3f4a3c', color2: '#151a14', size: 0.45, amount: 0.7 },
      { type: 'texture', name: 'Eerie windows', style: 'window-glow', target: 'windows', color: '#a3e635', color2: '#166534', speed: 0.8 },
      { type: 'wash', name: 'Fog', style: 'aurora', target: 'outside', color: '#4c1d95', color2: '#14532d', amount: 0.4, speed: 0.2 },
      { type: 'shapes', name: 'Pumpkins', style: 'pumpkins', target: 'walls', size: 0.35, amount: 0.2, color: '#f97316', color2: '#65a30d' },
      { type: 'outline', name: 'Neon edge', style: 'neon', target: 'roof', color: '#a855f7', color2: '#22c55e', size: 0.25, fade: 0.7 },
      { type: 'shadows', name: 'Giant shadows', style: 'giant', color: '#000000', amount: 0.8 },
    ],
  },
  {
    name: 'Winter lights',
    description: 'Ice blue walls, chasing white lights, falling snow; people melt warm circles.',
    layers: [
      { type: 'texture', name: 'Ice', style: 'ice', target: 'building', color: '#93c5fd', color2: '#e0f2fe', size: 0.5, amount: 0.6 },
      { type: 'lights', name: 'White lights', style: 'chase', target: 'building', color: '#fff7e0', color2: '#ffd27a', speed: 0.5 },
      { type: 'falling', name: 'Snow', style: 'snow', amount: 0.6, speed: 0.3 },
      { type: 'glow', name: 'Warm glow', style: 'soft', color: '#ffb36b', color2: '#ff6a3d', size: 0.4, amount: 0.6 },
    ],
  },
  {
    name: 'Underwater',
    description: 'Deep blue light rays, drifting bubbles of light, and ripples wherever people walk.',
    layers: [
      { type: 'wash', name: 'Deep water', style: 'aurora', color: '#0c4a6e', color2: '#155e75', amount: 0.7, speed: 0.25, reacts_to: 'always' },
      { type: 'particles', name: 'Plankton', style: 'fireflies', color: '#67e8f9', color2: '#a5f3fc', amount: 0.6, size: 0.25, reacts_to: 'always' },
      { type: 'ripples', name: 'Ripples', style: 'water', color: '#5eead4', color2: '#3b82f6', size: 0.6, amount: 0.7 },
      { type: 'distort', name: 'Wobble', style: 'ripple', amount: 0.4 },
    ],
  },
  {
    name: 'Party',
    description: 'Pulsing colour, confetti, neon trim; more people make it brighter.',
    layers: [
      { type: 'wash', name: 'Pulse', style: 'gradient', color: '#db2777', color2: '#7c3aed', amount: 0.5, speed: 0.6, reacts_to: 'count', reaction: 0.7 },
      { type: 'outline', name: 'Neon', style: 'neon', target: 'building', color: '#22d3ee', color2: '#f472b6', size: 0.3, fade: 0.8 },
      { type: 'falling', name: 'Confetti', style: 'confetti', amount: 0.5, speed: 0.35 },
      { type: 'trails', name: 'Trails', style: 'neon', color: '#facc15', color2: '#22d3ee', size: 0.4 },
    ],
  },
  {
    name: 'Shadow play',
    description: 'A soft light field that bends around people, with glowing silhouettes.',
    layers: [
      { type: 'field', name: 'Light field', style: 'dots', color: '#67e8f9', amount: 0.7, size: 0.3 },
      { type: 'shadows', name: 'Silhouettes', style: 'silhouette', blend: 'add', color: '#f0abfc', color2: '#c084fc', amount: 0.8, fade: 0.35 },
      { type: 'glow', name: 'Halo', style: 'halo', color: '#a78bfa', color2: '#22d3ee', amount: 0.3, size: 0.7 },
    ],
  },
]
