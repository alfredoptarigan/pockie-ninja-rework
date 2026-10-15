import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
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
    // The worn outfit: the active set's Outfit item, else set I's (game/outfit.ts syncOutfit).
    clothing: smallint('clothing').notNull(),
    avatarId: integer('avatar_id').notNull(),
    // Reborn's Visual Outfit: the clothing drawn instead of `clothing`; null = the worn one.
    visualClothing: smallint('visual_clothing'),
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
    // VIP membership (decision 14) runs until this instant; null means none.
    vipUntil: timestamp('vip_until', { withTimezone: true }),
    // Reborn equipment set (loadout) I-V the ninja wears; IV-V need VIP to switch to.
    activeSet: smallint('active_set').notNull().default(1),
    // Reborn's Inventory "Hide": View Character shows other players no stats or skills.
    hideStats: boolean('hide_stats').notNull().default(false),
    createdAt: createdAt(),
    // Market wallet (MartCapital0 Stone, MartCapital1 Gold): sale proceeds after tax, moved to
    // stone/gold by an explicit claim.
    marketStone: currency('market_stone'),
    marketGold: currency('market_gold'),
    // Talent upgrades (M5 decision 7): attempts used on the UTC day `talentDay`, shared by all
    // talents; the n-th attempt costs costNeeded[n].
    talentDay: date('talent_day'),
    talentAttemptsUsed: smallint('talent_attempts_used').notNull().default(0),
    // Bloodline turn-ins (decision 12: 10 a day, 4 items each) on the UTC day `bloodlineDay`.
    bloodlineDay: date('bloodline_day'),
    bloodlineTurnIns: smallint('bloodline_turn_ins').notNull().default(0),
    // Soul discovery (decision 15: 10 a day, 30 with VIP) on the UTC day `soulDay`.
    soulDay: date('soul_day'),
    soulsDiscovered: smallint('souls_discovered').notNull().default(0),
    // Dice of Fate (decision 25) on the UTC day `diceDay`: rolls used and replenishes bought.
    diceDay: date('dice_day'),
    diceUsed: smallint('dice_used').notNull().default(0),
    diceBought: smallint('dice_bought').notNull().default(0),
    // Twenty-Minute Reward (decision 26): last claim and claims on the UTC day `twentyMinDay`.
    twentyMinAt: timestamp('twenty_min_at', { withTimezone: true }),
    twentyMinDay: date('twenty_min_day'),
    twentyMinCount: smallint('twenty_min_count').notNull().default(0),
    // Team Stone shop currency (decision 28); never lost on a loss.
    battleCoins: currency('battle_coins'),
    // Kennel slots owned (M6 decision 17): 1 free, up to 5.
    petSlots: smallint('pet_slots').notNull().default(1),
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
    check('characters_market_wallet', sql`${t.marketStone} >= 0 and ${t.marketGold} >= 0`),
    // M5 daily counters: the caps live in each feature's constants file, the database only
    // refuses negatives.
    check('characters_talent_attempts', sql`${t.talentAttemptsUsed} >= 0`),
    check('characters_bloodline_turn_ins', sql`${t.bloodlineTurnIns} >= 0`),
    check('characters_souls_discovered', sql`${t.soulsDiscovered} >= 0`),
    check(
      'characters_daily_events',
      sql`${t.diceUsed} >= 0 and ${t.diceBought} >= 0 and ${t.twentyMinCount} >= 0`,
    ),
    check('characters_battle_coins', sql`${t.battleCoins} >= 0`),
    check('characters_pet_slots', sql`${t.petSlots} between 1 and 5`),
    check('characters_active_set', sql`${t.activeSet} between 1 and 5`),
    // Rankings (decision 13), ties to the older ninja. `desc().nullsFirst()` matches a plain
    // `order by ... desc`, so the index serves it.
    index('characters_level_rank_idx').on(
      t.level.desc().nullsFirst(),
      t.exp.desc().nullsFirst(),
      t.createdAt,
      t.id,
    ),
    index('characters_stone_rank_idx').on(t.stone.desc().nullsFirst(), t.createdAt, t.id),
  ],
)

// Where an inventory item is: in the bag (or equipped), listed on the Market, or waiting in the
// Market warehouse, or stored in the Wardrobe (outfits). Bag queries must filter `location = 'bag'`.
export const itemLocation = pgEnum('item_location', ['bag', 'market', 'warehouse', 'wardrobe'])

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
    // Reborn equipment set (1-5) the row is worn in; read only while equippedSlot is set. What the
    // character wears is the rows of characters.active_set (wornItemsWhere in game/bag.ts).
    equippedSet: smallint('equipped_set').notNull().default(1),
    createdAt: createdAt(),
    // Item instance state (docs/original-data/blacksmith.md). The defaults describe a plain
    // M2 item: not enhanced, appraised, no properties.
    // ConsolidateLevel (0-12 for gear, capped in code); wings and auras go to 30 (M6 decision 24).
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
    // Listed and warehoused Market items keep their row (and instance state) but leave the bag.
    location: itemLocation('location').notNull().default('bag'),
    // Reborn bag: tab (0-9) and top-left tile (0-59, row-major, 10 per row) of an unequipped
    // bag item. Null = not placed yet; placeBag (game/bag.ts) places such rows lazily.
    bagPage: smallint('bag_page'),
    bagSlot: smallint('bag_slot'),
    // A locked item cannot be sold or listed on the Market.
    locked: boolean('locked').notNull().default(false),
    // Reborn's Wardrobe: slot 0-19 (4 pages of 5) of an outfit stored there, else null.
    wardrobeSlot: smallint('wardrobe_slot'),
    // Gem sockets (HoleCount, max 3): gem item id per socket, null = open (migration 0047).
    gems: jsonb('gems').$type<(string | null)[]>().notNull().default([]),
    // The Enchanting Stone (MagicItem id) applied to this gear, else null (migration 0047).
    enchantItemId: text('enchant_item_id'),
  },
  (t) => [
    index('inventory_items_character_id_idx').on(t.characterId),
    check('inventory_items_wardrobe_slot', sql`${t.wardrobeSlot} between 0 and 19`),
    // A text comparison: the migration adds the enum value in the same transaction.
    check(
      'inventory_items_wardrobe_location',
      sql`(${t.wardrobeSlot} is null) = (${t.location}::text <> 'wardrobe')`,
    ),
    uniqueIndex('inventory_items_wardrobe_slot_key')
      .on(t.characterId, t.wardrobeSlot)
      .where(sql`${t.wardrobeSlot} is not null`),
    check(
      'inventory_items_equipped_in_bag',
      sql`${t.equippedSlot} is null or ${t.location} = 'bag'`,
    ),
    uniqueIndex('inventory_items_equipped_set_slot_key')
      .on(t.characterId, t.equippedSet, t.equippedSlot)
      .where(sql`${t.equippedSlot} is not null`),
    check('inventory_items_equipped_set', sql`${t.equippedSet} between 1 and 5`),
    check('inventory_items_count', sql`${t.count} > 0`),
    check('inventory_items_enhance_level', sql`${t.enhanceLevel} between 0 and 30`),
    check('inventory_items_inscribe_level', sql`${t.inscribeLevel} between 0 and 12`),
    check('inventory_items_durability', sql`${t.durability} >= 0`),
    check('inventory_items_identify_count', sql`${t.identifyCount} between 0 and 4`),
    check('inventory_items_identify_times', sql`${t.identifyTimes} >= 0`),
    check('inventory_items_props', jsonbArray(t.props, 4)),
    check('inventory_items_gems', jsonbArray(t.gems, 3)),
    check('inventory_items_engraved_slot', sql`${t.engravedSlot} between 0 and 3`),
    check('inventory_items_bag_page', sql`${t.bagPage} between 0 and 9`),
    check('inventory_items_bag_slot', sql`${t.bagSlot} between 0 and 59`),
    // Only unequipped bag rows have a position, and always both halves of it.
    check(
      'inventory_items_bag_position',
      sql`(${t.bagPage} is null and ${t.bagSlot} is null) or (${t.bagPage} is not null and ${t.bagSlot} is not null and ${t.location} = 'bag' and ${t.equippedSlot} is null)`,
    ),
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

// The explore search waiting for its card pick (OutSearchSystem OutSearchBonus): the five cards,
// which ones were peeked at, and what the search already paid out. One per character.
export const exploreSearches = pgTable(
  'explore_searches',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    searchId: uuid('search_id').notNull(),
    spotId: integer('spot_id').notNull(),
    // The scene a normal search started in (senior searches may be picked anywhere).
    sceneId: integer('scene_id').notNull(),
    mode: text('mode').$type<'normal' | 'senior'>().notNull(),
    cards: jsonb('cards').$type<unknown[]>().notNull(),
    // Card indexes revealed by paid peeks (LookCount).
    revealed: smallint('revealed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    peekCount: smallint('peek_count').notNull().default(0),
    star: jsonb('star').$type<{ level: number; progress: number }>().notNull(),
    starBonus: jsonb('star_bonus').$type<unknown>(),
    rewards: jsonb('rewards').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('explore_searches_mode', sql`${t.mode} in ('normal', 'senior')`),
    check('explore_searches_peek_count', sql`${t.peekCount} between 0 and 5`),
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
    // The team the run belongs to (one row per member); null = solo. Kept when the team ends,
    // so the members finish their own card flip.
    teamId: uuid('team_id').references((): AnyPgColumn => teams.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('toll_gate_runs_team_id_idx').on(t.teamId),
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
    // SGateType: 0 no run, 1 auto running, 2 manual (or auto paused with auto runs left).
    mode: smallint('mode').notNull().default(0),
    // SGateExpAdd: bonus EXP on top of the pot (the floor 150 broadcast shows pot + bonus).
    expBonus: bigint('exp_bonus', { mode: 'number' }).notNull().default(0),
    // SGateAutoLoop and SGateAutoMaxLoop: auto runs left and auto runs bought.
    autoRunsLeft: smallint('auto_runs_left').notNull().default(0),
    autoRunsBought: smallint('auto_runs_bought').notNull().default(0),
    // SGateAutoFloor: last floor auto mode aims for (MaxGate); SGateLastFloor: floor it reaches.
    autoEndFloor: smallint('auto_end_floor'),
    autoReachFloor: smallint('auto_reach_floor'),
    // SGateAutoTime: last auto tick; one floor per 30 s, caught up lazily (also offline).
    autoTickAt: timestamp('auto_tick_at', { withTimezone: true }),
    // SGateBroadcast: the floor 50 world message was sent once.
    floor50Broadcast: boolean('floor_50_broadcast').notNull().default(false),
  },
  (t) => [
    // Las Noches best floor ranking (gametop list 10).
    index('single_gate_best_floor_rank_idx').on(t.bestFloor.desc().nullsFirst(), t.characterId),
    check('single_gate_best_floor', sql`${t.bestFloor} between 0 and 170`),
    check('single_gate_current_floor', sql`${t.currentFloor} between 1 and 170`),
    check(
      'single_gate_amounts',
      sql`${t.potExp} >= 0 and ${t.lives} >= 0 and ${t.livesBought} between 0 and 999 and ${t.runsToday} >= 0`,
    ),
    check(
      'single_gate_auto',
      sql`${t.mode} between 0 and 2 and ${t.expBonus} >= 0 and ${t.autoRunsLeft} between 0 and ${t.autoRunsBought} and ${t.autoRunsBought} between 0 and 3 and ${t.autoEndFloor} between 1 and 170 and ${t.autoReachFloor} between 1 and 170`,
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

// Social (docs/original-data/friends-mail.md). Everything is keyed by character id, not by name.

// FriendRecord: one-sided rows; both directions present = mutual.
export const friends = pgTable(
  'friends',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    friendId: uuid('friend_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // FriendRecord col 7 (intimacy): true = home friend (mutual, used by homes in M6).
    homeFriend: boolean('home_friend').notNull().default(false),
    // Common_AddFriendPrompt: the friend has not answered the add-back prompt for this row yet
    // (shown at their next login when they were offline). One per pair by the primary key.
    addBackPending: boolean('add_back_pending').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.friendId] }),
    // "Who lists me": add-back prompts, the mutual flag and presence pushes.
    index('friends_friend_id_idx').on(t.friendId),
    check('friends_not_self', sql`${t.ownerId} <> ${t.friendId}`),
  ],
)

// The Blocked list (decision 17; replaces the original EnemyRecord "block mail" flag).
export const blocks = pgTable(
  'blocks',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.blockedId] }),
    index('blocks_blocked_id_idx').on(t.blockedId),
    check('blocks_not_self', sql`${t.ownerId} <> ${t.blockedId}`),
  ],
)

// Mail categories (Mail window tabs, UI_MailFrame._mailTypeAry) used in M4. Original types:
// 2 player, 8 arena, 10 market, 4 interaction (friend notices), 9 Las Noches, 1 other.
// Every category but `player` is system mail. Add values with ALTER TYPE when a system needs one.
export const mailCategory = pgEnum('mail_category', [
  'player',
  'arena',
  'market',
  'interaction',
  'las_noches',
  'other',
])

/** Params of a system mail template: names, item ids, amounts (rendered by the client). */
export type MailParams = Record<string, string | number>

// MailRecord. Player mail: subject + body (plain text). System mail: templateKey + params
// (SendSystemHintMail without the `\b` encoding). No attachments (decision 3).
export const mails = pgTable(
  'mails',
  {
    id: id(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // SendUid; null for system mail (and set to null when the sender is gone).
    senderId: uuid('sender_id').references(() => characters.id, { onDelete: 'set null' }),
    category: mailCategory('category').notNull(),
    // PlayerMailMaxTitleWord 20, PlayerMailMaxTextWord 200.
    subject: text('subject'),
    body: text('body'),
    templateKey: text('template_key'),
    params: jsonb('params').$type<MailParams>(),
    // State: 0 unread / 1 read.
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
    // 7 days for player mail, 30 days for system mail (decision 18); purged by a job.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // Inbox list with the expiry filter.
    index('mails_recipient_expires_idx').on(t.recipientId, t.expiresAt),
    // Per-category list and the inbox caps (count, oldest first).
    index('mails_recipient_category_idx').on(t.recipientId, t.category, t.createdAt),
    // Purge job.
    index('mails_expires_at_idx').on(t.expiresAt),
    // Per-sender rate limits.
    index('mails_sender_created_idx').on(t.senderId, t.createdAt),
    check(
      'mails_kind',
      sql`case when ${t.category} = 'player'
        then ${t.subject} is not null and ${t.body} is not null and ${t.templateKey} is null and ${t.params} is null
        else ${t.senderId} is null and ${t.subject} is null and ${t.body} is null and ${t.templateKey} is not null and ${t.params} is not null end`,
    ),
    check(
      'mails_lengths',
      sql`char_length(${t.subject}) between 1 and 20 and char_length(${t.body}) between 1 and 200 and char_length(${t.templateKey}) between 1 and 100`,
    ),
    check('mails_params', sql`jsonb_typeof(${t.params}) = 'object'`),
    check('mails_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)

export const reportKind = pgEnum('report_kind', ['whisper', 'mail', 'chat'])

// Player reports (decision 19), read by the M6 admin view. The text is a copy, so a report
// outlives the mail's deletion or expiry.
export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    reportedId: uuid('reported_id').references(() => characters.id, { onDelete: 'set null' }),
    kind: reportKind('kind').notNull(),
    mailId: uuid('mail_id').references(() => mails.id, { onDelete: 'set null' }),
    // Chat channel of a reported chat line (world, scene, team, trade); null for whispers and mail.
    channel: text('channel'),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_reported_id_idx').on(t.reportedId),
    index('reports_created_at_idx').on(t.createdAt),
    // One report per mail and reporter.
    uniqueIndex('reports_reporter_mail_key')
      .on(t.reporterId, t.mailId)
      .where(sql`${t.mailId} is not null`),
    check('reports_text', sql`char_length(${t.text}) between 1 and 1000`),
  ],
)

// Teams (docs/original-data/teams.md): one server-side row instead of the per-member TeamRec
// copies. Lock the team row (FOR UPDATE) after the characters for every change.
export const teams = pgTable(
  'teams',
  {
    id: id(),
    // TeamRec c1 = 1. The captain also has a team_members row.
    captainId: uuid('captain_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // The scene every member must be in (13 neutral fields 26xx-28xx or the lobby 3102).
    sceneId: integer('scene_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('teams_captain_id_key').on(t.captainId)],
)

// TeamRec rows: 2-3 per team (TEAM_PLAYERMAX 3, TEAM_MINCOUNT 2); one team per character.
export const teamMembers = pgTable(
  'team_members',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    // TeamRec c2: fight order 0-2 (TEAM_FIGHTFIRST..THIRD). Not unique per team, so a swap can
    // be two plain updates; the team row lock keeps it consistent.
    fightOrder: smallint('fight_order').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Disconnected since (decision 15: 60 s grace, then the member leaves); null = online.
    offlineSince: timestamp('offline_since', { withTimezone: true }),
  },
  (t) => [
    index('team_members_team_id_idx').on(t.teamId),
    check('team_members_fight_order', sql`${t.fightOrder} between 0 and 2`),
  ],
)

export const teamPromptKind = pgEnum('team_prompt_kind', ['invite', 'apply'])

// Invite (MSGBOX_REQUEST_TEAM) and application (MSGBOX_ASKJOIN_TEAM) prompts: one pending per
// sender and target, 60 s expiry, re-validated on accept.
export const teamPrompts = pgTable(
  'team_prompts',
  {
    id: id(),
    kind: teamPromptKind('kind').notNull(),
    fromId: uuid('from_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    toId: uuid('to_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // The team joined on accept; null for an invite from a solo player (the team is created
    // on accept, RequestJoinTeamSuccess).
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('team_prompts_pair_key').on(t.fromId, t.toId),
    index('team_prompts_to_id_idx').on(t.toId),
    index('team_prompts_team_id_idx').on(t.teamId),
    check('team_prompts_not_self', sql`${t.fromId} <> ${t.toId}`),
    check('team_prompts_apply_team', sql`${t.kind} = 'invite' or ${t.teamId} is not null`),
    check('team_prompts_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)

// Team stone boards (ReadyTeamRec, RequestTeamRec) per neutral field: a captain of 2 publishing
// the team (teamId set) or a solo ninja publishing themself (teamId null). One row per ninja.
export const teamBoardEntries = pgTable(
  'team_board_entries',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    sceneId: integer('scene_id').notNull(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('team_board_entries_scene_idx').on(t.sceneId, t.createdAt),
    index('team_board_entries_team_id_idx').on(t.teamId),
  ],
)

// Market (docs/original-data/trade-market.md, MartSystem + MartServer).

// A listing (SaleItemRec / the domain category row). The listed inventory_items row keeps the
// seller as owner with location 'market'; its `count` is the count left (partial purchases split
// it). Lock order: characters by id, then the listing.
export const marketListings = pgTable(
  'market_listings',
  {
    id: id(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    // MartType category path, plus `_<quality>` for equipment (GetDomainRec).
    category: text('category').notNull(),
    // Per-unit prices; null = not offered in that currency; each <= 1,000,000.
    priceStone: integer('price_stone'),
    priceGold: integer('price_gold'),
    // Duration (8, 12 or 24 h) and the Stone fee paid for it (GetCharge, not refunded).
    hours: smallint('hours').notNull(),
    fee: integer('fee').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('market_listings_inventory_item_id_key').on(t.inventoryItemId),
    // Browse a category (live rows only) and the expiry sweep.
    index('market_listings_category_idx').on(t.category, t.expiresAt),
    index('market_listings_expires_at_idx').on(t.expiresAt),
    index('market_listings_seller_id_idx').on(t.sellerId),
    check(
      'market_listings_prices',
      sql`(${t.priceStone} is not null or ${t.priceGold} is not null) and ${t.priceStone} between 1 and 1000000 and ${t.priceGold} between 1 and 1000000`,
    ),
    check('market_listings_hours', sql`${t.hours} in (8, 12, 24)`),
    check('market_listings_fee', sql`${t.fee} >= 0`),
    check('market_listings_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)

// MartDepotRec: the 15-row Market warehouse. The item row has location 'warehouse' and is owned
// by the warehouse owner; claiming moves it to the bag and deletes this row.
export const marketWarehouse = pgTable(
  'market_warehouse',
  {
    inventoryItemId: uuid('inventory_item_id')
      .primaryKey()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // Source (Common_MarcketDepotFrom): 0 bought, 1 own listing returned (expired or cancelled).
    source: smallint('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('market_warehouse_owner_idx').on(t.ownerId, t.createdAt),
    check('market_warehouse_source', sql`${t.source} in (0, 1)`),
  ],
)

export const marketAction = pgEnum('market_action', [
  'list',
  'buy',
  'cancel',
  'expire',
  'claim_item',
  'claim_wallet',
])

// Audit trail of every Market move (the original player logs 100-111). No foreign keys on the
// listing and item ids: the trail outlives them.
export const marketAudit = pgTable(
  'market_audit',
  {
    id: id(),
    action: marketAction('action').notNull(),
    // The acting ninja (seller on list/cancel/expire, buyer on buy, owner on claims).
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    // The seller on a buy.
    counterpartyId: uuid('counterparty_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    listingId: uuid('listing_id'),
    inventoryItemId: uuid('inventory_item_id'),
    itemId: text('item_id'),
    count: integer('count'),
    // Amounts moved: the buyer's payment, the seller's payout (after tax) and the claimed wallet.
    stone: bigint('stone', { mode: 'number' }).notNull().default(0),
    gold: bigint('gold', { mode: 'number' }).notNull().default(0),
    // 10% tax kept by the server on a buy; listing fee on a list.
    taxStone: bigint('tax_stone', { mode: 'number' }).notNull().default(0),
    taxGold: bigint('tax_gold', { mode: 'number' }).notNull().default(0),
    fee: bigint('fee', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('market_audit_character_idx').on(t.characterId, t.createdAt),
    index('market_audit_counterparty_idx').on(t.counterpartyId, t.createdAt),
    check(
      'market_audit_amounts',
      sql`${t.count} > 0 and ${t.stone} >= 0 and ${t.gold} >= 0 and ${t.taxStone} >= 0 and ${t.taxGold} >= 0 and ${t.fee} >= 0`,
    ),
  ],
)

// Arena (docs/original-data/pvp-rankings.md, CompeteSystem + CompeteServer). Honor lives in
// characters.honor. One row per ninja once they opened the arena.

/** The defence snapshot: the fighter built by the live fight code (decision 9). */
export type ArenaSnapshot = Record<string, unknown>

export const arenaPlayers = pgTable(
  'arena_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // Tier 0-21 (competerank.ini); never goes down.
    tier: smallint('tier').notNull().default(0),
    // CompeteScore (raw, initscore 93500; shown / 100).
    score: integer('score').notNull().default(93500),
    // When the score last changed: the one tie rule (decision 12), earlier holder ranks higher.
    scoreAt: timestamp('score_at', { withTimezone: true }).notNull().defaultNow(),
    // m_LastWin (current streak), total fights and wins (defences count) for the win rate.
    streak: integer('streak').notNull().default(0),
    fights: integer('fights').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    // Daily counters on the UTC day `day` (TestCompeteTime): free tries used (competemaxcount 20),
    // tries bought (competemaxcountGold 15) and Ninjutsu Duels (competefriendfightcount 10).
    day: date('day'),
    triesUsed: smallint('tries_used').notNull().default(0),
    triesBought: smallint('tries_bought').notNull().default(0),
    duelsUsed: smallint('duels_used').notNull().default(0),
    // Last free list refresh (refurbishtime 3600 s, at most one stored).
    freeRefreshAt: timestamp('free_refresh_at', { withTimezone: true }),
    // Defence snapshot and when it was built (refreshed on every gear, level or skill change).
    snapshot: jsonb('snapshot').$type<ArenaSnapshot>(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }),
  },
  (t) => [
    // The arena order (World Rank and the opponent windows): tier, score, tie rule.
    index('arena_players_rank_idx').on(
      t.tier.desc().nullsFirst(),
      t.score.desc().nullsFirst(),
      t.scoreAt,
      t.characterId,
    ),
    // Win streak list (tier 2+).
    index('arena_players_streak_idx').on(t.streak.desc().nullsFirst(), t.characterId),
    check('arena_players_tier', sql`${t.tier} between 0 and 21`),
    check(
      'arena_players_counts',
      sql`${t.score} >= 0 and ${t.streak} >= 0 and ${t.fights} >= 0 and ${t.wins} between 0 and ${t.fights}`,
    ),
    check(
      'arena_players_daily',
      sql`${t.triesUsed} >= 0 and ${t.triesBought} between 0 and 15 and ${t.duelsUsed} >= 0`,
    ),
    check('arena_players_snapshot', sql`jsonb_typeof(${t.snapshot}) = 'object'`),
  ],
)

export const arenaOpponentKind = pgEnum('arena_opponent_kind', ['npc', 'player', 'referee'])

// CompeteClient: the 18 opponent slots (3 rows of 6). Replaced as a whole on a list refresh.
export const arenaOpponents = pgTable(
  'arena_opponents',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    slot: smallint('slot').notNull(),
    kind: arenaOpponentKind('kind').notNull(),
    // competenpc NPC id (npc), the opponent ninja (player) or the Referee's place (-10..-1).
    npcId: text('npc_id'),
    opponentId: uuid('opponent_id').references(() => characters.id, { onDelete: 'cascade' }),
    refereePlace: smallint('referee_place'),
    // CompeteClient column 12: each slot can be beaten once.
    beaten: boolean('beaten').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.slot] }),
    index('arena_opponents_opponent_id_idx').on(t.opponentId),
    check('arena_opponents_slot', sql`${t.slot} between 0 and 17`),
    check(
      'arena_opponents_kind',
      sql`case ${t.kind}
        when 'npc' then ${t.npcId} is not null and ${t.opponentId} is null and ${t.refereePlace} is null
        when 'player' then ${t.npcId} is null and ${t.opponentId} is not null and ${t.refereePlace} is null
        else ${t.npcId} is null and ${t.opponentId} is null and ${t.refereePlace} between -10 and -1 end`,
    ),
  ],
)

// CompeteFight types: 1 attack, 2 revenge, 3 boss, 4 was attacked; duels (CompeteFriendFight)
// share the log as duel / duel_defense.
export const arenaLogKind = pgEnum('arena_log_kind', [
  'attack',
  'revenge',
  'boss',
  'defense',
  'duel',
  'duel_defense',
])

// The fight log (savaselffightcount 15 per ninja; trimmed by the arena code) with replays.
export const arenaLogs = pgTable(
  'arena_logs',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    kind: arenaLogKind('kind').notNull(),
    // The other side: a ninja (null once deleted) or an NPC / Referee by id.
    opponentId: uuid('opponent_id').references(() => characters.id, { onDelete: 'set null' }),
    opponentNpcId: text('opponent_npc_id'),
    // Name shown in the log (kept when the opponent is gone).
    opponentName: text('opponent_name').notNull(),
    // From this ninja's side: 0 loss, 1 win, 2 draw.
    result: smallint('result').notNull(),
    scoreDelta: integer('score_delta').notNull().default(0),
    honor: integer('honor').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    replay: jsonb('replay').$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('arena_logs_character_idx').on(t.characterId, t.createdAt),
    index('arena_logs_opponent_id_idx').on(t.opponentId),
    check('arena_logs_result', sql`${t.result} between 0 and 2`),
    check('arena_logs_honor', sql`${t.honor} >= 0 and ${t.streak} >= 0`),
  ],
)

// Revenges used per target on the UTC day `day` (CanBackAtk: first free, then 10 Gold × used).
export const arenaRevenges = pgTable(
  'arena_revenges',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    used: smallint('used').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.targetId] }),
    index('arena_revenges_target_id_idx').on(t.targetId),
    check('arena_revenges_used', sql`${t.used} >= 0`),
  ],
)

// Weekly toll gate ranking (pvp-rankings.md 7, toll-gates.md 3.1): best progress per ninja,
// gate and week (the UTC Monday it starts, decision 14). Top 50 by schedule, ties to the
// earlier time.
export const tollGateWeekly = pgTable(
  'toll_gate_weekly',
  {
    // TollGate.ini section with IsExistsRank=1 (100001-100008).
    gateId: integer('gate_id').notNull(),
    week: date('week').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // Progress % (schedule, 0-100) and when it was reached.
    schedule: smallint('schedule').notNull(),
    reachedAt: timestamp('reached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gateId, t.week, t.characterId] }),
    index('toll_gate_weekly_rank_idx').on(
      t.gateId,
      t.week,
      t.schedule.desc().nullsFirst(),
      t.reachedAt,
      t.characterId,
    ),
    index('toll_gate_weekly_character_idx').on(t.characterId, t.week),
    check('toll_gate_weekly_schedule', sql`${t.schedule} between 0 and 100`),
  ],
)

// Rewards claimed for a past week's place (once per ninja, gate and week).
export const tollGateWeeklyClaims = pgTable(
  'toll_gate_weekly_claims',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    gateId: integer('gate_id').notNull(),
    week: date('week').notNull(),
    // The place paid (1-50), for support questions.
    place: smallint('place').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.gateId, t.week] }),
    check('toll_gate_weekly_claims_place', sql`${t.place} between 1 and 50`),
  ],
)

/** Paid treasure cards survive reconnects; a character may have only one pending box. */
export const characterTreasures = pgTable(
  'character_treasures',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    boxId: text('box_id').notNull(),
    cards: jsonb('cards').$type<string[]>().notNull(),
  },
  (t) => [
    uniqueIndex('character_treasures_character_key').on(t.characterId),
    check(
      'character_treasures_cards',
      sql`jsonb_typeof(${t.cards}) = 'array' and jsonb_array_length(${t.cards}) = 5`,
    ),
  ],
)

/** Original server-wide jackpot limits (TreasureRole.Value). */
export const treasureJackpots = pgTable(
  'treasure_jackpots',
  {
    itemId: text('item_id').primaryKey(),
    claimed: integer('claimed').notNull().default(0),
  },
  (t) => [check('treasure_jackpots_claimed', sql`${t.claimed} >= 0`)],
)

export const characterBuffs = pgTable(
  'character_buffs',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    buffId: integer('buff_id').notNull(),
    group: integer('replacement_group').notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.buffId] }),
    uniqueIndex('character_buffs_group_key').on(t.characterId, t.group),
    check('character_buffs_source', sql`${t.source} in ('food', 'title')`),
  ],
)

export const characterTitles = pgTable(
  'character_titles',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    titleId: integer('title_id').notNull(),
    active: boolean('active').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.titleId] }),
    uniqueIndex('character_titles_active_key')
      .on(t.characterId)
      .where(sql`${t.active} = true`),
  ],
)

export const characterSkills = pgTable(
  'character_skills',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id').notNull(),
    level: smallint('skill_level').notNull().default(1),
    // 7-day scroll skills (decision 18) end here; null = permanent. Expired rows are ignored by
    // fights and deleted lazily.
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.skillId] }),
    check('character_skills_level', sql`${t.level} between 1 and 13`),
  ],
)

export const characterSkillState = pgTable(
  'character_skill_state',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    learnedThrough: smallint('learned_through').notNull().default(1),
    activeTree: smallint('active_tree').notNull().default(0),
    freeResets: integer('free_resets').notNull().default(0),
  },
  (t) => [
    check('character_skill_state_level', sql`${t.learnedThrough} between 1 and 90`),
    check('character_skill_state_tree', sql`${t.activeTree} between 0 and 4`),
    check('character_skill_state_resets', sql`${t.freeResets} >= 0`),
  ],
)

export const characterSkillSlots = pgTable(
  'character_skill_slots',
  {
    characterId: uuid('character_id').notNull(),
    tree: smallint('tree').notNull(),
    slot: smallint('slot').notNull(),
    skillId: integer('skill_id').notNull(),
    level: smallint('use_level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.tree, t.slot] }),
    uniqueIndex('character_skill_slots_skill_key').on(t.characterId, t.tree, t.skillId),
    foreignKey({
      columns: [t.characterId, t.skillId],
      foreignColumns: [characterSkills.characterId, characterSkills.skillId],
    }).onDelete('cascade'),
    check('character_skill_slots_tree', sql`${t.tree} between 0 and 4`),
    check('character_skill_slots_slot', sql`${t.slot} between 0 and 5`),
    check('character_skill_slots_level', sql`${t.level} between 1 and 13`),
  ],
)

// M5 Reborn Update (.claude/plans/m5-reborn-update.plan.md). Lock order as everywhere: the
// character row first, then feature rows by key.

// Talents (decision 6-8). A row exists once a talent got EXP or was touched. "Active" is a slot
// 0-2, so the unique index caps active talents at 3 per ninja.
export const characterTalents = pgTable(
  'character_talents',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    talentId: smallint('talent_id').notNull(),
    // Capped by max(0, level - 50) in the feature code; 60 is serverConfig's last expNeeded row.
    level: smallint('level').notNull().default(0),
    exp: integer('exp').notNull().default(0),
    activeSlot: smallint('active_slot'),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.talentId] }),
    uniqueIndex('character_talents_active_key')
      .on(t.characterId, t.activeSlot)
      .where(sql`${t.activeSlot} is not null`),
    check('character_talents_id', sql`${t.talentId} between 1 and 8`),
    check('character_talents_level', sql`${t.level} between 0 and 60 and ${t.exp} >= 0`),
    check(
      'character_talents_active',
      sql`${t.activeSlot} is null or (${t.activeSlot} between 0 and 2 and ${t.level} >= 1)`,
    ),
  ],
)

// Bloodline limits (decision 11-14): a row per limit the ninja has handed items in for. Active
// is a slot 0-2 (at most 3 active, unlocked limits only).
export const characterBloodlines = pgTable(
  'character_bloodlines',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    limitId: smallint('limit_id').notNull(),
    // +30 per turn-in; unlocked once it reaches the limit's target.
    amity: integer('amity').notNull().default(0),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    activeSlot: smallint('active_slot'),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.limitId] }),
    uniqueIndex('character_bloodlines_active_key')
      .on(t.characterId, t.activeSlot)
      .where(sql`${t.activeSlot} is not null`),
    check('character_bloodlines_id', sql`${t.limitId} between 1 and 44`),
    check('character_bloodlines_amity', sql`${t.amity} >= 0`),
    check(
      'character_bloodlines_active',
      sql`${t.activeSlot} is null or (${t.activeSlot} between 0 and 2 and ${t.unlockedAt} is not null)`,
    ),
  ],
)

/** The soul inventory size (decision 15), enforced by the `character_souls_cap` trigger (0023). */
export const SOUL_INVENTORY_MAX = 250

// Bloodline souls (decision 15). A soul is loose (limit and socket null) or socketed in one of
// the 5 sockets of an owned limit, at most one soul of each type per limit.
export const characterSouls = pgTable(
  'character_souls',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    type: smallint('type').notNull(),
    level: smallint('level').notNull().default(1),
    limitId: smallint('limit_id'),
    socket: smallint('socket'),
    createdAt: createdAt(),
  },
  (t) => [
    index('character_souls_character_idx').on(t.characterId, t.level),
    foreignKey({
      columns: [t.characterId, t.limitId],
      foreignColumns: [characterBloodlines.characterId, characterBloodlines.limitId],
    }),
    uniqueIndex('character_souls_socket_key')
      .on(t.characterId, t.limitId, t.socket)
      .where(sql`${t.limitId} is not null`),
    uniqueIndex('character_souls_type_key')
      .on(t.characterId, t.limitId, t.type)
      .where(sql`${t.limitId} is not null`),
    check('character_souls_type', sql`${t.type} between 1 and 13`),
    check('character_souls_level', sql`${t.level} between 1 and 10`),
    check(
      'character_souls_socket',
      sql`(${t.limitId} is null) = (${t.socket} is null) and ${t.socket} between 0 and 4`,
    ),
  ],
)

// Prayer on a limit (decision 16): attribute 1 Str, 2 Agi, 3 Sta; switching it resets level and
// progress. The bonus (8 x level Reborn points) is computed, not stored.
export const characterBloodlinePrayer = pgTable(
  'character_bloodline_prayer',
  {
    characterId: uuid('character_id').notNull(),
    limitId: smallint('limit_id').notNull(),
    attribute: smallint('attribute').notNull(),
    level: smallint('level').notNull().default(0),
    // Points toward the next level (5000 x 2^level).
    progress: integer('progress').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.limitId] }),
    foreignKey({
      columns: [t.characterId, t.limitId],
      foreignColumns: [characterBloodlines.characterId, characterBloodlines.limitId],
    }).onDelete('cascade'),
    check('character_bloodline_prayer_attribute', sql`${t.attribute} between 1 and 3`),
    check(
      'character_bloodline_prayer_level',
      sql`${t.level} between 0 and 9 and ${t.progress} >= 0`,
    ),
  ],
)

// Daily Login (decision 24): a 7-day cycle that advances only on a claimed day, plus the daily
// bonus. `claimDay`/`bonusDay` are the UTC days last claimed.
export const characterDailyLogin = pgTable(
  'character_daily_login',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    completedDays: integer('completed_days').notNull().default(0),
    claimDay: date('claim_day'),
    bonusDay: date('bonus_day'),
  },
  (t) => [check('character_daily_login_days', sql`${t.completedDays} >= 0`)],
)

/** Weekly activity counters, keyed by activity (decision 24). */
export type WeeklyCounters = Record<string, number>

// Weekly Rewards (decision 24) for the week starting `week` (UTC Monday). A new week is a new
// row; old rows can be pruned.
export const characterWeeklyRewards = pgTable(
  'character_weekly_rewards',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    week: date('week').notNull(),
    counters: jsonb('counters').$type<WeeklyCounters>().notNull().default({}),
    // Point milestones claimed (50, 100, 200) and weekday rewards claimed (1 Monday - 7 Sunday).
    claimedMilestones: smallint('claimed_milestones')
      .array()
      .notNull()
      .default(sql`'{}'`),
    claimedWeekdays: smallint('claimed_weekdays')
      .array()
      .notNull()
      .default(sql`'{}'`),
    // The bonus after all 7 weekday rewards.
    bonusClaimed: boolean('bonus_claimed').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.week] }),
    check('character_weekly_rewards_counters', sql`jsonb_typeof(${t.counters}) = 'object'`),
    check(
      'character_weekly_rewards_claims',
      sql`${t.claimedMilestones} <@ '{50,100,200}'::smallint[] and ${t.claimedWeekdays} <@ '{1,2,3,4,5,6,7}'::smallint[]`,
    ),
  ],
)

// Tailed Beast (decision 27). Rows are keyed by `week` (UTC Monday), so the weekly reset is a
// new key. The pool row is the shared HP: one locked update per fight.
export const tailedBeastPools = pgTable(
  'tailed_beast_pools',
  {
    week: date('week').notNull(),
    beast: smallint('beast').notNull(),
    // 0 normal, 1 hard, 2 rampage.
    mode: smallint('mode').notNull(),
    hpLeft: bigint('hp_left', { mode: 'number' }).notNull(),
    // The ninja who dealt the last hit.
    killedBy: uuid('killed_by').references(() => characters.id, { onDelete: 'set null' }),
    killedAt: timestamp('killed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.beast, t.mode] }),
    index('tailed_beast_pools_killed_by_idx').on(t.killedBy),
    check(
      'tailed_beast_pools_beast',
      sql`${t.beast} between 1 and 9 and ${t.mode} between 0 and 2`,
    ),
    check('tailed_beast_pools_hp', sql`${t.hpLeft} >= 0`),
  ],
)

export const tailedBeastPlayers = pgTable(
  'tailed_beast_players',
  {
    week: date('week').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // The ninja's nation when the week's first fight was recorded (village Honor).
    village: smallint('village').notNull(),
    honor: bigint('honor', { mode: 'number' }).notNull().default(0),
    // Spent in the Essence shop; Essence gained = Honor gained.
    essence: bigint('essence', { mode: 'number' }).notNull().default(0),
    fights: integer('fights').notNull().default(0),
    // Free tickets used on the UTC day `ticketDay` (10 a day; a fight costs 1, 3 or 5).
    ticketDay: date('ticket_day'),
    ticketsUsed: smallint('tickets_used').notNull().default(0),
    // Fight-count boxes claimed (5, 10, 20).
    boxesClaimed: smallint('boxes_claimed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    // Level 10 Stone Bags bought from the Essence shop this week (limit 5).
    stoneBagsBought: smallint('stone_bags_bought').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.characterId] }),
    index('tailed_beast_players_honor_idx').on(t.week, t.honor.desc().nullsFirst(), t.characterId),
    index('tailed_beast_players_village_idx').on(
      t.week,
      t.village,
      t.honor.desc().nullsFirst(),
      t.characterId,
    ),
    index('tailed_beast_players_character_idx').on(t.characterId),
    check('tailed_beast_players_village', sql`${t.village} between 0 and 4`),
    check(
      'tailed_beast_players_amounts',
      sql`${t.honor} >= 0 and ${t.essence} >= 0 and ${t.fights} >= 0 and ${t.ticketsUsed} >= 0`,
    ),
    check('tailed_beast_players_boxes', sql`${t.boxesClaimed} <@ '{5,10,20}'::smallint[]`),
  ],
)

// The weekly Kage per village (top Honor) and whether the Kage reward was picked.
export const tailedBeastKages = pgTable(
  'tailed_beast_kages',
  {
    week: date('week').notNull(),
    village: smallint('village').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // The picked reward item; null until claimed.
    claimedItemId: text('claimed_item_id'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.village] }),
    index('tailed_beast_kages_character_idx').on(t.characterId),
    check('tailed_beast_kages_village', sql`${t.village} between 0 and 4`),
    check('tailed_beast_kages_claim', sql`(${t.claimedItemId} is null) = (${t.claimedAt} is null)`),
  ],
)

// Team Stone (decision 28): ranked 3v3. Score resets on the 1st of the month (`month`), the
// weekly Battle Coin pay needs `playedThisWeek` for the week starting `week`.
export const teamStonePlayers = pgTable(
  'team_stone_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    score: integer('score').notNull().default(0),
    // Attempts used on the UTC day `attemptsDay` (25 a day, spent when a fight starts).
    attemptsDay: date('attempts_day'),
    attemptsUsed: smallint('attempts_used').notNull().default(0),
    week: date('week'),
    playedThisWeek: boolean('played_this_week').notNull().default(false),
    // The last week paid, so a week split by the month change is never paid twice.
    paidWeek: date('paid_week'),
    // First day of the UTC month the score belongs to.
    month: date('month'),
  },
  (t) => [
    index('team_stone_players_rank_idx').on(t.score.desc().nullsFirst(), t.characterId),
    check('team_stone_players_counts', sql`${t.score} >= 0 and ${t.attemptsUsed} >= 0`),
  ],
)

// A finished (or running) 3v3 match: the character ids of both sides in fight order; bot slots
// hold the id of the ninja whose arena snapshot fought.
export const teamStoneMatches = pgTable(
  'team_stone_matches',
  {
    id: id(),
    teamA: uuid('team_a').array().notNull(),
    teamB: uuid('team_b').array().notNull(),
    // 0 side A, 1 side B; null while running.
    winner: smallint('winner'),
    replay: jsonb('replay').$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('team_stone_matches_created_at_idx').on(t.createdAt),
    check(
      'team_stone_matches_teams',
      sql`cardinality(${t.teamA}) = 3 and cardinality(${t.teamB}) = 3`,
    ),
    check('team_stone_matches_winner', sql`${t.winner} in (0, 1)`),
  ],
)

// The matchmaking queue: one row per queued ninja. A pre-made team queues its members with the
// same `teamId`. `matchId` is set once matched (the ninja is held until the match ends).
export const teamStoneQueue = pgTable(
  'team_stone_queue',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    // Score and fighter power when queued (matching and the score rule).
    score: integer('score').notNull(),
    power: bigint('power', { mode: 'number' }).notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    matchId: uuid('match_id').references(() => teamStoneMatches.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('team_stone_queue_waiting_idx')
      .on(t.queuedAt)
      .where(sql`${t.matchId} is null`),
    index('team_stone_queue_team_id_idx').on(t.teamId),
    index('team_stone_queue_match_id_idx').on(t.matchId),
    check('team_stone_queue_amounts', sql`${t.score} >= 0 and ${t.power} >= 0`),
  ],
)

// Pets (M6 decisions 8-19).

/** One food slot of a pet (decision 13): `PetFeedLib` type 1-7, multiplier tier, food item fed. */
export interface PetFoodSlot {
  type: number
  mul: number
  item?: string
}

// A pet in a kennel slot. Props are the rolled bases (80-120%, decision 11); totals are computed.
// Appetite counts up to `HungerMax` 7200; food digests until `digestEndsAt`.
export const characterPets = pgTable(
  'character_pets',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // The pet item id (i3200xx or i340710).
    species: text('species').notNull(),
    // Null = the species name.
    name: text('name'),
    kennelSlot: smallint('kennel_slot').notNull(),
    active: boolean('active').notNull().default(false),
    level: smallint('level').notNull().default(1),
    exp: integer('exp').notNull().default(0),
    growth: smallint('growth').notNull(),
    baseAttack: integer('base_attack').notNull(),
    baseDefence: integer('base_defence').notNull(),
    baseDisturb: integer('base_disturb').notNull(),
    baseActive: integer('base_active').notNull(),
    baseSavvy: integer('base_savvy').notNull(),
    appetite: smallint('appetite').notNull().default(0),
    digestEndsAt: timestamp('digest_ends_at', { withTimezone: true }),
    foodSlots: jsonb('food_slots').$type<PetFoodSlot[]>().notNull().default([]),
    // Unlocked skill slots per kind (decision 14); a kind's slots are always 0..n-1.
    haloSlots: smallint('halo_slots').notNull().default(0),
    helpSlots: smallint('help_slots').notNull().default(0),
    passSlots: smallint('pass_slots').notNull().default(0),
    adoptedAt: timestamp('adopted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('character_pets_kennel_slot_key').on(t.characterId, t.kennelSlot),
    uniqueIndex('character_pets_active_key')
      .on(t.characterId)
      .where(sql`${t.active}`),
    check('character_pets_kennel_slot', sql`${t.kennelSlot} between 0 and 4`),
    check('character_pets_level', sql`${t.level} between 1 and 50`),
    check('character_pets_appetite', sql`${t.appetite} between 0 and 7200`),
    check(
      'character_pets_amounts',
      sql`${t.exp} >= 0 and ${t.growth} >= 0 and ${t.baseAttack} >= 0 and ${t.baseDefence} >= 0 and ${t.baseDisturb} >= 0 and ${t.baseActive} >= 0 and ${t.baseSavvy} >= 0`,
    ),
    check('character_pets_food_slots', jsonbArray(t.foodSlots, 6)),
    check(
      'character_pets_skill_slots',
      sql`${t.haloSlots} between 0 and 6 and ${t.helpSlots} between 0 and 6 and ${t.passSlots} between 0 and 6`,
    ),
  ],
)

// A pet's skills (decision 14): kind 1 Halo, 2 Help, 3 Pass. A slotted skill sits in slot 0-5 of
// its kind, so a kind holds at most 6. The learned list cap (`MaxSkillCount` 5, the oldest
// unlocked one is replaced) and the unlocked slot total (`PetSkillCnt`) are rules in game-core.
export const characterPetSkills = pgTable(
  'character_pet_skills',
  {
    petId: uuid('pet_id')
      .notNull()
      .references(() => characterPets.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id').notNull(),
    level: smallint('level').notNull().default(1),
    learnedOrder: integer('learned_order').notNull(),
    locked: boolean('locked').notNull().default(false),
    kind: smallint('kind').notNull(),
    slot: smallint('slot'),
  },
  (t) => [
    primaryKey({ columns: [t.petId, t.skillId] }),
    uniqueIndex('character_pet_skills_slot_key')
      .on(t.petId, t.kind, t.slot)
      .where(sql`${t.slot} is not null`),
    check('character_pet_skills_kind', sql`${t.kind} between 1 and 3`),
    check('character_pet_skills_slot', sql`${t.slot} between 0 and 5`),
    check('character_pet_skills_amounts', sql`${t.level} >= 1 and ${t.learnedOrder} >= 0`),
    check('character_pet_skills_skill', sql`${t.skillId} > 0`),
  ],
)

// Pet Tracing (decision 20): attempts used on the UTC day `day`, the day +10 attempts were
// bought, and the seeded board (the pet cell never leaves the server). Caps live in constants.
export const characterPetTracing = pgTable(
  'character_pet_tracing',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    day: date('day'),
    attemptsUsed: smallint('attempts_used').notNull().default(0),
    boughtDay: date('bought_day'),
    board: jsonb('board').$type<Record<string, unknown>>(),
    finds: integer('finds').notNull().default(0),
  },
  (t) => [
    check('character_pet_tracing_amounts', sql`${t.attemptsUsed} >= 0 and ${t.finds} >= 0`),
    check('character_pet_tracing_board', sql`jsonb_typeof(${t.board}) = 'object'`),
  ],
)

// Kennel shop purchases per UTC day (decision 21); daily limits live in constants.
export const characterKennelPurchases = pgTable(
  'character_kennel_purchases',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    itemId: text('item_id').notNull(),
    count: smallint('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.day, t.itemId] }),
    check('character_kennel_purchases_count', sql`${t.count} > 0`),
  ],
)

// Wing Collection (decision 25): each wing or aura item registers once; the item is kept.
export const characterWingCollection = pgTable(
  'character_wing_collection',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.itemId] })],
)

// Cards (decisions 27-30): card 1-74 stacks duplicates; each collection 1-10 pays its prize once.
export const characterCards = pgTable(
  'character_cards',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    cardId: smallint('card_id').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.cardId] }),
    check('character_cards_card', sql`${t.cardId} between 1 and 74`),
    check('character_cards_count', sql`${t.count} > 0`),
  ],
)

export const characterCardPrizes = pgTable(
  'character_card_prizes',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    collection: smallint('collection').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.collection] }),
    check('character_card_prizes_collection', sql`${t.collection} between 1 and 10`),
  ],
)

// Clans (Reborn's Clan window; shared/src/schemas/clans.ts). A disbanded clan keeps its row
// (`disbandedAt`) so "your first clan is free" still knows who founded one; its name is free again.
export const clanRole = pgEnum('clan_role', ['leader', 'vice', 'officer', 'member'])

export const clans = pgTable(
  'clans',
  {
    id: id(),
    name: text('name').notNull(),
    nameLower: text('name_lower')
      .notNull()
      .generatedAlwaysAs(sql`lower(name)`),
    founderId: uuid('founder_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    notice: text('notice').notNull().default(''),
    level: smallint('level').notNull().default(1),
    // Treasury: currencies members donated (clan storage "Donate Stones / Gold / Gift Certs").
    stone: currency('stone'),
    gold: currency('gold'),
    giftCoupon: currency('gift_coupon'),
    createdAt: createdAt(),
    disbandedAt: timestamp('disbanded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('clans_name_lower_key')
      .on(t.nameLower)
      .where(sql`${t.disbandedAt} is null`),
    index('clans_founder_id_idx').on(t.founderId),
    check('clans_name_format', sql`${t.name} ~ '^[A-Za-z0-9]{4,10}$'`),
    check('clans_notice_length', sql`char_length(${t.notice}) <= 120`),
    check('clans_level', sql`${t.level} >= 1`),
    check('clans_amounts', sql`${t.stone} >= 0 and ${t.gold} >= 0 and ${t.giftCoupon} >= 0`),
  ],
)

// One clan per ninja; one leader and at most one vice-leader per clan (the officer limit of 3
// is checked under the clan row lock).
export const clanMembers = pgTable(
  'clan_members',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    clanId: uuid('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    role: clanRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Contribution points from donations: `weeklyPoints` belong to the UTC Monday `week`.
    weeklyPoints: bigint('weekly_points', { mode: 'number' }).notNull().default(0),
    week: date('week'),
    totalPoints: bigint('total_points', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('clan_members_clan_id_idx').on(t.clanId),
    uniqueIndex('clan_members_leader_key')
      .on(t.clanId)
      .where(sql`${t.role} = 'leader'`),
    uniqueIndex('clan_members_vice_key')
      .on(t.clanId)
      .where(sql`${t.role} = 'vice'`),
    check('clan_members_points', sql`${t.weeklyPoints} >= 0 and ${t.totalPoints} >= 0`),
  ],
)

// Pending applications (Clan Browser "Apply"); accepting one drops the ninja's others.
export const clanApplications = pgTable(
  'clan_applications',
  {
    clanId: uuid('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.clanId, t.characterId] }),
    index('clan_applications_character_id_idx').on(t.characterId),
  ],
)

// Bankai (Reborn, level 30; game-core/src/bankai): the shared EXP pool, Bankai Coins, the active
// weapon, the stat swaps and the crystal inventory cells bought (8-79). Every Bankai change locks
// the character row first.
const BANKAI_WEAPON_LIST = sql.raw(`('zangetsu', 'senbonzakura', 'iceRing')`)
export const characterBankai = pgTable(
  'character_bankai',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    expPool: bigint('exp_pool', { mode: 'number' }).notNull().default(0),
    coins: bigint('coins', { mode: 'number' }).notNull().default(0),
    activeWeapon: text('active_weapon'),
    statSwaps: text('stat_swaps')
      .array()
      .notNull()
      .default(sql`'{}'`),
    unlockedSlots: smallint('unlocked_slots')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    check('character_bankai_amounts', sql`${t.expPool} >= 0 and ${t.coins} >= 0`),
    check('character_bankai_active_weapon', sql`${t.activeWeapon} in ${BANKAI_WEAPON_LIST}`),
  ],
)

// One row per unlocked Bankai weapon; levels stop at 15 (the end of Reborn's EXP table).
export const bankaiWeapons = pgTable(
  'bankai_weapons',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    weapon: text('weapon').notNull(),
    level: smallint('level').notNull().default(1),
    exp: integer('exp').notNull().default(0),
    form: smallint('form').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.weapon] }),
    check('bankai_weapons_weapon', sql`${t.weapon} in ${BANKAI_WEAPON_LIST}`),
    check(
      'bankai_weapons_values',
      sql`${t.level} between 1 and 15 and ${t.exp} >= 0 and ${t.form} between 1 and 3`,
    ),
  ],
)

// Crystals sit in a crystal inventory cell (0-79) or in a weapon's ring slot (0-7), never both.
export const bankaiCrystals = pgTable(
  'bankai_crystals',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    quality: text('quality').notNull(),
    stat: text('stat').notNull(),
    level: smallint('level').notNull().default(1),
    exp: integer('exp').notNull().default(0),
    inventorySlot: smallint('inventory_slot'),
    weapon: text('weapon'),
    ringSlot: smallint('ring_slot'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('bankai_crystals_inventory_key').on(t.characterId, t.inventorySlot),
    uniqueIndex('bankai_crystals_ring_key').on(t.characterId, t.weapon, t.ringSlot),
    check(
      'bankai_crystals_quality',
      sql`${t.quality} in ('green', 'blue', 'purple', 'gold', 'black', 'orange')`,
    ),
    check('bankai_crystals_values', sql`${t.level} between 1 and 20 and ${t.exp} >= 0`),
    check(
      'bankai_crystals_place',
      sql`(${t.inventorySlot} between 0 and 79 and ${t.weapon} is null and ${t.ringSlot} is null) or (${t.inventorySlot} is null and ${t.weapon} in ${BANKAI_WEAPON_LIST} and ${t.ringSlot} between 0 and 7)`,
    ),
  ],
)

// Scroll Dungeons: a ninja's attempts on the UTC day `attemptDay` and the pity per boss.
export const dungeonPlayers = pgTable(
  'dungeon_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    attemptDay: date('attempt_day'),
    attemptsUsed: smallint('attempts_used').notNull().default(0),
    // Wins without a scroll per boss index 0-10 (+0.5% each on its timed scrolls).
    pity: smallint('pity')
      .array()
      .notNull()
      .default(sql`'{0,0,0,0,0,0,0,0,0,0,0}'`),
  },
  (t) => [
    check('dungeon_players_values', sql`${t.attemptsUsed} >= 0 and cardinality(${t.pity}) = 11`),
  ],
)

// Zanpakuto: Spirit Coins, today's refines and bought spirit slots (slots 0-3 are free).
export const characterZanpakuto = pgTable(
  'character_zanpakuto',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    coins: bigint('coins', { mode: 'number' }).notNull().default(0),
    // Refines used on the UTC day `refineDay` (the first 3 a day are free).
    refineDay: date('refine_day'),
    refinesUsed: smallint('refines_used').notNull().default(0),
    unlockedSlots: smallint('unlocked_slots')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [check('character_zanpakuto_values', sql`${t.coins} >= 0 and ${t.refinesUsed} >= 0`)],
)

const ZANPAKUTO_TAB_LIST = sql.raw(`('sharp', 'blunt', 'fist')`)

// A crystal (item 480001-480086) sits in a spirit slot (0-15) or a weapon tab slot (0-5), never
// both. `stats` are Reborn's [stat id, raw value] pairs; `bulkOptions` the open Bulk Refine sets.
export const zanpakutoCrystals = pgTable(
  'zanpakuto_crystals',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: integer('item_id').notNull(),
    stats: jsonb('stats').$type<[number, number][]>().notNull(),
    bulkOptions: jsonb('bulk_options').$type<[number, number][][]>().notNull().default([]),
    spiritSlot: smallint('spirit_slot'),
    tab: text('tab'),
    tabSlot: smallint('tab_slot'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('zanpakuto_crystals_spirit_key').on(t.characterId, t.spiritSlot),
    uniqueIndex('zanpakuto_crystals_tab_key').on(t.characterId, t.tab, t.tabSlot),
    check(
      'zanpakuto_crystals_values',
      sql`${t.itemId} between 480001 and 480086 and jsonb_array_length(${t.stats}) between 1 and 3`,
    ),
    check(
      'zanpakuto_crystals_place',
      sql`(${t.spiritSlot} between 0 and 15 and ${t.tab} is null and ${t.tabSlot} is null) or (${t.spiritSlot} is null and ${t.tab} in ${ZANPAKUTO_TAB_LIST} and ${t.tabSlot} between 0 and 5)`,
    ),
  ],
)

// Impel Down: where the ninja stands (gate 0-5, floor 0-24, 25 = the intersection after floor 25),
// its best floors cleared over all gates (opens Zanpakuto weapon slots), and today's lost lives
// and refreshes (UTC days).
export const impelDownPlayers = pgTable(
  'impel_down_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    gate: smallint('gate').notNull().default(0),
    floor: smallint('floor').notNull().default(0),
    maxFloor: smallint('max_floor').notNull().default(0),
    livesDay: date('lives_day'),
    livesUsed: smallint('lives_used').notNull().default(0),
    refreshDay: date('refresh_day'),
    refreshes: smallint('refreshes').notNull().default(0),
  },
  (t) => [
    check(
      'impel_down_players_values',
      sql`${t.gate} between 0 and 5 and ${t.floor} between 0 and 25 and ${t.maxFloor} between 0 and 150 and ${t.livesUsed} between 0 and 3 and ${t.refreshes} between 0 and 5`,
    ),
  ],
)

// Tsunade Pub (Reborn's prize roulette): today's free spins (UTC day), bought and reward spins,
// total spins (bonus every 5th, legendary every 100th), the wheel and the unclaimed prizes.
export interface PubPrizeRow {
  itemId: string
  amount: number
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  bound?: boolean
  valhalla?: boolean
}
export const tsunadePub = pgTable(
  'tsunade_pub',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    freeDay: date('free_day'),
    freeUsed: smallint('free_used').notNull().default(0),
    rewardAttempts: integer('reward_attempts').notNull().default(0),
    paidAttempts: integer('paid_attempts').notNull().default(0),
    spins: integer('spins').notNull().default(0),
    board: jsonb('board').$type<PubPrizeRow[]>().notNull().default([]),
    won: jsonb('won').$type<PubPrizeRow[]>().notNull().default([]),
  },
  (t) => [
    check(
      'tsunade_pub_values',
      sql`${t.freeUsed} >= 0 and ${t.rewardAttempts} >= 0 and ${t.paidAttempts} >= 0 and ${t.spins} >= 0`,
    ),
  ],
)

// Konoha Boutique (Reborn's slot machine): coins, EXP (the level follows it), today's free coins
// (UTC day), a waiting Bonus Round (the bet that started it and the chests opened) and a waiting
// Double Chance (the coins at stake, the number and the operator).
export const konohaBoutique = pgTable(
  'konoha_boutique',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    coins: integer('coins').notNull().default(0),
    exp: integer('exp').notNull().default(0),
    lastWon: integer('last_won').notNull().default(0),
    freeDay: date('free_day'),
    freeClaimed: smallint('free_claimed').notNull().default(0),
    nextFreeAt: timestamp('next_free_at', { withTimezone: true }),
    bonusBet: integer('bonus_bet').notNull().default(0),
    bonusPicks: jsonb('bonus_picks')
      .$type<{ index: number; coins: number }[]>()
      .notNull()
      .default([]),
    doubleCoins: integer('double_coins').notNull().default(0),
    doubleNumber: smallint('double_number').notNull().default(0),
    doubleOperator: text('double_operator').$type<'higher' | 'lower'>().notNull().default('higher'),
  },
  (t) => [
    check(
      'konoha_boutique_values',
      sql`${t.coins} >= 0 and ${t.exp} >= 0 and ${t.lastWon} >= 0 and ${t.freeClaimed} >= 0 and ${t.bonusBet} >= 0 and ${t.doubleCoins} >= 0`,
    ),
  ],
)

// Ninja Mall daily limits: how many of a limited item the ninja bought on `day` (UTC); a new day
// starts the count again.
export const characterMallPurchases = pgTable(
  'character_mall_purchases',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.itemId] }),
    check('character_mall_purchases_count', sql`${t.count} > 0`),
  ],
)

// Collection (Reborn's Avatars / Pets / Gear Sets tabs, migration 0048): each entry counts once.
// `entry` is the outfit clothing ("23"), the pet family item id ("i320015") or the gear set piece
// ("8160:Hat"); the submitted copy is destroyed.
export const characterCollection = pgTable(
  'character_collection',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'outfit' | 'pet' | 'gear'>().notNull(),
    entry: text('entry').notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.kind, t.entry] }),
    check('character_collection_kind', sql`${t.kind} in ('outfit', 'pet', 'gear')`),
  ],
)

// Portable Function, Recast (migration 0049): an outfit row's recast ISV, the per-level
// StrengthUp / AgilityUp / StaminaUp it uses instead of its avatar's (AvatarSystem
// RecastStrengthUp...). No row = never recast. Leaves with the item.
export const outfitRecasts = pgTable(
  'outfit_recasts',
  {
    itemId: uuid('item_id')
      .primaryKey()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    strength: smallint('strength').notNull(),
    agility: smallint('agility').notNull(),
    stamina: smallint('stamina').notNull(),
  },
  (t) => [
    check(
      'outfit_recasts_isv',
      sql`${t.strength} >= 0 and ${t.agility} >= 0 and ${t.stamina} >= 0`,
    ),
  ],
)

// Akatsuki Invasion (Reborn scene 9400, migration 0050): pairs beaten in order, the sprung ambush
// waiting to be fought, the red outfits claimed and today's bait.
export const akatsukiHunters = pgTable(
  'akatsuki_hunters',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    pairsDefeated: smallint('pairs_defeated').notNull().default(0),
    pendingAmbush: boolean('pending_ambush').notNull().default(false),
    claimed: text('claimed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    baitDay: date('bait_day'),
    baitUntil: timestamp('bait_until', { withTimezone: true }),
  },
  (t) => [check('akatsuki_hunters_pairs', sql`${t.pairsDefeated} between 0 and 4`)],
)

// Hashirama vs Madara (Reborn scene 9500, migration 0050): one admin-started battle at a time.
// `settled` once the damage is counted and the spins paid out.
export const hashiramaEvents = pgTable(
  'hashirama_events',
  {
    id: id(),
    startedAt: createdAt(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    settled: boolean('settled').notNull().default(false),
    winner: text('winner').$type<'madara' | 'hashirama' | 'tie' | 'none'>(),
  },
  (t) => [
    check('hashirama_events_winner', sql`${t.winner} in ('madara', 'hashirama', 'tie', 'none')`),
    index('hashirama_events_closes_at_idx').on(t.closesAt),
  ],
)

// A ninja in one battle: their side (null until chosen, e.g. a wheel-only visit), damage, last
// attack, the spins paid out, and their Fortune Wheel (spins left, paid-spin bonus progress, the 3
// chosen rewards, wins per reward, the spin token and the last result).
export const hashiramaPlayers = pgTable(
  'hashirama_players',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => hashiramaEvents.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    side: text('side').$type<'madara' | 'hashirama'>(),
    damage: bigint('damage', { mode: 'number' }).notNull().default(0),
    lastAttackAt: timestamp('last_attack_at', { withTimezone: true }),
    payout: integer('payout').notNull().default(0),
    spins: integer('spins').notNull().default(0),
    paidSpins: integer('paid_spins').notNull().default(0),
    bonusReady: boolean('bonus_ready').notNull().default(false),
    selection: jsonb('selection')
      .$type<(string | null)[]>()
      .notNull()
      .default(sql`'[null, null, null]'::jsonb`),
    won: jsonb('won')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    spinToken: integer('spin_token').notNull().default(0),
    lastResult: jsonb('last_result'),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.characterId] }),
    index('hashirama_players_board_idx').on(t.eventId, t.side, t.damage),
    check('hashirama_players_side', sql`${t.side} in ('madara', 'hashirama')`),
    check(
      'hashirama_players_amounts',
      sql`${t.damage} >= 0 and ${t.spins} >= 0 and ${t.paidSpins} >= 0`,
    ),
  ],
)

// Shichibukai: today's expeditions, exchange points, best stars per "difficulty-floor" and the
// saved run (validated by modules/shichibukai/rules.ts runSchema), or null between runs.
export const shichibukaiPlayers = pgTable(
  'shichibukai_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    attemptDay: date('attempt_day'),
    attemptsUsed: smallint('attempts_used').notNull().default(0),
    points: integer('points').notNull().default(0),
    stars: jsonb('stars')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    run: jsonb('run'),
  },
  (t) => [check('shichibukai_players_values', sql`${t.attemptsUsed} >= 0 and ${t.points} >= 0`)],
)

// Sannin Test: title rank, Growing Points, today's dice and free changes (UTC day), and the
// unclaimed six dice (null when nothing is pending).
export const sanninPlayers = pgTable(
  'sannin_players',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    rank: smallint('rank').notNull().default(0),
    growthPoints: integer('growth_points').notNull().default(0),
    diceDay: date('dice_day'),
    diceUsed: smallint('dice_used').notNull().default(0),
    changesUsed: smallint('changes_used').notNull().default(0),
    pending: smallint('pending').array(),
    totalRolls: integer('total_rolls').notNull().default(0),
  },
  (t) => [
    check(
      'sannin_players_values',
      sql`${t.rank} >= 0 and ${t.growthPoints} >= 0 and ${t.diceUsed} >= 0 and ${t.changesUsed} >= 0 and ${t.totalRolls} >= 0 and (${t.pending} is null or cardinality(${t.pending}) = 6)`,
    ),
  ],
)

// Home (Reborn's scene 4101): the six farm fields, each null or { crop, readyAt (server ms) }.
export const homeFarms = pgTable('home_farms', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  plots: jsonb('plots')
    .$type<({ crop: string; readyAt: number } | null)[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
})

// Clan level progress (Events tab bar) and Picnic in Garden's weekly warehouse: `picnicPoints`
// belong to the UTC Monday `picnicWeek`, `picnicLastPoints` to the week before it.
export const clanProgress = pgTable(
  'clan_progress',
  {
    clanId: uuid('clan_id')
      .primaryKey()
      .references(() => clans.id, { onDelete: 'cascade' }),
    exp: bigint('exp', { mode: 'number' }).notNull().default(0),
    picnicWeek: date('picnic_week'),
    picnicPoints: integer('picnic_points').notNull().default(0),
    picnicLastPoints: integer('picnic_last_points').notNull().default(0),
  },
  (t) => [
    check(
      'clan_progress_values',
      sql`${t.exp} >= 0 and ${t.picnicPoints} >= 0 and ${t.picnicLastPoints} >= 0`,
    ),
  ],
)

// A ninja's Picnic contributions this `week` to `clanId` (the leaderboard) and the Monday of the
// last week they claimed boxes.
export const clanPicnicMembers = pgTable(
  'clan_picnic_members',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    clanId: uuid('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    week: date('week'),
    points: integer('points').notNull().default(0),
    claimedWeek: date('claimed_week'),
  },
  (t) => [
    index('clan_picnic_members_clan_id_idx').on(t.clanId),
    check('clan_picnic_members_points', sql`${t.points} >= 0`),
  ],
)

// A clan member's Ninja Garden: nine plots ({ unlocked, tree, cooldownUntil }), scrolls (refilled
// on the UTC Monday `scrollsWeek`), today's plants and the level the next tree is planted at.
export const clanGardens = pgTable(
  'clan_gardens',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    plots: jsonb('plots')
      .$type<
        {
          unlocked: boolean
          tree: { type: 'money' | 'zenpakuto'; level: number; readyAt: number } | null
          cooldownUntil: number
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    scrolls: smallint('scrolls').notNull().default(18),
    scrollsWeek: date('scrolls_week'),
    plantDay: date('plant_day'),
    plants: smallint('plants').notNull().default(0),
    pendingLevel: smallint('pending_level').notNull().default(1),
  },
  (t) => [
    check(
      'clan_gardens_values',
      sql`${t.scrolls} between 0 and 18 and ${t.plants} >= 0 and ${t.pendingLevel} between 1 and 5`,
    ),
  ],
)

// Chain Attack (Reborn `fieldFightMulti`): one running chain per ninja against `monsterId` of
// `sceneId`, `amount` monsters ending at `endsAt` (3 minutes each). The row goes when claimed.
export const chainAttacks = pgTable(
  'chain_attacks',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    monsterId: text('monster_id').notNull(),
    sceneId: integer('scene_id').notNull(),
    amount: smallint('amount').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('chain_attacks_amount', sql`${t.amount} between 1 and 30`)],
)

// Hunt (Reborn `huntBegin` / `huntComplete` at the Arena NPC): the monsters to kill (`targets`,
// `targetScenes`, `killed` side by side; empty when no hunt runs) and the hunts finished on the
// UTC day `day`.
export const hunts = pgTable(
  'hunts',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    targets: text('targets')
      .array()
      .notNull()
      .default(sql`'{}'`),
    targetScenes: integer('target_scenes')
      .array()
      .notNull()
      .default(sql`'{}'`),
    killed: boolean('killed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    day: date('day'),
    huntsDone: smallint('hunts_done').notNull().default(0),
  },
  (t) => [check('hunts_done', sql`${t.huntsDone} >= 0`)],
)

// Adventure with Jiraiya (Reborn `clanAdventureStart` / `clanAdventureReturn`): the ninja is away
// since `startedAt`; the row goes when they return.
export const jiraiyaAdventures = pgTable('jiraiya_adventures', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
})

// Player-to-player Trade (modules/trade, migration 0054): one row per completed trade, what each
// side gave. No foreign keys on the item ids: the trail outlives them.
export interface TradeLogOffer {
  items: { inventoryId: string; itemId: string; count: number }[]
  /** Amounts the side paid, and the fee kept from them before the partner got the rest. */
  currency: { stone: number; gold: number; giftCoupon: number }
  fee: { stone: number; gold: number; giftCoupon: number }
}

export const tradeLogs = pgTable(
  'trade_logs',
  {
    id: id(),
    initiatorId: uuid('initiator_id').references(() => characters.id, { onDelete: 'set null' }),
    partnerId: uuid('partner_id').references(() => characters.id, { onDelete: 'set null' }),
    initiatorOffer: jsonb('initiator_offer').$type<TradeLogOffer>().notNull(),
    partnerOffer: jsonb('partner_offer').$type<TradeLogOffer>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('trade_logs_initiator_idx').on(t.initiatorId, t.createdAt),
    index('trade_logs_partner_idx').on(t.partnerId, t.createdAt),
  ],
)
