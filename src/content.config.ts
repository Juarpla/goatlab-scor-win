import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const editorial = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/editorial' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['Dinero y fútbol', 'El juego y sus números']),
    date: z.coerce.date(),
    order: z.number().int().positive(),
    figure: z.enum(['earnings', 'transfers']).optional(),
    sources: z.array(z.object({ name: z.string(), url: z.url() })).min(1),
  }),
});

export const collections = { editorial };
