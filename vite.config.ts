import { defineConfig } from 'vite';

// Relative base so the build works from any subpath,
// e.g. https://<user>.github.io/guitar-game/
export default defineConfig({
  base: './',
  server: {
    // Dev server is reached through the Paseo proxy / LAN hostnames.
    allowedHosts: true,
  },
});
