import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://whoishiring-insight.pages.dev',
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});
