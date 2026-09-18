import { z } from 'zod/v4'

const rotationStateSchema = z.object({
  queue: z.array(z.string()),
  pointer: z.number().int().min(0),
  lastCadenceBoundary: z.number(),
})

export const prayerListSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  status: z.enum(['active', 'archived']),
  rotationState: rotationStateSchema,
  createdAt: z.number(),
})

export const prayerSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  listIds: z.array(z.string()).min(1),
  createdAt: z.number(),
  lastPrayedAt: z.number().nullable(),
  prayerTally: z.number().int().min(0),
})

export const prayerLogSchema = z.object({
  id: z.string(),
  prayerId: z.string(),
  listId: z.string(),
  prayedAt: z.number(),
})

export type PrayerListInput = z.infer<typeof prayerListSchema>
export type PrayerInput = z.infer<typeof prayerSchema>
