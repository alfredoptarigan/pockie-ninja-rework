// Creates the app and test databases if they do not exist yet.
import postgres from 'postgres'

const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter(
  (url): url is string => Boolean(url),
)
if (urls.length === 0) throw new Error('Set DATABASE_URL (and TEST_DATABASE_URL) first.')

for (const url of urls) {
  const target = new URL(url)
  const name = target.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsafe database name: ${name}`)

  const admin = new URL(url)
  admin.pathname = '/postgres'
  const sql = postgres(admin.toString(), { max: 1 })
  const [existing] = await sql`select 1 from pg_database where datname = ${name}`
  if (existing) {
    console.log(`Database ${name} already exists`)
  } else {
    await sql.unsafe(`create database ${name}`)
    console.log(`Created database ${name}`)
  }
  await sql.end()
}
