// Guards Node's real ESM module *resolution* of the built API, not its
// behavior. `tsc --noEmit` only resolves types, and vitest transpiles
// TypeScript on the fly instead of loading dist/ output through Node's
// loader -- so a bare package specifier that resolves fine for both of
// those (e.g. "@rvs/contracts", whose package.json points at TypeScript
// source) can still crash-loop the built container the moment Node's real
// loader tries to load it. Run this after `pnpm --filter @rvs/api build`.
//
// It dynamically imports the built server entrypoint. server.ts only calls
// startApiServer() (which binds a port and needs env secrets) when it is
// run as the process's own main module -- guarded by
// `process.argv[1] === fileURLToPath(import.meta.url)`. A dynamic import
// from this script never satisfies that, so importing server.js here walks
// its whole module graph (app.js -> author-scene.js -> the compiled
// packages/contracts modules, etc.) purely to resolve it, without ever
// starting a listening server.
const serverUrl = new URL("../dist/apps/api/src/server.js", import.meta.url);
await import(serverUrl);
console.log(
  "apps/api: built module graph resolved cleanly from",
  serverUrl.pathname,
);
