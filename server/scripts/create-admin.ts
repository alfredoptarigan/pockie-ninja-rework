// Usage: pnpm create-admin <username> <email>
// Creates an admin account, or promotes the existing account with that username.
// The password comes from ADMIN_PASSWORD; without it a random one is generated and printed once.
import { randomBytes } from 'node:crypto'
import { registerSchema } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client.js'
import { users } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { hashPassword } from '../src/modules/auth/password.js'

const [username, email] = process.argv.slice(2)
const generated = !process.env.ADMIN_PASSWORD
const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url')

const parsed = registerSchema.safeParse({ username, email, password })
if (!parsed.success) {
  console.error('Usage: pnpm create-admin <username> <email>')
  console.error(parsed.error.issues.map((issue) => `- ${issue.message}`).join('\n'))
  process.exit(1)
}

const { db, close } = createDb(loadEnv().DATABASE_URL)
try {
  const input = parsed.data
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, input.username.toLowerCase()))

  if (existing) {
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, existing.id))
    console.log(`Promoted ${input.username} to admin (password unchanged).`)
  } else {
    await db.insert(users).values({
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: 'admin',
    })
    console.log(`Created admin ${input.username}.`)
    if (generated) console.log(`Generated password (shown once): ${password}`)
  }
} finally {
  await close()
}
