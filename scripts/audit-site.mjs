#!/usr/bin/env node
// Run unmodified Lighthouse defaults. Desktop uses Lighthouse's official preset.
// Examples:
//   node scripts/audit-site.mjs --routes=/,/shop/mixed/ --mode=desktop
//   node scripts/audit-site.mjs --all-tabs --mode=mobile
//   node scripts/audit-site.mjs --all-tabs --mode=both --base-url=http://localhost:52827
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = path.join(projectRoot, 'artifacts');
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
const defaults = {
  mode: 'desktop',
  baseUrl: 'http://localhost:52827',
  chromePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  outDir: path.join(artifactsRoot, 'lighthouse'),
};

function argumentsFor(argv) {
  const options = {...defaults, routes: undefined, allTabs: false};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/audit-site.mjs [--routes=/,/shop/mixed/ | --all-tabs] [--mode=desktop|mobile|both] [--base-url=http://localhost:52827] [--out-dir=artifacts/lighthouse] [--chrome-path=PATH] [--save-trace]');
      process.exit(0);
    }
    if (argument === '--all-tabs') {
      options.allTabs = true;
      continue;
    }
    if (argument === '--save-trace') {
      options.saveTrace = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    const key = {'--routes': 'routes', '--mode': 'mode', '--base-url': 'baseUrl', '--base': 'baseUrl', '--out-dir': 'outDir', '--chrome-path': 'chromePath'}[name];
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = separator < 0 ? argv[++index] : argument.slice(separator + 1);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    options[key] = value;
  }
  if (!['desktop', 'mobile', 'both'].includes(options.mode)) throw new Error('--mode must be desktop, mobile, or both');
  if (options.allTabs && options.routes) throw new Error('Use --all-tabs or --routes, not both');
  const baseUrl = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('--base-url must use HTTP or HTTPS');
  options.baseUrl = baseUrl.origin;
  options.outDir = path.resolve(projectRoot, options.outDir);
  const relativeOutput = path.relative(artifactsRoot, options.outDir);
  if (relativeOutput === '..' || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
    throw new Error('--out-dir must be within this project\'s artifacts directory');
  }
  return options;
}

function routeList(options) {
  const entries = options.allTabs
    ? [...fs.readFileSync(path.join(projectRoot, 'dist', 'sitemap.xml'), 'utf8').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => new URL(match[1].trim()).pathname).filter(route => !route.startsWith('/products/'))
    : (options.routes ?? '/').split(',').map(route => route.trim());
  const routes = [...new Set(entries.filter(Boolean).map(route => {
    if (!route.startsWith('/') || route.startsWith('//') || /[?#]/.test(route)) {
      throw new Error(`Routes must be absolute URL paths without queries or fragments: ${route}`);
    }
    return new URL(route, options.baseUrl).pathname;
  }))];
  if (!routes.length) throw new Error('No routes selected');
  return routes;
}

function reportName(route) {
  return route === '/' ? 'home' : route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]+/g, '__');
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeSummaries(directory, entries, metadata = {}) {
  const document = {version: 1, generatedAt: new Date().toISOString(), ...metadata, entries};
  fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(document, null, 2)}\n`);
  const columns = ['mode', 'route', ...categories, 'all100', 'auditedAt', 'url', 'lighthouseVersion', 'reportFile', 'error', 'failedAudits'];
  const rows = entries.map(entry => [entry.mode, entry.route, ...categories.map(category => entry.scores?.[category]), entry.all100, entry.auditedAt, entry.url, entry.lighthouseVersion, entry.reportFile, entry.error, entry.failedAudits?.map(audit => audit.id).join('; ')]);
  fs.writeFileSync(path.join(directory, 'summary.csv'), `\uFEFF${[columns, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n')}\r\n`);
}

function summaryFor(lhr, mode, route, reportFile) {
  const rawScores = Object.fromEntries(categories.map(category => [category, lhr.categories?.[category]?.score ?? null]));
  const scores = Object.fromEntries(categories.map(category => [category, rawScores[category] === null ? null : Math.round(rawScores[category] * 100)]));
  const categoryAudits = new Set(categories.flatMap(category => lhr.categories?.[category]?.auditRefs.map(audit => audit.id) ?? []));
  const failedAudits = [...categoryAudits].map(id => lhr.audits[id]).filter(audit => audit && (audit.scoreDisplayMode === 'error' || typeof audit.score === 'number' && audit.score < 1)).map(audit => ({
    id: audit.id,
    title: audit.title,
    score: audit.score,
    scoreDisplayMode: audit.scoreDisplayMode,
    ...(audit.displayValue ? {displayValue: audit.displayValue} : {}),
    ...(audit.errorMessage ? {errorMessage: audit.errorMessage} : {}),
  }));
  return {
    mode, route, url: lhr.requestedUrl, finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl,
    auditedAt: lhr.fetchTime, lighthouseVersion: lhr.lighthouseVersion,
    scores, rawScores, all100: categories.every(category => scores[category] === 100),
    reportFile, failedAudits, runWarnings: lhr.runWarnings ?? [],
    ...(lhr.runtimeError ? {error: `${lhr.runtimeError.code}: ${lhr.runtimeError.message}`} : {}),
  };
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const routes = routeList(options);
  const modes = options.mode === 'both' ? ['desktop', 'mobile'] : [options.mode];
  const moduleRoot = path.join(artifactsRoot, 'lighthouse-tools', 'node_modules');
  const importLocal = relative => import(pathToFileURL(path.join(moduleRoot, relative)).href);
  const [{default: lighthouse}, {default: desktopConfig}, chromeLauncher] = await Promise.all([
    importLocal('lighthouse/core/index.js'),
    importLocal('lighthouse/core/config/desktop-config.js'),
    importLocal('chrome-launcher/dist/chrome-launcher.js'),
  ]);
  fs.mkdirSync(options.outDir, {recursive: true});
  const cumulativeFile = path.join(options.outDir, 'summary.json');
  const previous = fs.existsSync(cumulativeFile) ? JSON.parse(fs.readFileSync(cumulativeFile, 'utf8')) : {entries: []};
  if (!Array.isArray(previous.entries)) throw new Error(`Invalid cumulative summary: ${cumulativeFile}`);
  const latestEntries = new Map(previous.entries.map(entry => [`${entry.mode}|${entry.url}`, entry]));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${options.mode}-${process.pid}`;
  const runDirectory = path.join(options.outDir, runId);
  const profileDirectory = path.join(options.outDir, 'profiles', runId);
  fs.mkdirSync(runDirectory, {recursive: true});
  fs.mkdirSync(profileDirectory, {recursive: true});
  const runEntries = [];
  const metadata = {baseUrl: options.baseUrl, requestedModes: modes, requestedRoutes: routes};
  function persist(entry) {
    runEntries.push(entry);
    latestEntries.set(`${entry.mode}|${entry.url}`, entry);
    writeSummaries(runDirectory, runEntries, metadata);
    writeSummaries(options.outDir, [...latestEntries.values()].sort((left, right) => `${left.mode}|${left.url}`.localeCompare(`${right.mode}|${right.url}`)));
  }

  let chrome;
  let hadErrors = false;
  try {
    // This dedicated directory never uses or removes the user's Chrome profile.
    // An explicit userDataDir also prevents chrome-launcher's Windows temp cleanup.
    chrome = await chromeLauncher.launch({
      chromePath: options.chromePath,
      userDataDir: profileDirectory,
      chromeFlags: ['--headless=new'],
      logLevel: 'silent',
    });
    for (const mode of modes) {
      for (const route of routes) {
        const url = new URL(route, options.baseUrl).href;
        const reportFile = path.join(runDirectory, `${mode}-${reportName(route)}.json`);
        try {
          // No audits are skipped and no performance settings or scores are overridden.
          const result = await lighthouse(url, {port: chrome.port, output: 'json', logLevel: 'silent'}, mode === 'desktop' ? desktopConfig : undefined);
          if (!result?.lhr) throw new Error('Lighthouse returned no report');
          fs.writeFileSync(reportFile, `${JSON.stringify(result.lhr, null, 2)}\n`);
          if (options.saveTrace && result.artifacts?.Trace) fs.writeFileSync(reportFile.replace(/\.json$/, '.trace.json'), JSON.stringify(result.artifacts.Trace));
          const entry = summaryFor(result.lhr, mode, route, reportFile);
          persist(entry);
          hadErrors ||= Boolean(entry.error);
          const scoreLine = categories.map(category => entry.scores[category] ?? 'ERR').join('/');
          const failures = entry.failedAudits.map(audit => `${audit.id}${audit.displayValue ? ` (${audit.displayValue})` : ''}`).join('; ');
          console.log(`${mode} ${route} ${scoreLine}${entry.error ? ` ERROR: ${entry.error}` : ''}${failures ? ` | failed: ${failures}` : ''}`);
        } catch (error) {
          hadErrors = true;
          const entry = {mode, route, url, auditedAt: new Date().toISOString(), scores: Object.fromEntries(categories.map(category => [category, null])), all100: false, reportFile: fs.existsSync(reportFile) ? reportFile : null, error: error.message, failedAudits: []};
          persist(entry);
          console.log(`${mode} ${route} ERR/ERR/ERR/ERR | ERROR: ${error.message}`);
        }
      }
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch (error) {
        console.warn(`Warning: audit Chrome cleanup failed; dedicated profile retained at ${profileDirectory}: ${error.message}`);
      }
    }
  }
  if (hadErrors) process.exitCode = 2;
}

main().catch(error => {
  console.error(`Audit runner error: ${error.message}`);
  process.exitCode = 2;
});
