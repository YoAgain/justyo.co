import { defineConfig } from 'astro/config';
import ogImages from './og-images.mjs';

export default defineConfig({
  site: 'https://justyo.co',
  compressHTML: true,
  integrations: [ogImages()],
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
