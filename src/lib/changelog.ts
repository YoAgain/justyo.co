// Changelog entries, newest first; each has its own page at /p/changelog/<slug> (the file name without its date).
import { getCollection, type CollectionEntry } from 'astro:content';

export type Entry = CollectionEntry<'changelog'> & { slug: string };

export const slugOf = (id: string) => id.replace(/^\d{4}-\d{2}-\d{2}-/, '');

export async function entries(): Promise<Entry[]> {
  return (await getCollection('changelog'))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || b.id.localeCompare(a.id))
    .map((e) => ({ ...e, slug: slugOf(e.id) }));
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const long = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// The first paragraph of the Markdown, as plain text: the teaser and the meta description.
export const excerpt = (body = '') =>
  body
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
