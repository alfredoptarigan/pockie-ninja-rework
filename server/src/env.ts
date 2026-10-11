import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Browsers send Origin without a path or trailing slash, so compare against the bare origin.
    APP_ORIGIN: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => new URL(value).origin),
    // Reverse proxies in front of the API (Fastify hop count). 0 trusts no X-Forwarded-For header.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    DATABASE_URL: z.url(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.APP_ORIGIN.startsWith('https://'), {
    path: ['APP_ORIGIN'],
    message: 'APP_ORIGIN must use https in production',
  })

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
