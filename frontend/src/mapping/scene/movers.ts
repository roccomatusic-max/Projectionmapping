/**
 * Flying and walking elements: Santa's sleigh and reindeer, a Christmas
 * train, flocks of birds or bats, elves, penguins, shooting stars and
 * ghosts that travel over the house; a witch on her broom, a UFO that
 * beams people up, skeletons, zombies, black cats, turkeys, Cupid,
 * leprechauns, a hopping Easter bunny, eagles, butterflies and fish;
 * firework rockets that go up and burst, and balloons that float away.
 *
 * Each follows a path: the points placed by hand on the preview (a line
 * through them, in order), or, with fewer than two, a path of its own:
 * fliers sweep along just above the roofline (or arc over the top of the
 * picture before the house is traced), walkers and the train go along the
 * bottom of the house. Where everything is comes from the time since the
 * cue started, which every output shares, so a sleigh crossing from one
 * projector to the next is in the same place on both.
 *
 * The pictures are painted once into one texture (sprites.ts) and stamped
 * where each one is; the positions are worked out here, in the browser,
 * which is a few dozen sums a frame. People make them react: a flock
 * scatters away from someone who comes near and settles back, elves jump
 * and wave, the sleigh lights up and Santa says "Ho ho ho!".
 */

import type { PersonSpot } from '../people'
import type { LayerBlend, ObjectPin, SceneLayer, SourceRect, Surface } from '../types'
import { nearOf } from './catalog'
import { SPRITE_ROWS, type SpriteRow } from './sprites'

// New styles go at the end, after the ones saved scenes already use.
export const MOVER_STYLES = [
  'sleigh', 'train', 'birds', 'bats', 'elves', 'penguins', 'shooting-stars', 'ghosts',
  'witch', 'ufo', 'skeletons', 'zombies', 'black-cats', 'turkeys', 'cupid', 'leprechauns', 'bunnies', 'eagles',
  'rockets', 'balloons', 'butterflies', 'fish',
  'snowfall', 'leaves', 'petals', 'confetti', 'falling-hearts', 'clovers', 'hanging-spiders', 'lanterns', 'jellyfish',
  'rising-bubbles', 'hot-air-balloons', 'fireflies', 'bees', 'dragon', 'owls', 'angels', 'sharks', 'sea-turtles',
  'mummies', 'gingerbread-men', 'toy-soldiers', 'dinosaurs', 'ducklings',
  'trick-or-treaters', 'werewolves', 'vampires', 'frankensteins', 'grim-reaper', 'zombie-hands', 'rats',
  'falling-presents', 'polar-bears', 'reindeer', 'carolers', 'squirrels', 'lovebirds', 'hatching-eggs', 'frogs',
  'dragonflies', 'hummingbirds', 'dolphins', 'whales', 'crabs', 'octopus', 'beach-balls', 'paper-planes', 'kites',
  'rocket-ship', 'astronauts', 'robots', 'dogs', 'dreidels', 'lion-dance', 'red-envelopes',
  'crows', 'doves', 'cardinals', 'hanging-bats', 'sledders', 'sliding-penguins', 'jingle-bells', 'stockings',
  'candy-canes', 'gold-coins', 'falling-candy', 'parachute-presents', 'sparklers', 'floating-candles', 'rolling-pumpkins',
  'snowmen', 'santa-walking', 'hens', 'ice-cream-truck', 'fire-truck', 'race-cars', 'drummers', 'scarecrows',
  'love-letters', 'seahorses', 'mermaids', 'submarines', 'origami-cranes', 'pufferfish', 'koi',
  'peeking-ghosts', 'peeking-elves', 'window-cats', 'window-eyes', 'perched-owls', 'seagulls', 'snowball-kids',
  'water-balloon-kids', 'jack-in-the-box', 'moles', 'coffins', 'grave-ghosts', 'party-poppers', 'birthday-cakes',
  'skiers', 'ice-skaters', 'snails', 'tortoises', 'hedgehogs', 'skunks', 'uncle-sam', 'football-players',
  'storks', 'flying-pigs', 'unicorns', 'magic-carpet', 'fairies', 'superheroes', 'ladybugs', 'moths',
] as const
export type MoverStyle = (typeof MOVER_STYLES)[number]

type Motion =
  | 'flyer' | 'flock' | 'walker' | 'train' | 'streak' | 'rocket' | 'rise' | 'fall' | 'dangle' | 'wander'
  | 'popup' | 'bounce' | 'leap' | 'kite' | 'perch' | 'slide' | 'peek' | 'throw'

/**
 * How each travels; trail leaves sparkles behind, hop goes in bounds, spin
 * turns falling ones over as they come down, pace slows rising, falling ones and walkers, animate
 * plays a rising, falling, hanging or popping one's frames (rather than each being another colour),
 * line has the little ones follow the first in a row, still hangs one at a fixed length
 * (bells and stockings rather than spiders going up and down), steady keeps a wandering
 * one lit (candles rather than blinking fireflies), low rolls a bouncing one along the ground
 * and under hangs a perching one from the bottom edge of the roof (the gutter) rather than its top;
 * look turns a perching one's head to whoever is near, shy stops a walker and has it hide (in its shell)
 * from people, twirl spins a walker round on the spot for them, and rises brings one up out of its
 * mound rather than growing out of it.
 */
const STYLE: Record<MoverStyle, {
  motion: Motion; ground: boolean; height: number; trail?: boolean; hop?: boolean; spin?: number; pace?: number
  animate?: boolean; line?: boolean; still?: boolean; steady?: boolean; low?: boolean; under?: boolean
  look?: boolean; shy?: boolean; twirl?: boolean; rises?: boolean
}> = {
  sleigh: { motion: 'flyer', ground: false, height: 1, trail: true },
  train: { motion: 'train', ground: true, height: 0.8 },
  birds: { motion: 'flock', ground: false, height: 0.3 },
  bats: { motion: 'flock', ground: false, height: 0.3 },
  elves: { motion: 'walker', ground: true, height: 0.85 },
  penguins: { motion: 'walker', ground: true, height: 0.7 },
  'shooting-stars': { motion: 'streak', ground: false, height: 0.22 },
  ghosts: { motion: 'flyer', ground: false, height: 0.7 },
  witch: { motion: 'flyer', ground: false, height: 0.85, trail: true },
  ufo: { motion: 'flyer', ground: false, height: 0.7 },
  skeletons: { motion: 'walker', ground: true, height: 0.95 },
  zombies: { motion: 'walker', ground: true, height: 0.95 },
  'black-cats': { motion: 'walker', ground: true, height: 0.6 },
  turkeys: { motion: 'walker', ground: true, height: 0.7 },
  cupid: { motion: 'flyer', ground: false, height: 0.6 },
  leprechauns: { motion: 'walker', ground: true, height: 0.85 },
  bunnies: { motion: 'walker', ground: true, height: 0.6, hop: true },
  eagles: { motion: 'flyer', ground: false, height: 0.6 },
  // Rockets go up from the bottom of the house and burst; balloons float up from it.
  rockets: { motion: 'rocket', ground: true, height: 0.22 },
  balloons: { motion: 'rise', ground: true, height: 0.75 },
  butterflies: { motion: 'flock', ground: false, height: 0.28 },
  fish: { motion: 'flock', ground: false, height: 0.3 },
  // Falling down the house, turning over; they drift aside round people.
  snowfall: { motion: 'fall', ground: false, height: 0.12, spin: 0.25 },
  leaves: { motion: 'fall', ground: false, height: 0.3, spin: 1 },
  petals: { motion: 'fall', ground: false, height: 0.15, spin: 1.3 },
  confetti: { motion: 'fall', ground: false, height: 0.11, spin: 2.2 },
  'falling-hearts': { motion: 'fall', ground: false, height: 0.24 },
  clovers: { motion: 'fall', ground: false, height: 0.22, spin: 0.8 },
  // Hanging from the roofline on threads; they drop down to people.
  'hanging-spiders': { motion: 'dangle', ground: false, height: 0.42 },
  lanterns: { motion: 'rise', ground: true, height: 0.45, pace: 1.6, animate: true },
  jellyfish: { motion: 'rise', ground: true, height: 0.6, pace: 1.5, animate: true },
  'rising-bubbles': { motion: 'rise', ground: true, height: 0.32, pace: 0.8 },
  'hot-air-balloons': { motion: 'rise', ground: true, height: 0.95, pace: 2.6 },
  // Drifting about over the lower part of the house, blinking.
  fireflies: { motion: 'wander', ground: true, height: 0.1 },
  bees: { motion: 'flock', ground: false, height: 0.22 },
  dragon: { motion: 'flyer', ground: false, height: 1.05 },
  owls: { motion: 'flyer', ground: false, height: 0.6 },
  angels: { motion: 'flyer', ground: false, height: 0.75, trail: true },
  sharks: { motion: 'flyer', ground: false, height: 0.5 },
  'sea-turtles': { motion: 'flyer', ground: false, height: 0.55 },
  mummies: { motion: 'walker', ground: true, height: 0.95 },
  'gingerbread-men': { motion: 'walker', ground: true, height: 0.7 },
  'toy-soldiers': { motion: 'walker', ground: true, height: 0.95 },
  dinosaurs: { motion: 'walker', ground: true, height: 1.05 },
  ducklings: { motion: 'walker', ground: true, height: 0.55, line: true },
  'trick-or-treaters': { motion: 'walker', ground: true, height: 0.8 },
  werewolves: { motion: 'walker', ground: true, height: 1 },
  vampires: { motion: 'walker', ground: true, height: 0.95 },
  frankensteins: { motion: 'walker', ground: true, height: 1, pace: 1.4 },
  'grim-reaper': { motion: 'flyer', ground: false, height: 0.9 },
  // Coming up out of the ground beside people, along the bottom of the house.
  'zombie-hands': { motion: 'popup', ground: true, height: 0.85 },
  rats: { motion: 'walker', ground: true, height: 0.3, pace: 0.45 },
  'falling-presents': { motion: 'fall', ground: false, height: 0.22, spin: 0.4 },
  'polar-bears': { motion: 'walker', ground: true, height: 0.8, pace: 1.3 },
  reindeer: { motion: 'walker', ground: true, height: 0.85 },
  carolers: { motion: 'walker', ground: true, height: 0.9, pace: 1.5 },
  squirrels: { motion: 'walker', ground: true, height: 0.4, hop: true, pace: 0.7 },
  lovebirds: { motion: 'flyer', ground: false, height: 0.5 },
  'hatching-eggs': { motion: 'popup', ground: true, height: 0.6 },
  frogs: { motion: 'walker', ground: true, height: 0.42, hop: true },
  dragonflies: { motion: 'flock', ground: false, height: 0.24 },
  hummingbirds: { motion: 'flock', ground: false, height: 0.24 },
  // Leaping out of the bottom of the house (or the line drawn) as if it were the sea.
  dolphins: { motion: 'leap', ground: true, height: 0.75 },
  whales: { motion: 'flyer', ground: false, height: 0.9 },
  crabs: { motion: 'walker', ground: true, height: 0.38, pace: 0.8 },
  octopus: { motion: 'flyer', ground: false, height: 0.7 },
  'beach-balls': { motion: 'bounce', ground: true, height: 0.55 },
  'paper-planes': { motion: 'flyer', ground: false, height: 0.3 },
  // Flown on strings from the bottom of the house.
  kites: { motion: 'kite', ground: true, height: 0.7 },
  'rocket-ship': { motion: 'flyer', ground: false, height: 0.55, trail: true },
  astronauts: { motion: 'flyer', ground: false, height: 0.7 },
  robots: { motion: 'walker', ground: true, height: 0.9, pace: 1.3 },
  dogs: { motion: 'walker', ground: true, height: 0.6, pace: 0.75 },
  dreidels: { motion: 'walker', ground: true, height: 0.45 },
  'lion-dance': { motion: 'walker', ground: true, height: 1.05, pace: 1.2 },
  'red-envelopes': { motion: 'fall', ground: false, height: 0.2, spin: 0.9 },
  // Fourth batch.
  crows: { motion: 'perch', ground: false, height: 0.8 },
  doves: { motion: 'perch', ground: false, height: 0.75 },
  cardinals: { motion: 'perch', ground: false, height: 0.7 },
  'hanging-bats': { motion: 'perch', ground: false, height: 0.8, under: true },
  sledders: { motion: 'slide', ground: false, height: 0.9 },
  'sliding-penguins': { motion: 'slide', ground: false, height: 0.75 },
  'jingle-bells': { motion: 'dangle', ground: false, height: 0.7, still: true, animate: true, under: true },
  stockings: { motion: 'dangle', ground: false, height: 0.9, still: true, under: true },
  'candy-canes': { motion: 'fall', ground: false, height: 0.32, spin: 0.45 },
  'gold-coins': { motion: 'fall', ground: false, height: 0.24, animate: true },
  'falling-candy': { motion: 'fall', ground: false, height: 0.26, spin: 0.45 },
  'parachute-presents': { motion: 'fall', ground: false, height: 0.5, pace: 2.2 },
  sparklers: { motion: 'popup', ground: true, height: 1.4, animate: true },
  'floating-candles': { motion: 'wander', ground: true, height: 0.9, steady: true },
  'rolling-pumpkins': { motion: 'bounce', ground: true, height: 0.8, low: true },
  snowmen: { motion: 'walker', ground: true, height: 0.95, pace: 1.6 },
  'santa-walking': { motion: 'walker', ground: true, height: 1, pace: 1.3 },
  hens: { motion: 'walker', ground: true, height: 0.55, line: true },
  'ice-cream-truck': { motion: 'walker', ground: true, height: 0.9, pace: 0.8 },
  'fire-truck': { motion: 'walker', ground: true, height: 0.85, pace: 0.6 },
  'race-cars': { motion: 'walker', ground: true, height: 0.45, pace: 0.3 },
  drummers: { motion: 'walker', ground: true, height: 0.95, pace: 1.3 },
  scarecrows: { motion: 'walker', ground: true, height: 1, pace: 1.6 },
  'love-letters': { motion: 'flyer', ground: false, height: 0.5 },
  seahorses: { motion: 'flyer', ground: false, height: 0.65 },
  mermaids: { motion: 'flyer', ground: false, height: 0.55 },
  submarines: { motion: 'flyer', ground: false, height: 0.55 },
  'origami-cranes': { motion: 'flyer', ground: false, height: 0.5 },
  pufferfish: { motion: 'flock', ground: false, height: 0.3 },
  koi: { motion: 'flock', ground: false, height: 0.26 },
  // Fifth batch. Peeking over the window sills (or the bottom of the house).
  'peeking-ghosts': { motion: 'peek', ground: false, height: 0.75 },
  'peeking-elves': { motion: 'peek', ground: false, height: 0.75 },
  'window-cats': { motion: 'peek', ground: false, height: 0.75 },
  'window-eyes': { motion: 'peek', ground: false, height: 0.45 },
  'perched-owls': { motion: 'perch', ground: false, height: 0.85, look: true },
  seagulls: { motion: 'perch', ground: false, height: 0.75 },
  // Throwing at the house, and at people.
  'snowball-kids': { motion: 'throw', ground: true, height: 0.9 },
  'water-balloon-kids': { motion: 'throw', ground: true, height: 0.9 },
  'jack-in-the-box': { motion: 'popup', ground: true, height: 0.9 },
  moles: { motion: 'popup', ground: true, height: 0.7, rises: true },
  coffins: { motion: 'popup', ground: true, height: 1.1 },
  'grave-ghosts': { motion: 'popup', ground: true, height: 0.75 },
  'party-poppers': { motion: 'popup', ground: true, height: 0.5 },
  'birthday-cakes': { motion: 'popup', ground: true, height: 0.9 },
  skiers: { motion: 'slide', ground: false, height: 0.9 },
  'ice-skaters': { motion: 'walker', ground: true, height: 0.95, pace: 0.8, twirl: true },
  snails: { motion: 'walker', ground: true, height: 0.45, pace: 3, shy: true },
  tortoises: { motion: 'walker', ground: true, height: 0.55, pace: 2.4, shy: true },
  hedgehogs: { motion: 'walker', ground: true, height: 0.45, pace: 1.2, shy: true },
  skunks: { motion: 'walker', ground: true, height: 0.5, pace: 1.3, shy: true },
  'uncle-sam': { motion: 'walker', ground: true, height: 1.5, pace: 1.6 },
  'football-players': { motion: 'walker', ground: true, height: 0.95, pace: 0.6 },
  storks: { motion: 'flyer', ground: false, height: 0.95 },
  'flying-pigs': { motion: 'flyer', ground: false, height: 0.75 },
  unicorns: { motion: 'flyer', ground: false, height: 0.85, trail: true },
  'magic-carpet': { motion: 'flyer', ground: false, height: 0.7 },
  fairies: { motion: 'wander', ground: true, height: 0.35, steady: true },
  superheroes: { motion: 'flyer', ground: false, height: 0.7 },
  ladybugs: { motion: 'flock', ground: false, height: 0.2 },
  moths: { motion: 'flock', ground: false, height: 0.22 },
}

/** How much flyers bob up and down (ghosts float, the rest hardly), and how fast their frames go. */
const FLOAT: Partial<Record<MoverStyle, number>> = {
  ghosts: 0.25, ufo: 0.18, angels: 0.12, 'sea-turtles': 0.12, sharks: 0.08,
  'grim-reaper': 0.2, whales: 0.1, octopus: 0.3, astronauts: 0.3, 'paper-planes': 0.35, 'rocket-ship': 0.12,
  'love-letters': 0.25, seahorses: 0.3, mermaids: 0.18, submarines: 0.1, 'origami-cranes': 0.2,
  storks: 0.1, 'flying-pigs': 0.2, unicorns: 0.12, 'magic-carpet': 0.25, superheroes: 0.1,
}
const BEAT: Partial<Record<MoverStyle, number>> = {
  ghosts: 6, ufo: 4, 'sea-turtles': 4, angels: 5, sharks: 6, dragon: 7,
  'grim-reaper': 4, whales: 3, octopus: 5, astronauts: 3, 'rocket-ship': 12,
  'love-letters': 8, seahorses: 5, mermaids: 5, submarines: 6, 'origami-cranes': 6,
  storks: 6, 'flying-pigs': 10, unicorns: 9, 'magic-carpet': 6, superheroes: 8,
}

/** Width over height of a style's main picture. */
function ratioOf(style: MoverStyle): number {
  const main = SPRITE_ROWS[style][0]
  return main.w / main.h
}

function hasRow(style: MoverStyle, id: string): boolean {
  return SPRITE_ROWS[style].some((r) => r.id === id)
}

export function moverStyle(style: string): MoverStyle {
  return (MOVER_STYLES as readonly string[]).includes(style) ? (style as MoverStyle) : 'sleigh'
}

/** Height of one (the sleigh team, the engine, a bird…) in canvas heights. */
export function moverHeight(layer: SceneLayer): number {
  return (0.04 + 0.22 * layer.size) * STYLE[moverStyle(layer.style)].height
}

/** Walkers, the train, bouncing balls, throwers and things coming up out of the ground stay on it; the rest fly, float, fall or hang. */
export function moverWalks(style: string): boolean {
  const { motion } = STYLE[moverStyle(style)]
  return motion === 'walker' || motion === 'train' || motion === 'bounce' || motion === 'popup' || motion === 'throw'
}

// -- paths --------------------------------------------------------------------------------

interface PathPoint {
  x: number
  y: number
  size: number
}

/** A smooth line through points (x across in canvas heights, y down), walked by distance. */
export class MoverPath {
  private xs: number[] = []
  private ys: number[] = []
  private ss: number[] = []
  private cum: number[] = []
  readonly length: number

  constructor(readonly stops: PathPoint[]) {
    const points = stops
    const n = points.length
    const p = (i: number) => points[Math.max(0, Math.min(n - 1, i))]
    for (let i = 0; i < n - 1; i++) {
      // Catmull-Rom through the points, a few steps per span.
      const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
      const steps = 12
      for (let k = 0; k < steps; k++) {
        const t = k / steps
        const t2 = t * t
        const t3 = t2 * t
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
        this.xs.push(cr(p0.x, p1.x, p2.x, p3.x))
        this.ys.push(cr(p0.y, p1.y, p2.y, p3.y))
        this.ss.push(p1.size + (p2.size - p1.size) * t)
      }
    }
    const last = points[n - 1]
    this.xs.push(last.x)
    this.ys.push(last.y)
    this.ss.push(last.size)
    let total = 0
    this.cum.push(0)
    for (let i = 1; i < this.xs.length; i++) {
      total += Math.hypot(this.xs[i] - this.xs[i - 1], this.ys[i] - this.ys[i - 1])
      this.cum.push(total)
    }
    this.length = Math.max(1e-6, total)
  }

  /** The spot d along the path: where, how big, and which way it heads. */
  at(d: number): { x: number; y: number; size: number; dx: number; dy: number } {
    const cum = this.cum
    const s = Math.max(0, Math.min(this.length, d))
    let lo = 0
    let hi = cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= s) lo = mid
      else hi = mid
    }
    const span = cum[hi] - cum[lo] || 1
    const t = (s - cum[lo]) / span
    const dx = this.xs[hi] - this.xs[lo]
    const dy = this.ys[hi] - this.ys[lo]
    const len = Math.hypot(dx, dy) || 1
    return {
      x: this.xs[lo] + dx * t,
      y: this.ys[lo] + dy * t,
      size: this.ss[lo] + (this.ss[hi] - this.ss[lo]) * t,
      dx: dx / len,
      dy: dy / len,
    }
  }
}

/** Highest point of the traced parts at canvas fraction x (lowest with bottom), or null where there are none. */
function topAt(surfaces: Surface[], x: number, bottom = false): number | null {
  let best: number | null = null
  for (const s of surfaces) {
    const pts = s.points
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      if ((ax <= x && x <= bx) || (bx <= x && x <= ax)) {
        const y = bx === ax ? Math.min(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay)
        if (best == null || (bottom ? y > best : y < best)) best = y
      }
    }
  }
  return best
}

/**
 * The path a layer follows, in canvas heights across (x) and down (y):
 * the points placed by hand when there are two or more, otherwise one of
 * its own over the roofline or along the bottom of the house.
 */
export function moverPathPoints(layer: SceneLayer, surfaces: Surface[], aspect: number): { points: PathPoint[]; drawn: boolean } {
  const pins = layer.pins ?? []
  if (pins.length >= 2) {
    return { points: pins.map((p: ObjectPin) => ({ x: p.x * aspect, y: p.y, size: p.size })), drawn: true }
  }
  const style = moverStyle(layer.style)
  const h = moverHeight(layer)
  const parts = surfaces.filter((s) => s.points.length >= 3)
  const xs = parts.flatMap((s) => s.points.map((p) => p[0]))
  const ys = parts.flatMap((s) => s.points.map((p) => p[1]))
  if (STYLE[style].ground) {
    // Along the bottom of the house, or of the picture.
    const y = parts.length ? Math.min(0.97, Math.max(...ys)) : 0.93
    const x0 = parts.length ? Math.max(0, Math.min(...xs)) * aspect : 0.06 * aspect
    const x1 = parts.length ? Math.min(1, Math.max(...xs)) * aspect : 0.94 * aspect
    // The train comes in from one side and leaves by the other.
    const out = style === 'train' ? h * 4 : 0
    return { points: [{ x: x0 - out, y, size: 1 }, { x: x1 + out, y, size: 1 }], drawn: false }
  }
  if (STYLE[style].motion === 'peek') {
    // Each window's sill, sized to the window; without windows, spots along the bottom of the house.
    const ratio = ratioOf(style)
    const sills = parts
      .filter((s) => s.kind === 'window')
      .map((w) => {
        const wx = w.points.map((q) => q[0])
        const wy = w.points.map((q) => q[1])
        const cx = (Math.min(...wx) + Math.max(...wx)) / 2
        const wide = (Math.max(...wx) - Math.min(...wx)) * aspect
        const tall = Math.max(...wy) - Math.min(...wy)
        const size = Math.max(0.3, Math.min((wide * 0.8) / (h * ratio), (tall * 0.85) / h, 3))
        return { x: cx * aspect, y: topAt([w], cx, true) ?? Math.max(...wy), size }
      })
      .sort((a, b) => a.x - b.x)
    if (sills.length) return { points: sills, drawn: false }
    const y = parts.length ? Math.min(0.97, Math.max(...ys)) : 0.93
    const x0 = parts.length ? Math.max(0, Math.min(...xs)) : 0.06
    const x1 = parts.length ? Math.min(1, Math.max(...xs)) : 0.94
    return { points: [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => ({ x: (x0 + (x1 - x0) * k) * aspect, y, size: 1 })), drawn: false }
  }
  const roofs = parts.filter((s) => s.kind === 'roof')
  const over = roofs.length ? roofs : parts
  if (!over.length) {
    // An arc over the top of the picture until the house is traced.
    return {
      points: [
        { x: -0.25, y: 0.36, size: 1 },
        { x: aspect * 0.25, y: 0.2, size: 1 },
        { x: aspect * 0.5, y: 0.14, size: 1 },
        { x: aspect * 0.75, y: 0.2, size: 1 },
        { x: aspect + 0.25, y: 0.36, size: 1 },
      ],
      drawn: false,
    }
  }
  // Just above the roofline, from beyond the left edge to beyond the right; ones that sit on the
  // roof, slide down it or hang still from it follow the roofline itself, and only over the house.
  const ox = over.flatMap((s) => s.points.map((p) => p[0]))
  const left = Math.max(0, Math.min(...ox))
  const right = Math.min(1, Math.max(...ox))
  const motion = STYLE[style].motion
  const on = motion === 'perch' || motion === 'slide' || (motion === 'dangle' && !!STYLE[style].still)
  const lift = h * (style === 'sleigh' ? 0.75 : 1.2)
  const points: PathPoint[] = []
  const steps = on ? 24 : 10
  for (let i = 0; i <= steps; i++) {
    const x = left + ((right - left) * i) / steps
    const top = topAt(over, Math.min(right - 1e-4, Math.max(left + 1e-4, x)), on && STYLE[style].under)
    points.push({ x: x * aspect, y: on ? (top ?? 0.3) : Math.max(h * 0.6, (top ?? 0.3) - lift), size: 1 })
  }
  if (on) return { points, drawn: false }
  const first = points[0]
  const last = points[points.length - 1]
  points.unshift({ x: -0.3, y: Math.max(h, first.y - 0.08), size: 1 })
  points.push({ x: aspect + 0.3, y: Math.max(h, last.y - 0.08), size: 1 })
  return { points, drawn: false }
}

// -- where each one is ----------------------------------------------------------------------

export interface Sprite {
  /** Centre, in canvas heights across and down. */
  x: number
  y: number
  /** Half width and half height, canvas heights. */
  hw: number
  hh: number
  angle: number
  flip: boolean
  alpha: number
  glow: number
  row: string
  frame: number
  /** How much of the picture shows, from its top down (1 or left out: all of it); for rising up from behind something. */
  crop?: number
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

interface Near {
  k: number
  /** Unit vector from the nearest person to the point. */
  ax: number
  ay: number
  dist: number
}

/** How near the nearest person is to a point (canvas heights), 0..1 within the layer's reach. */
function nearAt(x: number, y: number, radius: number, people: PersonSpot[], reach: number, aspect: number): Near {
  const within = 0.06 + 0.5 * reach + radius
  let best: Near = { k: 0, ax: 0, ay: -1, dist: 1 }
  for (const p of people) {
    const dx = x - p.x * aspect
    const dy = y - p.y
    const d = Math.hypot(dx, dy)
    const k = p.strength * (1 - smoothstep(0, 1, d / within))
    if (k > best.k) best = { k, ax: d > 1e-4 ? dx / d : 0, ay: d > 1e-4 ? dy / d : -1, dist: d }
  }
  return best
}

/** Facing the way it travels: mirrored when heading left, tilted up to a limit. */
function heading(dx: number, dy: number, limit: number): { angle: number; flip: boolean } {
  const flip = dx < 0
  const a = flip ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx)
  return { angle: Math.max(-limit, Math.min(limit, a)), flip }
}

/** A speech bubble over one ("Ho ho ho!"), showing as someone comes near. */
function bubble(s: Sprite, size: number, flip: boolean, k: number): Sprite {
  const bh = size * 0.32
  return {
    x: s.x + (flip ? 1 : -1) * s.hw * 0.3,
    y: s.y - s.hh - bh * 0.7,
    hw: (bh * 360) / 140,
    hh: bh,
    angle: 0,
    flip: false,
    alpha: s.alpha * smoothstep(0.2, 0.5, k),
    glow: 0,
    row: 'bubble',
    frame: 0,
  }
}

/** What one does when someone comes near; flocks scatter by themselves (below). */
function react(s: Sprite, action: string, near: Near, t: number, ph: number, reach: number) {
  const k = near.k
  // Ones that only appear for people stay hidden while nobody is near at all.
  if (action === 'appear') {
    s.alpha *= smoothstep(0.05, 0.6, k)
    return
  }
  if (k <= 0.001) return
  if (action === 'light') s.glow = Math.max(s.glow, k)
  else if (action === 'grow') {
    s.hw *= 1 + 0.6 * k
    s.hh *= 1 + 0.6 * k
  } else if (action === 'flee') {
    const d = (0.1 + 0.4 * reach) * k
    s.x += near.ax * d
    s.y += near.ay * d - 0.05 * k
  } else if (action === 'follow') {
    const d = Math.max(0, near.dist - s.hh) * 0.6 * k
    s.x -= near.ax * d
    s.y -= near.ay * d
  } else if (action === 'jump') s.y -= Math.abs(Math.sin(t * 9 + ph)) * s.hh * 1.2 * k
  else if (action === 'dance') {
    s.angle += Math.sin(t * 10 + ph) * 0.3 * k
    s.y -= Math.abs(Math.sin(t * 10 + ph)) * s.hh * 0.5 * k
  } else if (action === 'hide') s.alpha *= 1 - smoothstep(0.25, 0.85, k)
}

export interface MoverFrame {
  layer: SceneLayer
  path: MoverPath
  drawn: boolean
  aspect: number
  people: PersonSpot[]
  /** Seconds since the cue started, shared by every output. */
  time: number
  dt: number
  /** Per-layer memory: how scared each bird is (flocks only). */
  scared: number[]
}

/** Everything one layer shows this frame. */
export function moverSprites(f: MoverFrame): Sprite[] {
  const { layer, path, drawn, aspect, people, time: t } = f
  const style = moverStyle(layer.style)
  const action = nearOf(layer)
  const reach = layer.reach ?? 0.5
  const H = moverHeight(layer)
  const L = path.length
  const out: Sprite[] = []
  const ends = (s: number) => (drawn ? smoothstep(0, 0.08, s) * smoothstep(0, 0.08, L - s) : 1)
  const motion = STYLE[style].motion
  // Each style keeps its own spacing, so a witch and a UFO do not fly on top of each other.
  const own = MOVER_STYLES.indexOf(style) * 0.37

  if (motion === 'flyer') {
    const v = 0.04 + 0.4 * layer.speed
    const gap = drawn ? 0.5 : 0.2
    const lap = L + gap
    const n = style === 'sleigh' ? 1 : 1 + Math.round(layer.amount * 5)
    const ratio = ratioOf(style)
    const floaty = FLOAT[style] ?? 0.07
    const beat = BEAT[style] ?? 9
    for (let i = 0; i < n; i++) {
      const s = (((t * v + (i * lap) / n + own * lap) % lap) + lap) % lap
      if (s > L) continue
      const p = path.at(s)
      const size = H * p.size
      const ph = hash(i + 3)
      const { angle, flip } = heading(p.dx, p.dy, style === 'sleigh' ? 0.4 : 0.15)
      const sprite: Sprite = {
        x: p.x,
        y: p.y + Math.sin(t * (floaty > 0.1 ? 1.6 : 2.6) + ph * 6) * size * floaty,
        hw: (size * ratio) / 2,
        hh: size / 2,
        angle,
        flip,
        alpha: ends(s) * (style === 'ghosts' ? 0.75 + 0.25 * Math.sin(t * 2.3 + ph * 9) : 1),
        glow: 0,
        row: 'main',
        frame: Math.floor(t * beat + ph * 8),
      }
      const near = nearAt(sprite.x, sprite.y, sprite.hh, people, reach, aspect)
      react(sprite, action, near, t, ph * 6, reach)
      if (style === 'ufo' && near.k > 0.15) {
        // A beam of light down onto whoever is under it.
        const bh = size * 2.4
        out.push({
          x: sprite.x, y: sprite.y + sprite.hh * 0.45 + bh / 2, hw: (bh * 200) / 300 / 2, hh: bh / 2,
          angle: 0, flip: false, alpha: sprite.alpha * smoothstep(0.15, 0.5, near.k), glow: 0, row: 'beam', frame: 0,
        })
      }
      if (hasRow(style, 'fire') && near.k > 0.2) {
        // The dragon breathes fire at whoever comes near, from its mouth.
        const fh = size * 0.5
        const fw = (fh * 320) / 140
        const dir = flip ? -1 : 1
        const lx = dir * (size * (462 - 240) / 360 + fw / 2 - size * 0.04)
        const ly = (size * (108 + 60 - 180)) / 360
        const ca = Math.cos(angle)
        const sa = Math.sin(angle)
        out.push({
          x: sprite.x + ca * lx - sa * ly, y: sprite.y + sa * lx + ca * ly, hw: fw / 2, hh: fh / 2, angle, flip,
          alpha: sprite.alpha * smoothstep(0.2, 0.5, near.k), glow: 0.5, row: 'fire', frame: Math.floor(t * 12),
        })
      }
      if (hasRow(style, 'spout') && near.k > 0.2) {
        // The whale blows a spout over whoever comes near.
        const hh = size * 0.4 * smoothstep(0.2, 0.6, near.k)
        const dir = flip ? -1 : 1
        const lx = dir * ((size * (330 - 210)) / 230)
        const ly = (size * (64 - 115)) / 230 - hh
        out.push({
          x: sprite.x + Math.cos(angle) * lx - Math.sin(angle) * ly, y: sprite.y + Math.sin(angle) * lx + Math.cos(angle) * ly,
          hw: size * 0.4, hh, angle: 0, flip: false,
          alpha: sprite.alpha * smoothstep(0.2, 0.5, near.k), glow: 0, row: 'spout', frame: Math.floor(t * 8),
        })
      }
      if (STYLE[style].trail) {
        // A trail of sparkles from the runners, longer with Trail turned up.
        const count = Math.round(6 + layer.fade * 18)
        for (let k = 1; k <= count; k++) {
          const ds = s - sprite.hw * 0.8 - k * size * 0.22
          if (ds < 0) break
          const q = path.at(ds)
          const lapNo = Math.floor((t * v) / lap)
          const j = hash(k * 7.1 + lapNo)
          out.push({
            x: q.x + (j - 0.5) * size * 0.2,
            y: q.y + size * 0.3 + (hash(k * 3.3 + lapNo) - 0.5) * size * 0.35 + Math.sin(t * 3 + k) * size * 0.05,
            hw: size * 0.13 * (1 - k / (count + 1)),
            hh: size * 0.13 * (1 - k / (count + 1)),
            angle: 0,
            flip: false,
            alpha: sprite.alpha * (1 - k / (count + 1)) * (0.4 + 0.6 * layer.fade),
            glow: 0.3,
            row: 'sparkle',
            frame: Math.floor(t * 10 + k) % 4,
          })
        }
      }
      out.push(sprite)
      // Santa (or the witch) calls out to whoever comes near.
      if (hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, flip, near.k))
    }
    return out
  }

  if (motion === 'flock') {
    const v = 0.03 + 0.3 * layer.speed
    const gap = drawn ? 0.5 : 0.3
    const n = 3 + Math.round(layer.amount * 25)
    const spread = H * (1.4 + 0.3 * Math.sqrt(n))
    const lap = L + gap + spread * 2
    const centre = (((t * v) % lap) + lap) % lap - spread
    if (f.scared.length !== n) f.scared = new Array(n).fill(0)
    const scatter = 0.12 + 0.5 * reach
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const hA = hash(i * 1.7 + 0.3)
      const hB = hash(i * 2.9 + 1.1)
      const along = (hA - 0.5) * spread * 2.2
      const s = centre + along
      if (s < -spread || s > L + spread) continue
      const p = path.at(s)
      const size = H * p.size * (0.8 + 0.4 * hB)
      // Spread around the path, each bobbing and drifting on its own.
      const side = (hB - 0.5) * spread * 1.2
      let x = p.x - p.dy * side + Math.sin(t * 0.9 + i) * size * 0.5
      let y = p.y + p.dx * side + Math.sin(t * 1.3 + i * 2.1) * size * 0.6
      const near = nearAt(x, y, size, people, reach, aspect)
      let scared = f.scared[i]
      if (action === 'flee') {
        // Rise at once, settle back over a few seconds.
        const target = smoothstep(0.05, 0.5, near.k)
        scared += (target - scared) * (1 - Math.exp(-f.dt / (target > scared ? 0.12 : 2.5)))
        f.scared[i] = scared
        const ax = near.ax + (hA - 0.5) * 0.8
        const ay = near.ay - 0.9
        const len = Math.hypot(ax, ay) || 1
        x += (ax / len) * scatter * scared
        y += (ay / len) * scatter * scared
      }
      const flap = 1 + scared * 1.8
      const { angle, flip } = heading(p.dx, p.dy - scared * 0.6, 0.35)
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle, flip,
        alpha: ends(Math.max(0, Math.min(L, s))) * (s < 0 || s > L ? 0.0 : 1),
        glow: 0, row: 'main',
        frame: Math.floor(((t * 3.2 * flap + hA * 8) % 1) * 8),
      }
      if (action !== 'flee') react(sprite, action, near, t, hA * 6, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'walker') {
    const v = (0.025 + 0.12 * layer.speed) / (STYLE[style].pace ?? 1)
    // A line is one big one with little ones hurrying after it (a duck and her ducklings).
    const line = STYLE[style].line
    const n = line ? 2 + Math.round(layer.amount * 6) : 1 + Math.round(layer.amount * 7)
    const ratio = ratioOf(style)
    const baby = SPRITE_ROWS[style].find((r) => r.id === 'baby')
    const hop = STYLE[style].hop
    const waves = hasRow(style, 'wave')
    const lead = t * v + hash(2 + own * 10) * L * 0.3
    // Shy ones stop and hide (in their shells) from people for a while: how long each has
    // stood still so far, then how much longer it stays hidden.
    const shy = STYLE[style].shy && (action === 'hide' || action === 'flee')
    if (shy && f.scared.length !== n * 2) f.scared = new Array(n * 2).fill(0)
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 5.3 + 2 + own * 10)
      const little = line && i > 0 && baby != null
      const tw = shy ? t - f.scared[i] : t
      const u = line
        ? lead - (i ? H * 0.75 + (i - 1) * H * 0.48 : 0)
        : tw * v * (0.85 + 0.3 * ph) + (i / n) * 2 * L + ph * L * 0.3
      const m = ((u % (2 * L)) + 2 * L) % (2 * L)
      const forward = m < L
      const s = forward ? m : 2 * L - m
      const p = path.at(s)
      const size = H * p.size * (little ? 0.5 : 1)
      const near = nearAt(p.x, p.y - size / 2, size / 2, people, reach, aspect)
      const stride = size * (hop ? 1.1 : 0.55)
      const excited = (action === 'dance' || action === 'jump') && near.k > 0.35
      const step = (((u / stride) % 1) + 1) % 1
      const sprite: Sprite = {
        x: p.x,
        // Hoppers go in bounds, up off the ground and down again.
        y: p.y - size / 2 - (hop ? Math.sin(step * Math.PI) * size * 0.45 : 0),
        hw: (size * (little ? baby.w / baby.h : ratio)) / 2,
        hh: size / 2,
        angle: 0,
        flip: forward ? p.dx < 0 : p.dx > 0,
        alpha: 1,
        glow: 0,
        row: little ? 'baby' : waves && excited ? 'wave' : 'main',
        frame: waves && excited && !little ? Math.floor(t * 8 + ph * 4) : Math.floor(step * 8),
      }
      if (shy) {
        if (near.k > 0.3) f.scared[n + i] = 2.5
        const hidden = f.scared[n + i] > 0
        f.scared[n + i] = Math.max(0, f.scared[n + i] - f.dt)
        if (hidden) {
          f.scared[i] += f.dt
          sprite.row = 'hide'
          sprite.frame = 0
          // The skunk turns its tail on whoever it is.
          if (style === 'skunks') sprite.flip = near.ax < 0
        }
        out.push(sprite)
        continue
      }
      if (STYLE[style].twirl && action === 'dance' && near.k > 0.35) {
        // A pirouette on the spot.
        const w = Math.cos(t * 9 + ph * 6)
        sprite.hw *= Math.max(0.2, Math.abs(w))
        sprite.flip = w < 0
        sprite.frame = 0
        out.push(sprite)
        if (hasRow(style, 'bubble')) out.push(bubble(sprite, size, sprite.flip, near.k))
        continue
      }
      // Walkers jump for joy rather than shake; the ones that can dance do that instead.
      // They run off (or come over) along the ground, not up the wall.
      const along: Near = action === 'flee' || action === 'follow' ? { ...near, ax: near.ax >= 0 ? 1 : -1, ay: 0 } : near
      react(sprite, action === 'dance' ? (waves ? 'none' : 'jump') : action, along, t, ph * 6, reach)
      out.push(sprite)
      if (!little && hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, sprite.flip, near.k))
    }
    return out
  }

  if (motion === 'train') {
    const v = 0.04 + 0.3 * layer.speed
    const eh = H
    const ew = eh * 1.6
    const ch = (eh * 264) / 320
    const cw = (ch * 400) / 264
    const link = eh * 0.04
    const cars = 2 + Math.round(layer.amount * 4)
    const length = ew + cars * (cw + link)
    const lap = L + length + (drawn ? 0.6 : 0.1)
    const head = (((t * v) % lap) + lap) % lap
    const wheels = Math.floor(((head / (eh * 0.5)) % 1) * 4)
    const place = (centre: number, w: number, hgt: number, row: string) => {
      if (centre < 0 || centre > L) return null
      const p = path.at(centre)
      const { angle, flip } = heading(p.dx, p.dy, 0.6)
      // Sit on the line: up from it, square to it.
      const nx = p.dy
      const ny = -p.dx
      const up = ny > 0 ? -1 : 1
      const sprite: Sprite = {
        x: p.x + nx * up * (hgt / 2) * p.size,
        y: p.y + ny * up * (hgt / 2) * p.size,
        hw: (w / 2) * p.size,
        hh: (hgt / 2) * p.size,
        angle, flip, alpha: ends(centre), glow: 0, row, frame: wheels,
      }
      return sprite
    }
    const engine = place(head - ew / 2, ew, eh, 'main')
    let near: Near = { k: 0, ax: 0, ay: -1, dist: 1 }
    if (engine) {
      near = nearAt(engine.x, engine.y, engine.hh, people, reach, aspect)
      // Puffs of steam from the chimney, rising and fading behind it.
      const dir = engine.flip ? -1 : 1
      const cx = engine.x + dir * engine.hw * 0.53 * Math.cos(engine.angle) + engine.hh * 0.62 * Math.sin(engine.angle) * dir
      const cy = engine.y - engine.hh * 0.62
      const puffs = 7
      for (let k = 0; k < puffs; k++) {
        const a = (t * 0.9 + k / puffs) % 1
        out.push({
          x: cx - dir * a * eh * 0.9,
          y: cy - a * eh * 1.1,
          hw: eh * (0.12 + a * 0.3),
          hh: eh * (0.12 + a * 0.3),
          angle: 0, flip: false,
          alpha: (1 - a) * 0.7 * (0.35 + 0.65 * layer.fade) * engine.alpha,
          glow: 0, row: 'puff', frame: 0,
        })
      }
    }
    for (let j = 0; j < cars; j++) {
      const c = place(head - ew - link - j * (cw + link) - cw / 2, cw, ch, j % 2 ? 'tree' : 'gifts')
      if (!c) continue
      react(c, action, nearAt(c.x, c.y, c.hh, people, reach, aspect), t, j, reach)
      out.push(c)
    }
    if (engine) {
      react(engine, action, near, t, 0, reach)
      out.push(engine)
    }
    return out
  }

  if (motion === 'rocket') {
    // Each goes up from the bottom of the house (or along the drawn path) and bursts.
    const n = 1 + Math.round(layer.amount * 5)
    const rh = H
    const rw = rh * (160 / 48)
    const sparks = 16 + Math.round(layer.fade * 20)
    for (let i = 0; i < n; i++) {
      const period = (2.6 + hash(i * 3.1) * 2.6) / (0.4 + 1.2 * layer.speed)
      const u = (t + hash(i * 7.7) * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 17.3 + i * 5.1
      const climb = 0.32
      let x0: number
      let y0: number
      let x1: number
      let y1: number
      if (drawn) {
        const a = path.at(0)
        const b = path.at(L)
        ;[x0, y0, x1, y1] = [a.x, a.y, b.x, b.y]
      } else {
        const base = path.at(hash(seed) * L)
        x0 = base.x
        y0 = base.y
        x1 = x0 + (hash(seed + 1) - 0.5) * 0.15
        y1 = Math.max(0.08, y0 - 0.45 - hash(seed + 2) * 0.3)
      }
      if (q < climb) {
        const k = q / climb
        const e = 1 - (1 - k) * (1 - k)
        let x = x0 + (x1 - x0) * e
        let y = y0 + (y1 - y0) * e
        let dx = x1 - x0
        let dy = y1 - y0
        if (drawn) {
          const p = path.at(e * L)
          ;({ x, y, dx, dy } = p)
        }
        const len = Math.hypot(dx, dy) || 1
        const { angle, flip } = heading(dx / len, dy / len, Math.PI)
        const shell: Sprite = {
          x: x - (dx / len) * rw * 0.35, y: y - (dy / len) * rw * 0.35, hw: rw / 2, hh: rh / 2,
          angle, flip, alpha: smoothstep(0, 0.1, k), glow: 0, row: 'main', frame: 0,
        }
        react(shell, action, nearAt(x, y, rh, people, reach, aspect), t, i, reach)
        out.push(shell)
        continue
      }
      // The burst: sparks fly out, slow down, drift down and fade.
      const k = (q - climb) / (1 - climb)
      const near = nearAt(x1, y1, H * 3, people, reach, aspect)
      const big = 1 + (action === 'grow' ? 0.8 : 0.35) * near.k
      const radius = H * (2.2 + hash(seed + 3) * 1.6) * big * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3))
      const fade = 1 - smoothstep(0.45, 1, k)
      const rows = ['spark1', 'spark2', 'spark3']
      const look = Math.floor(hash(seed + 4) * 3)
      // An outer ring and an inner one in another colour, each spark with a short tail.
      for (const [ring, count, row] of [[1, sparks, rows[look]], [0.55, Math.round(sparks * 0.6), rows[(look + 1) % 3]]] as const) {
        for (let j = 0; j < count; j++) {
          const a = (j / count) * Math.PI * 2 + hash(seed + j + ring) * 0.25
          const sr = H * 0.3 * (1 - k * 0.5) * (action === 'light' ? 1 + 0.6 * near.k : 1)
          for (let m = 0; m < 3; m++) {
            const r = radius * ring * (1 - m * 0.09)
            out.push({
              x: x1 + Math.cos(a) * r,
              y: y1 + Math.sin(a) * r + k * k * H * 1.4,
              hw: sr * (1 - m * 0.3), hh: sr * (1 - m * 0.3), angle: 0, flip: false,
              alpha: fade * (1 - m * 0.35) * (0.75 + 0.25 * Math.sin(t * 20 + j)),
              glow: near.k,
              row, frame: 0,
            })
          }
        }
      }
    }
    return out
  }

  if (motion === 'rise') {
    // Balloons float up from the bottom of the house, swaying, and away off the top.
    const n = 1 + Math.round(layer.amount * 9)
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const period = ((7 + hash(i * 2.3) * 5) * (STYLE[style].pace ?? 1)) / (0.3 + 1.4 * layer.speed)
      const u = (t + hash(i * 9.1) * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 11.7 + i * 3.3
      const size = H * (0.8 + 0.4 * hash(seed + 5))
      let x: number
      let y: number
      if (drawn) {
        const p = path.at(q * L)
        x = p.x
        y = p.y
      } else {
        const base = path.at(hash(seed) * L)
        x = base.x + Math.sin(t * 0.8 + i * 2) * size * 0.3
        y = base.y - size * 0.4 - q * (base.y + size * 1.5)
      }
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle: Math.sin(t * 1.1 + i) * 0.12, flip: false,
        alpha: smoothstep(0, 0.06, q) * (1 - smoothstep(0.92, 1, q)), glow: 0, row: 'main',
        // Balloons and hot air balloons each keep a colour; lanterns flicker, jellyfish pulse.
        frame: STYLE[style].animate ? Math.floor(t * 6 + i * 3) : i,
      }
      react(sprite, action, nearAt(x, y, size / 2, people, reach, aspect), t, i, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'fall') {
    // Each comes down from above the picture (or from the line drawn) to the bottom, swaying and turning over.
    const n = 6 + Math.round(layer.amount * 44)
    const spin = STYLE[style].spin ?? 0
    const frames = SPRITE_ROWS[style][0].frames
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const period = ((7 + hash(i * 2.7) * 6) * (STYLE[style].pace ?? 1)) / (0.25 + 1.3 * layer.speed)
      const u = (t + hash(i * 8.3) * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 7.9 + i * 4.1 + own
      const size = H * (0.65 + 0.7 * hash(seed + 2))
      let x0 = hash(seed) * aspect
      let y0 = -0.06
      if (drawn) {
        const p = path.at(hash(seed) * L)
        x0 = p.x
        y0 = p.y
      }
      const ph = hash(seed + 4) * 6.28
      const x = x0 + Math.sin(t * (0.6 + hash(seed + 5) * 0.8) + ph) * (0.02 + 0.04 * hash(seed + 3))
      const y = y0 + q * (1.06 - y0)
      // Flat ones (leaves, petals, confetti) flutter: narrower as they turn edge on.
      const tumble = spin > 0.5 ? 0.3 + 0.7 * Math.abs(Math.cos(t * spin * 1.7 + ph)) : 1
      const sprite: Sprite = {
        x, y, hw: ((size * ratio) / 2) * tumble, hh: size / 2,
        angle: spin ? t * spin * (0.6 + hash(seed + 6)) * (hash(seed + 7) < 0.5 ? -1 : 1) : Math.sin(t * 1.2 + ph) * 0.25,
        flip: false,
        alpha: smoothstep(0, 0.05, q) * (1 - smoothstep(0.9, 1, q)),
        // Coins spin as they fall; the rest are each another one of the kind.
        glow: 0, row: 'main', frame: Math.floor((STYLE[style].animate ? t * 10 : 0) + hash(seed + 8) * frames),
      }
      react(sprite, action, nearAt(x, y, size / 2, people, reach, aspect), t, ph, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'dangle') {
    // Spiders hanging from the roofline on threads, slowly going up and down; they drop to people below.
    // Bells and stockings hang still on their ribbons, at staggered lengths, and swing when people dance by.
    const n = 1 + Math.round(layer.amount * 7)
    const ratio = ratioOf(style)
    const still = STYLE[style].still
    const drops = !still && (action === 'follow' || action === 'jump')
    // People are down on the ground below the bells and stockings: only how far along matters.
    const along = still ? people.map((q) => ({ ...q, y: 0 })) : people
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 3.7 + 1 + own)
      const p = path.at(L * ((i + 0.5) / n) + (ph - 0.5) * (L / n) * 0.5)
      const size = H * p.size
      // Its own path is lifted over the roof; hang from the roof itself.
      const top = drawn || still ? p.y : p.y + H * 1.2
      const rest = still
        ? size * (0.5 + 0.35 * (i % 3) + 0.3 * ph)
        : size * (1.2 + 1.5 * ph) + Math.sin(t * (0.4 + ph * 0.5) + ph * 9) * size * 0.45
      const near0 = nearAt(p.x, still ? 0 : top + rest, size / 2, along, reach, aspect)
      const rings = still && (action === 'dance' || action === 'jump') ? smoothstep(0.1, 0.6, near0.k) : 0
      const swing = Math.sin(t * 0.8 + ph * 5) * size * (still ? 0.06 : 0.1) + Math.sin(t * 7 + ph * 9) * size * 0.35 * rings
      const near = nearAt(p.x + swing, still ? 0 : top + rest, size / 2, along, reach, aspect)
      const len = rest + (drops ? smoothstep(0, 1, near.k) * (0.12 + 0.45 * reach) : 0)
      const x = p.x + swing
      const y = top + len
      const angle = -Math.atan2(x - p.x, len)
      out.push({
        x: (x + p.x) / 2, y: top + (len - size * 0.4) / 2, hw: size * (still ? 0.035 : 0.02), hh: Math.max(0, len - size * 0.4) / 2,
        angle, flip: false, alpha: 0.85, glow: 0, row: 'thread', frame: 0,
      })
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle, flip: false, alpha: 1, glow: 0, row: 'main',
        // Bells glint faster as they ring; stockings each keep a pattern.
        frame: still && !STYLE[style].animate ? i : Math.floor(t * (still ? 3 + 12 * rings : 5 + 10 * near.k) + ph * 8),
      }
      react(sprite, drops || rings > 0 ? 'none' : action, near, t, ph * 6, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'wander') {
    // Fireflies drifting over the lower part of the house (or round the line drawn), blinking on and off;
    // candles floating higher and slower, always lit, their flames flickering.
    const steady = STYLE[style].steady
    const n = steady ? 3 + Math.round(layer.amount * 14) : 5 + Math.round(layer.amount * 40)
    const ratio = ratioOf(style)
    const drift = steady ? 0.5 : 1
    for (let i = 0; i < n; i++) {
      const hA = hash(i * 1.9 + own)
      const hB = hash(i * 3.1 + 2)
      const p = path.at(hA * L)
      const size = H * p.size * (0.7 + 0.6 * hash(i * 5.7))
      const hy = drawn ? p.y : p.y - (steady ? 0.12 + hB * 0.45 : 0.04 + hB * 0.4)
      const x = p.x + (Math.sin(t * (0.21 + 0.2 * hA) * drift + i) * 0.06 + Math.sin(t * (0.53 + 0.3 * hB) * drift + i * 2) * 0.03) * drift
      const y = hy + Math.sin(t * (0.17 + 0.2 * hB) + i * 1.3) * 0.04 * drift + Math.sin(t * 0.61 + i) * 0.015
      const blink = steady ? 1 : Math.pow(Math.max(0, Math.sin(t * (0.7 + hA * 0.8) + i * 7)), 3)
      const near = nearAt(x, y, size, people, reach, aspect)
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle: steady ? Math.sin(t * 0.7 + i) * 0.05 : 0, flip: false,
        // Near people they all light up.
        alpha: Math.max(0.1 + 0.9 * blink, near.k), glow: 0, row: 'main',
        frame: steady ? Math.floor(t * 7 + i * 3) : 0,
      }
      react(sprite, action, near, t, hA * 6, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'popup') {
    // Zombie hands clawing up out of the ground, eggs hatching, coffins opening, moles, a jack-in-the-box,
    // ghosts rising from graves or sparklers lit, spread along the bottom of the house.
    // Each comes up now and then by itself; people bring up the ones beside them (Appear: only then).
    // Party poppers go off and birthday cakes stand there lit, until someone comes and blows the candles out.
    const cake = hasRow(style, 'out')
    const popper = hasRow(style, 'burst')
    const n = cake ? 1 + Math.round(layer.amount * 4) : 2 + Math.round(layer.amount * 8)
    const ratio = ratioOf(style)
    const frames = SPRITE_ROWS[style][0].frames
    const hand = hasRow(style, 'mound')
    // When each popper last went off, or each cake was last blown out.
    if ((cake || popper) && f.scared.length !== n) f.scared = new Array(n).fill(-100)
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 4.3 + 2 + own)
      const p = path.at(L * ((i + 0.5) / n) + (ph - 0.5) * (L / n) * 0.6)
      const size = H * p.size * (0.85 + 0.3 * hash(i * 2.2))
      const period = (9 + ph * 7) / (0.3 + 1.4 * layer.speed)
      const q = (((t + ph * period) / period) % 1 + 1) % 1
      let up = action === 'appear' ? 0 : smoothstep(0.05, 0.2, q) * (1 - smoothstep(0.6, 0.75, q))
      const near = nearAt(p.x, p.y - size / 2, size / 2, people, reach, aspect)
      if (action === 'hide') up *= 1 - smoothstep(0.2, 0.7, near.k)
      else if (action !== 'none') up = Math.max(up, smoothstep(0.1, 0.6, near.k))
      if (f.scared[i] > t) f.scared[i] = -100
      if (cake) {
        // Lit, flickering; people coming up blow the candles out (smoke curls up) and they light again later.
        // With Light up the candles are lit only for people.
        if (action !== 'none' && action !== 'light' && action !== 'appear' && near.k > 0.45 && t - f.scared[i] > 9) f.scared[i] = t
        const blown = action === 'light' ? near.k < 0.2 : t - f.scared[i] < 8
        const sprite: Sprite = {
          x: p.x, y: p.y - size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: false,
          alpha: action === 'appear' ? smoothstep(0.05, 0.6, near.k) : 1, glow: blown ? 0 : 0.15,
          row: blown ? 'out' : 'main', frame: Math.floor(t * (blown ? 3 : 8) + ph * 8),
        }
        out.push(sprite)
        if (near.k > 0.2) out.push(bubble(sprite, size, false, near.k))
        continue
      }
      if (popper) {
        // Stuck in the ground leaning over; now and then, and as soon as people come up, it goes pop.
        if (action !== 'none' && action !== 'hide' && near.k > 0.4 && t - f.scared[i] > 2.5) f.scared[i] = t
        const period2 = (5 + ph * 5) / (0.3 + 1.4 * layer.speed)
        const tq = t + ph * period2
        const sinceOwn = action === 'appear' ? 1e9 : ((tq % period2) + period2) % period2
        const since = Math.min(sinceOwn, t - f.scared[i])
        const start = Math.round((t - since) * 10)
        const tilt = (ph < 0.5 ? -1 : 1) * (0.15 + 0.2 * hash(i * 1.7))
        const shake = since < 0.12 ? Math.sin(since * 120) * 0.08 : 0
        const sprite: Sprite = {
          x: p.x, y: p.y - size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: tilt + shake, flip: false,
          alpha: action === 'appear' ? smoothstep(0.05, 0.6, near.k) : 1, glow: 0, row: 'main', frame: 0,
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        const life = 2.4
        if (since < life) {
          const mx = sprite.x + Math.sin(tilt) * size * 0.37
          const my = sprite.y - Math.cos(tilt) * size * 0.37
          const pieces = 14 + Math.round(layer.fade * 18)
          const drag = (1 - Math.exp(-3 * since)) / 3
          for (let j = 0; j < pieces; j++) {
            const hj = hash(start * 0.37 + j * 1.13 + i)
            const a = tilt - Math.PI / 2 + (hj - 0.5) * 1.2
            const v0 = size * (2.2 + 3 * hash(start + j * 2.7))
            const ps = size * (0.08 + 0.05 * hash(j * 3.1 + start))
            out.push({
              x: mx + Math.cos(a) * v0 * drag + Math.sin(since * 3 + j) * size * 0.08 * since,
              y: my + Math.sin(a) * v0 * drag + 0.35 * size * since * since,
              hw: ps, hh: ps, angle: since * (hash(j + 5.5) - 0.5) * 16, flip: false,
              alpha: sprite.alpha * (1 - smoothstep(life * 0.6, life, since)), glow: 0, row: 'burst', frame: j,
            })
          }
        }
        continue
      }
      if (hasRow(style, 'box')) {
        // The lid flies open and the jester springs out, bobbing on the spring, then folds back in.
        const bh = size * 0.5
        const box: Sprite = {
          x: p.x, y: p.y - bh / 2, hw: (bh * 120) / 110 / 2, hh: bh / 2, angle: 0, flip: ph < 0.5,
          alpha: 1, glow: 0, row: 'box', frame: up > 0.03 ? 1 : 0,
        }
        out.push(box)
        const out1 = Math.min(1, up * 2.2)
        if (out1 > 0.01) {
          const bob = Math.sin(t * 8 + ph * 9) * Math.exp(-((t * 0.7 + ph * 3) % 1) * 2) * 0.12
          const crop = Math.min(1, out1 * (1 + bob))
          const top = p.y - bh + (bh * 30) / 110
          const jester: Sprite = {
            x: p.x, y: top + size * 0.03 - (size * crop) / 2, hw: (size * ratio) / 2, hh: (size * crop) / 2,
            angle: Math.sin(t * 5 + ph * 9) * 0.1 * out1, flip: ph < 0.5, alpha: 1, glow: 0, row: 'main',
            frame: Math.floor(t * 8 + ph * 8), crop,
          }
          react(jester, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
          out.push(jester)
          if (out1 > 0.9 && near.k > 0.2) out.push(bubble(jester, size, jester.flip, near.k))
        }
        continue
      }
      if (hasRow(style, 'stone')) {
        // A ghost rising up out of the grave behind its headstone and sinking back.
        const sh = size * 0.9
        const gh = size * 0.85
        const bottom = p.y - sh * 0.35 - up * sh * 0.85
        const ghost: Sprite = {
          x: p.x + Math.sin(t * 0.9 + ph * 7) * size * 0.06 * up, y: bottom - gh / 2 + Math.sin(t * 1.7 + ph * 5) * size * 0.04,
          hw: (gh * ratio) / 2, hh: gh / 2, angle: Math.sin(t * 1.3 + ph * 3) * 0.08, flip: ph < 0.5,
          alpha: 0.85 * smoothstep(0.02, 0.4, up), glow: 0, row: 'main', frame: Math.floor(t * 6 + ph * 8),
        }
        react(ghost, action === 'light' || action === 'grow' || action === 'dance' ? action : 'none', near, t, ph * 6, reach)
        out.push(ghost)
        out.push({
          x: p.x, y: p.y - sh / 2, hw: (sh * 140) / 170 / 2, hh: sh / 2, angle: (ph - 0.5) * 0.12, flip: false,
          alpha: 1, glow: 0, row: 'stone', frame: 0,
        })
        if (up > 0.7 && near.k > 0.2) out.push(bubble(ghost, gh, ghost.flip, near.k))
        continue
      }
      if (STYLE[style].rises) {
        // Poking up out of its mound to sniff the air and ducking back down.
        const crop = Math.min(1, up * 1.15)
        if (crop > 0.01) {
          const sprite: Sprite = {
            x: p.x, y: p.y - size * 0.12 - (size * crop) / 2, hw: (size * ratio) / 2, hh: (size * crop) / 2,
            angle: 0, flip: ph < 0.5, alpha: 1, glow: 0, row: 'main', frame: Math.floor(t * (5 + 6 * near.k) + ph * 8), crop,
          }
          react(sprite, action === 'light' || action === 'grow' || action === 'dance' ? action : 'none', near, t, ph * 6, reach)
          out.push(sprite)
        }
        out.push({
          x: p.x, y: p.y - size * 0.11, hw: size * 0.5, hh: size * 0.19, angle: 0, flip: ph < 0.5,
          alpha: 1, glow: 0, row: 'mound', frame: 0,
        })
        continue
      }
      if (STYLE[style].animate) {
        // Sparklers stuck in the ground: lit now and then, and by people coming near; burnt out in between.
        const sprite: Sprite = {
          x: p.x, y: p.y - size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: Math.sin(t * 0.9 + ph * 9) * 0.06,
          flip: ph < 0.5, alpha: smoothstep(0.02, 0.3, up), glow: up * 0.5, row: 'main', frame: Math.floor(t * 16 + ph * 8),
        }
        react(sprite, action === 'light' || action === 'grow' || action === 'dance' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (hand) {
        // Growing up out of its mound (nothing shows below the ground), flexing its fingers; the mound stays.
        const grow = 0.3 + 0.7 * up
        const sprite: Sprite = {
          x: p.x, y: p.y - size * 0.06 - (size / 2) * grow, hw: ((size * ratio) / 2) * grow, hh: (size / 2) * grow,
          angle: Math.sin(t * 1.7 + ph * 9) * 0.12 * up, flip: ph < 0.5,
          alpha: smoothstep(0.02, 0.35, up), glow: 0, row: 'main', frame: Math.floor(t * (4 + 8 * near.k) + ph * 8),
        }
        react(sprite, action === 'light' || action === 'grow' || action === 'dance' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        out.push({
          x: p.x, y: p.y - size * 0.09, hw: size * 0.4, hh: size * 0.15, angle: 0, flip: ph < 0.5,
          alpha: 1, glow: 0, row: 'mound', frame: 0,
        })
      } else {
        // Eggs sit there and hatch as they come up: whole, cracking, then the chick climbs out.
        const stage = Math.min(frames - 1, Math.floor(up * frames * 0.999))
        const sprite: Sprite = {
          x: p.x, y: p.y - size / 2, hw: (size * ratio) / 2, hh: size / 2,
          angle: stage >= 1 && stage <= 2 ? Math.sin(t * 14 + ph * 9) * 0.12 : 0, flip: false,
          alpha: 1, glow: 0, row: 'main', frame: stage,
        }
        react(sprite, action === 'light' || action === 'grow' || action === 'dance' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        // The vampire greets whoever opened the coffin.
        if (stage === frames - 1 && hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, false, near.k))
      }
    }
    return out
  }

  if (motion === 'bounce') {
    // Beach balls bouncing along the bottom of the house, spinning; people kick them up and away.
    // Pumpkins roll along it with only a bump now and then.
    const low = STYLE[style].low
    const n = 1 + Math.round(layer.amount * 5)
    const v = 0.04 + 0.2 * layer.speed
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 6.1 + own)
      const size = H * (0.8 + 0.4 * hash(i * 1.3))
      const u = t * v * (0.8 + 0.4 * ph) + (i / n) * 2 * L + ph * L
      const m = ((u % (2 * L)) + 2 * L) % (2 * L)
      const forward = m < L
      const s = forward ? m : 2 * L - m
      const p = path.at(s)
      const hop = size * (2.2 + 1.2 * ph)
      const step = (((u / hop) % 1) + 1) % 1
      const height = low ? Math.pow(Math.sin(step * Math.PI), 8) * size * 0.12 : Math.sin(step * Math.PI) * size * (1.1 + 0.6 * ph)
      const sprite: Sprite = {
        x: p.x, y: p.y - size / 2 - height, hw: size / 2, hh: size / 2,
        angle: ((forward ? 1 : -1) * u) / (size * 0.5), flip: false, alpha: 1, glow: 0, row: 'main', frame: 0,
      }
      const near = nearAt(sprite.x, sprite.y, size / 2, people, reach, aspect)
      if (action === 'flee' || action === 'jump') {
        // A kick: up high and off to the side, away from them.
        const kick = smoothstep(0.05, 0.6, near.k)
        sprite.x += near.ax * kick * (0.06 + 0.25 * reach)
        sprite.y -= kick * size * (low ? 0.3 + Math.abs(Math.sin(t * 5 + ph * 6)) * 0.4 : 1.5 + Math.abs(Math.sin(t * 3 + ph * 6)) * 1.5)
        sprite.angle += kick * t * 8
      } else react(sprite, action, near, t, ph * 6, reach)
      out.push(sprite)
    }
    return out
  }

  if (motion === 'leap') {
    // Dolphins leaping out of the bottom of the house as if it were the sea, with a splash in and out.
    const n = 1 + Math.round(layer.amount * 6)
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 3.9 + own)
      const period = (2.6 + ph * 2) / (0.3 + 1.2 * layer.speed)
      const u = (t + ph * period * 3) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 9.7 + i * 2.9
      const size = H * (0.85 + 0.3 * hash(seed + 1))
      const span = Math.min(L * 0.8, size * (3.2 + 1.4 * hash(seed + 2)))
      const left = hash(seed + 3) < 0.5
      const s0 = hash(seed) * Math.max(0, L - span)
      const air = 0.6
      // Under water for the rest of the time.
      if (q > air) continue
      const k = q / air
      const a = path.at(left ? s0 + span : s0)
      const b = path.at(left ? s0 : s0 + span)
      const near = nearAt((a.x + b.x) / 2, a.y - size, size, people, reach, aspect)
      const high = size * (1.6 + 0.8 * hash(seed + 4)) * (action === 'jump' || action === 'grow' ? 1 + 0.7 * near.k : 1)
      const x = a.x + (b.x - a.x) * k
      const y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * high
      const dx = b.x - a.x
      const dy = b.y - a.y - Math.cos(k * Math.PI) * high * Math.PI
      const len = Math.hypot(dx, dy) || 1
      const { angle, flip } = heading(dx / len, dy / len, Math.PI / 2)
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle, flip,
        alpha: smoothstep(0, 0.06, k) * (1 - smoothstep(0.94, 1, k)), glow: 0, row: 'main', frame: Math.floor(t * 9 + ph * 8),
      }
      react(sprite, action === 'jump' ? 'none' : action, near, t, ph * 6, reach)
      out.push(sprite)
      for (const [sx, sy, at] of [[a.x, a.y, k], [b.x, b.y, k - 0.85]] as const) {
        // A splash where it comes out, and another where it goes back in.
        const w = 1 - smoothstep(0, 0.2, Math.abs(at - 0.05))
        if (w <= 0.01) continue
        out.push({
          x: sx, y: sy - size * 0.25 * w, hw: size * 0.55, hh: size * 0.34 * w, angle: 0, flip: false,
          alpha: w, glow: 0, row: 'splash', frame: 0,
        })
      }
    }
    return out
  }

  if (motion === 'kite') {
    // Kites on strings from the bottom of the house, riding the wind above it; people make them dive and climb.
    const n = 1 + Math.round(layer.amount * 5)
    const ratio = ratioOf(style)
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 5.9 + own)
      const p = path.at(L * ((i + 0.5) / n) + (ph - 0.5) * (L / n) * 0.5)
      const size = H * p.size * (0.85 + 0.3 * hash(i * 3.3))
      const wind = 0.4 + 1.2 * layer.speed
      // Its own path is along the ground: the string comes from there and the kite flies high above.
      const ax = drawn ? p.x : p.x - size * 0.6
      const ay = drawn ? Math.min(1, p.y + 0.45) : p.y
      let x = drawn ? p.x : ax + size * (1.2 + ph)
      let y = drawn ? p.y : Math.max(size, ay - (0.42 + 0.25 * ph))
      x += Math.sin(t * 0.5 * wind + ph * 9) * size * 0.6 + Math.sin(t * 1.3 * wind + ph * 3) * size * 0.15
      y += Math.sin(t * 0.7 * wind + ph * 5) * size * 0.35
      const near = nearAt(ax, ay, size, people, reach, aspect)
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle: Math.sin(t * 1.1 * wind + ph * 7) * 0.25, flip: false,
        alpha: 1, glow: 0, row: 'main', frame: Math.floor(t * (6 + 6 * layer.speed) + ph * 8),
      }
      if (action === 'jump' || action === 'dance') {
        // A dive and loop over whoever is holding the string.
        const k = smoothstep(0.1, 0.6, near.k)
        const a = t * 2.4 + ph * 6
        sprite.x += Math.cos(a) * size * 1.1 * k
        sprite.y += Math.sin(a) * size * 0.9 * k
        sprite.angle += k * Math.sin(a) * 0.9
      } else react(sprite, action, near, t, ph * 6, reach)
      // The string from the hand to the bottom of the kite.
      const bx = sprite.x - Math.sin(sprite.angle) * sprite.hh * 0.24
      const by = sprite.y + Math.cos(sprite.angle) * sprite.hh * 0.24
      const len = Math.hypot(bx - ax, by - ay)
      out.push({
        x: (ax + bx) / 2, y: (ay + by) / 2, hw: size * 0.012, hh: len / 2, angle: Math.atan2(bx - ax, ay - by),
        flip: false, alpha: 0.8, glow: 0, row: 'string', frame: 0,
      })
      out.push(sprite)
    }
    return out
  }

  if (motion === 'perch') {
    // Birds sitting along the roofline (bats hanging under it), looking round, pecking and calling.
    // Now and then one flies off and comes back to its spot; people coming near send them all off at once.
    const n = 1 + Math.round(layer.amount * 9)
    const ratio = ratioOf(style)
    const fly = SPRITE_ROWS[style].find((r) => r.id === 'fly')
    const hangs = STYLE[style].under
    // How far off each one is (0 sitting, 1 gone), then which way it went.
    if (f.scared.length !== n * 2) f.scared = new Array(n * 2).fill(0)
    // People are down on the ground below them: only how far along matters.
    const along = people.map((q) => ({ ...q, y: 0 }))
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 4.9 + 3 + own)
      const p = path.at(L * ((i + 0.5) / n) + (ph - 0.5) * (L / n) * 0.6)
      const size = H * p.size * (0.85 + 0.3 * hash(i * 2.7))
      // Feet on the line, or hanging from it.
      const px = p.x
      const py = hangs ? p.y + size / 2 : p.y - size / 2
      const near = nearAt(px, 0, size / 2, along, reach, aspect)
      const period = (16 + ph * 18) / (0.3 + 1.4 * layer.speed)
      const q = (((t + ph * period) / period) % 1 + 1) % 1
      const scare = action === 'flee' && near.k > 0.4
      const target = q < 0.05 || scare ? 1 : 0
      let off = f.scared[i]
      if (off < 0.02 && target > off) f.scared[n + i] = scare ? (near.ax >= 0 ? 1 : -1) : ph < 0.5 ? -1 : 1
      const dir = f.scared[n + i] || 1
      // Off quickly, back slowly, slowing down to land.
      off += (target - off) * (1 - Math.exp(-f.dt / (target > off ? 0.8 : 1.4)))
      f.scared[i] = off
      let sprite: Sprite
      if (off > 0.02 && fly) {
        const leaving = target > off
        const reachX = 0.45 + 0.35 * ph
        const reachY = 0.35 + 0.2 * hash(i * 1.3)
        const fh = size * 0.7
        const { angle, flip } = heading((leaving ? 1 : -1) * dir * reachX, (leaving ? -1 : 1) * reachY * 0.8, 0.5)
        sprite = {
          x: px + dir * reachX * off,
          y: py - reachY * Math.pow(off, 0.8) + (hangs ? size * 0.2 * Math.sin(Math.min(1, off * 4) * Math.PI) : 0),
          hw: (fh * fly.w) / fly.h / 2, hh: fh / 2, angle, flip,
          alpha: 1 - smoothstep(0.75, 0.98, off), glow: 0, row: 'fly', frame: Math.floor(t * 14 + ph * 8),
        }
      } else {
        // Sitting: mostly still, looking round, pecking and calling now and then.
        const c = Math.floor(t / 1.3 + ph * 7)
        const r = hash(c * 1.37 + i * 7.1)
        let pose = hangs ? Math.floor(t * 2 + ph * 4) : near.k > 0.2 ? 3 : r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3
        // Owls turn their heads to watch whoever is near (left, ahead, right), blinking now and then.
        const looks = STYLE[style].look
        if (looks) {
          const side = -near.ax * near.dist
          pose = near.k > 0.08 ? (r > 0.9 ? 3 : side < -size * 0.3 ? 0 : side > size * 0.3 ? 2 : 1) : r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3
        }
        sprite = {
          x: px, y: py, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: !looks && ph < 0.5, alpha: 1, glow: 0, row: 'main', frame: pose,
        }
      }
      react(sprite, action === 'flee' ? 'none' : action, near, t, ph * 6, reach)
      out.push(sprite)
      if (hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, sprite.flip, near.k))
    }
    return out
  }

  if (motion === 'slide') {
    // Sledders and penguins sliding from the peak of the roof down the roofline (or along the line drawn),
    // faster and faster, and off the end into the air; arms up and "Wheee!" for people.
    const n = 1 + Math.round(layer.amount * 5)
    const ratio = ratioOf(style)
    // The peak: the highest point of the roofline.
    let peak = 0
    if (!drawn) {
      let best = Infinity
      for (let k = 0; k <= 48; k++) {
        const y = path.at((L * k) / 48).y
        if (y < best) {
          best = y
          peak = (L * k) / 48
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 6.7 + own)
      const period = (4.5 + ph * 3) / (0.3 + 1.2 * layer.speed)
      const u = (t + (i / n) * period + ph * period * 0.3) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 5.3 + i * 1.9
      const slid = 0.7
      const air = 0.18
      if (q > slid + air) continue
      // Down whichever side of the peak; along the line drawn from its start.
      const right = drawn || peak < L * 0.1 ? true : peak > L * 0.9 ? false : hash(seed) < 0.5
      const s0 = drawn ? 0 : peak
      const dist = right ? L - s0 : s0
      const size = H * path.at(s0).size
      const side = right ? 1 : -1
      // Speeding up all the way down.
      const k = Math.min(1, q / slid)
      const p = path.at(s0 + side * dist * k * k)
      let dx = side * p.dx
      let dy = side * p.dy
      // Sit on the line: up from it, square to it.
      const lift = -dx > 0 ? -1 : 1
      let x = p.x + dy * lift * (size / 2)
      let y = p.y - dx * lift * (size / 2)
      let alpha = smoothstep(0, 0.06, k)
      const flying = q > slid
      if (flying) {
        // Off the end: on in the same direction, falling, fading.
        const a = q - slid
        const speed = (2 * dist) / slid
        const vx = dx * speed * 0.7
        const vy = dy * speed * 0.7 - 0.6
        x += vx * a
        y += vy * a + 14 * a * a
        dx = vx
        dy = vy + 28 * a
        alpha *= 1 - smoothstep(0.3, 1, a / air)
      }
      const { angle, flip } = heading(dx, dy, flying ? 1.1 : 0.9)
      const near = nearAt(x, y, size / 2, people, reach, aspect)
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle, flip, alpha, glow: 0, row: 'main',
        frame: flying || near.k > 0.3 ? 1 : 0,
      }
      react(sprite, action, near, t, ph * 6, reach)
      out.push(sprite)
      if (hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, flip, near.k))
    }
    return out
  }

  if (motion === 'peek') {
    // Ghosts, elves and cats taking turns to come up over the window sills (or the bottom of the house),
    // looking round and ducking down again; eyes opening in the dark windows. People bring up the one
    // in the window nearest them, which turns to watch them (Hide or Run away: it ducks out of sight).
    const stops = path.stops
    const S = stops.length
    const count = Math.min(S, 1 + Math.round(layer.amount * 7))
    const ratio = ratioOf(style)
    const eyes = hasRow(style, 'pupil')
    const period = (10 + hash(own) * 4) / (0.3 + 1.4 * layer.speed)
    const cycle = Math.floor(t / period)
    const q = t / period - cycle
    // People are on the ground below the windows: how far along matters for whether it comes up.
    const along = people.map((v) => ({ ...v, y: 0 }))
    for (let j = 0; j < S; j++) {
      const stop = stops[j]
      const size = H * stop.size
      // Which of them is at this window this time round, if any.
      const who = (((j - cycle * count) % S) + S) % S
      const ph = hash(who * 3.3 + own + 1)
      const start = 0.04 + 0.32 * ph
      let up = who < count && action !== 'appear' ? smoothstep(start, start + 0.08, q) * (1 - smoothstep(start + 0.5, start + 0.58, q)) : 0
      const near = nearAt(stop.x, 0, size / 2, along, reach, aspect)
      if (action === 'hide' || action === 'flee') up *= 1 - smoothstep(0.2, 0.6, near.k)
      else if (action !== 'none') up = Math.max(up, smoothstep(0.15, 0.5, near.k))
      if (up < 0.01) continue
      const r = hash(Math.floor(t / 1.4 + ph * 5) * 1.7 + j)
      const side = -near.ax * near.dist
      const frame = near.k > 0.08 ? (r > 0.9 ? 3 : side < -size * 0.3 ? 0 : side > size * 0.3 ? 2 : 1) : r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.86 ? 2 : 3
      if (eyes) {
        // A pair of eyes opening in the middle of the window, the pupils following whoever is nearest.
        const sprite: Sprite = {
          x: stop.x, y: stop.y - size * 0.7, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: false,
          alpha: smoothstep(0, 0.6, up), glow: 0.3 * up, row: 'main', frame: frame === 3 ? 3 : 0,
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (frame !== 3) {
          const seen = nearAt(sprite.x, sprite.y, size / 2, people, reach, aspect)
          const lx = seen.k > 0.05 ? -seen.ax : Math.sin(t * 0.6 + ph * 6)
          const ly = seen.k > 0.05 ? -seen.ay : 0.4 * Math.sin(t * 0.9 + ph * 3)
          const u = sprite.hh * 2 / 110
          for (const d of [-1, 1]) {
            out.push({
              x: sprite.x + d * 50 * u + lx * 17 * u, y: sprite.y + ly * 9 * u, hw: 23 * u, hh: 23 * u, angle: 0, flip: false,
              alpha: sprite.alpha, glow: 0, row: 'pupil', frame: 0,
            })
          }
        }
        continue
      }
      // Rising from behind the sill: only the part above it shows.
      const crop = smoothstep(0, 1, up)
      const sprite: Sprite = {
        x: stop.x, y: stop.y + size * 0.04 - (size * crop) / 2, hw: (size * ratio) / 2, hh: (size * crop) / 2, angle: 0,
        flip: false, alpha: smoothstep(0, 0.15, up), glow: 0, row: 'main', frame, crop,
      }
      react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
      out.push(sprite)
      if (crop > 0.85 && near.k > 0.2 && hasRow(style, 'bubble')) out.push(bubble(sprite, size, false, near.k))
    }
    return out
  }

  if (motion === 'throw') {
    // Kids along the bottom of the house winding up and throwing snowballs (or water balloons) in an arc:
    // at the house, splatting on it, or at whoever comes near.
    const n = 1 + Math.round(layer.amount * 4)
    const ratio = ratioOf(style)
    const flight = 0.9
    const linger = 0.8
    const aims = action !== 'none' && action !== 'hide'
    const x0 = path.at(0).x
    const x1 = path.at(L).x
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 7.3 + own)
      const p = path.at(L * ((i + 0.5) / n) + (ph - 0.5) * (L / n) * 0.5)
      const size = H * p.size * (0.9 + 0.2 * hash(i * 2.9))
      const x = p.x + Math.sin(t * 0.25 + ph * 6) * size * 0.25
      const y = p.y - size / 2
      const period = (3 + ph * 1.5) / (0.4 + 1.2 * layer.speed)
      const u = (t + ph * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const near = nearAt(x, y, size * 2, people, reach, aspect)
      const person = aims && near.k > 0.05
      // Where this throw (or the last one, still in the air) goes.
      const launch = 0.62
      const thrown = q >= launch ? cycle : cycle - 1
      const age = (q >= launch ? q - launch : q + 1 - launch) * period
      const seed = thrown * 7.3 + i * 3.1 + own
      const tx = person ? x - near.ax * near.dist : Math.max(x0, Math.min(x1, x + (hash(seed) - 0.5) * 0.7))
      const ty = person ? y - near.ay * near.dist : Math.max(0.06, p.y - (0.2 + 0.4 * hash(seed + 1)))
      const flip = tx < x
      const frame = q < 0.45 ? 0 : q < 0.6 ? 1 : q < 0.72 ? 2 : q < 0.86 ? 3 : 0
      const kid: Sprite = { x, y, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip, alpha: 1, glow: 0, row: 'main', frame }
      react(kid, action === 'light' || action === 'grow' || action === 'jump' || action === 'dance' || action === 'hide' || action === 'appear' ? action : 'none', near, t, ph * 6, reach)
      out.push(kid)
      if (kid.alpha < 0.05) continue
      const hx = x + (flip ? -1 : 1) * size * 0.2
      const hy = y - size * 0.4
      if (age < flight) {
        const k = age / flight
        const arc = 0.1 + 0.35 * Math.abs(tx - hx)
        const bs = size * 0.1
        out.push({
          x: hx + (tx - hx) * k, y: hy + (ty - hy) * k - arc * 4 * k * (1 - k), hw: bs, hh: bs * (52 / 48), angle: age * 9, flip: false,
          alpha: kid.alpha, glow: 0, row: 'ball', frame: 0,
        })
      } else if (age < flight + linger) {
        // It bursts where it lands, and fades.
        const k = (age - flight) / linger
        const sw = size * 0.32 * (1 + 0.3 * k)
        out.push({
          x: tx, y: ty, hw: sw, hh: sw * 0.62, angle: 0, flip: false,
          alpha: kid.alpha * (1 - smoothstep(0.4, 1, k)), glow: 0, row: 'splat', frame: 0,
        })
      }
    }
    return out
  }

  // Shooting stars: each streaks across now and then, from a spot of its own.
  const n = 1 + Math.round(layer.amount * 5)
  const sh = H
  const sw = sh * (512 / 96)
  for (let i = 0; i < n; i++) {
    const period = (3 + hash(i * 3.1) * 5) / (0.4 + 1.2 * layer.speed)
    const u = (t + hash(i * 7.7) * period) / period
    const cycle = Math.floor(u)
    const w = 0.35
    const q = (u - cycle) / w
    if (q > 1) continue
    let x: number
    let y: number
    let dx: number
    let dy: number
    if (drawn) {
      const p = path.at(q * L)
      ;({ x, y, dx, dy } = p)
    } else {
      const seed = cycle * 13.1 + i * 3.7
      const left = hash(seed) < 0.5
      const a = 0.25 + hash(seed + 1) * 0.35
      const length = 0.35 + hash(seed + 2) * 0.4
      dx = (left ? -1 : 1) * Math.cos(a)
      dy = Math.sin(a)
      const x0 = hash(seed + 3) * aspect
      const y0 = 0.04 + hash(seed + 4) * 0.28
      x = x0 + dx * length * q
      y = y0 + dy * length * q
    }
    const { angle, flip } = heading(dx, dy, Math.PI)
    const alpha = Math.sin(Math.PI * Math.min(1, q))
    const star: Sprite = {
      // The head is at the front of the picture.
      x: x - dx * sw * 0.42,
      y: y - dy * sw * 0.42,
      hw: sw / 2, hh: sh / 2, angle, flip, alpha, glow: 0, row: 'main', frame: 0,
    }
    react(star, action, nearAt(x, y, sh, people, reach, aspect), t, i, reach)
    out.push(star)
  }
  return out
}

// -- drawing ----------------------------------------------------------------------------------

const MAX_ATLAS = 4096
const BATCH = 64

const VERTEX = `#version 300 es
precision highp float;
uniform vec4 uA[${BATCH}];
uniform vec4 uB[${BATCH}];
uniform vec4 uC[${BATCH}];
uniform vec4 uRect;
uniform float uAspect;
out vec2 vUv;
flat out float vAlpha;
flat out float vGlow;
void main() {
  int id = gl_VertexID / 6;
  int v = gl_VertexID - id * 6;
  vec2 corner = v == 0 ? vec2(-1.0, -1.0) : (v == 1 || v == 4) ? vec2(1.0, -1.0) : (v == 2 || v == 3) ? vec2(-1.0, 1.0) : vec2(1.0, 1.0);
  vec4 a = uA[id];
  vec4 b = uB[id];
  vec4 c = uC[id];
  vec2 l = corner * a.zw;
  float ca = cos(b.x);
  float sa = sin(b.x);
  vec2 p = a.xy + vec2(ca * l.x - sa * l.y, sa * l.x + ca * l.y);
  vec2 uv = (vec2(p.x / uAspect, p.y) - uRect.xy) / uRect.zw;
  gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  vec2 t = corner * 0.5 + 0.5;
  if (b.y < 0.0) t.x = 1.0 - t.x;
  vUv = c.xy + t * c.zw;
  vAlpha = b.z;
  vGlow = b.w;
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
flat in float vAlpha;
flat in float vGlow;
uniform sampler2D uAtlas;
uniform vec3 uGlowColor;
out vec4 outColor;
void main() {
  vec4 c = texture(uAtlas, vUv);
  c.rgb = c.rgb * (1.0 + 0.6 * vGlow) + uGlowColor * c.a * 0.35 * vGlow;
  outColor = c * clamp(vAlpha, 0.0, 1.0);
}`

interface Cell {
  u: number
  v: number
  du: number
  dv: number
}

interface Atlas {
  key: string
  tex: WebGLTexture
  cells: Map<string, Cell[]>
}

interface LayerMemory {
  atlas: Atlas | null
  pathKey: string
  path: MoverPath | null
  drawn: boolean
  scared: number[]
  seenAt: number
}

/** Paints every frame of every picture a style needs into one canvas. */
export function paintAtlas(rows: SpriteRow[], scale: number, colors: { color: string; color2: string }) {
  const pad = 2
  let width = 0
  let height = 0
  const layout = rows.map((row) => {
    const cw = Math.max(4, Math.ceil(row.w * scale))
    const ch = Math.max(4, Math.ceil(row.h * scale))
    const cols = Math.max(1, Math.min(row.frames, Math.floor(MAX_ATLAS / (cw + pad))))
    const lines = Math.ceil(row.frames / cols)
    const y = height
    height += lines * (ch + pad)
    width = Math.max(width, cols * (cw + pad))
    return { row, cw, ch, cols, y }
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const cells = new Map<string, Cell[]>()
  for (const { row, cw, ch, cols, y } of layout) {
    const list: Cell[] = []
    for (let f = 0; f < row.frames; f++) {
      const x0 = (f % cols) * (cw + pad) + 1
      const y0 = y + Math.floor(f / cols) * (ch + pad) + 1
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, y0, cw, ch)
      ctx.clip()
      ctx.translate(x0, y0)
      ctx.scale(cw / row.w, ch / row.h)
      row.paint(ctx, f, row.frames, colors)
      ctx.restore()
      list.push({ u: x0 / width, v: y0 / height, du: cw / width, dv: ch / height })
    }
    cells.set(row.id, list)
  }
  return { canvas, cells }
}

export interface MoverDraw {
  layer: SceneLayer
  rect: SourceRect
  canvasWidth: number
  canvasHeight: number
  /** Scene buffer height in pixels, for how sharp to paint the pictures. */
  h: number
  surfaces: Surface[]
  surfacesKey: string
  people: PersonSpot[]
  strength: number
  time: number
  dt: number
  detail: number
  blend: (mode: LayerBlend) => void
}

export class MoverDrawer {
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private memory = new Map<string, LayerMemory>()
  private a = new Float32Array(BATCH * 4)
  private b = new Float32Array(BATCH * 4)
  private c = new Float32Array(BATCH * 4)

  constructor(private gl: WebGL2RenderingContext) {
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Mover shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    this.program = gl.createProgram()!
    for (const shader of [compile(gl.VERTEX_SHADER, VERTEX), compile(gl.FRAGMENT_SHADER, FRAGMENT)]) {
      gl.attachShader(this.program, shader)
      gl.deleteShader(shader)
    }
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Mover shader failed to link: ${gl.getProgramInfoLog(this.program)}`)
    }
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    return this.uniforms.get(name)!
  }

  draw(key: string, d: MoverDraw) {
    const gl = this.gl
    const { layer } = d
    const aspect = d.canvasWidth / Math.max(1, d.canvasHeight)
    const style = moverStyle(layer.style)
    let mem = this.memory.get(key)
    if (!mem) {
      mem = { atlas: null, pathKey: '', path: null, drawn: false, scared: [], seenAt: 0 }
      this.memory.set(key, mem)
    }
    mem.seenAt = performance.now()
    const pathKey = [style, layer.size, JSON.stringify(layer.pins ?? null), d.surfacesKey, aspect.toFixed(4)].join('|')
    if (pathKey !== mem.pathKey) {
      const { points, drawn } = moverPathPoints(layer, d.surfaces, aspect)
      mem.path = new MoverPath(points)
      mem.drawn = drawn
      mem.pathKey = pathKey
    }
    const frame: MoverFrame = {
      layer, path: mem.path!, drawn: mem.drawn, aspect, people: d.people, time: d.time, dt: d.dt, scared: mem.scared,
    }
    const sprites = moverSprites(frame)
    mem.scared = frame.scared
    // Only the ones on this output.
    const r = d.rect
    const shown = sprites.filter((s) => {
      if (s.alpha <= 0.002) return false
      const e = Math.max(s.hw, s.hh) * 1.42
      return !(s.x / aspect + e / aspect < r.x || (s.x - e) / aspect > r.x + r.w || s.y + e < r.y || s.y - e > r.y + r.h)
    })
    if (!shown.length) return

    // Paint at about the size they show, in steps, so small changes do not repaint.
    const rows = SPRITE_ROWS[style]
    const pxHigh = (moverHeight(layer) / r.h) * d.h * d.detail
    const scale = Math.min(1, Math.max(0.15, Math.ceil(((pxHigh * 1.3) / rows[0].h) * 8) / 8))
    const atlasKey = [style, layer.color, layer.color2, scale].join('|')
    if (mem.atlas?.key !== atlasKey) {
      const { canvas, cells } = paintAtlas(rows, scale, { color: layer.color, color2: layer.color2 })
      const tex = mem.atlas?.tex ?? gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      mem.atlas = { key: atlasKey, tex, cells }
    }
    const cells = mem.atlas.cells

    gl.useProgram(this.program)
    gl.uniform4f(this.u('uRect'), r.x, r.y, r.w, r.h)
    gl.uniform1f(this.u('uAspect'), aspect)
    const n = parseInt(layer.color2.slice(1), 16)
    gl.uniform3f(this.u('uGlowColor'), ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mem.atlas.tex)
    gl.uniform1i(this.u('uAtlas'), 0)
    d.blend(layer.blend)
    const strength = Math.min(1, d.strength)
    for (let start = 0; start < shown.length; start += BATCH) {
      const batch = shown.slice(start, start + BATCH)
      batch.forEach((s, i) => {
        const list = cells.get(s.row) ?? cells.get('main')!
        const cell = list[((s.frame % list.length) + list.length) % list.length]
        this.a.set([s.x, s.y, s.hw, s.hh], i * 4)
        this.b.set([s.angle, s.flip ? -1 : 1, s.alpha * strength, s.glow], i * 4)
        this.c.set([cell.u, cell.v, cell.du, cell.dv * (s.crop ?? 1)], i * 4)
      })
      gl.uniform4fv(this.u('uA'), this.a)
      gl.uniform4fv(this.u('uB'), this.b)
      gl.uniform4fv(this.u('uC'), this.c)
      gl.drawArrays(gl.TRIANGLES, 0, batch.length * 6)
    }
  }

  /** Give back the pictures of layers not drawn for a while. */
  forget(used: Set<string>) {
    const now = performance.now()
    for (const [key, mem] of this.memory) {
      if (!used.has(key) && now - mem.seenAt > 5000) {
        if (mem.atlas) this.gl.deleteTexture(mem.atlas.tex)
        this.memory.delete(key)
      }
    }
  }

  dispose() {
    for (const mem of this.memory.values()) if (mem.atlas) this.gl.deleteTexture(mem.atlas.tex)
    this.memory.clear()
    this.gl.deleteProgram(this.program)
  }
}
