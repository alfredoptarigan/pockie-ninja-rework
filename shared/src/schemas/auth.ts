import { z } from 'zod'

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(16, 'Username must be at most 16 characters.')
  .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers and underscores.')

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'))

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your username or email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
  rememberMe: z.boolean().default(false),
})

export const userRoleSchema = z.enum(['player', 'admin'])

export const publicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  role: userRoleSchema,
  createdAt: z.string(),
})

export type RegisterInput = z.input<typeof registerSchema>
export type LoginInput = z.input<typeof loginSchema>
export type UserRole = z.infer<typeof userRoleSchema>
export type PublicUser = z.infer<typeof publicUserSchema>

/** Error body returned by every failing API call. */
export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}
