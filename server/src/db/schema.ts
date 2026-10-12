import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const userRole = pgEnum('user_role', ['player', 'admin'])
export const postKind = pgEnum('post_kind', ['news', 'update', 'event'])

export const users = pgTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    usernameLower: text('username_lower')
      .notNull()
      .generatedAlwaysAs(sql`lower(username)`),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('player'),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_username_lower_key').on(t.usernameLower),
    uniqueIndex('users_email_key').on(t.email),
    check('users_username_format', sql`${t.username} ~ '^[A-Za-z0-9_]{3,16}$'`),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_last_seen_at_idx').on(t.lastSeenAt),
  ],
)

export const posts = pgTable(
  'posts',
  {
    id: id(),
    kind: postKind('kind').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('posts_slug_key').on(t.slug),
    index('posts_published_idx').on(t.publishedAt.desc(), t.id.desc()),
  ],
)

export const loreChapters = pgTable(
  'lore_chapters',
  {
    id: id(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
  },
  (t) => [uniqueIndex('lore_chapters_position_key').on(t.position)],
)

export const faqItems = pgTable(
  'faq_items',
  {
    id: id(),
    position: integer('position').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
  },
  (t) => [uniqueIndex('faq_items_position_key').on(t.position)],
)

// Game: one ninja per account (milestone 2). Values follow the original server
// (empty pouches, level cap 90, currencies: stone, gold, gift coupons).
const currency = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0)

/** Check body: the jsonb column holds an array (of at most `max` entries). */
const jsonbArray = (column: AnyPgColumn, max?: number) =>
  max === undefined
    ? sql`jsonb_typeof(${column}) = 'array'`
    : sql`jsonb_typeof(${column}) = 'array' and jsonb_array_length(${column}) <= ${sql.raw(String(max))}`

/** One rolled equipment property (IdentifyPropRec row): IdentifyPropLib id and value. */
export interface ItemProp {
  propId: number
  value: number
}

export const characters = pgTable(
  'characters',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameLower: text('name_lower')
      .notNull()
      .generatedAlwaysAs(sql`lower(name)`),
    gender: smallint('gender').notNull(),
    nation: smallint('nation').notNull(),
    clothing: smallint('clothing').notNull(),
    avatarId: integer('avatar_id').notNull(),
    level: smallint('level').notNull().default(1),
    exp: bigint('exp', { mode: 'number' }).notNull().default(0),
    stone: currency('stone'),
    gold: currency('gold'),
    giftCoupon: currency('gift_coupon'),
    honor: integer('honor').notNull().default(0),
    hp: integer('hp').notNull(),
    mp: integer('mp').notNull(),
    // HP/MP pouch amounts (RoleUseSystem); they start empty, the size is 9000 + level * 1000.
    hpPouch: integer('hp_pouch').notNull().default(0),
    mpPouch: integer('mp_pouch').notNull().default(0),
    sceneId: integer('scene_id').notNull(),
    // Explore spots (OutSearchSystem): global cooldown and searches used on `exploreDay` (UTC).
    exploreLastAt: timestamp('explore_last_at', { withTimezone: true }),
    exploreDay: date('explore_day'),
    exploreUsed: smallint('explore_used').notNull().default(0),
    // ScenesEntered: every scene the ninja has switched to (world map "visited" state).
    scenesEntered: integer('scenes_entered')
      .array()
      .notNull()
      .default(sql`'{}'`),
    // Daily quests (DayTaskSystem), reset on a new UTC day (`dailyQuestDay`, TaskPerDayFlush):
    // AcceptedDayTaskNum and CompletedDayTaskNum.
    dailyQuestDay: date('daily_quest_day'),
    dailyQuestsAccepted: smallint('daily_quests_accepted').notNull().default(0),
    dailyQuestsCompleted: smallint('daily_quests_completed').notNull().default(0),
    // LastOpenTaskDialogTime: start of the current offer period (FlushDayTaskTime timer).
    dailyQuestOfferAt: timestamp('daily_quest_offer_at', { withTimezone: true }),
    // CurWeekTaskScore (RewardScore), paid out as honor on a new week; `dailyScoreWeek` is
    // the UTC Monday of the week it belongs to (TaskPerWeekFlush).
    dailyScore: integer('daily_score').notNull().default(0),
    dailyScoreWeek: date('daily_score_week'),
    // Toll gates: EntryTollGateSceneTimes on the UTC day `tollGateDay` (TollGatePerDayFlush).
    tollGateDay: date('toll_gate_day'),
    tollGateEntries: smallint('toll_gate_entries').notNull().default(0),
    // Pub fights (per ninja, not per scene): PubSceneFightDayNum on the UTC day
    // `pubFightDay` (PubSceneFightFlushTime) and LastPullRockerTime (one pull per 3600 s).
    pubFightDay: date('pub_fight_day'),
    pubFightsToday: smallint('pub_fights_today').notNull().default(0),
    pubFightPulledAt: timestamp('pub_fight_pulled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('characters_user_id_key').on(t.userId),
    uniqueIndex('characters_name_lower_key').on(t.nameLower),
    index('characters_scene_id_idx').on(t.sceneId),
    check('characters_name_format', sql`${t.name} ~ '^[A-Za-z0-9_]{3,12}$'`),
    check('characters_gender', sql`${t.gender} in (0, 1)`),
    check('characters_nation', sql`${t.nation} between 0 and 4`),
    check('characters_level', sql`${t.level} between 1 and 90`),
    check(
      'characters_amounts',
      sql`${t.exp} >= 0 and ${t.stone} >= 0 and ${t.gold} >= 0 and ${t.giftCoupon} >= 0 and ${t.hp} >= 0 and ${t.mp} >= 0`,
    ),
    check(
      'characters_daily_quests',
      sql`${t.dailyQuestsAccepted} >= 0 and ${t.dailyQuestsCompleted} >= 0 and ${t.dailyScore} >= 0`,
    ),
    check(
      'characters_instance_counts',
      sql`${t.tollGateEntries} >= 0 and ${t.pubFightsToday} >= 0`,
    ),
  ],
)

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    count: integer('count').notNull().default(1),
    bound: boolean('bound').notNull().default(false),
    equippedSlot: text('equipped_slot'),
    createdAt: createdAt(),
    // Item instance state (docs/original-data/blacksmith.md). The defaults describe a plain
    // M2 item: not enhanced, appraised, no properties.
    // ConsolidateLevel (0-12); attack and HP follow from the item config.
    enhanceLevel: smallint('enhance_level').notNull().default(0),
    // InscribeLevel (0-12); the bonus follows from the config and EquipInscribe.ini.
    inscribeLevel: smallint('inscribe_level').notNull().default(0),
    // Hardiness. Null = full (the item's MaxHardiness) or an item without durability.
    durability: integer('durability'),
    // CanIdentify: true = has hidden properties (appraised once identifyTimes >= 1).
    canIdentify: boolean('can_identify').notNull().default(false),
    // IdentifyPropCount (0-4): properties to roll.
    identifyCount: smallint('identify_count').notNull().default(0),
    // IdentifyTimes: times rolled (appraise + refines).
    identifyTimes: integer('identify_times').notNull().default(0),
    // IdentifyPropRec rows (<= 4); the name comes from identify-props.
    props: jsonb('props').$type<ItemProp[]>().notNull().default([]),
    // ImpressIdentRec: the engraved (locked) property position 0-3, null = none.
    engravedSlot: smallint('engraved_slot'),
  },
  (t) => [
    index('inventory_items_character_id_idx').on(t.characterId),
    uniqueIndex('inventory_items_equipped_slot_key')
      .on(t.characterId, t.equippedSlot)
      .where(sql`${t.equippedSlot} is not null`),
    check('inventory_items_count', sql`${t.count} > 0`),
    check('inventory_items_enhance_level', sql`${t.enhanceLevel} between 0 and 12`),
    check('inventory_items_inscribe_level', sql`${t.inscribeLevel} between 0 and 12`),
    check('inventory_items_durability', sql`${t.durability} >= 0`),
    check('inventory_items_identify_count', sql`${t.identifyCount} between 0 and 4`),
    check('inventory_items_identify_times', sql`${t.identifyTimes} >= 0`),
    check('inventory_items_props', jsonbArray(t.props, 4)),
    check('inventory_items_engraved_slot', sql`${t.engravedSlot} between 0 and 3`),
  ],
)

export const characterQuests = pgTable(
  'character_quests',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    taskId: integer('task_id').notNull(),
    // 0 accepted, 1 ready to hand in, 2 completed
    state: smallint('state').notNull().default(0),
    // Count per sub-task, indexed by SetpSeq
    progress: jsonb('progress').$type<number[]>().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // TaskAccepted_Rec CompleteType (daily quests): 0 normal, 1 auto-complete, 2 hurried (paid).
    completeType: smallint('complete_type').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.taskId] }),
    check('character_quests_state', sql`${t.state} between 0 and 2`),
    check('character_quests_complete_type', sql`${t.completeType} between 0 and 2`),
  ],
)

// Today's daily quest board (TaskDayAccepted_Rec). Progress of an accepted daily quest lives
// in character_quests like any quest. State: 0 offered, 1-2 accepted, 3 completed today.
export const characterDailyQuests = pgTable(
  'character_daily_quests',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    taskId: integer('task_id').notNull(),
    state: smallint('state').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.taskId] }),
    check('character_daily_quests_state', sql`${t.state} between 0 and 3`),
  ],
)

// Star level per explore spot (OutSearch record: StarLevel, StarUpValue).
export const characterExploreSpots = pgTable(
  'character_explore_spots',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    spotId: integer('spot_id').notNull(),
    starLevel: smallint('star_level').notNull(),
    starProgress: smallint('star_progress').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.spotId] }),
    check('character_explore_spots_star', sql`${t.starLevel} between 0 and 5`),
  ],
)

// Refresh shops (RefreshShopSystem, docs/original-data/shops.md): shop type 1 Item Shop,
// 2 Mystery Shop, 3 Dark Shop. One row per character and shop once it was first stocked.
const shopType = () => smallint('shop_type').notNull()

export const characterShops = pgTable(
  'character_shops',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    shopType: shopType(),
    // LastRefreshTime: last restock (automatic, paid or free); null = never stocked.
    lastRefreshAt: timestamp('last_refresh_at', { withTimezone: true }),
    // UTC day of the last free instant restock (GratisRefreshCount, daily: decision 4).
    freeRestockDay: date('free_restock_day'),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.shopType] }),
    check('character_shops_shop_type', sql`${t.shopType} between 1 and 3`),
  ],
)

// RefreshShopBox_1..3 contents: one drawn item per slot; a purchase deletes the row.
export const characterShopStock = pgTable(
  'character_shop_stock',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    shopType: shopType(),
    // Position in the box (draw order, 0-based).
    slot: smallint('slot').notNull(),
    itemId: text('item_id').notNull(),
    // refreshitems.ini `price,type` pairs; null = not sold for that currency.
    priceStone: integer('price_stone'),
    priceGold: integer('price_gold'),
    priceGiftCoupon: integer('price_gift_coupon'),
    // IdentifyPropCount given at the draw (0-4).
    identifyCount: smallint('identify_count').notNull().default(0),
    // Item Shop equipment is rolled at the draw (Flush); Mystery and Dark Shop items are not.
    appraised: boolean('appraised').notNull().default(false),
    // IdentifyPropRec of an appraised item, moved into the bag on purchase.
    props: jsonb('props').$type<ItemProp[]>().notNull().default([]),
    // ItemBindingStatus of the bought item (shop types 1 and 3 bind).
    bound: boolean('bound').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.shopType, t.slot] }),
    check('character_shop_stock_shop_type', sql`${t.shopType} between 1 and 3`),
    check('character_shop_stock_slot', sql`${t.slot} between 0 and 99`),
    check(
      'character_shop_stock_prices',
      sql`${t.priceStone} >= 0 and ${t.priceGold} >= 0 and ${t.priceGiftCoupon} >= 0`,
    ),
    check('character_shop_stock_identify_count', sql`${t.identifyCount} between 0 and 4`),
    check('character_shop_stock_props', jsonbArray(t.props, 4)),
  ],
)

/** One Gold-tab row of a Mysterious Merchant spawn (Cap2ItemsRec), in MysticItemLib order. */
export interface MysticStockRow {
  itemId: string
  /** Price for this spawn, raised by the item's server-wide sales (GetItemNewPrice). */
  price: number
  /** MysticItemLib maxCnt and the count left. */
  maxCount: number
  left: number
}

// Mysterious Merchant spawns (MysticShopSystem): server-wide, one per hourly slot.
export const mysticSpawns = pgTable(
  'mystic_spawns',
  {
    id: id(),
    // MysticNpcLocation scene (2601-2605).
    sceneId: integer('scene_id').notNull(),
    // Spawn (MysticNpcTime `hour`) and despawn (+ `livetime` minutes).
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // Gold tab stock; lock the spawn row (FOR UPDATE) before decrementing `left`.
    stock: jsonb('stock').$type<MysticStockRow[]>().notNull(),
  },
  (t) => [
    // Creating the same hourly spawn twice (two requests at once) fails on this key.
    uniqueIndex('mystic_spawns_starts_at_key').on(t.startsAt),
    check('mystic_spawns_window', sql`${t.endsAt} > ${t.startsAt}`),
    check('mystic_spawns_stock', jsonbArray(t.stock)),
  ],
)

// Server-wide count sold per item over all spawns (SAVEITEMINFO_MYSTICITEM); sets the price.
export const mysticItemSales = pgTable(
  'mystic_item_sales',
  {
    itemId: text('item_id').primaryKey(),
    sold: integer('sold').notNull().default(0),
  },
  (t) => [check('mystic_item_sales_sold', sql`${t.sold} >= 0`)],
)

// Per-player purchases per spawn (MysticBuyRec), checked against the MysticCfg limits.
export const characterMysticPurchases = pgTable(
  'character_mystic_purchases',
  {
    spawnId: uuid('spawn_id')
      .notNull()
      .references(() => mysticSpawns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    count: smallint('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spawnId, t.characterId, t.itemId] }),
    index('character_mystic_purchases_character_id_idx').on(t.characterId),
    check('character_mystic_purchases_count', sql`${t.count} > 0`),
  ],
)

// Demon City instances (docs/original-data/toll-gates.md).

/** One card of the post-clear card flip (TGCardDropLib row), in slot order. */
export interface TollGateCard {
  itemId: string
  count: number
  bound: boolean
  /** Shown to the player (show all or a peek). */
  revealed: boolean
}

// The ninja's current solo toll gate run; at most one, deleted when the run ends.
export const tollGateRuns = pgTable(
  'toll_gate_runs',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // TollGate.ini section (100000-100038).
    gateId: integer('gate_id').notNull(),
    // Sub gate and fight point sequence (0-based) to fight next.
    subGate: smallint('sub_gate').notNull().default(0),
    point: smallint('point').notNull().default(0),
    // Last point passed as `subGate * 5 + point` (schedule %), null = none yet.
    passedPoint: smallint('passed_point'),
    // FightMonsterPointState = 0: the run was lost and only ends.
    lost: boolean('lost').notNull().default(false),
    // TGCardSystem: 0 no cards yet, 1 dealt, 2 all shown, 3 shuffled face down.
    cardState: smallint('card_state').notNull().default(0),
    // The 5 dealt cards (empty before the deal).
    cards: jsonb('cards').$type<TollGateCard[]>().notNull().default([]),
    // Peeks bought on this deal (LookCap index).
    peeks: smallint('peeks').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('toll_gate_runs_progress', sql`${t.subGate} >= 0 and ${t.point} >= 0`),
    check('toll_gate_runs_card_state', sql`${t.cardState} between 0 and 3`),
    check('toll_gate_runs_cards', jsonbArray(t.cards, 5)),
    check('toll_gate_runs_peeks', sql`${t.peeks} between 0 and 5`),
  ],
)

// Las Noches (SingleGateSystem), manual mode: one row per ninja once it entered.
export const singleGate = pgTable(
  'single_gate',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // SGateMaxFloor: best floor cleared (0-170).
    bestFloor: smallint('best_floor').notNull().default(0),
    // SGateCurOrder: floor to fight next; null = no run (SGateIsStart = 0).
    currentFloor: smallint('current_floor'),
    // SGateExp: EXP pot of the run, paid when it ends.
    potExp: bigint('pot_exp', { mode: 'number' }).notNull().default(0),
    // SGateReliveCnt and SGateBuyCnt: lives left and lives bought this run.
    lives: smallint('lives').notNull().default(0),
    livesBought: smallint('lives_bought').notNull().default(0),
    // SGateCount runs ended on the UTC day `runsDay` (SGateTime).
    runsDay: date('runs_day'),
    runsToday: smallint('runs_today').notNull().default(0),
  },
  (t) => [
    check('single_gate_best_floor', sql`${t.bestFloor} between 0 and 170`),
    check('single_gate_current_floor', sql`${t.currentFloor} between 1 and 170`),
    check(
      'single_gate_amounts',
      sql`${t.potExp} >= 0 and ${t.lives} >= 0 and ${t.livesBought} between 0 and 999 and ${t.runsToday} >= 0`,
    ),
  ],
)

// Pub fight line-up per ninja and neutral field (PullRockerMonsterRec).
export const pubFightLineups = pgTable(
  'pub_fight_lineups',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // PubSceneFightInfo scene (2601-2804).
    sceneId: integer('scene_id').notNull(),
    // The 3 PubMonsterLib NPC ids (n8000xxx), in fight order.
    npcIds: text('npc_ids').array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.sceneId] }),
    check('pub_fight_lineups_npc_ids', sql`cardinality(${t.npcIds}) = 3`),
  ],
)
