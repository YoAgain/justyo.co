// The changelog: one Markdown file per entry in src/content/changelog/, named YYYY-MM-DD-slug.md, newest shown first. Optional image (a path under public/) with its alt text.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const changelog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/changelog' }),
  schema: z.object({ title: z.string(), date: z.coerce.date(), image: z.string().optional(), alt: z.string().optional() }),
});

export const collections = { changelog };
