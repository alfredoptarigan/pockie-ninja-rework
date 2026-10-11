import type { Env } from '../../env.js'

/**
 * In production the cookies use the __Host- prefix: Secure, Path=/ and no Domain, so a sibling
 * subdomain can never set or overwrite them.
 */
export function cookieConfig(env: Env) {
  const production = env.NODE_ENV === 'production'
  const prefix = production ? '__Host-' : ''
  return {
    session: `${prefix}pn_session`,
    csrf: `${prefix}pn_csrf`,
    options: { httpOnly: true, sameSite: 'lax', secure: production, path: '/' } as const,
  }
}
