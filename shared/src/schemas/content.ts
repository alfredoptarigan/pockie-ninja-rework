import { z } from 'zod'

export const postKindSchema = z.enum(['news', 'update', 'event'])

export const postsQuerySchema = z.object({
  kind: postKindSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(6),
})

export interface Post {
  id: string
  kind: PostKind
  slug: string
  title: string
  summary: string
  body: string
  publishedAt: string
}

export interface PostsPage {
  items: Post[]
  nextCursor: string | null
}

export interface LoreChapter {
  id: string
  position: number
  title: string
  body: string
}

export interface FaqItem {
  id: string
  position: number
  question: string
  answer: string
}

export interface ServerStatus {
  online: boolean
  playersActiveNow: number
}

export type PostKind = z.infer<typeof postKindSchema>
