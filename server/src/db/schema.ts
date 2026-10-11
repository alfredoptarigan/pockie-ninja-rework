import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
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
