#!/usr/bin/env node
/**
 * Build script — produces an obfuscated + minified production build in dist/.
 *
 * Usage:
 *   node build.js            # full build (JS obfuscate + CSS minify + HTML minify)
 *   node build.js --quick    # minify only (skip JS obfuscation — much faster)
 *
 * Output goes to dist/ which is .gitignored.
 * To serve locally:  cd dist && python3 -m http.server 4174
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const QUICK = process.argv.includes("--quick");

// ─── Files to process ───────────────────────────────────────────────
const JS_FILES = [
  "app.js",
  "admin.js",
  "admin-operations.js",
  "nav-component.js",
  "main.js",
];

const CSS_FILES = ["styles.css"];

const HTML_FILES = ["index.html", "admin.html", "admin-operations.html"];

// Directories + files to copy as-is (no transformation)
const COPY_ITEMS = [
  "assets",
  "config/prod",           // only prod config — never copy config/local (secrets)
  "firebase.json",
  "firestore.rules",
  "firestore.indexes.json",
];

// ─── Helpers ────────────────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "pipe" });
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Clean dist ─────────────────────────────────────────────────────
console.log(`\n🔨 Building production bundle${QUICK ? " (quick mode)" : ""}…\n`);
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
ensureDir(DIST);

// ─── Copy static assets ────────────────────────────────────────────
for (const item of COPY_ITEMS) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(DIST, item));
    console.log(`  📂 Copied ${item}`);
  }
}

// ─── Obfuscate / minify JavaScript ─────────────────────────────────
const obfuscatorBin = path.join(ROOT, "node_modules", ".bin", "javascript-obfuscator");

const OBFUSCATOR_OPTS = [
  "--compact true",
  "--control-flow-flattening true",
  "--control-flow-flattening-threshold 0.4",
  "--dead-code-injection true",
  "--dead-code-injection-threshold 0.15",
  "--identifier-names-generator hexadecimal",
  "--rename-globals false",            // keep global exports intact
  "--rename-properties false",         // keep property names (Firebase, DOM, etc.)
  "--self-defending false",
  "--simplify true",
  "--split-strings true",
  "--split-strings-chunk-length 6",
  "--string-array true",
  "--string-array-calls-transform true",
  "--string-array-encoding base64",
  "--string-array-index-shift true",
  "--string-array-rotate true",
  "--string-array-shuffle true",
  "--string-array-threshold 0.65",
  "--string-array-wrappers-count 2",
  "--string-array-wrappers-type variable",
  "--transform-object-keys false",     // keep object keys readable for Firebase
  "--unicode-escape-sequence false",
].join(" ");

console.log("");
for (const file of JS_FILES) {
  const src = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (!fs.existsSync(src)) {
    console.log(`  ⚠️  Skipped ${file} (not found)`);
    continue;
  }
  const originalSize = fileSize(src);
  if (QUICK) {
    // Quick mode: just copy (no obfuscation)
    fs.copyFileSync(src, dest);
    console.log(`  📄 Copied ${file} (${fmtSize(originalSize)})`);
  } else {
    run(`"${obfuscatorBin}" "${src}" --output "${dest}" ${OBFUSCATOR_OPTS}`);
    const newSize = fileSize(dest);
    console.log(`  🔒 Obfuscated ${file}  ${fmtSize(originalSize)} → ${fmtSize(newSize)}`);
  }
}

// ─── Minify CSS ────────────────────────────────────────────────────
const cleanCssBin = path.join(ROOT, "node_modules", ".bin", "cleancss");

console.log("");
for (const file of CSS_FILES) {
  const src = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (!fs.existsSync(src)) {
    console.log(`  ⚠️  Skipped ${file} (not found)`);
    continue;
  }
  const originalSize = fileSize(src);
  run(`"${cleanCssBin}" -o "${dest}" "${src}"`);
  const newSize = fileSize(dest);
  console.log(`  🎨 Minified ${file}  ${fmtSize(originalSize)} → ${fmtSize(newSize)}`);
}

// ─── Minify HTML ───────────────────────────────────────────────────
const htmlMinBin = path.join(ROOT, "node_modules", ".bin", "html-minifier-terser");

const HTML_OPTS = [
  "--collapse-whitespace",
  "--remove-comments",
  "--remove-redundant-attributes",
  "--remove-empty-attributes",
  "--minify-css true",
  "--minify-js true",
].join(" ");

console.log("");
for (const file of HTML_FILES) {
  const src = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (!fs.existsSync(src)) {
    console.log(`  ⚠️  Skipped ${file} (not found)`);
    continue;
  }
  const originalSize = fileSize(src);
  run(`"${htmlMinBin}" ${HTML_OPTS} -o "${dest}" "${src}"`);
  const newSize = fileSize(dest);
  console.log(`  📝 Minified ${file}  ${fmtSize(originalSize)} → ${fmtSize(newSize)}`);
}

// ─── Summary ───────────────────────────────────────────────────────
const allSrcFiles = [...JS_FILES, ...CSS_FILES, ...HTML_FILES];
let totalOriginal = 0;
let totalDist = 0;
for (const file of allSrcFiles) {
  totalOriginal += fileSize(path.join(ROOT, file));
  totalDist += fileSize(path.join(DIST, file));
}
const pct = totalOriginal ? ((1 - totalDist / totalOriginal) * 100).toFixed(1) : 0;

console.log(`\n✅ Build complete → dist/`);
console.log(`   Source: ${fmtSize(totalOriginal)}  →  Dist: ${fmtSize(totalDist)}  (${pct}% ${totalDist < totalOriginal ? "smaller" : "larger"})\n`);
