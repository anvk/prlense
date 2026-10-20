// Bundles the renderer for the browser so a shared report JSON can be opened by anyone,
// with or without prlense installed. The renderer is usable here because nothing in it
// touches Node: the GitHub links are baked into the report before it is saved, so even the
// sha256 anchoring has already happened.
//
// The result is inlined into every page, which is what keeps a report a single file.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.PRLENSE_BUILD_OUTDIR || path.join(root, "dist");
const outfile = path.join(outDir, "render", "viewer.js");

fs.mkdirSync(path.dirname(outfile), { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "render", "browser.ts")],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none",
});
const kb = (fs.statSync(outfile).size / 1024).toFixed(1);
console.log(`viewer: built ${path.relative(root, outfile)} (${kb} KB)`);
