/**
 * Elements carried by a cue (on that cue only) or by a show (on every cue),
 * as scenes the engine can draw. They are kept apart from the scene library
 * so scene groups and playlists, which change a cue's scenes, leave them be.
 * Their ids are negative, so no saved scene has them, and stay the same
 * while they play, which keeps their people-reactive state from cue to cue.
 */

import type { Cue, MappingScene, SceneLayer, Show } from '../types'

const CUE_IDS = 1_000_000
const SHOW_IDS = 2_000_000

function asScene(id: number, name: string, layers: SceneLayer[]): MappingScene {
  return { id, name, description: '', layers, created_at: '', updated_at: '' }
}

/** The elements on this cue only, or null when it has none. */
export function cueElementsScene(cue: Pick<Cue, 'id' | 'name' | 'elements'>): MappingScene | null {
  const layers = cue.elements ?? []
  return layers.length ? asScene(-(CUE_IDS + cue.id), `${cue.name} elements`, layers) : null
}

/** The elements on every cue of the show, or null when it has none. */
export function everyCueScene(show: Pick<Show, 'id' | 'name' | 'every_cue_elements'>): MappingScene | null {
  const layers = show.every_cue_elements ?? []
  return layers.length ? asScene(-(SHOW_IDS + show.id), `${show.name}: every cue`, layers) : null
}
