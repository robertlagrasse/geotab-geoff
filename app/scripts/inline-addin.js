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

// Read CSS and JS from addin build
const css = readFileSync(resolve(addinDist, 'addin.css'), 'utf-8');
const js = readFileSync(resolve(addinDist, 'app.iife.js'), 'utf-8');

// Prepend CSS injection to JS bundle — MyGeotab drops <head> (and its <style> tag)
// when injecting add-in HTML into its DOM, so CSS must be delivered via JS.
const cssInjector = `(function(){var s=document.createElement('style');s.id='geoff-addin-styles';s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);})();\n`;
writeFileSync(resolve(mainDist, 'addin.js'), cssInjector + js);

// Build addin.html — CSS also in <style> for direct-browser access
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
