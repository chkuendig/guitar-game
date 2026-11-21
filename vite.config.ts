import { defineConfig } from 'vite';

// Relative base so the build works from any subpath,
// e.g. https://<user>.github.io/guitar-game/
export default defineConfig({
  base: './',
});
