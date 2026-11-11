import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://justyo.co',
  compressHTML: true,
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
