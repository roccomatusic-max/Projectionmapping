/**
 * Every style's pictures in one place: the first ones (sprites.ts) and the
 * holiday ones added since, a file for each season, kept apart so no one
 * file grows past what an editor opens comfortably.
 */

import { AUTUMN_ROWS } from './autumnSprites'
import { CELEBRATION_ROWS } from './celebrationSprites'
import { CHRISTMAS_ROWS } from './christmasSprites'
import { FAITH_ROWS } from './faithSprites'
import { FAMILY_ROWS } from './familySprites'
import { HALLOWEEN_ROWS } from './halloweenSprites'
import { HARVEST_ROWS } from './harvestSprites'
import { HANUKKAH_KWANZAA_ROWS } from './hanukkahKwanzaaSprites'
import { LATE_WINTER_ROWS } from './lateWinterSprites'
import { SPRING_ROWS } from './springSprites'
import { MAY_JUNE_ROWS } from './mayJuneSprites'
import { SUMMER_ROWS } from './summerSprites'
import { HALLOWEEN_EXTRA_ROWS } from './halloweenExtraSprites'
import { CHRISTMAS_EXTRA_ROWS } from './christmasExtraSprites'
import { NEW_YEAR_ROWS } from './newYearSprites'
import { SCHOOL_GAME_ROWS } from './schoolGameSprites'
import { SPRITE_ROWS as FIRST_ROWS, type SpriteRow } from './sprites'
import { THANKSGIVING_ROWS } from './thanksgivingSprites'
import { WINTERTIME_ROWS } from './wintertimeSprites'

export type { SpriteColors, SpriteRow } from './sprites'

export const SPRITE_ROWS: Record<string, SpriteRow[]> = {
  ...FIRST_ROWS, ...HALLOWEEN_ROWS, ...AUTUMN_ROWS, ...CHRISTMAS_ROWS, ...THANKSGIVING_ROWS,
  ...HANUKKAH_KWANZAA_ROWS, ...NEW_YEAR_ROWS, ...LATE_WINTER_ROWS, ...SPRING_ROWS, ...MAY_JUNE_ROWS, ...SUMMER_ROWS, ...HALLOWEEN_EXTRA_ROWS, ...CHRISTMAS_EXTRA_ROWS,
  ...CELEBRATION_ROWS, ...SCHOOL_GAME_ROWS, ...FAITH_ROWS, ...FAMILY_ROWS, ...HARVEST_ROWS, ...WINTERTIME_ROWS,
}
