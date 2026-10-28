/**
 * Where Santa is: a built-in Christmas Eve route, worked out from the clock
 * alone so the tracker needs no internet. Like the well-known trackers, he
 * leaves the North Pole on the morning of 24 December (UTC), reaches each
 * place close to its local midnight, travelling west with the night from
 * the islands of Kiribati to American Samoa, and is home on Christmas Day.
 *
 * Every stop lists its UTC offset in December (summer time south of the
 * equator); within one offset he goes east to west.
 */

export interface Stop {
  name: string
  lat: number
  lon: number
  /** Hours ahead of UTC in late December. */
  offset: number
}

// name, latitude, longitude, UTC offset in December
const STOPS: Array<[string, number, number, number]> = [
  ['Kiritimati, Kiribati', 1.87, -157.4, 14],
  ['Nukuʻalofa, Tonga', -21.14, -175.2, 13],
  ['Apia, Samoa', -13.83, -171.76, 13],
  ['Auckland, New Zealand', -36.85, 174.76, 13],
  ['Wellington, New Zealand', -41.29, 174.78, 13],
  ['Suva, Fiji', -18.14, 178.44, 12],
  ['Nouméa, New Caledonia', -22.27, 166.46, 11],
  ['Sydney, Australia', -33.87, 151.21, 11],
  ['Melbourne, Australia', -37.81, 144.96, 11],
  ['Adelaide, Australia', -34.93, 138.6, 10.5],
  ['Brisbane, Australia', -27.47, 153.03, 10],
  ['Port Moresby, Papua New Guinea', -9.44, 147.18, 10],
  ['Guam', 13.44, 144.79, 10],
  ['Darwin, Australia', -12.46, 130.84, 9.5],
  ['Tokyo, Japan', 35.68, 139.69, 9],
  ['Seoul, South Korea', 37.57, 126.98, 9],
  ['Perth, Australia', -31.95, 115.86, 8],
  ['Manila, Philippines', 14.6, 120.98, 8],
  ['Taipei, Taiwan', 25.03, 121.57, 8],
  ['Hong Kong', 22.32, 114.17, 8],
  ['Beijing, China', 39.9, 116.4, 8],
  ['Singapore', 1.35, 103.82, 8],
  ['Hanoi, Vietnam', 21.03, 105.85, 7],
  ['Bangkok, Thailand', 13.75, 100.5, 7],
  ['Jakarta, Indonesia', -6.2, 106.85, 7],
  ['Yangon, Myanmar', 16.87, 96.2, 6.5],
  ['Dhaka, Bangladesh', 23.81, 90.41, 6],
  ['Kathmandu, Nepal', 27.72, 85.32, 5.75],
  ['New Delhi, India', 28.61, 77.21, 5.5],
  ['Mumbai, India', 19.08, 72.88, 5.5],
  ['Karachi, Pakistan', 24.86, 67.0, 5],
  ['Dubai, United Arab Emirates', 25.2, 55.27, 4],
  ['Tehran, Iran', 35.69, 51.39, 3.5],
  ['Moscow, Russia', 55.75, 37.62, 3],
  ['Nairobi, Kenya', -1.29, 36.82, 3],
  ['Istanbul, Türkiye', 41.01, 28.98, 3],
  ['Cairo, Egypt', 30.04, 31.24, 2],
  ['Johannesburg, South Africa', -26.2, 28.05, 2],
  ['Helsinki, Finland', 60.17, 24.94, 2],
  ['Athens, Greece', 37.98, 23.73, 2],
  ['Stockholm, Sweden', 59.33, 18.07, 1],
  ['Berlin, Germany', 52.52, 13.4, 1],
  ['Rome, Italy', 41.9, 12.5, 1],
  ['Oslo, Norway', 59.91, 10.75, 1],
  ['Lagos, Nigeria', 6.52, 3.38, 1],
  ['Paris, France', 48.86, 2.35, 1],
  ['Madrid, Spain', 40.42, -3.7, 1],
  ['London, United Kingdom', 51.51, -0.13, 0],
  ['Dublin, Ireland', 53.35, -6.26, 0],
  ['Lisbon, Portugal', 38.72, -9.14, 0],
  ['Reykjavík, Iceland', 64.15, -21.94, 0],
  ['Ponta Delgada, Azores', 37.74, -25.67, -1],
  ['Praia, Cape Verde', 14.93, -23.51, -1],
  ['Fernando de Noronha, Brazil', -3.85, -32.42, -2],
  ['Rio de Janeiro, Brazil', -22.91, -43.17, -3],
  ['São Paulo, Brazil', -23.55, -46.63, -3],
  ['Buenos Aires, Argentina', -34.6, -58.38, -3],
  ['Santiago, Chile', -33.45, -70.67, -3],
  ['St. John’s, Newfoundland', 47.56, -52.71, -3.5],
  ['Halifax, Canada', 44.65, -63.57, -4],
  ['San Juan, Puerto Rico', 18.47, -66.1, -4],
  ['Caracas, Venezuela', 10.48, -66.9, -4],
  ['Boston, Massachusetts', 42.36, -71.06, -5],
  ['New York City', 40.71, -74.01, -5],
  ['Philadelphia, Pennsylvania', 39.95, -75.17, -5],
  ['Washington, D.C.', 38.91, -77.04, -5],
  ['Miami, Florida', 25.76, -80.19, -5],
  ['Toronto, Canada', 43.65, -79.38, -5],
  ['Atlanta, Georgia', 33.75, -84.39, -5],
  ['Bogotá, Colombia', 4.71, -74.07, -5],
  ['Lima, Peru', -12.05, -77.04, -5],
  ['Chicago, Illinois', 41.88, -87.63, -6],
  ['Dallas, Texas', 32.78, -96.8, -6],
  ['Mexico City, Mexico', 19.43, -99.13, -6],
  ['Denver, Colorado', 39.74, -104.99, -7],
  ['Phoenix, Arizona', 33.45, -112.07, -7],
  ['Seattle, Washington', 47.61, -122.33, -8],
  ['San Francisco, California', 37.77, -122.42, -8],
  ['Los Angeles, California', 34.05, -118.24, -8],
  ['Anchorage, Alaska', 61.22, -149.9, -9],
  ['Honolulu, Hawaii', 21.31, -157.86, -10],
  ['Papeete, Tahiti', -17.53, -149.57, -10],
  ['Niue', -19.05, -169.87, -11],
  ['Pago Pago, American Samoa', -14.28, -170.7, -11],
]

export const NORTH_POLE = { name: 'the North Pole', lat: 84, lon: 20 }

const HOUR = 3_600_000
/** Everyone's presents, spread over the night. */
export const ALL_PRESENTS = 7_800_000_000

export interface TimedStop extends Stop {
  /** When Santa is there, epoch milliseconds. */
  at: number
}

/** The route for the Christmas of a year, in the order he flies it. */
export function santaRoute(year: number): TimedStop[] {
  // Each time zone is visited in the hour around its midnight, sweeping down
  // one zone and up the next (as the real tracker draws it) rather than
  // zigzagging between cities in the same zone.
  const zones = [...new Set(STOPS.map((s) => s[3]))].sort((a, b) => b - a)
  return zones.flatMap((offset, z) => {
    const midnight = Date.UTC(year, 11, 25) - offset * HOUR
    const here = STOPS.filter((s) => s[3] === offset).sort((a, b) => (z % 2 ? a[1] - b[1] : b[1] - a[1]))
    return here.map(([name, lat, lon], k) => ({
      name, lat, lon, offset,
      at: midnight + (-0.45 + (0.9 * (k + 0.5)) / here.length) * HOUR,
    }))
  })
}

export type SantaPhase = 'waiting' | 'flying' | 'home'

export interface SantaNow {
  phase: SantaPhase
  /** Where he is (interpolated between stops while flying). */
  lat: number
  lon: number
  /** The place he is at or just left, and the next one. */
  last: TimedStop | null
  next: TimedStop | null
  /** True while he is at a stop delivering, rather than between them. */
  delivering: boolean
  presents: number
  /** When he takes off and lands back home this Christmas. */
  takeoff: number
  landing: number
  /** When he reaches this computer's own time zone (its local midnight). */
  here: number
  route: TimedStop[]
  /** Stops already visited. */
  visited: number
}

/** The Christmas he is getting ready for (or flying) at nowMs: this year's, until Boxing Day. */
function seasonYear(nowMs: number): number {
  const d = new Date(nowMs)
  const y = d.getFullYear()
  return d.getMonth() === 11 && d.getDate() >= 26 ? y + 1 : y
}

export function santaNow(nowMs: number): SantaNow {
  let year = seasonYear(nowMs)
  let route = santaRoute(year)
  let takeoff = route[0].at - 0.5 * HOUR
  let landing = route[route.length - 1].at + 0.75 * HOUR
  // Past Boxing Day UTC but before the 26th locally: next year's then.
  if (nowMs > landing + 24 * HOUR) {
    year += 1
    route = santaRoute(year)
    takeoff = route[0].at - 0.5 * HOUR
    landing = route[route.length - 1].at + 0.75 * HOUR
  }
  const here = new Date(year, 11, 25, 0, 0, 0).getTime()
  const base = { takeoff, landing, here, route }
  if (nowMs < takeoff) {
    return { ...base, phase: 'waiting', lat: NORTH_POLE.lat, lon: NORTH_POLE.lon, last: null, next: route[0], delivering: false, presents: 0, visited: 0 }
  }
  if (nowMs >= landing) {
    return {
      ...base, phase: 'home', lat: NORTH_POLE.lat, lon: NORTH_POLE.lon, last: route[route.length - 1], next: null,
      delivering: false, presents: ALL_PRESENTS, visited: route.length,
    }
  }
  const presents = Math.round(
    ALL_PRESENTS * Math.min(1, Math.max(0, (nowMs - route[0].at) / (route[route.length - 1].at - route[0].at))),
  )
  // Between takeoff and the first stop, or the last stop and home.
  const pole = { name: NORTH_POLE.name, lat: NORTH_POLE.lat, lon: NORTH_POLE.lon, offset: 0 }
  const legs: Array<[TimedStop, TimedStop]> = [
    [{ ...pole, at: takeoff }, route[0]],
    ...route.slice(1).map((s, i) => [route[i], s] as [TimedStop, TimedStop]),
    [route[route.length - 1], { ...pole, at: landing }],
  ]
  const legIndex = legs.findIndex(([, b]) => nowMs < b.at)
  const [a, b] = legs[Math.max(0, legIndex)]
  // He stays a little while at each stop, then flies to the next.
  const span = Math.max(1, b.at - a.at)
  const stay = Math.min(span * 0.35, 4 * 60_000)
  const into = nowMs - a.at
  const delivering = legIndex > 0 && into < stay
  const t = delivering ? 0 : Math.min(1, (into - (legIndex > 0 ? stay : 0)) / Math.max(1, span - (legIndex > 0 ? stay : 0)))
  const e = t * t * (3 - 2 * t)
  let dLon = b.lon - a.lon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  let lon = a.lon + dLon * e
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360
  const isPole = (s: TimedStop) => s.name === NORTH_POLE.name
  return {
    ...base,
    phase: 'flying',
    lat: a.lat + (b.lat - a.lat) * e,
    lon,
    last: isPole(a) ? null : a,
    next: isPole(b) ? null : b,
    delivering,
    presents,
    visited: Math.max(0, legIndex),
  }
}

/** "2 h 14 min", "14 min", "45 s": how long until a moment. */
export function untilWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${s} s`
}

/** The lines the tracker shows at nowMs. */
export function santaWords(now: SantaNow, nowMs: number): { headline: string; place: string; detail: string; here: string } {
  const town = (s: TimedStop | null) => (s ? s.name : NORTH_POLE.name)
  if (now.phase === 'waiting') {
    const left = now.takeoff - nowMs
    return {
      headline: 'Santa is at the North Pole',
      place: left > 86_400_000 ? 'Elves are busy in the workshop' : 'Loading the sleigh!',
      detail: `Takes off in ${untilWords(left)}`,
      here: `Reaches our house in ${untilWords(now.here - nowMs)}`,
    }
  }
  if (now.phase === 'home') {
    return {
      headline: 'Santa is back home',
      place: 'Merry Christmas!',
      detail: 'Every present delivered',
      here: 'He has been to our house',
    }
  }
  const here =
    nowMs < now.here - 20 * 60_000
      ? `Reaches our house in ${untilWords(now.here - nowMs)}`
      : nowMs < now.here + 30 * 60_000
        ? 'Santa is nearly here! Time for bed!'
        : 'He has been to our house!'
  return {
    headline: now.delivering ? 'Santa is delivering in' : now.next ? 'Santa is flying to' : 'Santa is flying home to',
    place: now.delivering ? town(now.last) : town(now.next),
    detail: now.delivering && now.next ? `Next stop: ${now.next.name}` : now.last ? `Just left ${now.last.name}` : 'Just took off from the North Pole',
    here,
  }
}
