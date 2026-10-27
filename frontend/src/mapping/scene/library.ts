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
import { countdownNeedsDate } from './countdown'
import { moverWalks } from './movers'

export type Occasion =
  | 'new-year' | 'mlk-day' | 'lunar-new-year' | 'valentines' | 'presidents-day' | 'mardi-gras' | 'st-patricks' | 'easter'
  | 'earth-day' | 'cinco-de-mayo' | 'mothers-day' | 'memorial-day' | 'fathers-day' | 'juneteenth' | 'fourth-of-july'
  | 'labor-day' | 'halloween' | 'veterans-day' | 'thanksgiving' | 'diwali' | 'hanukkah' | 'christmas' | 'kwanzaa'
  | 'winter' | 'spring' | 'summer' | 'autumn' | 'birthday' | 'party' | 'sea' | 'driveway' | 'any'

/** The holidays in calendar order, then the seasons and the rest. */
export const OCCASIONS: Array<{ id: Occasion; label: string; words: string }> = [
  { id: 'new-year', label: 'New Year’s', words: 'new years eve nye midnight january' },
  { id: 'mlk-day', label: 'MLK Day', words: 'martin luther king jr day january dream' },
  { id: 'lunar-new-year', label: 'Lunar New Year', words: 'chinese new year spring festival zodiac' },
  { id: 'valentines', label: 'Valentine’s', words: 'valentines love february' },
  { id: 'presidents-day', label: 'Presidents’ Day', words: 'presidents day washington lincoln february patriotic' },
  { id: 'mardi-gras', label: 'Mardi Gras', words: 'mardi gras fat tuesday carnival new orleans' },
  { id: 'st-patricks', label: 'St Patrick’s', words: 'st patricks paddy irish luck march green' },
  { id: 'easter', label: 'Easter', words: 'april spring' },
  { id: 'earth-day', label: 'Earth Day', words: 'earth day planet nature green april' },
  { id: 'cinco-de-mayo', label: 'Cinco de Mayo', words: 'cinco de mayo fiesta mexico may' },
  { id: 'mothers-day', label: 'Mother’s Day', words: 'mothers day mom mum may' },
  { id: 'memorial-day', label: 'Memorial Day', words: 'memorial day remember may patriotic' },
  { id: 'fathers-day', label: 'Father’s Day', words: 'fathers day dad june' },
  { id: 'juneteenth', label: 'Juneteenth', words: 'juneteenth freedom day june' },
  { id: 'fourth-of-july', label: 'Fourth of July', words: '4th july independence usa america patriotic' },
  { id: 'labor-day', label: 'Labor Day', words: 'labor labour day september workers' },
  { id: 'halloween', label: 'Halloween', words: 'spooky scary october trick treat' },
  { id: 'veterans-day', label: 'Veterans Day', words: 'veterans day november patriotic military' },
  { id: 'thanksgiving', label: 'Thanksgiving', words: 'fall harvest november' },
  { id: 'diwali', label: 'Diwali', words: 'festival of lights' },
  { id: 'hanukkah', label: 'Hanukkah', words: 'chanukah' },
  { id: 'christmas', label: 'Christmas', words: 'xmas santa holiday december' },
  { id: 'kwanzaa', label: 'Kwanzaa', words: 'kwanzaa december' },
  { id: 'winter', label: 'Winter', words: 'snow cold ice' },
  { id: 'spring', label: 'Spring', words: 'garden may' },
  { id: 'summer', label: 'Summer', words: 'sun beach' },
  { id: 'autumn', label: 'Autumn', words: 'fall leaves' },
  { id: 'birthday', label: 'Birthdays', words: 'birthday party cake' },
  { id: 'party', label: 'Parties', words: 'celebrate celebration fun' },
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
  flowers: [['spring', 'easter', 'mothers-day', 'summer'], 'garden bloom'],
  butterflies: [['spring', 'summer'], 'garden'],
  bunnies: [['easter', 'spring'], 'rabbit'],
  balloons: [['birthday', 'party'], ''],
  lanterns: [['party', 'lunar-new-year', 'any'], 'chinese lunar paper'],
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
  flags: [['fourth-of-july', 'memorial-day', 'veterans-day', 'presidents-day', 'juneteenth'], 'usa american stars stripes'],
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
  eagles: [['fourth-of-july', 'memorial-day', 'veterans-day', 'presidents-day'], 'bald eagle usa america bird'],
  rockets: [['new-year', 'fourth-of-july', 'juneteenth', 'party'], 'fireworks firework burst bang'],
  balloons: [['birthday', 'party', 'any'], 'float floating'],
  butterflies: [['spring', 'summer', 'earth-day'], 'monarch garden'],
  fish: [['sea', 'summer'], 'clownfish swimming school'],
  snowfall: [['winter', 'christmas'], 'snow snowflakes flakes falling let it snow'],
  leaves: [['autumn', 'thanksgiving', 'halloween'], 'fall falling maple oak leaf'],
  petals: [['spring', 'valentines', 'easter'], 'cherry blossom sakura flowers falling pink'],
  confetti: [['new-year', 'birthday', 'party'], 'celebrate falling streamers'],
  'falling-hearts': [['valentines'], 'love hearts falling'],
  clovers: [['st-patricks'], 'shamrock four leaf clover luck falling'],
  'hanging-spiders': [['halloween'], 'spider web thread drop creepy scary'],
  lanterns: [['diwali', 'lunar-new-year', 'new-year', 'any'], 'sky lanterns paper floating wish light'],
  jellyfish: [['sea', 'summer'], 'jelly glowing ocean'],
  'rising-bubbles': [['sea', 'party', 'summer', 'birthday'], 'bubbles soap pop'],
  'hot-air-balloons': [['summer', 'any', 'birthday'], 'balloon ride sky'],
  fireflies: [['summer', 'spring'], 'lightning bugs glow night'],
  bees: [['spring', 'summer', 'earth-day'], 'bumblebee buzz honey garden'],
  dragon: [['halloween', 'lunar-new-year', 'any'], 'fire breathing dragon fantasy'],
  owls: [['halloween', 'autumn'], 'owl hoot night bird'],
  angels: [['christmas'], 'angel trumpet halo heavenly nativity'],
  sharks: [['sea', 'summer'], 'shark jaws fin ocean'],
  'sea-turtles': [['sea', 'summer'], 'turtle ocean swim'],
  mummies: [['halloween'], 'mummy egypt bandages monster'],
  'gingerbread-men': [['christmas'], 'gingerbread cookie run catch me'],
  'toy-soldiers': [['christmas'], 'nutcracker toy soldier march salute'],
  dinosaurs: [['any', 'birthday'], 't rex dinosaur roar kids'],
  ducklings: [['spring', 'easter'], 'duck ducklings quack mother babies'],
  'trick-or-treaters': [['halloween'], 'kids children costume candy sweets pumpkin bucket trick or treat'],
  werewolves: [['halloween'], 'werewolf wolf howl full moon monster'],
  vampires: [['halloween'], 'vampire dracula cape fangs count monster'],
  frankensteins: [['halloween'], 'frankenstein monster bolts green'],
  'grim-reaper': [['halloween'], 'reaper death scythe hooded scary appear'],
  'zombie-hands': [['halloween'], 'zombie hand ground grave rise rising graveyard creepy'],
  rats: [['halloween'], 'rat rats mice scurry creepy'],
  'falling-presents': [['christmas', 'birthday'], 'gifts presents falling boxes'],
  'polar-bears': [['christmas', 'winter'], 'polar bear arctic north pole scarf'],
  reindeer: [['christmas', 'winter'], 'reindeer rudolph red nose walking deer'],
  carolers: [['christmas', 'winter'], 'carol singers singing caroling songs choir'],
  squirrels: [['autumn', 'thanksgiving'], 'squirrel acorn nuts hop'],
  lovebirds: [['valentines', 'spring'], 'love birds couple heart'],
  'hatching-eggs': [['easter', 'spring'], 'easter eggs hatch chick chicks crack'],
  frogs: [['spring', 'summer'], 'frog pond ribbit hop toad'],
  dragonflies: [['summer', 'spring'], 'dragonfly pond garden insect'],
  hummingbirds: [['summer', 'spring'], 'hummingbird garden bird hover'],
  dolphins: [['sea', 'summer'], 'dolphin leap jump ocean splash'],
  whales: [['sea', 'summer'], 'whale spout blow ocean'],
  crabs: [['sea', 'summer'], 'crab beach claws sideways'],
  octopus: [['sea', 'halloween'], 'octopus tentacles ocean squid'],
  'beach-balls': [['summer', 'party'], 'beach ball bounce kick play'],
  'paper-planes': [['any', 'birthday'], 'paper plane aeroplane airplane origami fly'],
  kites: [['spring', 'summer', 'any'], 'kite string wind fly'],
  'rocket-ship': [['any', 'birthday', 'fourth-of-july'], 'rocket spaceship space ship blast off'],
  astronauts: [['any', 'birthday'], 'astronaut space spaceman moon float'],
  robots: [['any', 'birthday'], 'robot robots machine beep'],
  dogs: [['any', 'birthday'], 'dog dogs puppy puppies woof pet'],
  dreidels: [['hanukkah'], 'dreidel spin top nun gimel hei shin chanukah'],
  'lion-dance': [['lunar-new-year'], 'lion dance chinese new year festival parade'],
  'red-envelopes': [['lunar-new-year'], 'red envelope hongbao money luck chinese new year falling'],
  crows: [['halloween', 'autumn'], 'crow crows raven ravens black bird roof caw spooky perched'],
  doves: [['mlk-day', 'christmas', 'winter', 'valentines'], 'dove doves peace olive branch white bird roof perched'],
  cardinals: [['christmas', 'winter'], 'cardinal cardinals red bird roof perched snow'],
  'hanging-bats': [['halloween'], 'bat bats hanging upside down roof gutter'],
  sledders: [['christmas', 'winter'], 'sled sledding sledge toboggan kids children slide snow roof'],
  'sliding-penguins': [['christmas', 'winter'], 'penguin penguins slide sliding belly roof ice'],
  'jingle-bells': [['christmas'], 'jingle bell bells ring ringing ribbon hanging'],
  stockings: [['christmas'], 'stocking stockings hanging chimney mantel presents'],
  'candy-canes': [['christmas'], 'candy cane canes peppermint falling sweets'],
  'gold-coins': [['st-patricks', 'new-year', 'lunar-new-year'], 'gold coins coin money treasure falling luck lucky'],
  'falling-candy': [['halloween', 'party', 'birthday'], 'candy sweets lollipop candy corn peppermint falling treats'],
  'parachute-presents': [['christmas', 'birthday'], 'presents gifts parachute parachutes drop delivery'],
  sparklers: [['fourth-of-july', 'new-year', 'diwali', 'birthday'], 'sparkler sparklers sparks fire light celebration'],
  'floating-candles': [['halloween', 'christmas', 'hanukkah', 'diwali'], 'candle candles floating flame magic wizard'],
  'rolling-pumpkins': [['halloween', 'autumn'], 'pumpkin pumpkins jack o lantern rolling roll'],
  snowmen: [['christmas', 'winter'], 'snowman snowmen snow walking carrot'],
  'santa-walking': [['christmas'], 'santa claus father christmas walking sack presents'],
  hens: [['easter', 'spring'], 'hen chicken chickens chicks chick farm cluck'],
  'ice-cream-truck': [['summer', 'any'], 'ice cream van truck cone'],
  'fire-truck': [['any', 'fourth-of-july'], 'fire truck engine firefighter siren lights parade'],
  'race-cars': [['any', 'birthday'], 'race car cars racing fast'],
  drummers: [['fourth-of-july', 'memorial-day', 'veterans-day', 'christmas', 'any'], 'drummer drum drums marching band parade'],
  scarecrows: [['autumn', 'thanksgiving', 'halloween'], 'scarecrow scarecrows straw farm harvest'],
  'love-letters': [['valentines'], 'love letter letters envelope heart flying wings'],
  seahorses: [['sea', 'summer'], 'seahorse seahorses sea horse ocean'],
  mermaids: [['sea', 'summer'], 'mermaid ocean sea tail'],
  submarines: [['sea', 'any'], 'submarine sub periscope ocean underwater'],
  'origami-cranes': [['any', 'lunar-new-year', 'spring'], 'paper crane cranes origami folded bird'],
  pufferfish: [['sea', 'summer'], 'pufferfish puffer blowfish fish puff ocean'],
  koi: [['lunar-new-year', 'spring', 'sea'], 'koi carp fish pond japanese goldfish'],
  'peeking-ghosts': [['halloween'], 'ghost ghosts peek peeking window sill boo spooky cute'],
  'peeking-elves': [['christmas'], 'elf elves peek peeking window sill watching santa helper'],
  'window-cats': [['any', 'halloween'], 'cat cats kitty kitten window sill peek pet meow'],
  'window-eyes': [['halloween'], 'eyes glowing eyes window dark watching monster spooky stare'],
  'perched-owls': [['halloween', 'autumn'], 'owl owls roof perched night hoot watching wise'],
  seagulls: [['summer', 'sea'], 'seagull seagulls gull gulls roof beach bird squawk mine'],
  'snowball-kids': [['winter', 'christmas'], 'snowball snowballs fight kids children throw throwing snow splat'],
  'water-balloon-kids': [['summer', 'fourth-of-july'], 'water balloon balloons kids children throw throwing splash fight'],
  'jack-in-the-box': [['christmas', 'birthday', 'party'], 'jack in the box jester toy spring pop surprise clown'],
  moles: [['spring', 'any'], 'mole moles whack a mole pop up digging garden lawn'],
  coffins: [['halloween'], 'coffin coffins vampire dracula open grave spooky'],
  'grave-ghosts': [['halloween'], 'grave graves tombstone headstone ghost ghosts rising cemetery rip spooky'],
  'party-poppers': [['birthday', 'party', 'new-year'], 'party popper poppers confetti pop bang celebration'],
  'birthday-cakes': [['birthday', 'party'], 'birthday cake candles blow out wish happy birthday'],
  skiers: [['winter'], 'ski skier skiers skiing slope roof snow jump'],
  'ice-skaters': [['winter', 'christmas'], 'ice skater skaters skating figure skating twirl spin rink'],
  snails: [['spring', 'any'], 'snail snails shell slow shy garden'],
  tortoises: [['spring', 'summer', 'any'], 'tortoise tortoises turtle shell slow shy'],
  hedgehogs: [['autumn', 'any'], 'hedgehog hedgehogs prickly ball curl shy'],
  skunks: [['autumn', 'any', 'halloween'], 'skunk skunks stink smell spray funny'],
  'uncle-sam': [['fourth-of-july', 'presidents-day'], 'uncle sam stilts stilt walker parade independence day july 4th patriotic'],
  'football-players': [['autumn', 'thanksgiving', 'party'], 'football player players touchdown sport game super bowl'],
  storks: [['spring', 'any'], 'stork storks baby bundle delivery new baby welcome'],
  'flying-pigs': [['any', 'party'], 'flying pig pigs when pigs fly funny wings'],
  unicorns: [['any', 'birthday', 'party'], 'unicorn unicorns rainbow magic horn horse fantasy'],
  'magic-carpet': [['any', 'party'], 'magic carpet flying carpet arabian nights genie'],
  fairies: [['spring', 'summer', 'any'], 'fairy fairies wand magic sparkle tinker garden'],
  superheroes: [['party', 'birthday', 'any'], 'superhero superheroes hero cape flying kid hero'],
  ladybugs: [['spring', 'summer'], 'ladybug ladybugs ladybird ladybirds beetle bug insect spots'],
  moths: [['summer', 'autumn'], 'moth moths night light insect wings porch light'],
  wolves: [['halloween', 'autumn', 'winter'], 'wolf wolves howl howling roof full moon werewolf spooky'],
  moon: [['halloween', 'any', 'autumn', 'winter'], 'moon tonight phase full moon crescent real night sky'],
  pinatas: [['cinco-de-mayo', 'birthday', 'party', 'summer'], 'pinata piñata candy party birthday cinco de mayo fiesta burst donkey'],
  ornaments: [['christmas', 'winter'], 'ornament ornaments bauble baubles christmas tree decorations hanging shiny'],
  icicles: [['winter', 'christmas'], 'icicle icicles ice frozen drip gutter winter cold temperature freezing'],
  flags: [['fourth-of-july', 'memorial-day', 'veterans-day', 'presidents-day', 'labor-day', 'any', 'summer'], 'flag flags american stars stripes wind memorial day veterans patriotic'],
  'gift-boxes': [['christmas', 'birthday', 'party'], 'present presents gift gifts box surprise teddy open christmas birthday'],
  cauldrons: [['halloween'], 'cauldron witch brew potion bubble bubbles hubble fire spooky'],
  'glowing-pumpkins': [['halloween', 'autumn'], 'pumpkin pumpkins jack-o-lantern jack o lantern carved glowing boo scare'],
  'burrow-bunnies': [['easter', 'spring'], 'bunny bunnies rabbit rabbits burrow hole peek pop up easter'],
  helicopter: [['any'], 'helicopter chopper searchlight spotlight search light police rescue'],
  sprinklers: [['summer'], 'sprinkler sprinklers lawn water spray splash garden summer'],
  'snow-globes': [['christmas', 'winter'], 'snow globe snowglobe shake snow house winter christmas'],
  'manta-rays': [['sea', 'summer'], 'manta ray rays stingray sea ocean underwater glide'],
  clownfish: [['sea', 'summer'], 'clownfish clown fish nemo sea ocean reef underwater'],
  anglerfish: [['sea', 'halloween'], 'anglerfish angler fish deep sea glow lure light teeth spooky'],
  starfish: [['sea', 'summer'], 'starfish star fish sea star beach ocean'],
  surfers: [['summer', 'sea'], 'surfer surfers surfing surf wave beach cowabunga summer'],
  sailboats: [['summer', 'sea'], 'sailboat sailboats boat boats sail sailing sea ocean'],
  snowplow: [['winter', 'christmas'], 'snowplow snow plow plough truck snow winter beep'],
  'pirate-ship': [['halloween', 'sea', 'any'], 'pirate pirates ship cannon arr sea treasure'],
  rudolph: [['christmas', 'winter'], 'rudolph red nosed reindeer nose glow christmas santa'],
  fountains: [['fourth-of-july', 'new-year', 'diwali', 'juneteenth', 'party'], 'firework fireworks fountain sparks fourth july new year celebration'],
  'web-spiders': [['halloween', 'autumn'], 'spider spiders web webs cobweb spooky creepy halloween'],
  'leaf-piles': [['autumn', 'thanksgiving'], 'leaf leaves pile piles fall autumn kick jump'],
  puddles: [['spring', 'any'], 'puddle puddles rain splash water rainy weather jump'],
  gnomes: [['spring', 'summer', 'any'], 'gnome gnomes garden statue freeze sneak funny'],
  'cuckoo-clock': [['any'], 'cuckoo clock time real time hour bird chime'],
  robins: [['spring', 'winter', 'christmas'], 'robin robins bird birds roof sing song spring'],
  peacocks: [['spring', 'summer', 'any'], 'peacock peacocks bird tail fan feathers display strut'],
  'pot-of-gold': [['st-patricks'], 'pot of gold rainbow leprechaun luck lucky coins st patricks'],
  'easter-eggs': [['easter', 'spring'], 'easter egg eggs hunt hidden find painted'],
  'teddy-bears': [['valentines', 'mothers-day', 'christmas', 'any'], 'teddy bear bears hug hugs heart cuddly valentine'],
  diyas: [['diwali'], 'diya diyas lamp lamps oil light lights diwali deepavali festival'],
  'santa-chimney': [['christmas'], 'santa claus chimney roof christmas eve ho ho ho wave pop up'],
  'roof-reindeer': [['christmas', 'winter'], 'reindeer roof rooftop prancing christmas santa hooves'],
  'window-candles': [['christmas', 'winter', 'hanukkah', 'any'], 'candle candles window windows electric lights welcome glow'],
  'disco-ball': [['party', 'birthday', 'new-year'], 'disco ball mirror ball party dance lights spots glitter 70s'],
  searchlights: [['party', 'new-year', 'any'], 'searchlight searchlights spotlight spotlights beams sky premiere hollywood grand opening'],
  'ball-drop': [['new-year'], 'new year ball drop times square countdown midnight real time clock hour'],
  champagne: [['new-year', 'party', 'birthday'], 'champagne bottle cork pop cheers toast celebration midnight new year'],
  firecrackers: [['lunar-new-year', 'new-year', 'fourth-of-july'], 'firecracker firecrackers fireworks bang pop chinese new year lunar string'],
  'graduation-caps': [['party', 'summer'], 'graduation grad cap caps mortarboard toss congrats school class'],
  'school-bus': [['labor-day', 'any', 'autumn'], 'school bus yellow stop sign back to school kids'],
  tractors: [['autumn', 'thanksgiving', 'any'], 'tractor farm farmer harvest howdy country'],
  deer: [['winter', 'autumn', 'christmas', 'any'], 'deer buck doe antlers woods forest wildlife'],
  foxes: [['winter', 'autumn', 'any'], 'fox foxes red fox pounce snow woods wildlife'],
  raccoons: [['halloween', 'any', 'autumn'], 'raccoon raccoons trash can garbage bandit mask funny'],
  'witch-crash': [['halloween'], 'witch crash splat broom wall funny ouch halloween'],
  'rain-clouds': [['spring', 'any'], 'rain cloud clouds rainy weather storm thunder lightning real weather'],
  'hockey-players': [['winter', 'any'], 'hockey ice puck stick slap shot score goal sports'],
  lighthouse: [['sea', 'summer', 'any'], 'lighthouse beacon beam light sea coast nautical'],
  tumbleweeds: [['summer', 'autumn', 'any'], 'tumbleweed tumbleweeds wind western desert real wind'],
  bigfoot: [['halloween', 'any'], 'bigfoot sasquatch yeti monster woods legend funny'],
  'skeleton-dogs': [['halloween'], 'skeleton dog dogs bones spooky puppy glowing eyes'],
  sunflowers: [['summer', 'autumn', 'earth-day', 'mothers-day'], 'sunflower sunflowers flower flowers garden sun field'],
  tulips: [['spring', 'easter', 'mothers-day', 'earth-day'], 'tulip tulips flower flowers spring garden bloom open'],
  'bird-feeder': [['spring', 'winter', 'earth-day', 'any'], 'bird feeder birds seed garden songbirds finch'],
  beehive: [['spring', 'summer', 'earth-day'], 'bee bees beehive hive skep honey swarm buzz'],
  'wind-chimes': [['spring', 'summer', 'any'], 'wind chime chimes breeze ring real wind porch'],
  campfire: [['summer', 'autumn', 'any'], 'campfire camp fire flames sparks embers camping cozy'],
  kinara: [['kwanzaa', 'christmas', 'winter'], 'kinara kwanzaa candles seven principles habari gani december'],
  fanous: [['any'], 'fanous fanoos lantern lanterns ramadan eid kareem moon star'],
  'hula-dancers': [['summer', 'party'], 'hula dancer dancers hawaii hawaiian aloha luau grass skirt lei'],
  mariachi: [['cinco-de-mayo', 'party', 'summer', 'any'], 'mariachi band guitar sombrero mexico cinco de mayo fiesta music ole'],
  bagpipers: [['st-patricks', 'any'], 'bagpipe bagpiper bagpipes scotland scottish kilt piper march'],
  pilgrims: [['thanksgiving', 'autumn'], 'pilgrim pilgrims thanksgiving harvest mayflower basket'],
  cornucopia: [['thanksgiving', 'autumn'], 'cornucopia horn of plenty harvest fruit vegetables thanksgiving'],
  'christmas-tree': [['christmas', 'winter'], 'christmas tree lights star light up decorated evergreen'],
  cows: [['any', 'summer'], 'cow cows moo farm cattle dairy grazing'],
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
  menorah: [['hanukkah'], 'menorah candles chanukah lights tonight night'],
  advent: [['christmas'], 'advent calendar doors december countdown'],
  'lunar-new-year': [['lunar-new-year'], 'chinese new year zodiac animal countdown spring festival'],
  showtimes: [['any', 'halloween', 'christmas'], 'show times tonight schedule start when next show visitors'],
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
  { type: 'movers', style: 'balloons', id: 'usa', name: 'Red, white and blue balloons', occasions: ['fourth-of-july', 'memorial-day', 'labor-day'], words: 'float usa', look: { color: '#dc2626', color2: '#1d4ed8' } },
  { type: 'movers', style: 'balloons', id: 'halloween', name: 'Orange and black balloons', occasions: ['halloween'], words: 'float', look: { color: '#f97316', color2: '#1f2937' } },
  { type: 'movers', style: 'butterflies', id: 'blue', name: 'Blue butterflies', occasions: ['spring', 'summer'], words: 'morpho', look: { color: '#3b82f6', color2: '#e0f2fe' } },
  { type: 'movers', style: 'fish', id: 'blue-tang', name: 'Blue tang fish', occasions: ['sea', 'summer'], words: 'swimming school', look: { color: '#2563eb', color2: '#facc15' } },
  { type: 'movers', style: 'fish', id: 'goldfish', name: 'Goldfish', occasions: ['sea', 'summer'], words: 'swimming school', look: { color: '#f59e0b', color2: '#fde68a' } },
  { type: 'shapes', style: 'hearts', id: 'pink', name: 'Pink hearts', occasions: ['valentines'], words: 'love', look: { color: '#f472b6', color2: '#fbcfe8' } },
  { type: 'shapes', style: 'stars', id: 'usa', name: 'Red, white and blue stars', occasions: ['fourth-of-july', 'memorial-day', 'veterans-day', 'presidents-day'], words: 'patriotic', look: { color: '#dc2626', color2: '#2563eb' } },
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

/** A date some days from today, as YYYY-MM-DD. */
function dateFromNow(days: number) {
  const d = new Date(Date.now() + days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
      id: `countdown:${p.id}`, name: p.label, kind: 'countdown', occasions: p.occasions as Occasion[],
      words: `days until clock ${p.words ?? ''}`.trim(),
      drawing: `countdown:${p.style}`, type: 'countdown', style: p.style,
      make: () => newLayer('countdown', {
        ...COUNTDOWN_COLORS[p.style], style: p.style, name: p.label, pins: [{ x: 0.5, y: 0.42, size: 1, rotation: 0 }],
        // A birthday or own day starts three weeks from now, to be changed in its settings.
        ...(countdownNeedsDate(p.style) ? { date: dateFromNow(21), text: '' } : {}),
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
