/**
 * Putting the remote on a phone's Home Screen.
 *
 * Safari reads these tags when someone taps Share → Add to Home Screen: the
 * icon and name for the Home Screen, and that it opens full screen with no
 * Safari bars. They are added only on /remote, so adding the main app to a
 * Home Screen does not turn it into the remote.
 */

const TAGS: Array<[string, Record<string, string>]> = [
  ['link', { rel: 'manifest', href: '/remote-manifest.json' }],
  ['link', { rel: 'apple-touch-icon', href: '/remote-icon-180.png' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-title', content: 'Show Remote' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
]

export function addHomeScreenTags() {
  document.title = 'Show Remote'
  for (const [tag, attributes] of TAGS) {
    const key = attributes.rel ? `${tag}[rel="${attributes.rel}"]` : `${tag}[name="${attributes.name}"]`
    if (document.head.querySelector(key)) continue
    const element = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
    document.head.appendChild(element)
  }
}

/** Opened from the Home Screen rather than in the browser. */
export function onHomeScreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export type Phone = 'iphone' | 'android' | 'other'

export function phoneKind(): Phone {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}
