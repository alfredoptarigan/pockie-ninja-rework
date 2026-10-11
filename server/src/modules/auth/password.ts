import { hash, verify } from '@node-rs/argon2'

// Argon2id (the library default) with the OWASP-recommended minimum cost.
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

export function hashPassword(password: string) {
  return hash(password, options)
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password)
}

// Verified against when the user does not exist, so both paths take the same time.
let dummyHash: Promise<string> | undefined
export function getDummyHash() {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  return dummyHash
}
