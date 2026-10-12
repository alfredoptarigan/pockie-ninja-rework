import { sql } from 'drizzle-orm'
import {
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
  },
  (t) => [
    index('inventory_items_character_id_idx').on(t.characterId),
    uniqueIndex('inventory_items_equipped_slot_key')
      .on(t.characterId, t.equippedSlot)
      .where(sql`${t.equippedSlot} is not null`),
    check('inventory_items_count', sql`${t.count} > 0`),
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
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.taskId] }),
    check('character_quests_state', sql`${t.state} between 0 and 2`),
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
