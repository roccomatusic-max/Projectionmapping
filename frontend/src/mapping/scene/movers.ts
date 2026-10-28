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
import { CLASS_FIRST_YEAR, CLASS_POSES, CLASS_TOSS, CLASS_YEARS } from './celebrationSprites'
import { MOON_PHASES } from './faithSprites'
import { KITE_POSES, windBand } from './harvestSprites'
import { BOARD_HELLO, BOARD_POSES } from './schoolGameSprites'
import { SPRITE_ROWS, type SpriteRow } from './spriteRows'
import { hanukkahEve, isEid, lastWeekday, lunarNewYear, moonPhase, ramadanDay } from './holidays'
import { weatherFor, weatherLook } from './weather'

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
  'wolves', 'moon', 'pinatas', 'ornaments', 'icicles', 'flags', 'gift-boxes', 'cauldrons', 'glowing-pumpkins',
  'burrow-bunnies', 'helicopter', 'sprinklers', 'snow-globes', 'manta-rays', 'clownfish', 'anglerfish', 'starfish',
  'surfers', 'sailboats', 'snowplow', 'pirate-ship', 'rudolph', 'fountains', 'web-spiders', 'leaf-piles', 'puddles',
  'gnomes', 'cuckoo-clock', 'robins', 'peacocks', 'pot-of-gold', 'easter-eggs', 'teddy-bears', 'diyas',
  'santa-chimney', 'roof-reindeer', 'window-candles', 'disco-ball', 'searchlights', 'ball-drop', 'champagne',
  'firecrackers', 'graduation-caps', 'school-bus', 'tractors', 'deer', 'foxes', 'raccoons', 'witch-crash',
  'rain-clouds', 'hockey-players', 'lighthouse', 'tumbleweeds', 'bigfoot', 'skeleton-dogs', 'sunflowers', 'tulips',
  'bird-feeder', 'beehive', 'wind-chimes', 'campfire', 'kinara', 'fanous', 'hula-dancers', 'mariachi', 'bagpipers',
  'pilgrims', 'cornucopia', 'christmas-tree', 'cows',
  'headless-horseman', 'haunted-tree', 'candy-bowl', 'skeleton-band', 'tesla-coil', 'window-hands', 'window-figures',
  'rocking-chair', 'swamp-monster', 'gargoyles', 'monster-mailbox', 'hanging-skeletons', 'bush-eyes', 'wall-spiders',
  'snakes', 'tentacles', 'fortune-teller', 'dancing-zombies', 'creaky-gate', 'pumpkin-tower', 'catrinas', 'sugar-skulls',
  'ofrenda', 'honor-guard', 'buglers', 'fighter-jets', 'perched-eagles', 'rangoli', 'star-lanterns', 'elephants',
  'nutcracker', 'singing-wreath', 'mistletoe', 'gingerbread-house', 'workshop-elves', 'melting-snowman', 'window-santa',
  'stuck-santa', 'krampus', 'snow-angels', 'yeti', 'north-pole-mailbox', 'bell-ringer', 'cookies-for-santa', 'moose',
  'sugar-plum-fairies', 'nativity', 'ice-fishing-penguins', 'lawn-reindeer', 'blow-up-santa', 'lights-elf', 'horse-sleigh',
  'parade-balloons', 'tuba-players', 'mayflower', 'wishbone', 'geese', 'strutting-tom', 'sign-turkey', 'turkey-trot',
  'latke-chef', 'dreidel-game', 'window-menorah', 'klezmer-band', 'sufganiyot', 'djembe-drummer', 'kwanzaa-dancers',
  'habari-gani', 'unity-cup', 'harvest-basket', 'baby-new-year', 'father-time', 'noisemaker-kids', 'midnight-toast',
  'conga-line', 'polar-plunge', 'rose-float', 'mummers', 'sleepy-reveler', 'zodiac-animal', 'god-of-fortune',
  'festival-drum', 'dumplings', 'gong-xi-kids', 'nian-beast', 'lucky-cat', 'lantern-kid',
  'dreamers-march', 'unity-circle', 'dove-release', 'tree-planters', 'groundhog', 'serenade', 'candy-heart',
  'waltzing-couple', 'pebble-penguins', 'heart-balloon', 'rushmore', 'liberty-bell', 'cherry-tree', 'fife-and-drum',
  'bead-balcony', 'brass-band', 'jester', 'king-cake', 'carnival-mask', 'crawfish', 'irish-dancers',
  'leprechaun-trap', 'harpist', 'egg-hunt', 'bunny-painter', 'lambs', 'egg-roll', 'easter-bonnet', 'litter-pickers',
  'recycle-bins', 'rain-barrel', 'folklorico', 'pinata-party', 'flowers-for-mom', 'breakfast-tray', 'mom-garden',
  'saluting-soldier', 'memorial-flag', 'grill-dad', 'fishing-dock', 'lawn-mower', 'order-reader', 'juneteenth-flag',
  'double-dutch', 'statue-of-liberty', 'hot-dog-contest', 'drum-major', 'picnic-ants', 'sparkler-writers', 'bike-parade',
  'ironworkers', 'cannonball', 'lemonade-stand', 'sandcastle', 'cornhole', 'pumpkin-carver', 'mad-scientist',
  'singing-pumpkins', 'haunted-portrait', 'sarcophagus', 'apple-bobbing', 'grave-digger', 'phantom-organist',
  'werewolf-change', 'lawn-chair-skeleton', 'skeleton-photographer', 'ghost-tea-party', 'witch-spell', 'scaredy-ghost',
  'elf-on-shelf', 'advent-calendar', 'nice-list', 'snowman-builders', 'star-topper', 'light-tangle', 'ugly-sweater',
  'present-puppy', 'reindeer-food', 'present-tower', 'sweater-dog', 'stair-peekers', 'cookie-baker',
  'bounce-house', 'magician', 'balloon-twister', 'party-horns', 'musical-chairs', 'pin-the-tail', 'limbo',
  'sack-race', 'face-painter', 'karaoke', 'dj-booth', 'diploma-walk', 'class-of', 'grad-parade', 'valedictorian',
  'crossing-guard', 'backpack-kid', 'chalkboard-teacher', 'spelling-bee', 'science-volcano', 'referee',
  'cheerleaders', 'stadium-wave', 'field-goal', 'team-mascot', 'snake-can', 'squirting-flower',
  'seder-table', 'afikomen-hunt', 'elijahs-door', 'sea-parting', 'shofar-blower', 'apples-and-honey', 'tashlich',
  'sukkah', 'moon-sighting', 'iftar', 'eid-gifts', 'fanous-kid', 'three-sisters-garden', 'canoe-paddlers', 'story-time',
  'knitting-grandma', 'porch-swing', 'whoopee-cushion', 'touchdown-dance',
  'pie-thief', 'turkey-carver', 'thanks-table', 'leaf-jumper', 'apple-picker', 'hayride', 'cider-press',
  'giant-pumpkin', 'turkey-disguise', 'candy-chute', 'trunk-or-treat', 'costume-parade', 'parade-watchers',
  'kite-flyer', 'snow-shoveler', 'igloo-builder', 'snowflake-catcher', 'ice-sculptor', 'snowshoe-hiker', 'ski-lift',
  'sled-dogs', 'chestnut-roaster', 'tree-lot', 'proposal', 'valentine-mailbox', 'egg-dyeing', 'maple-tapping',
  'diya-lighter', 'mithai-box', 'holi-colors', 'alebrije', 'papel-picado', 'step-team', 'zawadi', 'dragon-dance',
  'tangerine-tree', 'mardi-gras-float', 'rainbow-leprechaun', 'pi-day-pie', 'birdhouse-builder', 'thank-you-letter',
  'lincoln-hat', 'resolution-list', 'tamale-maker', 'haunted-doorbell', 'candy-trader', 'tree-trimmer',
  'secret-admirer', 'egg-spoon-race', 'seed-spitters', 'paul-revere', 'hammock-napper', 'flag-raiser',
] as const
export type MoverStyle = (typeof MOVER_STYLES)[number]

type Motion =
  | 'flyer' | 'flock' | 'walker' | 'train' | 'streak' | 'rocket' | 'rise' | 'fall' | 'dangle' | 'wander'
  | 'popup' | 'bounce' | 'leap' | 'kite' | 'perch' | 'slide' | 'peek' | 'throw' | 'stand' | 'sky'

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
 * mound rather than growing out of it; rock tips a walker to and fro like a boat on the waves, many is
 * how many more standing ones the How many dial adds, and halts stops a walker for people (a school bus
 * with its stop sign out, a deer with its head up) until they have gone.
 */
const STYLE: Record<MoverStyle, {
  motion: Motion; ground: boolean; height: number; trail?: boolean; hop?: boolean; spin?: number; pace?: number
  animate?: boolean; line?: boolean; still?: boolean; steady?: boolean; low?: boolean; under?: boolean
  look?: boolean; shy?: boolean; twirl?: boolean; rises?: boolean; rock?: boolean; many?: number; halts?: boolean
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
  // Sixth batch.
  wolves: { motion: 'perch', ground: false, height: 0.9, look: true },
  // Tonight's moon, crossing the sky with the clock.
  moon: { motion: 'sky', ground: false, height: 1.1 },
  pinatas: { motion: 'dangle', ground: false, height: 0.8, still: true, under: true },
  ornaments: { motion: 'dangle', ground: false, height: 0.45, still: true, animate: true, under: true },
  icicles: { motion: 'dangle', ground: false, height: 0.55, still: true, under: true },
  // Standing on the ground along the bottom of the house, each doing its own thing.
  flags: { motion: 'stand', ground: true, height: 1.2, many: 3 },
  'gift-boxes': { motion: 'popup', ground: true, height: 0.75 },
  cauldrons: { motion: 'stand', ground: true, height: 0.9, many: 2 },
  'glowing-pumpkins': { motion: 'stand', ground: true, height: 0.55, many: 6 },
  'burrow-bunnies': { motion: 'popup', ground: true, height: 0.6, rises: true },
  helicopter: { motion: 'flyer', ground: false, height: 0.6 },
  sprinklers: { motion: 'stand', ground: true, height: 0.45, many: 3 },
  'snow-globes': { motion: 'stand', ground: true, height: 0.9, many: 2 },
  'manta-rays': { motion: 'flyer', ground: false, height: 0.75 },
  clownfish: { motion: 'flock', ground: false, height: 0.22 },
  anglerfish: { motion: 'flyer', ground: false, height: 0.55 },
  starfish: { motion: 'walker', ground: true, height: 0.5, pace: 3 },
  surfers: { motion: 'walker', ground: true, height: 1, pace: 0.5, rock: true },
  sailboats: { motion: 'walker', ground: true, height: 0.95, pace: 1.4, rock: true },
  snowplow: { motion: 'walker', ground: true, height: 0.8, pace: 0.9 },
  'pirate-ship': { motion: 'walker', ground: true, height: 1.2, pace: 1.6, rock: true },
  rudolph: { motion: 'flyer', ground: false, height: 0.7 },
  fountains: { motion: 'stand', ground: true, height: 0.9, many: 4 },
  'web-spiders': { motion: 'dangle', ground: false, height: 0.8, still: true, under: true },
  'leaf-piles': { motion: 'stand', ground: true, height: 0.55, many: 3 },
  puddles: { motion: 'stand', ground: true, height: 0.35, many: 3 },
  gnomes: { motion: 'walker', ground: true, height: 0.6, pace: 1.6, shy: true },
  'cuckoo-clock': { motion: 'stand', ground: true, height: 1.3, many: 0 },
  robins: { motion: 'perch', ground: false, height: 0.55 },
  peacocks: { motion: 'walker', ground: true, height: 0.9, pace: 1.3 },
  'pot-of-gold': { motion: 'stand', ground: true, height: 0.5, many: 1 },
  'easter-eggs': { motion: 'stand', ground: true, height: 0.3, many: 12 },
  'teddy-bears': { motion: 'walker', ground: true, height: 0.7, pace: 1.2 },
  diyas: { motion: 'stand', ground: true, height: 0.32, many: 12 },
  // Seventh batch.
  'santa-chimney': { motion: 'stand', ground: false, height: 0.8, many: 0 },
  'roof-reindeer': { motion: 'perch', ground: false, height: 0.8, look: true },
  'window-candles': { motion: 'peek', ground: false, height: 0.5 },
  'disco-ball': { motion: 'dangle', ground: false, height: 0.5, still: true, animate: true, under: true },
  searchlights: { motion: 'stand', ground: true, height: 0.6, many: 2 },
  'ball-drop': { motion: 'stand', ground: true, height: 1.6, many: 0 },
  champagne: { motion: 'stand', ground: true, height: 0.9, many: 4 },
  firecrackers: { motion: 'dangle', ground: false, height: 1.4, still: true, under: true },
  'graduation-caps': { motion: 'stand', ground: true, height: 0.4, many: 6 },
  'school-bus': { motion: 'walker', ground: true, height: 0.9, pace: 0.8, halts: true },
  tractors: { motion: 'walker', ground: true, height: 0.8, pace: 1.4 },
  deer: { motion: 'walker', ground: true, height: 0.9, pace: 1.1, halts: true },
  foxes: { motion: 'walker', ground: true, height: 0.5, pace: 0.6 },
  raccoons: { motion: 'popup', ground: true, height: 0.6 },
  'witch-crash': { motion: 'flyer', ground: false, height: 0.85 },
  'rain-clouds': { motion: 'flyer', ground: false, height: 1.1 },
  'hockey-players': { motion: 'throw', ground: true, height: 0.9 },
  lighthouse: { motion: 'stand', ground: true, height: 1.4, many: 0 },
  tumbleweeds: { motion: 'bounce', ground: true, height: 0.6, low: true },
  bigfoot: { motion: 'walker', ground: true, height: 1.3, pace: 1.5 },
  'skeleton-dogs': { motion: 'walker', ground: true, height: 0.6, pace: 0.75 },
  sunflowers: { motion: 'stand', ground: true, height: 1, many: 5 },
  tulips: { motion: 'stand', ground: true, height: 0.6, many: 10 },
  'bird-feeder': { motion: 'stand', ground: true, height: 1.4, many: 1 },
  beehive: { motion: 'stand', ground: true, height: 0.6, many: 1 },
  'wind-chimes': { motion: 'dangle', ground: false, height: 0.7, still: true, animate: true, under: true },
  campfire: { motion: 'stand', ground: true, height: 0.6, many: 0 },
  kinara: { motion: 'stand', ground: true, height: 0.6, many: 0 },
  fanous: { motion: 'dangle', ground: false, height: 0.5, still: true, animate: true, under: true },
  'hula-dancers': { motion: 'stand', ground: true, height: 0.9, many: 3 },
  mariachi: { motion: 'stand', ground: true, height: 0.95, many: 3 },
  bagpipers: { motion: 'walker', ground: true, height: 0.95, pace: 1.4 },
  pilgrims: { motion: 'walker', ground: true, height: 0.95, pace: 1.5 },
  cornucopia: { motion: 'stand', ground: true, height: 0.55, many: 0 },
  'christmas-tree': { motion: 'stand', ground: true, height: 1.5, many: 2 },
  cows: { motion: 'walker', ground: true, height: 0.85, pace: 2 },
  // Holidays, Halloween to Diwali.
  'headless-horseman': { motion: 'walker', ground: true, height: 1.2, pace: 0.6 },
  'haunted-tree': { motion: 'stand', ground: true, height: 1.6, many: 1 },
  'candy-bowl': { motion: 'stand', ground: true, height: 1, many: 1 },
  'skeleton-band': { motion: 'stand', ground: true, height: 1, many: 2 },
  'tesla-coil': { motion: 'stand', ground: true, height: 1.3, many: 1 },
  'window-hands': { motion: 'peek', ground: false, height: 0.6 },
  'window-figures': { motion: 'peek', ground: false, height: 0.75 },
  'rocking-chair': { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'swamp-monster': { motion: 'popup', ground: true, height: 1, rises: true },
  gargoyles: { motion: 'perch', ground: false, height: 0.8, look: true },
  'monster-mailbox': { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'hanging-skeletons': { motion: 'dangle', ground: false, height: 1, still: true, animate: true, under: true },
  'bush-eyes': { motion: 'stand', ground: true, height: 0.6, many: 2 },
  'wall-spiders': { motion: 'wander', ground: true, height: 0.55, steady: true },
  snakes: { motion: 'walker', ground: true, height: 0.5, pace: 0.7 },
  tentacles: { motion: 'popup', ground: true, height: 1 },
  'fortune-teller': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'dancing-zombies': { motion: 'stand', ground: true, height: 1, many: 4 },
  'creaky-gate': { motion: 'stand', ground: true, height: 1.5, many: 0 },
  'pumpkin-tower': { motion: 'stand', ground: true, height: 1.4, many: 2 },
  catrinas: { motion: 'stand', ground: true, height: 1, many: 3 },
  'sugar-skulls': { motion: 'stand', ground: true, height: 0.5, many: 6 },
  ofrenda: { motion: 'stand', ground: true, height: 1.4, many: 0 },
  'honor-guard': { motion: 'walker', ground: true, height: 1, pace: 1.4, halts: true },
  buglers: { motion: 'stand', ground: true, height: 1, many: 0 },
  'fighter-jets': { motion: 'flyer', ground: false, height: 0.4 },
  'perched-eagles': { motion: 'perch', ground: false, height: 0.85, look: true },
  rangoli: { motion: 'stand', ground: true, height: 0.7, many: 2 },
  'star-lanterns': { motion: 'dangle', ground: false, height: 0.6, still: true, animate: true, under: true },
  elephants: { motion: 'walker', ground: true, height: 1.1, pace: 1.6 },
  // Christmas and Thanksgiving.
  nutcracker: { motion: 'stand', ground: true, height: 1.4, many: 1 },
  'singing-wreath': { motion: 'dangle', ground: false, height: 0.8, still: true, animate: true, under: true },
  mistletoe: { motion: 'dangle', ground: false, height: 0.55, still: true, animate: true, under: true },
  'gingerbread-house': { motion: 'stand', ground: true, height: 1.3, many: 0 },
  'workshop-elves': { motion: 'stand', ground: true, height: 0.9, many: 2 },
  'melting-snowman': { motion: 'stand', ground: true, height: 1.25, many: 1 },
  'window-santa': { motion: 'peek', ground: false, height: 0.75 },
  'stuck-santa': { motion: 'stand', ground: false, height: 1, many: 0 },
  krampus: { motion: 'walker', ground: true, height: 1.3, pace: 1.3 },
  'snow-angels': { motion: 'stand', ground: true, height: 0.65, many: 2 },
  yeti: { motion: 'walker', ground: true, height: 1.45, pace: 1.5 },
  'north-pole-mailbox': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'bell-ringer': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'cookies-for-santa': { motion: 'stand', ground: true, height: 0.55, many: 0 },
  moose: { motion: 'walker', ground: true, height: 1.3, pace: 1.7 },
  'sugar-plum-fairies': { motion: 'flyer', ground: false, height: 0.5, trail: true },
  nativity: { motion: 'stand', ground: true, height: 1.35, many: 0 },
  'ice-fishing-penguins': { motion: 'stand', ground: true, height: 0.7, many: 2 },
  'lawn-reindeer': { motion: 'stand', ground: true, height: 1, many: 3 },
  'blow-up-santa': { motion: 'stand', ground: true, height: 1.7, many: 1 },
  'lights-elf': { motion: 'stand', ground: true, height: 1.3, many: 0 },
  'horse-sleigh': { motion: 'walker', ground: true, height: 1, pace: 1.8 },
  'parade-balloons': { motion: 'flyer', ground: false, height: 1.1 },
  'tuba-players': { motion: 'walker', ground: true, height: 1, pace: 1.4 },
  mayflower: { motion: 'walker', ground: true, height: 1.4, pace: 2.4, rock: true },
  wishbone: { motion: 'stand', ground: true, height: 0.6, many: 0 },
  geese: { motion: 'flyer', ground: false, height: 0.5 },
  'strutting-tom': { motion: 'stand', ground: true, height: 0.95, many: 1 },
  'sign-turkey': { motion: 'stand', ground: true, height: 1, many: 1 },
  'turkey-trot': { motion: 'walker', ground: true, height: 1, pace: 0.5 },
  'latke-chef': { motion: 'stand', ground: true, height: 1.15, many: 1 },
  'dreidel-game': { motion: 'stand', ground: true, height: 0.8, many: 1 },
  'window-menorah': { motion: 'stand', ground: false, height: 0.7, many: 0 },
  'klezmer-band': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  sufganiyot: { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'djembe-drummer': { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'kwanzaa-dancers': { motion: 'stand', ground: true, height: 1.2, many: 1 },
  'habari-gani': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'unity-cup': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'harvest-basket': { motion: 'walker', ground: true, height: 1.15, pace: 1.3 },
  'baby-new-year': { motion: 'stand', ground: true, height: 0.8, many: 0 },
  'father-time': { motion: 'stand', ground: true, height: 1.4, many: 0 },
  'noisemaker-kids': { motion: 'stand', ground: true, height: 0.9, many: 1 },
  'midnight-toast': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'conga-line': { motion: 'walker', ground: true, height: 1, pace: 1.6 },
  'polar-plunge': { motion: 'stand', ground: true, height: 1, many: 0 },
  'rose-float': { motion: 'walker', ground: true, height: 1.3, pace: 2.4 },
  mummers: { motion: 'walker', ground: true, height: 1.3, pace: 1.3 },
  'sleepy-reveler': { motion: 'stand', ground: true, height: 0.9, many: 0 },
  'zodiac-animal': { motion: 'stand', ground: false, height: 0.9, many: 0 },
  'god-of-fortune': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'festival-drum': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  dumplings: { motion: 'stand', ground: true, height: 0.9, many: 0 },
  'gong-xi-kids': { motion: 'stand', ground: true, height: 0.9, many: 1 },
  'nian-beast': { motion: 'walker', ground: true, height: 1.1, pace: 1.6 },
  'lucky-cat': { motion: 'stand', ground: true, height: 0.8, many: 1 },
  'lantern-kid': { motion: 'walker', ground: true, height: 1, pace: 1.1 },
  'dreamers-march': { motion: 'walker', ground: true, height: 1.2, pace: 1.2 },
  'unity-circle': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'dove-release': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'tree-planters': { motion: 'stand', ground: true, height: 1.2, many: 1 },
  groundhog: { motion: 'stand', ground: true, height: 0.75, many: 0 },
  serenade: { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'candy-heart': { motion: 'stand', ground: true, height: 0.7, many: 2 },
  'waltzing-couple': { motion: 'stand', ground: true, height: 1.2, many: 1 },
  'pebble-penguins': { motion: 'stand', ground: true, height: 0.8, many: 1 },
  'heart-balloon': { motion: 'walker', ground: true, height: 1.1, pace: 0.9 },
  rushmore: { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'liberty-bell': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'cherry-tree': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'fife-and-drum': { motion: 'walker', ground: true, height: 1.15, pace: 1.1 },
  'bead-balcony': { motion: 'stand', ground: false, height: 1.1, many: 0 },
  'brass-band': { motion: 'walker', ground: true, height: 1.2, pace: 1.3 },
  jester: { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'king-cake': { motion: 'stand', ground: true, height: 0.7, many: 0 },
  'carnival-mask': { motion: 'stand', ground: false, height: 0.9, many: 0 },
  crawfish: { motion: 'walker', ground: true, height: 0.5, pace: 0.6 },
  'irish-dancers': { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'leprechaun-trap': { motion: 'stand', ground: true, height: 0.9, many: 0 },
  harpist: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'egg-hunt': { motion: 'stand', ground: true, height: 0.9, many: 1 },
  'bunny-painter': { motion: 'stand', ground: true, height: 1, many: 0 },
  lambs: { motion: 'walker', ground: true, height: 0.6, pace: 0.8 },
  'egg-roll': { motion: 'walker', ground: true, height: 0.85, pace: 0.7 },
  'easter-bonnet': { motion: 'walker', ground: true, height: 1.1, pace: 1 },
  'litter-pickers': { motion: 'walker', ground: true, height: 1.05, pace: 0.8 },
  'recycle-bins': { motion: 'stand', ground: true, height: 0.9, many: 0 },
  'rain-barrel': { motion: 'stand', ground: true, height: 1, many: 0 },
  folklorico: { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'pinata-party': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'flowers-for-mom': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'breakfast-tray': { motion: 'walker', ground: true, height: 1, pace: 0.8 },
  'mom-garden': { motion: 'stand', ground: true, height: 1, many: 0 },
  'saluting-soldier': { motion: 'stand', ground: true, height: 1.2, many: 1 },
  'memorial-flag': { motion: 'stand', ground: true, height: 1.4, many: 0 },
  'grill-dad': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'fishing-dock': { motion: 'stand', ground: true, height: 1, many: 0 },
  'lawn-mower': { motion: 'walker', ground: true, height: 1.05, pace: 0.9 },
  'order-reader': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'juneteenth-flag': { motion: 'walker', ground: true, height: 1.2, pace: 1.1 },
  'double-dutch': { motion: 'stand', ground: true, height: 1, many: 1 },
  'statue-of-liberty': { motion: 'stand', ground: true, height: 1.5, many: 0 },
  'hot-dog-contest': { motion: 'stand', ground: true, height: 0.95, many: 0 },
  'drum-major': { motion: 'walker', ground: true, height: 1.3, pace: 1.2 },
  'picnic-ants': { motion: 'walker', ground: true, height: 0.5, pace: 0.4 },
  'sparkler-writers': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'bike-parade': { motion: 'walker', ground: true, height: 1, pace: 1.8 },
  ironworkers: { motion: 'stand', ground: false, height: 0.95, many: 0 },
  cannonball: { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'lemonade-stand': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  sandcastle: { motion: 'stand', ground: true, height: 0.8, many: 0 },
  cornhole: { motion: 'stand', ground: true, height: 0.9, many: 0 },
  'pumpkin-carver': { motion: 'stand', ground: true, height: 1, many: 0 },
  'mad-scientist': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'singing-pumpkins': { motion: 'stand', ground: true, height: 0.75, many: 1 },
  'haunted-portrait': { motion: 'stand', ground: false, height: 0.8, many: 0 },
  sarcophagus: { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'apple-bobbing': { motion: 'stand', ground: true, height: 0.9, many: 0 },
  'grave-digger': { motion: 'stand', ground: true, height: 1, many: 0 },
  'phantom-organist': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'werewolf-change': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'lawn-chair-skeleton': { motion: 'stand', ground: true, height: 0.9, many: 1 },
  'skeleton-photographer': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'ghost-tea-party': { motion: 'stand', ground: true, height: 0.95, many: 0 },
  'witch-spell': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'scaredy-ghost': { motion: 'stand', ground: true, height: 1, many: 1 },
  'elf-on-shelf': { motion: 'stand', ground: false, height: 0.9, many: 0 },
  'advent-calendar': { motion: 'stand', ground: false, height: 1, many: 0 },
  'nice-list': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'snowman-builders': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'star-topper': { motion: 'stand', ground: true, height: 1.3, many: 0 },
  'light-tangle': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'ugly-sweater': { motion: 'stand', ground: true, height: 1.15, many: 1 },
  'present-puppy': { motion: 'stand', ground: true, height: 1, many: 0 },
  'reindeer-food': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'present-tower': { motion: 'walker', ground: true, height: 1.25, pace: 0.8 },
  'sweater-dog': { motion: 'walker', ground: true, height: 0.6, pace: 0.9 },
  'stair-peekers': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'cookie-baker': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'bounce-house': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  magician: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'balloon-twister': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'party-horns': { motion: 'stand', ground: true, height: 1, many: 1 },
  'musical-chairs': { motion: 'stand', ground: true, height: 0.95, many: 0 },
  'pin-the-tail': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  limbo: { motion: 'stand', ground: true, height: 1, many: 0 },
  'sack-race': { motion: 'walker', ground: true, height: 0.95, pace: 1.1 },
  'face-painter': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  karaoke: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'dj-booth': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'diploma-walk': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'class-of': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'grad-parade': { motion: 'walker', ground: true, height: 0.95, pace: 1.6 },
  valedictorian: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'crossing-guard': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'backpack-kid': { motion: 'walker', ground: true, height: 0.95, pace: 0.9 },
  'chalkboard-teacher': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'spelling-bee': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'science-volcano': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  referee: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  cheerleaders: { motion: 'stand', ground: true, height: 1.1, many: 1 },
  'stadium-wave': { motion: 'stand', ground: true, height: 0.95, many: 0 },
  'field-goal': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'team-mascot': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'snake-can': { motion: 'stand', ground: true, height: 1, many: 0 },
  'squirting-flower': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'seder-table': { motion: 'stand', ground: true, height: 1, many: 0 },
  'afikomen-hunt': { motion: 'stand', ground: true, height: 1, many: 0 },
  'elijahs-door': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'sea-parting': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'shofar-blower': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'apples-and-honey': { motion: 'stand', ground: true, height: 1, many: 0 },
  tashlich: { motion: 'stand', ground: true, height: 1, many: 0 },
  sukkah: { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'moon-sighting': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  iftar: { motion: 'stand', ground: true, height: 1, many: 0 },
  'eid-gifts': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'three-sisters-garden': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'story-time': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'knitting-grandma': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'porch-swing': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'whoopee-cushion': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'touchdown-dance': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'pie-thief': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'turkey-carver': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'thanks-table': { motion: 'stand', ground: true, height: 1, many: 0 },
  'leaf-jumper': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'apple-picker': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  hayride: { motion: 'walker', ground: true, height: 0.95, pace: 0.7 },
  'cider-press': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'giant-pumpkin': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'turkey-disguise': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'candy-chute': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'trunk-or-treat': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'costume-parade': { motion: 'walker', ground: true, height: 0.95, pace: 0.9 },
  'parade-watchers': { motion: 'stand', ground: true, height: 1, many: 0 },
  'kite-flyer': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'snow-shoveler': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'igloo-builder': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'snowflake-catcher': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'ice-sculptor': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'snowshoe-hiker': { motion: 'walker', ground: true, height: 0.95, pace: 0.6 },
  'ski-lift': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'sled-dogs': { motion: 'walker', ground: true, height: 0.9, pace: 1.4 },
  'chestnut-roaster': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'tree-lot': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  proposal: { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'valentine-mailbox': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'egg-dyeing': { motion: 'stand', ground: true, height: 1, many: 0 },
  'maple-tapping': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'diya-lighter': { motion: 'stand', ground: true, height: 1, many: 0 },
  'mithai-box': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'holi-colors': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  alebrije: { motion: 'walker', ground: true, height: 0.9, pace: 0.6 },
  'papel-picado': { motion: 'stand', ground: true, height: 1, many: 0 },
  'step-team': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  zawadi: { motion: 'stand', ground: true, height: 1, many: 0 },
  'dragon-dance': { motion: 'walker', ground: true, height: 1, pace: 0.7 },
  'tangerine-tree': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'mardi-gras-float': { motion: 'walker', ground: true, height: 1, pace: 0.5 },
  'rainbow-leprechaun': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'pi-day-pie': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'birdhouse-builder': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'thank-you-letter': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'lincoln-hat': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'resolution-list': { motion: 'stand', ground: true, height: 1.1, many: 0 },
  'tamale-maker': { motion: 'stand', ground: true, height: 1.05, many: 0 },
  'haunted-doorbell': { motion: 'stand', ground: true, height: 1.2, many: 0 },
  'candy-trader': { motion: 'stand', ground: true, height: 1, many: 0 },
  'tree-trimmer': { motion: 'stand', ground: true, height: 1.25, many: 0 },
  'secret-admirer': { motion: 'stand', ground: true, height: 1.15, many: 0 },
  'egg-spoon-race': { motion: 'stand', ground: true, height: 1, many: 0 },
  'seed-spitters': { motion: 'stand', ground: true, height: 1, many: 0 },
  'paul-revere': { motion: 'walker', ground: true, height: 1, pace: 1.2 },
  'hammock-napper': { motion: 'stand', ground: true, height: 1, many: 0 },
  'flag-raiser': { motion: 'stand', ground: true, height: 1.3, many: 0 },
  'fanous-kid': { motion: 'walker', ground: true, height: 0.95, pace: 0.8 },
  'canoe-paddlers': { motion: 'walker', ground: true, height: 0.9, pace: 1 },
}

/**
 * Standing ones that perform, and how: idle and act are how fast their frames go by themselves and for people
 * (act plays the 'act' row when it has one), level picks the frame by how near people are (from shut to wide open,
 * asleep to awake, unlit to lit) with peek waking it a little now and then by itself, looks turns it to watch
 * whoever is near (frames left, ahead, right, and a fourth for a blink or a laugh), faces turns it towards them,
 * variants gives each its own picture (rows main, v1, v2), notes sends music (or hearts, or letters) up from it
 * (lit: only for people), and together has them
 * fall into step with each other for people.
 */
interface Act {
  idle?: number
  act?: number
  level?: number
  peek?: boolean
  looks?: boolean
  faces?: boolean
  variants?: number
  notes?: boolean | 'lit'
  together?: boolean
  /** Never mirrored: it has words or letters on it. */
  text?: boolean
}
const ACTS: Partial<Record<MoverStyle, Act>> = {
  'haunted-tree': { level: 0, peek: true, faces: true },
  'candy-bowl': { level: 0, peek: true, faces: true },
  'skeleton-band': { idle: 6, act: 11, variants: 3, notes: true },
  'tesla-coil': { idle: 12, act: 18 },
  'rocking-chair': { idle: 4, act: 7 },
  'monster-mailbox': { idle: 2, act: 9 },
  'bush-eyes': { looks: true },
  'fortune-teller': { idle: 4, act: 8 },
  'dancing-zombies': { idle: 6, act: 9, together: true },
  'creaky-gate': { level: 0, peek: true },
  'pumpkin-tower': { looks: true },
  catrinas: { idle: 5, act: 9 },
  'sugar-skulls': { idle: 1, act: 8 },
  ofrenda: { level: 0.25 },
  buglers: { idle: 0.5, act: 3, notes: 'lit' },
  rangoli: { level: 0.3 },
  nutcracker: { idle: 2, act: 8, faces: true },
  'singing-wreath': { idle: 3, act: 8, notes: true },
  mistletoe: { idle: 2, notes: 'lit' },
  'gingerbread-house': { level: 0.1, peek: true },
  'workshop-elves': { idle: 5, act: 10 },
  'stuck-santa': { idle: 4, act: 10 },
  'snow-angels': { idle: 1, act: 6 },
  'north-pole-mailbox': { idle: 1, act: 6, notes: 'lit' },
  'bell-ringer': { idle: 3, act: 10, notes: 'lit' },
  nativity: { level: 0.2, peek: true },
  'ice-fishing-penguins': { idle: 3, act: 6, faces: true },
  'lawn-reindeer': { looks: true },
  'blow-up-santa': { level: 0, peek: true },
  'lights-elf': { level: 0.15, peek: true },
  wishbone: { idle: 2, act: 5 },
  'strutting-tom': { level: 0.1, peek: true, faces: true },
  'sign-turkey': { idle: 4, act: 5, faces: true },
  'latke-chef': { idle: 4, act: 7 },
  'dreidel-game': { idle: 2, act: 6, text: true },
  'klezmer-band': { idle: 4, act: 9, notes: 'lit' },
  sufganiyot: { idle: 3, act: 6 },
  'djembe-drummer': { idle: 4, act: 10, notes: 'lit' },
  'kwanzaa-dancers': { idle: 4, act: 9, together: true },
  'unity-cup': { idle: 2, act: 5 },
  'baby-new-year': { idle: 3, act: 8, text: true },
  'noisemaker-kids': { idle: 2, act: 8 },
  'polar-plunge': { idle: 6, act: 5 },
  'sleepy-reveler': { idle: 2, act: 6 },
  'god-of-fortune': { idle: 2, act: 5, text: true },
  'festival-drum': { idle: 4, act: 10 },
  dumplings: { idle: 3, act: 5 },
  'gong-xi-kids': { idle: 2, act: 6 },
  'lucky-cat': { idle: 3, act: 8, text: true },
  'unity-circle': { idle: 2, act: 6, together: true },
  'dove-release': { idle: 2, act: 6 },
  'tree-planters': { level: 0.15, peek: true },
  serenade: { idle: 2, act: 6, notes: 'lit' },
  'candy-heart': { idle: 0.25, act: 1.5, text: true },
  'waltzing-couple': { idle: 2, act: 5 },
  'pebble-penguins': { idle: 2, act: 5, faces: true },
  rushmore: { looks: true },
  'liberty-bell': { idle: 2, act: 6, text: true },
  'cherry-tree': { idle: 2, act: 6 },
  'bead-balcony': { idle: 2, act: 7 },
  jester: { idle: 4, act: 9 },
  'king-cake': { idle: 1, act: 4 },
  'carnival-mask': { looks: true },
  'irish-dancers': { idle: 4, act: 9, notes: 'lit', together: true },
  'leprechaun-trap': { idle: 1, act: 3 },
  harpist: { idle: 3, act: 6, notes: true },
  'egg-hunt': { idle: 2, act: 4 },
  'bunny-painter': { idle: 2, act: 3 },
  'recycle-bins': { idle: 2, act: 5 },
  folklorico: { idle: 3, act: 7, together: true },
  'pinata-party': { idle: 2, act: 5 },
  'flowers-for-mom': { idle: 2, act: 4 },
  'mom-garden': { level: 0.15, peek: true },
  'saluting-soldier': { idle: 1, act: 1.5, faces: true },
  'grill-dad': { idle: 3, act: 6 },
  'fishing-dock': { idle: 2, act: 4 },
  'order-reader': { idle: 2, act: 4 },
  'double-dutch': { idle: 6, act: 10 },
  'statue-of-liberty': { level: 0.25, peek: true },
  'hot-dog-contest': { idle: 2, act: 6 },
  'sparkler-writers': { idle: 6, act: 5, text: true },
  ironworkers: { idle: 2, act: 6 },
  cannonball: { idle: 3, act: 5 },
  sandcastle: { level: 0.1, peek: true },
  cornhole: { idle: 2, act: 5 },
  'pumpkin-carver': { idle: 3, act: 5 },
  'mad-scientist': { idle: 3, act: 5 },
  'singing-pumpkins': { idle: 2, act: 6, notes: true },
  'haunted-portrait': { looks: true },
  sarcophagus: { level: 0, peek: true },
  'apple-bobbing': { idle: 2, act: 4 },
  'grave-digger': { idle: 3, act: 5 },
  'phantom-organist': { idle: 3, act: 8, notes: true },
  'werewolf-change': { level: 0, peek: true },
  'skeleton-photographer': { idle: 1, act: 4 },
  'ghost-tea-party': { idle: 2, act: 5 },
  'witch-spell': { idle: 2, act: 4 },
  'scaredy-ghost': { idle: 2, act: 4, text: true },
  'nice-list': { idle: 2, act: 4 },
  'snowman-builders': { level: 0.1, peek: true },
  'star-topper': { idle: 2, act: 4 },
  'light-tangle': { idle: 3, act: 4 },
  'ugly-sweater': { idle: 3, act: 8, together: true },
  'present-puppy': { idle: 4, act: 5 },
  'reindeer-food': { idle: 2, act: 5 },
  'stair-peekers': { idle: 2, act: 4 },
  'cookie-baker': { idle: 2, act: 4 },
  'bounce-house': { idle: 4, act: 6 },
  magician: { idle: 3, act: 5 },
  'balloon-twister': { idle: 3, act: 4 },
  'party-horns': { idle: 3, act: 6, together: true },
  'musical-chairs': { idle: 6, act: 5 },
  'pin-the-tail': { idle: 3, act: 4 },
  limbo: { level: 0 },
  'face-painter': { idle: 3, act: 5 },
  karaoke: { idle: 3, act: 5, notes: 'lit' },
  'dj-booth': { idle: 6, act: 8, notes: true },
  'diploma-walk': { idle: 2, act: 4 },
  valedictorian: { idle: 3, act: 5 },
  'crossing-guard': { idle: 2, act: 4, text: true },
  'spelling-bee': { idle: 2, act: 4, text: true },
  'science-volcano': { idle: 2, act: 5 },
  referee: { idle: 2, act: 4 },
  cheerleaders: { idle: 4, act: 4, together: true },
  'stadium-wave': { idle: 3, act: 6 },
  'field-goal': { idle: 1, act: 6 },
  'team-mascot': { idle: 4, act: 5 },
  'snake-can': { idle: 2, act: 5, text: true },
  'squirting-flower': { idle: 3, act: 4 },
  'seder-table': { idle: 2, act: 5 },
  'afikomen-hunt': { idle: 3, act: 6 },
  'elijahs-door': { level: 0, peek: true },
  'sea-parting': { level: 0, peek: true },
  'shofar-blower': { idle: 1, act: 6 },
  'apples-and-honey': { idle: 2, act: 4 },
  tashlich: { idle: 3, act: 5 },
  sukkah: { idle: 2, act: 6 },
  iftar: { idle: 2, act: 4 },
  'eid-gifts': { idle: 2, act: 5 },
  'three-sisters-garden': { level: 0.1, peek: true },
  'story-time': { idle: 2, act: 4 },
  'knitting-grandma': { level: 0.1, peek: true },
  'porch-swing': { idle: 2, act: 4 },
  'whoopee-cushion': { idle: 2, act: 5, text: true },
  'touchdown-dance': { idle: 3, act: 6, text: true },
  'pie-thief': { idle: 2, act: 5 },
  'turkey-carver': { idle: 2, act: 5 },
  'thanks-table': { idle: 2, act: 4 },
  'leaf-jumper': { idle: 3, act: 6 },
  'apple-picker': { idle: 2, act: 5 },
  'cider-press': { idle: 3, act: 4 },
  'giant-pumpkin': { level: 0.1, peek: true },
  'turkey-disguise': { idle: 0.5, act: 2, text: true },
  'candy-chute': { idle: 2, act: 5 },
  'trunk-or-treat': { idle: 2, act: 4 },
  'parade-watchers': { idle: 2, act: 5 },
  'igloo-builder': { level: 0.1, peek: true },
  'snowflake-catcher': { idle: 2, act: 4 },
  'ice-sculptor': { level: 0.1, peek: true },
  'ski-lift': { idle: 1, act: 1.5 },
  'chestnut-roaster': { idle: 3, act: 4 },
  'tree-lot': { idle: 2, act: 4, text: true },
  proposal: { idle: 2, act: 5 },
  'valentine-mailbox': { idle: 2, act: 5 },
  'egg-dyeing': { idle: 2, act: 4 },
  'maple-tapping': { idle: 2, act: 4 },
  'diya-lighter': { level: 0.1, peek: true },
  'mithai-box': { idle: 2, act: 5 },
  'holi-colors': { idle: 2, act: 6 },
  'papel-picado': { level: 0.1, peek: true },
  'step-team': { idle: 1, act: 6 },
  zawadi: { idle: 2, act: 5 },
  'tangerine-tree': { idle: 2, act: 5 },
  'rainbow-leprechaun': { idle: 2, act: 5 },
  'pi-day-pie': { idle: 2, act: 5 },
  'birdhouse-builder': { level: 0.1, peek: true },
  'thank-you-letter': { idle: 2, act: 5 },
  'lincoln-hat': { idle: 2, act: 5 },
  'resolution-list': { idle: 2, act: 5 },
  'tamale-maker': { idle: 2, act: 5 },
  'haunted-doorbell': { idle: 2, act: 5 },
  'candy-trader': { idle: 2, act: 5 },
  'tree-trimmer': { level: 0.1, peek: true },
  'secret-admirer': { idle: 2, act: 3 },
  'egg-spoon-race': { idle: 2, act: 5 },
  'seed-spitters': { idle: 2, act: 5 },
  'hammock-napper': { idle: 2, act: 5 },
  'flag-raiser': { idle: 2, act: 5 },
}

/** How much flyers bob up and down (ghosts float, the rest hardly), and how fast their frames go. */
const FLOAT: Partial<Record<MoverStyle, number>> = {
  ghosts: 0.25, ufo: 0.18, angels: 0.12, 'sea-turtles': 0.12, sharks: 0.08,
  'grim-reaper': 0.2, whales: 0.1, octopus: 0.3, astronauts: 0.3, 'paper-planes': 0.35, 'rocket-ship': 0.12,
  'love-letters': 0.25, seahorses: 0.3, mermaids: 0.18, submarines: 0.1, 'origami-cranes': 0.2,
  storks: 0.1, 'flying-pigs': 0.2, unicorns: 0.12, 'magic-carpet': 0.25, superheroes: 0.1,
  helicopter: 0.15, 'manta-rays': 0.2, anglerfish: 0.15, rudolph: 0.08, 'sugar-plum-fairies': 0.25, 'parade-balloons': 0.12,
}
const BEAT: Partial<Record<MoverStyle, number>> = {
  ghosts: 6, ufo: 4, 'sea-turtles': 4, angels: 5, sharks: 6, dragon: 7,
  'grim-reaper': 4, whales: 3, octopus: 5, astronauts: 3, 'rocket-ship': 12,
  'love-letters': 8, seahorses: 5, mermaids: 5, submarines: 6, 'origami-cranes': 6,
  storks: 6, 'flying-pigs': 10, unicorns: 9, 'magic-carpet': 6, superheroes: 8,
  helicopter: 16, 'manta-rays': 3, anglerfish: 5, rudolph: 9, 'sugar-plum-fairies': 10, 'parade-balloons': 3,
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
  const { motion, ground } = STYLE[moverStyle(style)]
  return motion === 'walker' || motion === 'train' || motion === 'bounce' || motion === 'popup' || motion === 'throw' || (motion === 'stand' && ground)
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
  const on = motion === 'perch' || motion === 'slide' || motion === 'stand' || (motion === 'dangle' && !!STYLE[style].still)
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

/** Days in one round of the moon's phases, and a new moon to count from (6 January 2000, 18:14 UTC). */
const SYNODIC = 29.530588853
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

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

/** The pose each elf on the shelf was last left in, so it stays put while people watch. */
const elfPose = new Map<string, number>()

/** Tonight's night of Hanukkah (1 to 8; the candles are lit from the evening it starts), or 0. */
function hanukkahNight(now: Date) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  for (const year of [now.getFullYear() - 1, now.getFullYear()]) {
    const [y, m, d] = hanukkahEve(year)
    const days = Math.round((today - Date.UTC(y, m, d)) / 86_400_000)
    if (days >= 0 && days < 8) return days + 1
  }
  return 0
}

/** Today's day of Kwanzaa (1 on 26 December to 7 on 1 January), or 0. */
function kwanzaaDay(now: Date) {
  if (now.getMonth() === 11 && now.getDate() >= 26) return now.getDate() - 25
  if (now.getMonth() === 0 && now.getDate() === 1) return 7
  return 0
}

/** Which of the twelve animals (0 Rat to 11 Pig) is this lunar year's, or the coming one's from a month before. */
function zodiacIndex(now: Date) {
  const soon = new Date(now.getTime() + 30 * 86_400_000)
  const year = soon >= lunarNewYear(now.getFullYear()) ? now.getFullYear() : now.getFullYear() - 1
  return (((year - 4) % 12) + 12) % 12
}

/** Music (or hearts, or letters) floating up from (x, y) on one side of it, more of it the more lit. */
function rising(out: Sprite[], x: number, y: number, size: number, dir: number, lit: number, onlyLit: boolean, t: number, ph: number) {
  const count = 2 + Math.round(lit * 3)
  for (let j = 0; j < count; j++) {
    const q = (t * 0.45 + j / count + ph) % 1
    out.push({
      x: x + dir * size * 0.3 + Math.sin(q * 6 + j) * size * 0.15, y: y - q * size,
      hw: size * 0.09, hh: size * 0.09, angle: Math.sin(q * 5 + j) * 0.3, flip: false,
      alpha: Math.sin(q * Math.PI) * (onlyLit ? lit : 0.5 + 0.5 * lit), glow: 0.3, row: 'note', frame: j,
    })
  }
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
  /** The time now (milliseconds, the server's clock), for the ones that show the real time or the moon. */
  clock?: number
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

  // Whoever is nearest across the picture (people are down on the ground, under things in the sky), and how near.
  const nearestAcross = (x: number): { px: number; py: number; k: number } => {
    let best = { px: x, py: 1, k: 0 }
    for (const q of people) {
      const qk = q.strength * (1 - smoothstep(0, 0.2 + 0.6 * reach, Math.abs(q.x * aspect - x)))
      if (qk > best.k) best = { px: q.x * aspect, py: q.y, k: qk }
    }
    return best
  }
  const busy = action !== 'none' && action !== 'hide' && action !== 'appear'

  if (style === 'witch-crash') {
    // The witch comes flying in, getting bigger as she heads straight at the house, and splats flat against the
    // wall ("Ouch!"), slides slowly down it and is gone; she crashes above whoever is there (Hide: she swerves off).
    const n = 1 + Math.round(layer.amount * 2)
    const ratio = ratioOf(style)
    const x0 = path.at(0).x
    const x1 = path.at(L).x
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 4.1 + own)
      const period = (12 + ph * 6) / (0.4 + 1.2 * layer.speed)
      const u = (t + (i / n) * period + ph * period) / period
      const cycle = Math.floor(u)
      const q = u - cycle
      const seed = cycle * 7.7 + i * 3.1
      const fromLeft = hash(seed) < 0.5
      const start = path.at(fromLeft ? 0 : L)
      // Where she hits: somewhere over the house, or right over whoever is near.
      const lineAt = (x: number) => path.at((L * (x - x0)) / (x1 - x0 || 1)).y
      let cx = x0 + (x1 - x0) * (0.2 + 0.6 * hash(seed + 1))
      const who = nearestAcross(cx)
      const aim = busy ? smoothstep(0.05, 0.4, who.k) : 0
      cx += (Math.max(x0, Math.min(x1, who.px)) - cx) * aim
      let cy = lineAt(cx) + H * (1.6 + 1.0 * hash(seed + 2))
      cy += (Math.max(lineAt(cx) + H, who.py - H * 2.6) - cy) * aim
      const swerve = action === 'hide' ? smoothstep(0.2, 0.6, nearAt(cx, cy, H, people, reach, aspect).k) : 0
      const fly = 0.35
      if (q < fly) {
        const k = q / fly
        const sx = fromLeft ? x0 - 0.3 : x1 + 0.3
        const x = sx + (cx - sx) * k
        const y = start.y + (cy - start.y) * k * k - Math.sin(k * Math.PI) * H * 0.4 - swerve * k * k * 0.5
        const size = H * (0.6 + 0.7 * k * k)
        out.push({
          x, y, hw: (size * ratio) / 2, hh: size / 2, angle: (fromLeft ? 1 : -1) * 0.25 * k, flip: !fromLeft,
          alpha: smoothstep(0, 0.1, k) * (1 - swerve * smoothstep(0.7, 1, k)), glow: 0, row: 'main', frame: Math.floor(t * 9 + ph * 8),
        })
        continue
      }
      if (swerve > 0.5) continue
      // Flat against the wall, sliding slowly down it, then gone.
      const since = (q - fly) * period
      const stay = (1 - fly) * period * 0.75
      if (since > stay) continue
      const size = H * 1.3
      const slide = smoothstep(0.6, stay, since) * size * 0.6
      const hit = since < 0.25 ? 1 + 0.25 * Math.sin((since / 0.25) * Math.PI) : 1
      const splat: Sprite = {
        x: cx, y: cy + slide, hw: (size * 250) / 240 / 2 * hit, hh: (size / 2) * (2 - hit), angle: 0, flip: !fromLeft,
        alpha: 1 - smoothstep(stay - 0.8, stay, since), glow: 0, row: 'splat', frame: 0,
      }
      out.push(splat)
      if (since < 1.2) {
        // Stars round her head from the knock.
        for (let j = 0; j < 5; j++) {
          const a = since * 5 + (j / 5) * Math.PI * 2
          out.push({
            x: cx + Math.cos(a) * size * 0.35, y: cy - size * 0.38 + Math.sin(a) * size * 0.1, hw: size * 0.07, hh: size * 0.07,
            angle: 0, flip: false, alpha: splat.alpha * (1 - smoothstep(0.8, 1.2, since)), glow: 0.4, row: 'sparkle', frame: j % 4,
          })
        }
      }
      if (since < 2.5) out.push(bubble(splat, size * 0.8, splat.flip, 1))
    }
    return out
  }

  if (style === 'rain-clouds') {
    // Clouds drifting slowly over the roof. When it is really raining where the server is they turn dark and rain
    // down to the ground, with lightning in a thunderstorm; people bring one over to rain on them (Follow) or flash
    // lightning at them (Light up), or the clouds stay dry over them (Hide).
    const n = 1 + Math.round(layer.amount * 4)
    const ratio = ratioOf(style)
    const sky = weatherFor('').data
    const icon = sky ? weatherLook(sky.code).icon : 'cloud'
    const raining = icon === 'rain' || icon === 'storm'
    const storm = icon === 'storm'
    const v = 0.006 + 0.05 * layer.speed
    const lap = L + 0.6
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 2.3 + own)
      const s0 = (((t * v * (0.8 + 0.4 * ph) + (i / n) * lap + ph * lap) % lap) + lap) % lap - 0.3
      const p = path.at(Math.max(0, Math.min(L, s0)))
      const size = H * p.size * (0.8 + 0.4 * hash(i * 1.7))
      let x = p.x + (s0 - Math.max(0, Math.min(L, s0)))
      const y = p.y + Math.sin(t * 0.3 + ph * 6) * size * 0.08
      const who = nearestAcross(x)
      const k = smoothstep(0.05, 0.45, who.k)
      if (action === 'follow' || action === 'jump' || action === 'dance') x += (who.px - x) * k * 0.9
      const wet = action === 'hide' ? (raining ? 1 - k : 0) : Math.max(raining ? 1 : 0, action === 'follow' || action === 'jump' || action === 'dance' ? k : 0)
      const cloud: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: ph < 0.5, alpha: smoothstep(-0.3, 0, s0) * smoothstep(-0.3, 0, L - s0),
        glow: 0, row: wet > 0.3 || storm ? 'dark' : 'main', frame: Math.floor(t * 2 + ph * 8),
      }
      if (wet > 0.01) {
        // Rain from the bottom of the cloud down to the ground (or to whoever it is raining on).
        const top = y + size * 0.35
        const ground = action !== 'hide' && k > 0.2 ? Math.max(top + 0.1, who.py) : 0.99
        const drops = Math.round((14 + layer.fade * 26) * wet)
        for (let j = 0; j < drops; j++) {
          const hj = hash(j * 1.31 + i)
          const q = (t * (1.2 + 0.4 * hj) + hash(j * 2.7 + i)) % 1
          const rs = size * 0.16
          out.push({
            x: x + (hj - 0.5) * cloud.hw * 1.7 - q * size * 0.08, y: top + q * (ground - top), hw: rs / 4, hh: rs / 2, angle: 0.08,
            flip: false, alpha: cloud.alpha * 0.7 * (1 - smoothstep(0.85, 1, q)), glow: 0, row: 'rain', frame: 0,
          })
        }
      }
      // Lightning: now and then in a real thunderstorm, and at people with Light up.
      const zap = storm || (action === 'light' && k > 0.3)
      const flash = zap ? (((t + ph * 7) % (storm ? 6 : 2.5)) + (storm ? 6 : 2.5)) % (storm ? 6 : 2.5) : 99
      if (flash < 0.25) {
        cloud.glow = 0.8
        const bh = size * 1.6
        out.push({
          x: x + (hash(Math.floor(t / 6) + i) - 0.5) * cloud.hw, y: y + size * 0.3 + bh / 2, hw: bh / 4, hh: bh / 2, angle: 0,
          flip: hash(Math.floor(t) + i) < 0.5, alpha: cloud.alpha * (flash < 0.08 || flash > 0.14 ? 1 : 0.3), glow: 0.8, row: 'bolt', frame: 0,
        })
      }
      out.push(cloud)
    }
    return out
  }

  if (style === 'fighter-jets' || style === 'geese') {
    // Three jets in a V flying straight over the house now and then (each pass from one side or the other),
    // trailing red, white and blue smoke; for people they dip their wings in salute (Dance), light their
    // afterburners (Light up) or stay away (Hide). Geese fly over the same way, five to a V, slower, honking
    // at people.
    const geese = style === 'geese'
    const birds = geese ? 5 : 3
    const n = 1 + Math.round(layer.amount * 2)
    const ratio = ratioOf(style)
    let top = Infinity
    for (let k = 0; k <= 24; k++) top = Math.min(top, path.at((L * k) / 24).y)
    const v = geese ? 0.1 + 0.35 * layer.speed : 0.25 + 0.8 * layer.speed
    const span = aspect + 1.2
    const period = (span + (geese ? 1.4 : 2.5)) / v
    for (let i = 0; i < n; i++) {
      const u = (t + (i / n) * period + hash(i + own) * period) / period
      const cycle = Math.floor(u)
      const lead = (u - cycle) * period * v - 0.6
      if (lead > span) continue
      const fromLeft = hash(cycle * 3.7 + i) < 0.5
      const dir = fromLeft ? 1 : -1
      const y0 = geese
        ? Math.max(H * 2.6, top - H * (0.3 + 0.6 * hash(cycle * 1.9 + i)))
        : Math.max(H * 1.3, top - H * (1 + 0.8 * hash(cycle * 1.9 + i)))
      const lx = fromLeft ? lead : aspect - lead
      const near = nearAt(lx, y0, H * 2, people, reach, aspect)
      if (action === 'hide' && near.k > 0.3) continue
      const salute = action === 'dance' || action === 'jump' ? smoothstep(0.1, 0.5, near.k) : 0
      for (let w = 0; w < birds; w++) {
        // The leader in front, the rest behind either side of it.
        const rank = Math.ceil(w / 2)
        const side = w === 0 ? 0 : w % 2 ? -1 : 1
        const x = lx - dir * rank * H * (geese ? 1.3 : 1.7)
        const y = y0 + side * rank * H * (geese ? 0.55 : 0.7) - (x / aspect) * H * 0.3 * dir
        if (x < -0.6 || x > aspect + 0.6) continue
        const jet: Sprite = {
          x, y, hw: (H * ratio) / 2, hh: H / 2, angle: Math.sin(t * 7 + w) * 0.3 * salute - 0.05 * dir, flip: !fromLeft, alpha: 1,
          glow: action === 'light' ? near.k : 0, row: 'main', frame: Math.floor(t * (geese ? 9 : 12) + w * (geese ? 1.7 : 1)),
        }
        if (geese) {
          out.push(jet)
          if (w === 0 && near.k > 0.2 && action !== 'none') out.push(bubble(jet, H * 2.2, !fromLeft, near.k))
          continue
        }
        // The smoke, drifting down and spreading behind.
        const puffs = 12 + Math.round(layer.fade * 24)
        for (let j = 1; j <= puffs; j++) {
          const gap = jet.hw * 0.9 + j * H * 0.3
          const sz = H * (0.18 + 0.025 * j)
          out.push({
            x: x - dir * gap, y: y + gap * 0.05 * dir * dir + j * j * H * 0.002 + Math.sin(t + j) * H * 0.03,
            hw: sz, hh: sz, angle: 0, flip: false, alpha: 0.6 * (1 - j / (puffs + 1)), glow: 0, row: 'smoke', frame: [1, 0, 2][w],
          })
        }
        out.push(jet)
      }
    }
    return out
  }

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
      if (hasRow(style, 'search')) {
        // The searchlight sweeps the ground below, and swings round onto whoever comes near and stays on them.
        const dir = flip ? -1 : 1
        const lx = sprite.x + dir * size * (75 / 150)
        const ly = sprite.y + size * (45 / 150)
        const sweep = Math.sin(t * 0.9 + ph * 6) * 0.45
        // People are down on the ground: whoever is nearest across, within reach, gets the light.
        let px = lx
        let py = 1
        let k = 0
        for (const q of people) {
          const qk = q.strength * (1 - smoothstep(0, 0.2 + 0.6 * reach, Math.abs(q.x * aspect - lx)))
          if (qk > k) {
            k = qk
            px = q.x * aspect
            py = q.y
          }
        }
        if (action === 'none' || action === 'hide') k = 0
        k = smoothstep(0.05, 0.4, k)
        const aim = Math.atan2(-(px - lx), Math.max(1e-3, py - ly))
        const a = sweep + (aim - sweep) * k
        const bh = Math.max(size * 2, Math.min(size * 9, Math.hypot(px - lx, py - ly) * k + size * 3 * (1 - k)))
        out.push({
          x: lx - Math.sin(a) * (bh / 2), y: ly + Math.cos(a) * (bh / 2), hw: (bh * 200) / 300 / 2, hh: bh / 2,
          angle: a, flip: false, alpha: sprite.alpha * (action === 'hide' ? 1 - smoothstep(0.2, 0.6, near.k) : 0.85), glow: 0,
          row: 'search', frame: 0,
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
    // Ones that halt (the school bus, deer) stop the same way for anyone who comes near.
    const halts = STYLE[style].halts && action !== 'none'
    const shy = (STYLE[style].shy && (action === 'hide' || action === 'flee')) || halts
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
        // Out again, it hurries a little until back where it would have been,
        // so every projector (and one that just started) has it in one place.
        if (!hidden) f.scared[i] = Math.max(0, f.scared[i] - f.dt * 0.3)
        if (hidden) {
          f.scared[i] += f.dt
          // Gnomes have nowhere to hide: they freeze mid-step, like garden ornaments, until nobody is looking.
          if (hasRow(style, 'hide')) {
            sprite.row = 'hide'
            sprite.frame = 0
          }
          // The skunk turns its tail on whoever it is.
          if (style === 'skunks') sprite.flip = near.ax < 0
          // The bus puts its stop sign out and flashes its lights; the deer stands with its head up, ears turning,
          // and edges away (Run away), the bus lights up for them (Light up).
          if (halts && hasRow(style, 'halt')) {
            sprite.row = 'halt'
            sprite.frame = Math.floor(t * 4 + ph * 4)
            const along: Near = { ...near, ax: near.ax >= 0 ? 1 : -1, ay: 0 }
            react(sprite, action === 'flee' || action === 'light' || action === 'grow' ? action : 'none', along, t, ph * 6, reach)
          }
        }
        out.push(sprite)
        continue
      }
      // Bigfoot turns his head to look straight at whoever spots him (and then makes off, with Run away);
      // cows lift their heads from the grass to look and moo.
      if (hasRow(style, 'look') && action !== 'none' && near.k > 0.15) sprite.row = 'look'
      if (style === 'foxes') {
        // Now and then a fox stops to listen and pounces nose-first into the snow, the way they catch mice.
        const q = (((t + ph * 11) % 11) + 11) % 11
        if (q < 0.9) {
          const k = q / 0.9
          sprite.y -= Math.sin(k * Math.PI) * size * 1.2
          sprite.angle = (sprite.flip ? -1 : 1) * (k - 0.5) * 1.4
        }
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
      // Boats (and the surfer) rock on the waves.
      if (STYLE[style].rock) sprite.angle = Math.sin(t * 1.3 + ph * 6) * 0.07
      // Walkers jump for joy rather than shake; the ones that can dance do that instead.
      // They run off (or come over) along the ground, not up the wall.
      const along: Near = action === 'flee' || action === 'follow' ? { ...near, ax: near.ax >= 0 ? 1 : -1, ay: 0 } : near
      react(sprite, action === 'dance' ? (waves ? 'none' : 'jump') : action, along, t, ph * 6, reach)
      out.push(sprite)
      if (!little && hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, sprite.flip, near.k))
      if (style === 'tractors') {
        // Chugging along, puffing from its stack, harder for people.
        const dir = sprite.flip ? -1 : 1
        const busy = action !== 'none' && action !== 'hide' && action !== 'appear' ? smoothstep(0.2, 0.6, near.k) : 0
        const count = 3 + Math.round(busy * 3)
        for (let j = 0; j < count; j++) {
          const q = (t * (0.7 + busy) + j / count + ph) % 1
          const ps = size * (0.1 + 0.25 * q)
          out.push({
            x: sprite.x + dir * (sprite.hw * (200 / 240 * 2 - 1) - q * size * 0.6), y: sprite.y - size / 2 + size * (40 / 160) - q * size * 1.1,
            hw: ps, hh: ps, angle: 0, flip: false, alpha: (1 - q) * 0.55, glow: 0, row: 'puff', frame: 0,
          })
        }
      } else if (hasRow(style, 'puff') && action !== 'none' && action !== 'hide' && near.k > 0.3) {
        // The pirate ship fires a cannon (a puff of smoke from its side) every couple of seconds at whoever is near.
        const a = (t * 0.5 + ph) % 1
        const dir = near.ax < 0 ? 1 : -1
        out.push({
          x: sprite.x + dir * (sprite.hw * 0.6 + a * size * 0.5), y: sprite.y + size * 0.22 - a * size * 0.25,
          hw: size * (0.08 + a * 0.25), hh: size * (0.08 + a * 0.25), angle: 0, flip: false,
          alpha: (1 - a) * 0.85 * smoothstep(0.3, 0.6, near.k), glow: 0, row: 'puff', frame: 0,
        })
      }
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
    if (hasRow(style, 'drop')) {
      // Icicles along the gutter. Below freezing (from the weather where the server is) they hang still and
      // glint; when it is warmer they drip, and a drop falls on whoever stands underneath.
      const temp = weatherFor('').data?.temperature_f
      const thaw = temp == null ? 0.5 : temp <= 30 ? 0 : temp >= 36 ? 1 : (temp - 30) / 6
      const count = 2 + Math.round(layer.amount * 12)
      for (let i = 0; i < count; i++) {
        const ph = hash(i * 2.9 + own)
        const p = path.at(L * ((i + 0.5) / count) + (ph - 0.5) * (L / count) * 0.3)
        const size = H * p.size * (0.75 + 0.5 * hash(i * 1.9))
        const near = nearAt(p.x, 0, size / 2, along, reach, aspect)
        const sprite: Sprite = {
          x: p.x, y: p.y + size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: ph < 0.5, alpha: 0.95,
          glow: 0.25 * Math.pow(Math.max(0, Math.sin(t * 0.7 + ph * 9)), 8), row: 'main', frame: i % 3,
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        const wet = Math.max(thaw, action !== 'none' && action !== 'hide' ? smoothstep(0.3, 0.7, near.k) : 0)
        if (wet <= 0.01) continue
        // Drops from the longest tip, faster for people; each falls to the ground below.
        const period = (2.4 + ph * 2.5) / (0.4 + 1.6 * wet)
        const q = (((t + ph * period) / period) % 1 + 1) % 1
        const fallFor = Math.min(0.9, 0.5 / period * 2)
        const k = q / fallFor
        if (k > 1) continue
        const ds = size * 0.18
        const y0 = p.y + size * 0.9
        const y1 = Math.max(y0 + 0.05, near.k > 0.3 ? 1 : 0.98)
        out.push({
          x: p.x + (ph < 0.5 ? -1 : 1) * sprite.hw * 0.02, y: y0 + (y1 - y0) * k * k, hw: ds / 2, hh: ds / 2, angle: 0,
          flip: false, alpha: 0.9 * (1 - smoothstep(0.85, 1, k)), glow: 0, row: 'drop', frame: 0,
        })
      }
      return out
    }
    if (hasRow(style, 'spider')) {
      // Webs strung under the gutter, each with its spider going round it; people bring the spider
      // dropping down its thread to them (Hide: it scuttles to the top of the web and keeps still).
      const count = 1 + Math.round(layer.amount * 4)
      for (let i = 0; i < count; i++) {
        const ph = hash(i * 3.3 + own)
        const p = path.at(L * ((i + 0.5) / count) + (ph - 0.5) * (L / count) * 0.4)
        const size = H * p.size * (0.85 + 0.3 * hash(i * 2.1))
        const web: Sprite = {
          x: p.x, y: p.y + size * 0.45, hw: size / 2, hh: size / 2, angle: (ph - 0.5) * 0.3, flip: ph < 0.5,
          alpha: 0.9, glow: 0, row: 'main', frame: 0,
        }
        const near = nearAt(p.x, 0, size / 2, along, reach, aspect)
        if (action === 'light') web.glow = near.k
        out.push(web)
        const ss = size * 0.26
        const hides = action === 'hide' && near.k > 0.2
        // Round the web, stopping now and then.
        const go = t * 0.35 + ph * 9 + 0.3 * Math.sin(t * 1.1 + ph * 5)
        const r = hides ? size * 0.36 : size * (0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.21 + ph * 4)))
        const a = hides ? -Math.PI / 2 : go
        let x = web.x + Math.cos(a) * r
        let y = web.y + Math.sin(a) * r
        const dropK = action !== 'none' && action !== 'hide' && action !== 'appear' ? smoothstep(0.1, 0.7, near.k) : 0
        if (dropK > 0.01) {
          // Down on a thread from the middle of the web.
          const len = dropK * (0.15 + 0.5 * reach)
          x = web.x + (x - web.x) * (1 - dropK)
          y = web.y + (y - web.y) * (1 - dropK) + len
          out.push({
            x, y: (web.y + y) / 2, hw: size * 0.015, hh: Math.max(0, y - web.y) / 2, angle: 0, flip: false,
            alpha: 0.8, glow: 0, row: 'thread', frame: 0,
          })
        }
        out.push({
          x, y, hw: ss / 2, hh: ss / 2, angle: dropK > 0.5 ? 0 : a + Math.PI / 2, flip: false, alpha: 1,
          glow: action === 'light' ? near.k : 0, row: 'spider', frame: hides ? 0 : Math.floor(t * 10 + ph * 8),
        })
      }
      return out
    }
    // When each piñata last burst open (it is gone a while, then a new one is hung).
    const pinata = hasRow(style, 'candy')
    if (pinata && f.scared.length !== n * 2) {
      f.scared = new Array(n * 2).fill(0)
      for (let i = 0; i < n; i++) f.scared[n + i] = -100
    }
    // When each string of firecrackers was last set off.
    const crackers = hasRow(style, 'bang')
    if (crackers && f.scared.length !== n) f.scared = new Array(n).fill(-100)
    // Wind chimes swing and ring as hard as the real wind is blowing where the server is.
    const windMph = style === 'wind-chimes' ? weatherFor('').data?.wind_mph : undefined
    const windy = style !== 'wind-chimes' ? 1 : windMph == null ? 1 : 0.3 + Math.min(25, windMph) / 8
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
      const swing = Math.sin(t * 0.8 * Math.sqrt(windy) + ph * 5) * size * (still ? 0.06 : 0.1) * windy + Math.sin(t * 7 + ph * 9) * size * 0.35 * rings
      const near = nearAt(p.x + swing, still ? 0 : top + rest, size / 2, along, reach, aspect)
      const len = rest + (drops ? smoothstep(0, 1, near.k) * (0.12 + 0.45 * reach) : 0)
      const x = p.x + swing
      const y = top + len
      const angle = -Math.atan2(x - p.x, len)
      if (pinata) {
        // A piñata swings as people dance under it; after a couple of seconds of whacks it bursts, candy
        // flies out and falls, and a new one is hung a few seconds later.
        if (f.scared[n + i] > t) f.scared[n + i] = -100
        const whacking = action !== 'none' && action !== 'hide' && action !== 'appear' && near.k > 0.35
        f.scared[i] = whacking ? f.scared[i] + f.dt : Math.max(0, f.scared[i] - f.dt * 0.5)
        if (f.scared[i] > 2.2 && t - f.scared[n + i] > 8) {
          f.scared[n + i] = t
          f.scared[i] = 0
        }
        const since = t - f.scared[n + i]
        if (since < 8) {
          const back = smoothstep(6.5, 8, since)
          if (since < 2.2) {
            const start = Math.round(f.scared[n + i] * 10)
            for (let j = 0; j < 16; j++) {
              const hj = hash(start * 0.37 + j * 1.13 + i)
              const a = -Math.PI / 2 + (hj - 0.5) * 2.4
              const v0 = size * (1.2 + 1.6 * hash(start + j * 2.7))
              const cs = size * (0.13 + 0.06 * hash(j * 3.1 + start))
              const gy = Math.min(1, y + v0 * Math.sin(a) * since + 1.6 * since * since)
              out.push({
                x: x + Math.cos(a) * v0 * since, y: gy, hw: cs / 2, hh: cs / 2, angle: since * (hj - 0.5) * 12, flip: false,
                alpha: 1 - smoothstep(1.6, 2.2, since), glow: 0, row: 'candy', frame: j,
              })
            }
            if (near.k > 0.2) {
              out.push(bubble({ x, y, hw: size, hh: size / 2, angle: 0, flip: false, alpha: 1, glow: 0, row: 'main', frame: 0 }, size, false, near.k))
            }
          }
          if (back < 0.01) continue
          out.push({
            x: p.x, y: top + (rest - size * 0.4) / 2, hw: size * 0.02, hh: Math.max(0, rest - size * 0.4) / 2,
            angle: 0, flip: false, alpha: 0.85 * back, glow: 0, row: 'thread', frame: 0,
          })
          out.push({ x: p.x, y: top + rest, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: ph < 0.5, alpha: back, glow: 0, row: 'main', frame: 0 })
          continue
        }
      }
      out.push({
        x: (x + p.x) / 2, y: top + (len - size * 0.4) / 2, hw: size * (still ? 0.035 : 0.02), hh: Math.max(0, len - size * 0.4) / 2,
        angle, flip: false, alpha: 0.85, glow: 0, row: 'thread', frame: 0,
      })
      const sprite: Sprite = {
        x, y, hw: (size * ratio) / 2, hh: size / 2, angle, flip: pinata && ph < 0.5, alpha: 1,
        // Ornaments catch the light in turn, a glint running along the row.
        glow: style === 'ornaments' ? 0.6 * Math.pow(Math.max(0, Math.sin(t * 1.4 - i * 0.8)), 6) : 0, row: 'main',
        // Bells glint faster as they ring; stockings each keep a pattern; a piñata shakes as it is hit.
        frame: still && !STYLE[style].animate ? (pinata ? (f.scared[i] > 0.1 ? Math.floor(t * 14) : 0) : i)
          : Math.floor(t * (still ? (3 + 12 * rings) * (0.5 + 0.5 * windy) : 5 + 10 * near.k) + ph * 8),
      }
      const extra: Sprite[] = []
      if (crackers) {
        // Set off now and then, and by people: they pop one after another from the bottom up with a bang and a
        // flash each, jumping on the string, and a new string is hung a few seconds later.
        if (f.scared[i] > t) f.scared[i] = -100
        if (action !== 'none' && action !== 'hide' && action !== 'appear' && near.k > 0.35 && t - f.scared[i] > 10) f.scared[i] = t
        const ownGo = (((t + ph * 40) % 40) + 40) % 40
        const since = Math.min(t - f.scared[i], ownGo)
        const step = 0.2
        const popping = since < step * 11
        const gone = popping ? Math.min(10, Math.floor(since / step) + 1) : since < 9 ? 10 : 0
        sprite.frame = gone
        sprite.alpha = since < 9 ? 1 : smoothstep(9, 10, since)
        if (popping && gone <= 10) {
          const k = (since % step) / step
          sprite.angle += Math.sin(since * 60) * 0.12
          // The one that just went off: a bang where it was (10 down the string, the bottom one first).
          const cy = sprite.y - size / 2 + size * ((30 + (10 - gone) * 27) / 300)
          const bs = size * (0.35 + 0.25 * (1 - k))
          extra.push({
            x: sprite.x + Math.sin(sprite.angle) * (sprite.y - cy) + (hash(gone + i) - 0.5) * size * 0.2, y: cy, hw: bs / 2, hh: bs / 2,
            angle: 0, flip: false, alpha: 1 - smoothstep(0.4, 1, k), glow: 0.6, row: 'bang', frame: gone,
          })
        }
      }
      if (hasRow(style, 'spot')) {
        // The mirror ball throws spots of coloured light that wheel round over the wall; for people they gather
        // round them and dance there (nearest across, as people are down on the ground).
        let px = x
        let py = 1
        let k = 0
        for (const q of people) {
          const qk = q.strength * (1 - smoothstep(0, 0.2 + 0.6 * reach, Math.abs(q.x * aspect - x)))
          if (qk > k) {
            k = qk
            px = q.x * aspect
            py = q.y
          }
        }
        k = action === 'none' || action === 'hide' ? 0 : smoothstep(0.05, 0.5, k)
        const spots = 10 + Math.round(layer.fade * 14)
        for (let j = 0; j < spots; j++) {
          const hj = hash(j * 3.7 + i * 1.3)
          const a = t * (0.35 + 0.3 * layer.speed) * (hj < 0.5 ? 1 : -1) + j * 2.4
          const r = size * (1.2 + 4 * hash(j * 1.9 + i))
          const wx = x + Math.cos(a) * r * 1.4
          const wy = y + size * 0.4 + Math.abs(Math.sin(a * 0.7 + j)) * r * 0.9
          const gx = px + Math.cos(t * 2 + j * 2.4) * size * (0.25 + 0.5 * hj)
          const gy = py - size * 0.6 + Math.sin(t * 2.3 + j * 1.7) * size * (0.3 + 0.4 * hj)
          const ss = size * (0.3 + 0.2 * hj)
          out.push({
            x: wx + (gx - wx) * k, y: wy + (gy - wy) * k, hw: ss / 2, hh: ss / 2, angle: 0, flip: false,
            alpha: 0.75, glow: 0.4, row: 'spot', frame: j,
          })
        }
      }
      if (pinata && f.scared[i] > 0.1) sprite.angle += Math.sin(t * 13 + ph * 7) * 0.2 * Math.min(1, f.scared[i])
      const act = ACTS[style]
      let lit = 0
      if (act) {
        // A wreath that sings for people (its act), mistletoe sending up hearts for whoever is under it.
        lit = action !== 'none' && action !== 'hide' && action !== 'appear' ? smoothstep(0.1, 0.6, near.k) : 0
        const acting = lit > 0.3 && hasRow(style, 'act')
        if (acting) sprite.row = 'act'
        sprite.frame = Math.floor(t * (acting ? act.act ?? 8 : act.idle ?? 3) * (0.6 + 0.8 * layer.speed) + ph * 8)
      }
      react(sprite, drops || rings > 0 || act ? (action === 'light' || action === 'grow' ? action : 'none') : action, near, t, ph * 6, reach)
      out.push(sprite, ...extra)
      if (act?.notes && (act.notes !== 'lit' || lit > 0.3)) rising(out, x, y - size * 0.3, size, ph < 0.5 ? -1 : 1, lit, act.notes === 'lit', t, ph)
      if (act && hasRow(style, 'bubble') && lit > 0.3) out.push(bubble(sprite, size, false, Math.max(near.k, 0.6)))
      if (style === 'fanous' && near.k > 0.2) out.push(bubble(sprite, size, false, near.k))
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
      if (hasRow(style, 'can')) {
        // A raccoon climbing up out of the trash can (the can rocking as it does), looking about, and turning
        // to stare at whoever comes near with its masked eyes; it drops back in with Hide.
        const cs = size * 0.95
        const top = p.y - cs * 0.94
        const rs = size * 0.85
        let frame = Math.floor(t * 0.8 + ph * 4) % 4
        if (near.k > 0.1) {
          const side = -near.ax * near.dist
          frame = side < -size * 0.3 ? 0 : side > size * 0.3 ? 2 : 1
        }
        const raccoon: Sprite = {
          x: p.x, y: top + rs / 2 - up * rs * 0.7, hw: (rs * ratio) / 2, hh: rs / 2, angle: Math.sin(t * 1.1 + ph * 7) * 0.05 * up,
          flip: false, alpha: smoothstep(0.02, 0.2, up), glow: 0, row: 'main', frame,
        }
        react(raccoon, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(raccoon)
        const rising = up > 0.05 && up < 0.95 ? Math.sin(t * 18 + ph * 9) * 0.04 : 0
        out.push({
          x: p.x, y: p.y - cs / 2, hw: (cs * 160) / 165 / 2, hh: cs / 2, angle: rising, flip: ph < 0.5, alpha: 1, glow: 0, row: 'can', frame: 0,
        })
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
    if (style === 'tumbleweeds') {
      // Tumbleweeds bowling along one way, as fast as the real wind is blowing where the server is, in bumps
      // and bounces. Where each is follows from the show clock alone, so every projector has it in the same
      // place; the wind is taken in steps of 5 mph, and when it changes each eases over to its new place
      // (kept as an offset that dies away) rather than jumping there.
      const wind = weatherFor('').data?.wind_mph
      const gust = wind == null ? 1 : 0.25 + Math.round(Math.min(35, wind) / 5) / 2
      const along = (i: number, g: number) => {
        const ph = hash(i * 6.1 + own)
        // The speed with its slow surge, 1 + 0.3 sin(0.7 t + 9 ph), added up over time.
        return v * g * (0.8 + 0.4 * ph) * (t - (0.3 / 0.7) * Math.cos(t * 0.7 + ph * 9))
      }
      if (f.scared.length !== n + 1) f.scared = [...new Array(n).fill(0), gust]
      const was = f.scared[n]
      for (let i = 0; i < n; i++) {
        const size = H * (0.8 + 0.4 * hash(i * 1.3))
        const lap = L + size * 4
        if (was !== gust) {
          const jump = along(i, was) + f.scared[i] - along(i, gust)
          f.scared[i] = (((jump % lap) + lap * 1.5) % lap) - lap / 2
        }
      }
      f.scared[n] = gust
      for (let i = 0; i < n; i++) {
        const ph = hash(i * 6.1 + own)
        const size = H * (0.8 + 0.4 * hash(i * 1.3))
        f.scared[i] *= Math.exp(-f.dt / 10)
        const lap = L + size * 4
        const u = along(i, gust) + f.scared[i] + (i / n) * lap + ph * lap
        const s = (((u % lap) + lap) % lap) - size * 2
        const sc = Math.max(0, Math.min(L, s))
        const p = path.at(sc)
        const hop = size * 1.7
        const step = (((u / hop) % 1) + 1) % 1
        const bump = Math.abs(Math.sin(step * Math.PI)) * size * (0.15 + 0.12 * Math.min(2, gust)) * (0.6 + 0.8 * hash(Math.floor(u / hop) + i))
        const sprite: Sprite = {
          x: p.x + (s - sc), y: p.y - size / 2 - bump, hw: size / 2, hh: size / 2, angle: u / (size * 0.5), flip: false,
          alpha: smoothstep(-size * 2, -size, s) * smoothstep(-size * 2, -size, L - s), glow: 0, row: 'main', frame: 0,
        }
        const near = nearAt(sprite.x, sprite.y, size / 2, people, reach, aspect)
        if (action === 'flee' || action === 'jump') {
          const kick = smoothstep(0.05, 0.6, near.k)
          sprite.x += near.ax * kick * (0.06 + 0.25 * reach)
          sprite.y -= kick * size * (0.6 + Math.abs(Math.sin(t * 5 + ph * 6)) * 0.6)
        } else react(sprite, action, near, t, ph * 6, reach)
        out.push(sprite)
      }
      return out
    }
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
          // Wolves throw their heads back and howl at people now and then rather than blink.
          const howl = hasRow(style, 'bubble') ? 0.55 : 0.9
          pose = near.k > 0.08 ? (r > howl ? 3 : side < -size * 0.3 ? 0 : side > size * 0.3 ? 2 : 1) : r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3
        }
        sprite = {
          x: px, y: py, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: !looks && ph < 0.5, alpha: 1, glow: 0, row: 'main', frame: pose,
        }
      }
      react(sprite, action === 'flee' ? 'none' : action, near, t, ph * 6, reach)
      out.push(sprite)
      const calls = !STYLE[style].look || (sprite.row === 'main' && sprite.frame === 3)
      if (calls && hasRow(style, 'bubble') && near.k > 0.2) out.push(bubble(sprite, size, sprite.flip, near.k))
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
    if (style === 'window-candles') {
      // A candle on every sill, always lit and flickering; brighter for people (Hide: blown out as they come).
      for (let j = 0; j < S; j++) {
        const stop = stops[j]
        const size = H * stop.size
        const ph = hash(j * 2.7 + own)
        const near = nearAt(stop.x, 0, size / 2, along, reach, aspect)
        const sprite: Sprite = {
          x: stop.x, y: stop.y - size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: false, alpha: 1,
          glow: 0.12 + 0.06 * Math.sin(t * 7 + ph * 9), row: 'main', frame: Math.floor(t * 6 + ph * 4),
        }
        if (action === 'hide') sprite.alpha *= 1 - 0.8 * smoothstep(0.2, 0.7, near.k)
        else react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      }
      return out
    }
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
      // Hockey players slap the puck along the ground rather than lob it at the house.
      const flat = style === 'hockey-players'
      const tx = person ? x - near.ax * near.dist : Math.max(x0, Math.min(x1, x + (hash(seed) - 0.5) * 0.7))
      const ty = person ? (flat ? p.y - size * 0.05 : y - near.ay * near.dist) : flat ? p.y - size * 0.05 : Math.max(0.06, p.y - (0.2 + 0.4 * hash(seed + 1)))
      const flip = tx < x
      const frame = q < 0.45 ? 0 : q < 0.6 ? 1 : q < 0.72 ? 2 : q < 0.86 ? 3 : 0
      const kid: Sprite = { x, y, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip, alpha: 1, glow: 0, row: 'main', frame }
      react(kid, action === 'light' || action === 'grow' || action === 'jump' || action === 'dance' || action === 'hide' || action === 'appear' ? action : 'none', near, t, ph * 6, reach)
      out.push(kid)
      if (kid.alpha < 0.05) continue
      const hx = x + (flip ? -1 : 1) * size * (flat ? 0.3 : 0.2)
      const hy = flat ? p.y - size * 0.05 : y - size * 0.4
      const ball = SPRITE_ROWS[style].find((r) => r.id === 'ball')
      if (age < flight) {
        const k = age / flight
        const arc = flat ? 0 : 0.1 + 0.35 * Math.abs(tx - hx)
        const bs = size * (flat ? 0.07 : 0.1)
        out.push({
          x: hx + (tx - hx) * k, y: hy + (ty - hy) * k - arc * 4 * k * (1 - k), hw: bs, hh: bs * ((ball?.h ?? 52) / (ball?.w ?? 48)),
          angle: flat ? 0 : age * 9, flip: false, alpha: kid.alpha, glow: 0, row: 'ball', frame: 0,
        })
      } else if (age < flight + linger) {
        // It bursts where it lands, and fades.
        const k = (age - flight) / linger
        const sw = size * 0.32 * (1 + 0.3 * k)
        out.push({
          x: tx, y: ty, hw: sw, hh: sw * 0.62, angle: 0, flip: false,
          alpha: kid.alpha * (1 - smoothstep(0.4, 1, k)), glow: 0, row: 'splat', frame: 0,
        })
        // A goal for whoever it was passed to.
        if (person && hasRow(style, 'bubble')) out.push(bubble(kid, size, kid.flip, near.k))
      }
    }
    return out
  }

  if (motion === 'sky') {
    // Tonight's moon as it really is (its phase worked out from the date), rising on the left in the evening
    // and crossing over the house through the night by the clock; on the one spot placed by hand it stays there.
    const now = f.clock ?? Date.now()
    const age = ((((now - NEW_MOON_MS) / 86_400_000) % SYNODIC) + SYNODIC) % SYNODIC
    const frames = SPRITE_ROWS[style][0].frames
    const d = new Date(now)
    const night = Math.min(1, Math.max(0, (((d.getHours() + d.getMinutes() / 60 - 17 + 24) % 24) / 14)))
    const pins = layer.pins ?? []
    let x: number
    let y: number
    let size = H
    if (pins.length === 1) {
      x = pins[0].x * aspect
      y = pins[0].y
      size *= pins[0].size
    } else if (drawn) {
      const p = path.at(night * L)
      ;({ x, y } = p)
      size *= p.size
    } else {
      x = aspect * (0.08 + 0.84 * night)
      y = H * 0.6 + 0.03 + 0.2 * (2 * night - 1) * (2 * night - 1)
    }
    const near = nearAt(x, y, size / 2, people, reach, aspect)
    const sprite: Sprite = {
      x, y, hw: size / 2, hh: size / 2, angle: 0, flip: false, alpha: 1, glow: 0.15,
      row: 'main', frame: Math.round((age / SYNODIC) * frames) % frames,
    }
    react(sprite, action, near, t, 0, reach)
    out.push(sprite)
    return out
  }

  if (motion === 'stand') {
    // Things standing on the ground along the bottom of the house (or along the line drawn), each doing its own thing.
    const n = 1 + Math.round(layer.amount * (STYLE[style].many ?? 4))
    const ratio = ratioOf(style)
    const busy = action !== 'none' && action !== 'hide' && action !== 'appear'
    // Per-layer memory: when each was last set off (kicked, splashed, shaken, found, whistled for).
    if (f.scared.length !== n) f.scared = new Array(n).fill(-100)
    const sky = weatherFor('').data
    // The time now on the server's clock, for the ones that keep to the real date and time.
    const now = new Date(f.clock ?? Date.now())
    const hour = now.getHours() + now.getMinutes() / 60
    // Santa's chimney stands at the peak of the roof (along the line drawn, at its middle); people are down below it.
    const onRoof = style === 'santa-chimney' || style === 'stuck-santa'
    let peak = L / 2
    if (onRoof && !drawn) {
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
      const ph = hash(i * 5.7 + 1 + own)
      // Lamps stand in an even row; the rest a little here and there.
      const even = style === 'diyas'
      const p = onRoof ? path.at(peak) : path.at(L * ((i + 0.5) / n) + (even ? 0 : (ph - 0.5) * (L / n) * 0.6))
      const size = H * p.size * (even || onRoof ? 1 : 0.85 + 0.3 * hash(i * 3.1))
      const near = onRoof
        ? nearAt(p.x, 0, size / 2, people.map((q) => ({ ...q, y: 0 })), reach, aspect)
        : nearAt(p.x, p.y - size / 2, size / 2, people, reach, aspect)
      if (f.scared[i] > t) f.scared[i] = -100
      const since = t - f.scared[i]
      const sprite: Sprite = {
        x: p.x, y: p.y - size / 2, hw: (size * ratio) / 2, hh: size / 2, angle: 0, flip: ph < 0.5, alpha: 1, glow: 0,
        row: 'main', frame: Math.floor(t * 8 + ph * 8),
      }
      if (style === 'flags') {
        // Rippling as hard as the real wind is blowing where the server is (gently until the weather comes in).
        const wind = sky?.wind_mph
        sprite.frame = Math.floor(t * (wind == null ? 6 : 2 + Math.min(30, wind) * 0.6) + ph * 8)
        sprite.flip = false
        react(sprite, action, near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'cauldrons') {
        // Bubbling over a fire, more and bigger bubbles for people.
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        const boil = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const count = 3 + Math.round(boil * 6)
        for (let j = 0; j < count; j++) {
          const q = (t / (1.8 - boil * 0.6) + j / count + ph) % 1
          const bs = size * (0.08 + 0.06 * hash(j * 2.3 + i) + boil * 0.06) * (0.6 + q * 0.6)
          out.push({
            x: p.x + (hash(j * 1.7 + i) - 0.5) * size * 0.5 + Math.sin(t * 3 + j) * size * 0.04,
            y: p.y - size * 0.62 - q * size * (0.5 + boil * 0.6), hw: bs, hh: bs, angle: 0, flip: false,
            alpha: sprite.alpha * Math.sin(q * Math.PI), glow: 0.3, row: 'brew', frame: 0,
          })
        }
        if (busy && near.k > 0.3) out.push(bubble(sprite, size, sprite.flip, near.k))
      } else if (style === 'glowing-pumpkins') {
        // Lit from inside, flickering; whoever comes near gets a "Boo!" with a jump.
        const boo = busy && near.k > 0.35
        sprite.row = boo ? 'boo' : 'main'
        sprite.frame = Math.floor(t * 7 + ph * 8)
        sprite.glow = 0.15 + 0.1 * Math.sin(t * 9 + ph * 6)
        if (boo) {
          sprite.y -= Math.abs(Math.sin(t * 8 + ph * 6)) * size * 0.15
          sprite.hw *= 1.08
          sprite.hh *= 1.08
        }
        // Hide: they go dark as people come.
        if (action === 'hide') sprite.alpha *= 1 - 0.75 * smoothstep(0.2, 0.7, near.k)
        if (action === 'light') sprite.glow = Math.max(sprite.glow, near.k)
        out.push(sprite)
        if (boo) out.push(bubble(sprite, size, sprite.flip, near.k))
      } else if (style === 'sprinklers') {
        // Sweeping to and fro over the lawn, and turning onto whoever comes near (Hide: shutting off for them).
        out.push(sprite)
        const off = action === 'hide' ? smoothstep(0.2, 0.6, near.k) : 0
        if (off > 0.98) continue
        const sweep = Math.sin(t * (0.5 + 0.8 * layer.speed) + ph * 6) * 1.1
        const k = busy ? smoothstep(0.05, 0.4, near.k) : 0
        const aim = Math.max(-1.3, Math.min(1.3, -near.ax * 1.4))
        const a = sweep + (aim - sweep) * k
        const sh = size * 3.2
        const sw = (sh * 300) / 210
        const bx = p.x
        const by = p.y - size * 0.86
        const lean = a * 0.35
        // The fan's foot (the middle of its bottom edge) on the nozzle.
        out.push({
          x: bx + Math.sin(lean) * (sh * 95) / 210, y: by - Math.cos(lean) * (sh * 95) / 210, hw: sw / 2, hh: sh / 2,
          angle: lean, flip: a < 0, alpha: 1 - off, glow: 0, row: 'spray', frame: Math.floor(t * 10 + ph * 8),
        })
      } else if (style === 'snow-globes') {
        // Shaken now and then (and by people), the snow whirling up and settling back over the house inside.
        const own2 = (((t + ph * 17) % 17) + 17) % 17
        if (busy && near.k > 0.35) f.scared[i] = t
        const shaken = Math.min(since, own2)
        sprite.frame = Math.round((1 - smoothstep(0.5, 7, shaken)) * (SPRITE_ROWS[style][0].frames - 1))
        sprite.angle = shaken < 1 ? Math.sin(shaken * 28) * 0.12 * (1 - shaken) : 0
        sprite.flip = false
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'leaf-piles') {
        // Leaves flying up when someone walks through the pile (and a few in a gust now and then), fluttering down.
        if (busy && near.k > 0.4 && since > 2) f.scared[i] = t
        const gust = (((t + ph * 23) % 23) + 23) % 23
        const kick = since < gust
        const age = kick ? since : gust
        const flying = age < 3.2 ? (kick ? 18 : 5) : 0
        sprite.flip = false
        sprite.frame = 0
        if (kick && age < 0.4) sprite.hh *= 1 - 0.15 * Math.sin((age / 0.4) * Math.PI)
        out.push(sprite)
        const start = Math.round((t - age) * 10)
        for (let j = 0; j < flying; j++) {
          const hj = hash(start * 0.31 + j * 1.7 + i)
          const vx = (hj - 0.5) * size * 3
          // Up fast, then fluttering slowly down.
          const top = size * (1.4 + 1.4 * hash(start + j * 3.3))
          const rise = age < 0.6 ? top * (1 - (1 - age / 0.6) * (1 - age / 0.6)) : top - (age - 0.6) * size * 1.1
          const ls = size * (0.26 + 0.1 * hash(j * 2.9))
          out.push({
            x: p.x + vx * age * 0.6 + Math.sin(age * 4 + j) * size * 0.15,
            y: Math.min(p.y - ls / 2, p.y - size * 0.5 - rise),
            hw: (ls / 2) * (0.4 + 0.6 * Math.abs(Math.cos(age * 5 + j))), hh: ls / 2, angle: age * 4 * (hj - 0.5) * 3, flip: false,
            alpha: 1 - smoothstep(2.4, 3.2, age), glow: 0, row: 'leaf', frame: j,
          })
        }
      } else if (style === 'puddles') {
        // Rings spreading; a splash when someone steps in, and drops landing in it while it is really raining.
        if (busy && near.k > 0.45 && since > 1) f.scared[i] = t
        const icon = sky ? weatherLook(sky.code).icon : 'cloud'
        const raining = icon === 'rain' || icon === 'storm'
        sprite.y = p.y - size * 0.35
        sprite.flip = false
        sprite.frame = Math.floor(t * (raining ? 10 : 4) + ph * 8)
        out.push(sprite)
        // Seconds since the last raindrop landed in it.
        const drip = raining ? ((((t * 1.3 + ph) % 1) + 1) % 1) / 1.3 : Infinity
        const age = Math.min(since, drip)
        if (age < 0.7) {
          const big = since <= drip ? 1 : 0.45
          const k = age / 0.7
          const sh = size * 2.4 * big * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5)
          out.push({
            x: p.x + (since <= drip ? 0 : (hash(Math.floor(t * 1.3 + ph)) - 0.5) * sprite.hw), y: p.y - size * 0.4 - sh * 0.4,
            hw: size * 0.9 * big, hh: sh / 2, angle: 0, flip: false, alpha: 1 - smoothstep(0.5, 1, k), glow: 0, row: 'splash', frame: 0,
          })
        }
      } else if (style === 'cuckoo-clock') {
        // The real time (the server's clock) on its face. On the hour the cuckoo comes out of its door and calls
        // the hour, once on the half hour, and once for whoever comes up to the clock.
        sprite.flip = false
        sprite.frame = 0
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        const d = new Date(f.clock ?? Date.now())
        const sec = d.getSeconds() + d.getMilliseconds() / 1000
        const min = d.getMinutes() + sec / 60
        const hours = (d.getHours() % 12) + min / 60
        const u = sprite.hh * 2 / 300
        const cx = sprite.x
        const cy = sprite.y + (136 - 150) * u
        for (const [a, row, frame] of [[(hours / 12) * Math.PI * 2, 'hand', 0], [(min / 60) * Math.PI * 2, 'hand', 1]] as const) {
          const hh = 21 * u
          out.push({
            x: cx + Math.sin(a) * hh, y: cy - Math.cos(a) * hh, hw: 4.2 * u, hh, angle: a, flip: false,
            alpha: sprite.alpha, glow: 0, row, frame,
          })
        }
        if (busy && near.k > 0.45 && since > 8) f.scared[i] = t
        const strikes = d.getMinutes() === 0 ? d.getHours() % 12 || 12 : d.getMinutes() === 30 ? 1 : 0
        const call = 1.5
        let ph2 = -1
        if (sec < strikes * call) ph2 = sec % call
        else if (since < call * 2) ph2 = since % call
        if (ph2 >= 0) {
          const outK = smoothstep(0, 0.25, ph2) * (1 - smoothstep(1.05, 1.35, ph2))
          const bw = 60 * u * (0.4 + 0.6 * outK)
          const bird: Sprite = {
            x: cx + 6 * u * outK, y: sprite.y + (55 - 150) * u + 6 * u * outK, hw: bw / 2, hh: (bw * 0.6) / 2, angle: 0, flip: false,
            alpha: sprite.alpha * smoothstep(0, 0.2, outK), glow: 0, row: 'cuckoo', frame: ph2 > 0.3 && ph2 < 0.9 ? 1 : 0,
          }
          out.push(bird)
          if (outK > 0.6) out.push(bubble(bird, size * 0.6, false, 1))
        }
      } else if (style === 'pot-of-gold') {
        // Coins glinting; a rainbow arcs up out of the pot for people, and by itself now and then.
        sprite.flip = false
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        const own2 = (((t + ph * 31) % 31) + 31) % 31
        const show = Math.max(own2 < 7 ? smoothstep(0, 1.5, own2) * (1 - smoothstep(5.5, 7, own2)) : 0, busy ? smoothstep(0.15, 0.55, near.k) : 0)
        if (show > 0.01) {
          const rw = size * 4.2
          const rh = rw / 2
          const dir = p.x < path.at(L / 2).x ? 1 : -1
          out.push({
            x: p.x + dir * (rw * 145) / 400, y: p.y - size * 0.62 - rh / 2 + rh * 0.08, hw: rw / 2, hh: rh / 2, angle: 0, flip: false,
            alpha: show * 0.85 * sprite.alpha, glow: 0, row: 'rainbow', frame: 0,
          })
        }
        out.push(sprite)
        if (busy && near.k > 0.3) out.push(bubble(sprite, size, false, near.k))
      } else if (style === 'easter-eggs') {
        // Hidden about, dim and wobbling now and then; whoever finds one makes it light up and hop.
        if (busy && near.k > 0.4 && since > 20) f.scared[i] = t
        const found = since < 20
        sprite.flip = false
        sprite.frame = i
        sprite.alpha = found ? 1 : 0.55
        sprite.glow = found ? 0.4 + 0.3 * Math.sin(t * 4 + ph * 6) : 0
        const wob = (((t + ph * 9) % 9) + 9) % 9
        sprite.angle = !found && wob < 0.8 ? Math.sin(wob * 20) * 0.15 * (1 - wob / 0.8) : 0
        if (found && since < 0.9) sprite.y -= Math.sin((since / 0.9) * Math.PI) * size * 0.8
        out.push(sprite)
        if (found && since < 2.5) out.push(bubble(sprite, size * 1.6, false, 1))
      } else if (style === 'diyas') {
        // A row of lamps flickering, a wave of brightness running along them; the ones beside people glow bright.
        sprite.flip = false
        sprite.frame = Math.floor(t * 8 + ph * 8)
        sprite.glow = 0.5 * Math.pow(Math.max(0, Math.sin(t * 1.8 - i * 0.6)), 6)
        react(sprite, action, near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'santa-chimney') {
        // A chimney at the peak of the roof; Santa climbs up out of it now and then, waving, and for people
        // ("Ho ho ho!"). On Christmas Eve night (by the server's clock) he is up and down far more often.
        const eve = (now.getMonth() === 11 && now.getDate() === 24 && hour >= 17) || (now.getMonth() === 11 && now.getDate() === 25 && hour < 6)
        const period = (eve ? 14 : 32) / (0.4 + 1.2 * layer.speed)
        const q = (((t + ph * period) % period) + period) % period
        let up = smoothstep(0, 1.2, q) * (1 - smoothstep(5, 6.5, q))
        if (action === 'hide') up *= 1 - smoothstep(0.2, 0.6, near.k)
        else if (busy) up = Math.max(up, smoothstep(0.1, 0.5, near.k))
        sprite.y = p.y - size / 2 + size * 0.12
        sprite.flip = false
        sprite.frame = 0
        const crop = up * 0.8
        if (crop > 0.01) {
          const sh = size * 1.05
          const top = sprite.y - size / 2 + size * 0.1
          const santa: Sprite = {
            x: p.x, y: top - (sh * crop) / 2, hw: sh / 2, hh: (sh * crop) / 2, angle: Math.sin(t * 2 + ph * 6) * 0.04 * up,
            flip: false, alpha: 1, glow: 0, row: 'santa', frame: Math.floor(t * 8 + ph * 8), crop,
          }
          react(santa, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
          out.push(santa)
          if (up > 0.8 && (near.k > 0.2 || eve)) out.push(bubble(santa, size, false, Math.max(near.k, eve ? 1 : 0)))
        }
        out.push(sprite)
      } else if (style === 'searchlights') {
        // Beams sweeping the night sky, crossing back and forth; for people they swing round to cross right over them.
        const lx = p.x
        const ly = sprite.y - size * 0.25
        const sweep = Math.sin(t * (0.25 + 0.4 * layer.speed) + ph * 6 + i * 2.1) * 0.55 + (i % 2 ? 0.25 : -0.25)
        let px = lx
        let py = 1
        let k = 0
        for (const q of people) {
          const qk = q.strength * (1 - smoothstep(0, 0.3 + 0.8 * reach, Math.abs(q.x * aspect - lx)))
          if (qk > k) {
            k = qk
            px = q.x * aspect
            py = q.y
          }
        }
        k = busy ? smoothstep(0.05, 0.45, k) : 0
        const off = action === 'hide' ? smoothstep(0.2, 0.6, near.k) : 0
        // Through a point high over their head.
        const aim = Math.atan2(px - lx + Math.sin(t * 1.5 + i) * 0.03, ly - (py - 0.55))
        const a = sweep + (aim - sweep) * k
        const bh = Math.max(size * 9, 0.9)
        out.push({
          x: lx + Math.sin(a) * (bh / 2), y: ly - Math.cos(a) * (bh / 2), hw: (bh * 100) / 600 / 2, hh: bh / 2, angle: a, flip: false,
          alpha: 0.75 * (1 - off), glow: 0, row: 'beam', frame: 0,
        })
        sprite.flip = false
        sprite.frame = 0
        sprite.angle = a * 0.3
        out.push(sprite)
      } else if (style === 'ball-drop') {
        // The New Year's ball on its pole, by the server's clock: it comes down in the last minute before every
        // hour and reaches the bottom on the hour ("Happy New Year!" at midnight on New Year's Eve, sparkles
        // every hour); people set off a ten-second practice drop.
        sprite.flip = false
        sprite.frame = 0
        out.push(sprite)
        const sec = now.getSeconds() + now.getMilliseconds() / 1000
        let d = 0
        let landed = false
        if (now.getMinutes() === 59) d = sec / 60
        else if (now.getMinutes() < 2) {
          d = now.getMinutes() === 0 ? 1 : 1 - smoothstep(0, 60, sec)
          landed = now.getMinutes() === 0
        }
        const newYear = now.getMonth() === 0 && now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 10
        if (newYear) {
          d = 1
          landed = true
        }
        if (busy && near.k > 0.4 && since > 18) f.scared[i] = t
        const practice = t - f.scared[i]
        if (practice < 18) {
          const pd = practice < 10 ? practice / 10 : practice < 14 ? 1 : 1 - smoothstep(14, 18, practice)
          if (pd > d) d = pd
          if (practice >= 10 && practice < 14) landed = true
        }
        const top = sprite.y - size / 2 + size * 0.06
        const bottom = sprite.y + size / 2 - size * 0.14
        const bs = size * 0.42
        const ball: Sprite = {
          x: p.x, y: top + bs / 2 + d * (bottom - top - bs), hw: bs / 2, hh: bs / 2, angle: 0, flip: false, alpha: 1,
          glow: landed ? 0.6 + 0.3 * Math.sin(t * 8) : 0.25, row: 'ball', frame: Math.floor(t * 6 + ph * 4),
        }
        react(ball, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(ball)
        if (landed) {
          for (let j = 0; j < 10; j++) {
            const a = (j / 10) * Math.PI * 2 + t * 0.8
            const r = bs * (0.8 + 0.5 * Math.abs(Math.sin(t * 3 + j)))
            out.push({
              x: ball.x + Math.cos(a) * r, y: ball.y + Math.sin(a) * r, hw: bs * 0.12, hh: bs * 0.12, angle: 0, flip: false,
              alpha: 0.9, glow: 0.5, row: 'sparkle', frame: (j + Math.floor(t * 8)) % 4,
            })
          }
          if (newYear || (practice >= 10 && practice < 14)) out.push(bubble(ball, size * 0.6, false, 1))
        }
      } else if (style === 'champagne') {
        // Bottles going pop: the cork flies up and the foam spills over, for people ("Cheers!"), now and then by
        // themselves, and every one of them at midnight on New Year's Eve (by the server's clock).
        if (busy && near.k > 0.4 && since > 6) f.scared[i] = t
        const ownPop = (((t + ph * 45) % 45) + 45) % 45
        const midnight = now.getMonth() === 0 && now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 1
          ? now.getSeconds() + now.getMilliseconds() / 1000 + ph * 0.6 : Infinity
        const popped = Math.min(since, ownPop, midnight)
        sprite.flip = false
        sprite.frame = popped < 6 ? 1 : 0
        sprite.angle = popped < 0.3 ? Math.sin(popped * 60) * 0.06 : (ph - 0.5) * 0.08
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (popped < 1.8) {
          const cs = size * 0.16
          const dir = ph < 0.5 ? -1 : 1
          out.push({
            x: p.x + dir * popped * size * 0.5, y: sprite.y - size / 2 - popped * size * 2.6 + popped * popped * size * 1.3,
            hw: cs / 2, hh: cs / 2, angle: popped * 14 * dir, flip: false, alpha: 1 - smoothstep(1.4, 1.8, popped), glow: 0, row: 'cork', frame: 0,
          })
        }
        if (popped < 2.5 && (near.k > 0.2 || midnight < 2.5)) out.push(bubble(sprite, size * 0.8, false, Math.max(near.k, midnight < 2.5 ? 1 : 0)))
      } else if (style === 'graduation-caps') {
        // Caps on the ground tossed high into the air, spinning, now and then; people make them all go up ("Congrats!").
        if (busy && near.k > 0.3 && since > 2.6) f.scared[i] = t
        const period = (7 + ph * 6) / (0.4 + 1.2 * layer.speed)
        const own2 = (((t + ph * period) % period) + period) % period
        const tossed = Math.min(since, own2)
        const flight = 2.4
        sprite.flip = ph < 0.5
        if (tossed < flight) {
          const k = tossed / flight
          const high = size * (since <= own2 ? 6 : 4) * (0.8 + 0.4 * hash(i * 1.9))
          sprite.y -= 4 * high * k * (1 - k)
          sprite.x += (ph - 0.5) * size * 2 * k
          sprite.frame = Math.floor(tossed * 14 + ph * 8)
          if (since <= own2 && near.k > 0.2 && tossed < 1.6) out.push(bubble(sprite, size * 3, false, near.k))
        } else {
          sprite.frame = 0
          sprite.angle = (ph - 0.5) * 0.3
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'lighthouse') {
        // The lamp turning, its beam sweeping round (long when it points across, short as it turns towards or away);
        // for people it stops and shines straight at them (Hide: it goes dark for them).
        sprite.flip = false
        const turn = t * (0.5 + 1.2 * layer.speed) + ph * 6
        sprite.frame = Math.floor((((turn / (Math.PI * 2)) % 1) + 1) % 1 * 8)
        const lx = p.x
        const ly = sprite.y - size / 2 + (size * 62) / 300
        const seen = nearAt(lx, ly, size, people, reach * 2, aspect)
        const k = busy ? smoothstep(0.05, 0.4, seen.k) : 0
        const off = action === 'hide' ? smoothstep(0.2, 0.6, seen.k) : 0
        const c = Math.cos(turn)
        const bh = size * 0.3
        if (k < 0.98) {
          const bl = size * 4.5 * Math.abs(c)
          out.push({
            x: lx + Math.sign(c) * (bl / 2), y: ly, hw: bl / 2, hh: bh / 2, angle: 0, flip: c < 0,
            alpha: (1 - k) * (1 - off) * (0.45 + 0.5 * Math.abs(c)), glow: 0, row: 'beam', frame: 0,
          })
        }
        if (k > 0.02) {
          const tx = lx - seen.ax * seen.dist
          const ty = ly - seen.ay * seen.dist
          const bl = Math.max(size, Math.hypot(tx - lx, ty - ly) + size * 0.5)
          const hd = heading(tx - lx, ty - ly, Math.PI / 2)
          const dir = hd.flip ? -1 : 1
          out.push({
            x: lx + dir * Math.cos(hd.angle) * (bl / 2), y: ly + dir * Math.sin(hd.angle) * (bl / 2), hw: bl / 2, hh: bh / 2,
            angle: hd.angle, flip: hd.flip, alpha: k * (1 - off), glow: 0, row: 'beam', frame: 0,
          })
        }
        // The lamp flashes as the beam swings past the front.
        sprite.glow = Math.max(k * 0.5, 0.6 * Math.pow(Math.max(0, Math.sin(turn)), 12)) * (1 - off)
        out.push(sprite)
      } else if (style === 'sunflowers') {
        // Facing whoever comes near; otherwise following the sun by the server's clock (to the left in the morning,
        // ahead at midday, to the right in the afternoon) and drooping asleep at night.
        sprite.flip = false
        if (busy && near.k > 0.1) {
          const side = -near.ax * near.dist
          sprite.frame = side < -size * 0.15 ? 0 : side > size * 0.15 ? 2 : 1
        } else sprite.frame = hour < 6 || hour >= 19 ? 3 : hour < 11 ? 0 : hour < 14 ? 1 : 2
        sprite.angle = Math.sin(t * 0.8 + ph * 6) * 0.03
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'tulips') {
        // Open in the day and closed at night (as real tulips are, by the server's clock), and opening for people
        // (Hide: closing up for them).
        const day = smoothstep(7, 9, hour) * (1 - smoothstep(17, 19, hour))
        let open = Math.max(day, busy ? smoothstep(0.1, 0.6, near.k) : 0)
        if (action === 'hide') open *= 1 - smoothstep(0.2, 0.6, near.k)
        sprite.flip = ph < 0.5
        sprite.frame = Math.round(open * 3)
        sprite.angle = Math.sin(t * 0.9 + ph * 6) * 0.05
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'bird-feeder') {
        // Little birds flying in to the feeder, pecking at the seed and flying off again; people send them all off
        // for a while (Run away), or they keep coming with people about (anything else).
        sprite.flip = false
        sprite.frame = 0
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (action === 'flee' && near.k > 0.3) f.scared[i] = t
        const scared = t - f.scared[i] < 6
        const tray = sprite.y - size / 2 + (size * 108) / 300
        const bs = size * 0.13
        for (let b = 0; b < 3; b++) {
          const hb = hash(b * 3.3 + i)
          const period = 9 + hb * 6
          const q = (((t + hash(b * 7.7 + i + 0.5) * period) % period) + period) % period
          const side = b === 1 ? (hb < 0.5 ? -1 : 1) : b === 0 ? -1 : 1
          // Spaced along the tray.
          const sx = p.x + [-0.7, 0.05, 0.7][b] * size * ratio * 0.35
          const sy = tray - bs * 0.35
          // Away, flying in, pecking, flying off.
          let k = q < 1 ? q : q < period - 4 ? 1 : q < period - 3 ? period - 3 - q : 0
          if (scared) k = Math.min(k, Math.max(0, 1 - (t - f.scared[i]) * 1.5))
          if (k <= 0.01) continue
          const flying = k < 1
          const away = 1 - k
          out.push({
            x: sx + side * away * 0.35, y: sy - away * 0.3 + Math.sin(away * Math.PI) * 0.05, hw: (bs * 80) / 60 / 2, hh: bs / 2,
            angle: flying ? -side * 0.3 : 0, flip: side < 0, alpha: smoothstep(0, 0.2, k), glow: 0, row: 'bird',
            frame: flying ? 0 : Math.floor(t * (2 + hb * 2) + b) % 2,
          })
        }
      } else if (style === 'beehive') {
        // Bees buzzing in and out of the hive in loops; for people they swarm over to them (Run away or Hide: they go
        // back inside).
        sprite.flip = false
        sprite.frame = 0
        out.push(sprite)
        const door = { x: p.x, y: sprite.y + size * 0.3 }
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const inside = action === 'flee' || action === 'hide' ? smoothstep(0.2, 0.6, near.k) : 0
        const tx = p.x - near.ax * near.dist
        const ty = sprite.y - near.ay * near.dist
        const count = 5 + Math.round(layer.fade * 8)
        const bs = size * 0.14
        for (let j = 0; j < count; j++) {
          const hj = hash(j * 2.1 + i)
          const a = t * (1.2 + hj) * (hj < 0.5 ? 1 : -1) + j * 2.4
          const r = size * (0.3 + 0.6 * hj)
          const hx = door.x + Math.sin(a) * r * 1.3
          const hy = door.y - size * 0.3 + Math.sin(a * 2) * r * 0.4
          const sx = tx + Math.sin(a * 1.3) * size * 0.35
          const sy = ty + Math.cos(a * 1.7) * size * 0.3
          const vx = Math.cos(a) * (hj < 0.5 ? 1 : -1)
          out.push({
            x: hx + (sx - hx) * k, y: hy + (sy - hy) * k, hw: (bs * 170) / 130 / 2, hh: bs / 2, angle: 0, flip: vx < 0,
            alpha: 1 - inside, glow: 0, row: 'bee', frame: Math.floor(t * 24 + j * 3),
          })
        }
      } else if (style === 'campfire') {
        // Flames flickering, sparks rising; people stir it up, more and higher sparks (Grow: the flames leap up).
        sprite.flip = false
        sprite.frame = Math.floor(t * 10 + ph * 8)
        sprite.glow = 0.15 + 0.08 * Math.sin(t * 9 + ph * 6)
        const stir = busy ? smoothstep(0.1, 0.6, near.k) : 0
        if (action === 'grow') {
          const g = 1 + 0.5 * near.k
          sprite.y = p.y - (size * g) / 2
          sprite.hw *= g
          sprite.hh *= g
        } else react(sprite, action === 'light' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        const count = 6 + Math.round(stir * 16)
        for (let j = 0; j < count; j++) {
          const hj = hash(j * 1.7 + i)
          const q = (t * (0.5 + 0.4 * hj) * (1 + stir) + j / count + ph) % 1
          const es = size * (0.05 + 0.03 * hj) * (1 - q * 0.5)
          out.push({
            x: p.x + (hj - 0.5) * size * 0.4 + Math.sin(t * 2 + j) * size * 0.15 * q, y: p.y - size * 0.4 - q * size * (1 + 1.6 * stir),
            hw: es, hh: es, angle: 0, flip: false, alpha: sprite.alpha * (1 - q), glow: 0.8, row: 'ember', frame: 0,
          })
        }
      } else if (style === 'kinara') {
        // During Kwanzaa (26 December to 1 January, by the server's clock) as many candles are lit as it is the
        // night of; the rest of the year all seven. People make them flare ("Habari gani?").
        const m = now.getMonth()
        const day = now.getDate()
        sprite.flip = false
        sprite.frame = m === 11 && day >= 26 ? day - 25 : 7
        sprite.glow = 0.1 + 0.05 * Math.sin(t * 8 + ph * 6)
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (busy && near.k > 0.3) out.push(bubble(sprite, size, false, near.k))
      } else if (style === 'hula-dancers' || style === 'mariachi') {
        // Dancing (or playing) all the time, faster and with a call for people ("Aloha!", "¡Olé!").
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        sprite.flip = style === 'mariachi' ? p.x > path.at(L / 2).x : ph < 0.5
        sprite.frame = Math.floor(t * (5 + 7 * k) * (0.6 + 0.8 * layer.speed) + ph * 8)
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' || action === 'jump' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (k > 0.3) out.push(bubble(sprite, size, sprite.flip, near.k))
      } else if (style === 'cornucopia') {
        // A horn of plenty that spills apples, pears, grapes, pumpkins and corn rolling out across the ground for
        // people (and now and then by itself); they are gathered back in a few seconds later.
        const dir = p.x < path.at(L / 2).x ? 1 : -1
        sprite.flip = dir < 0
        sprite.frame = 0
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (busy && near.k > 0.35 && since > 9) f.scared[i] = t
        const ownSpill = (((t + ph * 30) % 30) + 30) % 30
        const spill = Math.min(since, ownSpill)
        const mouthX = p.x + dir * sprite.hw * 0.8
        const ps = size * 0.22
        const count = spill < 9 ? 7 : 3
        for (let j = 0; j < count; j++) {
          const hj = hash(j * 4.1 + i)
          // Three always lie by the mouth; the rest roll out and come back.
          const rolled = j < 3 ? 1 : smoothstep(0, 1.6, spill - j * 0.12)
          const back = j < 3 ? 0 : smoothstep(7.5, 9, spill)
          const dist = ps * (0.6 + j * 0.25) + (j < 3 ? 0 : rolled * size * (0.8 + 1.4 * hj))
          const bounce = j < 3 ? 0 : Math.abs(Math.sin(rolled * Math.PI * 2)) * (1 - rolled) * ps
          out.push({
            x: mouthX + dir * dist * (1 - back), y: p.y - ps / 2 - bounce, hw: ps / 2, hh: ps / 2, angle: (dir * dist) / (ps * 0.5),
            flip: false, alpha: j < 3 ? 1 : 1 - back, glow: 0, row: 'piece', frame: j % 5,
          })
        }
      } else if (style === 'christmas-tree') {
        // The lights twinkling on part of the way up by themselves; people light the whole tree, bottom to top,
        // and the star on top (Hide: it goes dark for them).
        let level = 0.3 + 0.15 * Math.sin(t * 0.5 + ph * 6)
        if (busy) level = Math.max(level, smoothstep(0.05, 0.6, near.k))
        if (action === 'hide') level *= 1 - smoothstep(0.2, 0.6, near.k)
        sprite.flip = false
        sprite.frame = Math.round(level * 10)
        sprite.glow = level >= 1 ? 0.2 : 0
        if (action === 'light') sprite.glow = Math.max(sprite.glow, near.k * 0.5)
        out.push(sprite)
      } else if (style === 'melting-snowman') {
        // Melting as the real temperature where the server is goes above freezing: proud and tall at 32°F or
        // colder, a puddle with his hat in it by 60°F. While he still can, he waves and tips his hat to people.
        const temp = sky?.temperature_f
        const melt = temp == null ? 0 : Math.max(0, Math.min(1, (temp - 32) / 28))
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        sprite.flip = false
        sprite.frame = Math.round(melt * 7)
        if (k > 0.3 && melt < 0.45) {
          sprite.row = 'act'
          sprite.frame = Math.floor(t * 5 + ph * 4)
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (k > 0.3) {
          const said = bubble(sprite, size, false, near.k)
          if (melt >= 0.45) said.row = 'melt'
          out.push(said)
        }
      } else if (style === 'cookies-for-santa') {
        // Cookies, milk and a carrot left out for Santa (warm and steaming for people, and all Christmas Eve);
        // from midnight on Christmas morning to the end of the 26th, crumbs, an empty glass and his thank-you.
        const eaten = now.getMonth() === 11 && (now.getDate() === 25 || now.getDate() === 26)
        const eve = now.getMonth() === 11 && now.getDate() === 24 && hour >= 16
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        sprite.flip = false
        sprite.frame = eaten ? 2 : k > 0.3 || eve ? 1 : 0
        if (eve) sprite.glow = 0.15 + 0.1 * Math.sin(t * 2 + ph * 6)
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (k > 0.3) {
          const said = bubble(sprite, size, false, near.k)
          if (eaten) said.row = 'thanks'
          out.push(said)
        }
      } else if (style === 'window-menorah' || style === 'habari-gani' || style === 'zodiac-animal' || style === 'father-time') {
        // Ones that show the real date: the menorah lit for tonight's night of Hanukkah (all eight the rest of the
        // year), the principle of today's day of Kwanzaa (the seven in turn the rest of the year), the animal of
        // this lunar year (next year's from a month before it starts) and Father Time's hourglass running out
        // over the year. People make them glow and speak.
        sprite.flip = false
        if (style === 'window-menorah') {
          sprite.frame = hanukkahNight(now) || 8
          sprite.glow = 0.1 + 0.05 * Math.sin(t * 7 + ph * 6)
        } else if (style === 'habari-gani') {
          const day = kwanzaaDay(now)
          sprite.frame = day ? day - 1 : Math.floor(t / 4 + ph * 7) % 7
        } else if (style === 'zodiac-animal') {
          sprite.frame = zodiacIndex(now)
          sprite.glow = 0.05
        } else {
          const start = new Date(now.getFullYear(), 0, 1).getTime()
          const end = new Date(now.getFullYear() + 1, 0, 1).getTime()
          sprite.frame = Math.round(((now.getTime() - start) / (end - start)) * 7)
        }
        react(sprite, action === 'light' || action === 'grow' || action === 'hide' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (busy && near.k > 0.3) {
          const said = bubble(sprite, size, false, near.k)
          if (style === 'zodiac-animal') said.frame = sprite.frame
          out.push(said)
        }
      } else if (style === 'groundhog') {
        // Asleep in his burrow, peeping out now and then, and up for people (all day on Groundhog Day). Once he's
        // all the way up, the real weather where the server is decides: clear skies and he sees his shadow
        // ("Six more weeks of winter!") and dives back; cloudy, rain or snow and he cheers an early spring.
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const day = now.getMonth() === 1 && now.getDate() === 2
        let level = day ? 1 : 0.4 * Math.pow(Math.max(0, Math.sin(t * 0.3 + ph * 9)), 8)
        level = Math.max(level, k)
        if (action === 'hide') level *= 1 - smoothstep(0.2, 0.6, near.k)
        const sky = weatherFor('').data
        const sunny = !!sky && ['sun', 'part'].includes(weatherLook(sky.code).icon)
        sprite.flip = false
        if (level > 0.95) {
          sprite.row = sunny ? 'shadow' : 'spring'
          sprite.frame = Math.floor(t * 4 + ph * 4)
        } else sprite.frame = Math.round(level * 5)
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (level > 0.95 && (k > 0.3 || day)) {
          const said = bubble(sprite, size, false, Math.max(near.k, 0.6))
          if (!sunny) said.row = 'early'
          out.push(said)
        }
      } else if (style === 'rain-barrel' || style === 'lemonade-stand' || style === 'memorial-flag') {
        // Ones that follow the real weather or date where the server is: the rain barrel filling under its
        // downspout while it really rains (a child jumping in the puddles for people; watering the flowers when
        // it's dry), the lemonade stand turning to hot cocoa below 55°F, and the flag at half-staff on the
        // morning of Memorial Day, raised to the top at noon.
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const acting = k > 0.3
        const sky = weatherFor('').data
        const cold = style === 'lemonade-stand' && sky?.temperature_f != null && sky.temperature_f < 55
        if (style === 'rain-barrel') {
          const wet = !!sky && ['rain', 'storm'].includes(weatherLook(sky.code).icon)
          sprite.row = wet ? (acting ? 'splash' : 'rain') : acting ? 'act' : 'main'
          sprite.frame = Math.floor(t * (acting ? 6 : 3) + ph * 8)
        } else if (style === 'lemonade-stand') {
          sprite.flip = false
          sprite.row = cold ? (acting ? 'coldact' : 'cold') : acting ? 'act' : 'main'
          sprite.frame = Math.floor(t * (acting ? 4 : 2) + ph * 8)
        } else {
          const day = lastWeekday(now.getFullYear(), 4, 1)
          const half = now.getMonth() === 4 && now.getDate() === day.getDate() && hour < 12
          sprite.flip = false
          sprite.row = half ? 'half' : 'main'
          sprite.frame = Math.floor(t * 4 + ph * 6)
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (acting) {
          const said = bubble(sprite, size, false, near.k)
          if (cold) said.row = 'cocoa'
          out.push(said)
        }
      } else if (style === 'class-of' || style === 'chalkboard-teacher') {
        // Ones that show the real date: the graduate's yard sign reads this year's class (next year's from July)
        // and the teacher's board today's day of the week. For people the graduate throws a cap in the air and
        // the teacher turns round to say good morning.
        sprite.flip = false
        const acting = busy && smoothstep(0.1, 0.6, near.k) > 0.3
        const grad = style === 'class-of'
        const slot = grad
          ? Math.max(0, Math.min(CLASS_YEARS - 1, now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0) - CLASS_FIRST_YEAR))
          : now.getDay()
        const poses = grad ? (acting ? CLASS_TOSS : CLASS_POSES) : acting ? BOARD_HELLO : BOARD_POSES
        sprite.row = acting ? 'act' : 'main'
        sprite.frame = slot * poses + (Math.floor(t * (acting ? 6 : 2) + ph * 8) % poses)
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (acting && hasRow(style, 'bubble')) out.push(bubble(sprite, size, false, near.k))
      } else if (style === 'moon-sighting') {
        // The moon they watch is tonight's real one, in its real phase; for people they cheer, saying
        // "Ramadan Mubarak!" during Ramadan and "Eid Mubarak!" on the days of Eid.
        sprite.flip = false
        const acting = busy && smoothstep(0.1, 0.6, near.k) > 0.3
        const phase = Math.round(moonPhase(now.getTime()) * MOON_PHASES) % MOON_PHASES
        const poses = SPRITE_ROWS[style].find((r) => r.id === (acting ? 'act' : 'main'))!.frames / MOON_PHASES
        sprite.row = acting ? 'act' : 'main'
        sprite.frame = (Math.floor(t * (acting ? 6 : 1.5) + ph * 8) % poses) * MOON_PHASES + phase
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (acting) {
          const said = bubble(sprite, size, false, near.k)
          if (ramadanDay(now)) said.row = 'ramadan'
          else if (isEid(now)) said.row = 'eid'
          out.push(said)
        }
      } else if (style === 'kite-flyer' || style === 'snow-shoveler') {
        // Following the real weather where the server is: the kite flies as high and pulls as hard as today's
        // wind (and needs a run to get up when it's still), and the neighbour shovels while it really snows and
        // otherwise leans on the shovel looking up hopefully. Both wave or cheer for people.
        sprite.flip = false
        const acting = busy && smoothstep(0.1, 0.6, near.k) > 0.3
        const sky = weatherFor('').data
        let said: string | null = null
        if (style === 'kite-flyer') {
          const band = windBand(sky?.wind_mph)
          sprite.row = acting ? 'act' : 'main'
          sprite.frame = band * KITE_POSES + (Math.floor(t * (2 + band * 1.5) + ph * 8) % KITE_POSES)
          if (band === 0) said = 'calm'
        } else {
          const snowing = !!sky && weatherLook(sky.code).icon === 'snow'
          sprite.row = snowing ? (acting ? 'snowact' : 'snow') : acting ? 'act' : 'main'
          sprite.frame = Math.floor(t * (snowing && !acting ? 5 : 3) + ph * 8)
          if (snowing) said = 'snowsay'
        }
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (acting) {
          const bub = bubble(sprite, size, false, near.k)
          if (said) bub.row = said
          out.push(bub)
        }
      } else if (style === 'lawn-chair-skeleton') {
        // Dressed for the real temperature where the server is: sunglasses and a cold drink when it's mild, a
        // hat, scarf, blanket and a steaming mug (and a shiver) below 50°F. It waves to people.
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const acting = k > 0.3
        const temp = weatherFor('').data?.temperature_f
        const cold = temp != null && temp < 50
        sprite.row = cold ? (acting ? 'coldact' : 'cold') : acting ? 'act' : 'main'
        sprite.frame = Math.floor(t * (acting ? 6 : 2) + ph * 8)
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (acting) {
          const said = bubble(sprite, size, sprite.flip, near.k)
          if (cold) said.row = 'brr'
          out.push(said)
        }
      } else if (style === 'elf-on-shelf') {
        // He only moves when nobody is looking: a new pose every few seconds while the yard is empty, and frozen
        // stock-still in whichever pose he was caught in while people are near.
        sprite.flip = false
        const frames = SPRITE_ROWS[style][0].frames
        const caught = busy && near.k > 0.08
        const key = `${layer.id}:${i}`
        if (!caught) elfPose.set(key, Math.floor(t / 4 + ph * 6) % frames)
        sprite.frame = elfPose.get(key) ?? 0
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'advent-calendar') {
        // Opened up to today's door, 1 to 24 December by the real date (all shut before December, all open from
        // Christmas Eve to the end of the year); today's door glows for people.
        sprite.flip = false
        const day = now.getMonth() === 11 ? Math.min(24, now.getDate()) : 0
        sprite.frame = day
        sprite.glow = busy ? 0.3 * smoothstep(0.1, 0.6, near.k) : 0
        react(sprite, action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
      } else if (style === 'midnight-toast') {
        // Chatting, glasses in hand; for people they clink them ("Cheers!"), and for the first half hour of New
        // Year's Day (by the server's clock) they kiss under a floating heart.
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const midnight = now.getMonth() === 0 && now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 30
        sprite.row = midnight ? 'kiss' : k > 0.3 ? 'act' : 'main'
        sprite.frame = Math.floor(t * (midnight ? 4 : k > 0.3 ? 6 : 2) + ph * 8)
        react(sprite, action === 'light' || action === 'grow' ? action : 'none', near, t, ph * 6, reach)
        out.push(sprite)
        if (k > 0.3 && !midnight) out.push(bubble(sprite, size, sprite.flip, near.k))
      } else if (ACTS[style]) {
        const act = ACTS[style]!
        const k = busy ? smoothstep(0.1, 0.6, near.k) : 0
        const frames = SPRITE_ROWS[style][0].frames
        const v = act.variants ? i % act.variants : 0
        sprite.row = v ? `v${v}` : 'main'
        let lit = k
        if (act.level != null) {
          // From shut (asleep, unlit) to wide open as people come; now and then a little by itself.
          let level = act.level
          if (act.peek) level = Math.max(level, 0.35 * Math.pow(Math.max(0, Math.sin(t * 0.35 + ph * 9)), 8))
          level = Math.max(level, k)
          if (action === 'hide') level *= 1 - smoothstep(0.2, 0.6, near.k)
          sprite.frame = Math.round(level * (frames - 1))
          lit = level > 0.85 ? 1 : 0
        } else if (act.looks) {
          // Watching whoever is near (left, ahead, right), laughing or blinking now and then.
          const r = hash(Math.floor(t / 1.4 + ph * 5) * 1.7 + i)
          const side = -near.ax * near.dist
          sprite.flip = false
          sprite.frame = near.k > 0.08 && action !== 'none'
            ? (r > 0.8 ? 3 : side < -size * 0.3 ? 0 : side > size * 0.3 ? 2 : 1)
            : r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3
        } else {
          // Playing (dancing, rocking) by itself, and its act for people; ones that dance together fall into step.
          const acting = k > 0.3
          if (acting && hasRow(style, 'act')) sprite.row = 'act'
          const fps = (acting ? act.act ?? 8 : act.idle ?? 6) * (0.6 + 0.8 * layer.speed)
          sprite.frame = Math.floor(t * fps + (act.together && acting ? 0 : ph * 8))
        }
        if (act.faces) sprite.flip = near.k > 0.1 && action !== 'none' ? near.ax > 0 : ph < 0.5
        if (act.text) sprite.flip = false
        const mine = action === 'light' || action === 'grow' ? action
          : action === 'hide' && act.level == null ? 'hide'
            : action === 'jump' && act.level == null && !hasRow(style, 'act') ? 'jump' : 'none'
        react(sprite, mine, near, t, ph * 6, reach)
        if (hasRow(style, 'arc') && busy) {
          // The coil throws lightning at whoever comes near (people are down on the ground), flickering.
          const who = nearestAcross(p.x)
          const zap = smoothstep(0.1, 0.45, who.k)
          if (zap > 0.05 && (t * 6 + ph) % 1 < 0.7) {
            const tx = p.x
            const ty = p.y - size + (size * 76) / 300
            const dx = who.px - tx
            const dy = Math.max(0.02, who.py - 0.02 - ty)
            const d = Math.hypot(dx, dy)
            out.push({
              x: tx + dx / 2, y: ty + dy / 2, hw: size * 0.16, hh: d / 2, angle: Math.atan2(-dx, dy), flip: false,
              alpha: zap, glow: 0.8, row: 'arc', frame: Math.floor(t * 14 + i),
            })
            sprite.glow = Math.max(sprite.glow, 0.5 * zap)
          }
        }
        out.push(sprite)
        if (act.notes && (act.notes !== 'lit' || lit > 0.3)) {
          // Music floating up off it (letters off to the North Pole), more of it for people.
          rising(out, p.x, p.y - size * 0.85, size, sprite.flip ? -1 : 1, lit, act.notes === 'lit', t, ph)
        }
        if (hasRow(style, 'bubble') && lit > 0.3) out.push(bubble(sprite, size, sprite.flip, Math.max(near.k, 0.6)))
      } else {
        // Fountains: sparks spraying up, the spray higher (Grow) or brighter (Light up) for people.
        sprite.flip = false
        sprite.frame = Math.floor(t * 14 + ph * 8)
        sprite.glow = 0.2
        if (action === 'grow') {
          // Taller from the ground up, rather than swelling round its middle.
          const g = 1 + 0.6 * near.k
          sprite.y = p.y - (size * g) / 2
          sprite.hw *= g
          sprite.hh *= g
        } else react(sprite, action, near, t, ph * 6, reach)
        out.push(sprite)
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
  /** The time now (milliseconds, the server's clock). */
  clockMs: number
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
      layer, path: mem.path!, drawn: mem.drawn, aspect, people: d.people, time: d.time, dt: d.dt, scared: mem.scared, clock: d.clockMs,
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
