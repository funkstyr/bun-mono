import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const REDIRECT_SCRIPT = `<script>
  // Single Page Apps for GitHub Pages — https://github.com/rafgraph/spa-github-pages — MIT
  var pathSegmentsToKeep = 1;
  var l = window.location;
  l.replace(
    l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
    l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
    l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
    (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
    l.hash
  );
</script>`;

function spaGithubPagesFallback(): Plugin {
  return {
    name: "spa-github-pages-fallback",
    apply: "build",
    closeBundle() {
      const outDir = resolve(process.cwd(), "dist");
      const indexHtml = readFileSync(resolve(outDir, "index.html"), "utf8");
      const fourOhFour = indexHtml.replace(/<head>/, `<head>\n  ${REDIRECT_SCRIPT}`);
      writeFileSync(resolve(outDir, "404.html"), fourOhFour);
    },
  };
}

export default defineConfig({
  base: "/bun-mono/",
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.png", "pwa-icon.svg"],
      manifest: {
        name: "bun-mono — static showcase",
        short_name: "bun-mono",
        description: "Static showcase of bun-mono apps (royalty, tic-tac-toe, workout timer).",
        id: "/bun-mono/",
        start_url: "/bun-mono/",
        scope: "/bun-mono/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/[^/]+\.[a-z0-9]+$/i],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        cleanupOutdatedCaches: true,
      },
    }),
    spaGithubPagesFallback(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
