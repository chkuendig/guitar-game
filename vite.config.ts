import { appendFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only sink for src/telemetry.ts: POST /__telemetry appends the batched
 * events as JSON lines to telemetry.log (gitignored). `tail -f telemetry.log`
 * to watch a device live. Not part of the production build.
 */
function telemetrySink(): Plugin {
  return {
    name: 'telemetry-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__telemetry', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 256_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const events = JSON.parse(body) as Record<string, unknown>[];
            const at = new Date().toISOString();
            const lines = events.map((e) => JSON.stringify({ at, ...e })).join('\n');
            if (lines) appendFileSync('telemetry.log', lines + '\n');
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

// Relative base so the build works from any subpath,
// e.g. https://<user>.github.io/guitar-game/
export default defineConfig({
  base: './',
  plugins: [telemetrySink()],
  server: {
    // Dev server is reached through the Cloudflare route / LAN hostnames.
    allowedHosts: true,
    // Live reload stays on; open the page with ?play to opt out (index.html).
  },
});
