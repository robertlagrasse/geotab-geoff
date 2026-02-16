#!/usr/bin/env node
/**
 * Post-build script: copies the IIFE bundle to dist/addin.js and creates
 * addin.html that references it with a relative path (no leading slash).
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const addinDist = resolve(__dirname, '..', 'dist-addin');
const mainDist = resolve(__dirname, '..', 'dist');

// Copy the IIFE JS and CSS to dist root
copyFileSync(resolve(addinDist, 'app.iife.js'), resolve(mainDist, 'addin.js'));
const css = readFileSync(resolve(addinDist, 'addin.css'), 'utf-8');

// Build addin.html with relative path (no leading slash!) to avoid MyGeotab double-slash bug
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Geoff - Fleet Intelligence</title>
<style>${css}</style>
</head>
<body>
<div id="geoff-addin-root"></div>
<script src="addin.js?v=${Date.now()}"></script>
</body>
</html>`;

writeFileSync(resolve(mainDist, 'addin.html'), html);
console.log(`addin.html → dist/addin.html (references addin.js)`);
console.log(`addin.js → dist/addin.js (${(readFileSync(resolve(mainDist, 'addin.js')).length / 1024).toFixed(0)} KB)`);
