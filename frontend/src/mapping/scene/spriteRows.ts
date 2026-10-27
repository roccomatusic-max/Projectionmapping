/**
 * Every style's pictures in one place: the first ones (sprites.ts) and the
 * holiday ones added since, a file for each season, kept apart so no one
 * file grows past what an editor opens comfortably.
 */

import { AUTUMN_ROWS } from './autumnSprites'
import { CHRISTMAS_ROWS } from './christmasSprites'
import { HALLOWEEN_ROWS } from './halloweenSprites'
import { HANUKKAH_KWANZAA_ROWS } from './hanukkahKwanzaaSprites'
import { NEW_YEAR_ROWS } from './newYearSprites'
import { SPRITE_ROWS as FIRST_ROWS, type SpriteRow } from './sprites'
import { THANKSGIVING_ROWS } from './thanksgivingSprites'

export type { SpriteColors, SpriteRow } from './sprites'

export const SPRITE_ROWS: Record<string, SpriteRow[]> = {
  ...FIRST_ROWS, ...HALLOWEEN_ROWS, ...AUTUMN_ROWS, ...CHRISTMAS_ROWS, ...THANKSGIVING_ROWS,
  ...HANUKKAH_KWANZAA_ROWS, ...NEW_YEAR_ROWS,
}
