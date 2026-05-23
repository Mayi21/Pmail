#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const style = (s, ...codes) => codes.map(k => c[k]).join('') + s + c.reset;
const log = (...a) => console.log(...a);
const warn = (msg) => log(style(`  ⚠ ${msg}`, 'yellow'));
const die = (msg) => { console.error(style(`✗ ${msg}`, 'red')); process.exit(1); };

const D1_NAME = 'pmail-db';
const R2_BUCKETS = [
  { key: 'storage', baseName: 'pmail-storage' },
];
const KV_NAMESPACES = ['JWT_KEYS', 'CACHE'];
const PAGES_PROJECT = 'pmail-web';
const PAGES_PRODUCTION_BRANCH = 'main';

const TOML_FILES = [
  { example: 'workers/api/wrangler.toml.example',    target: 'workers/api/wrangler.toml' },
  { example: 'workers/email/wrangler.toml.example',  target: 'workers/email/wrangler.toml' },
];
const ENV_FILE = { example: '.env.example', target: '.env' };

function parseCli() {
  const { values } = parseArgs({
    options: {
      'dry-run':     { type: 'boolean', default: false },
      'name-suffix': { type: 'string',  default: '' },
      'account-id':  { type: 'string' },
      'help':        { type: 'boolean', default: false, short: 'h' },
    },
    allowPositionals: false,
  });
  if (values.help) {
    log(`Usage: node scripts/bootstrap.mjs [options]

Creates Cloudflare D1, R2, KV, and Pages resources for PMail (idempotent),
then renders wrangler.toml / .env with the resulting IDs.

This script only handles resource provisioning and config rendering.
Deployment (migrations + wrangler deploy) is delegated to GitHub Actions
(.github/workflows/deploy.yml). Push to main to trigger a deploy.

Options:
  --dry-run               Show plan without creating resources or writing files
  --name-suffix=<s>       Append "-<s>" to D1/R2/Pages names (avoid collisions)
  --account-id=<id>       Cloudflare account ID (overrides CLOUDFLARE_ACCOUNT_ID)
  -h, --help              Show this help

Environment:
  CLOUDFLARE_ACCOUNT_ID   Required if your wrangler login has multiple accounts
  CLOUDFLARE_API_TOKEN    Optional; skips interactive auth, recommended for CI

Non-resource template variables (\${DOMAIN}, \${ALLOWED_ORIGINS}) are read from
.env if present; otherwise left as placeholders for you to fill in or envsubst.

Examples:
  node scripts/bootstrap.mjs                  # create resources + render configs
  node scripts/bootstrap.mjs --dry-run        # preview without changes
  node scripts/bootstrap.mjs --name-suffix=staging
`);
    process.exit(0);
  }
  if (values['name-suffix'] && !/^[a-z0-9-]+$/.test(values['name-suffix'])) {
    die('--name-suffix must match [a-z0-9-]+');
  }
  return values;
}

function resolveWrangler() {
  const local = join(REPO, 'workers/api/node_modules/.bin/wrangler');
  if (existsSync(local)) return local;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['wrangler'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim().split('\n')[0];
  die('wrangler not found. Install: cd workers/api && npm install   (or: npm i -g wrangler)');
}

function runWrangler(wrangler, args, { env = {} } = {}) {
  const r = spawnSync(wrangler, args, {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env, WRANGLER_SEND_METRICS: 'false' },
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ensureWranglerV4(wrangler) {
  const r = runWrangler(wrangler, ['--version']);
  if (r.status !== 0) die(`wrangler --version failed:\n${r.stderr}`);
  const m = r.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) die(`Could not parse wrangler version from: ${r.stdout.trim()}`);
  if (Number(m[1]) < 4) die(`wrangler ${m[0]} detected; v4+ required. Run: npm i -g wrangler@latest`);
  return m[0];
}

function preflight(wrangler, args) {
  log(style('▸ Pre-flight checks', 'bold', 'blue'));
  const [maj] = process.versions.node.split('.').map(Number);
  if (maj < 18) die(`Node ${process.versions.node} detected; v18+ required.`);
  log(`  ${style('✓', 'green')} node ${process.versions.node}`);

  const wver = ensureWranglerV4(wrangler);
  log(`  ${style('✓', 'green')} wrangler ${wver}  ${style(`(${wrangler})`, 'gray')}`);

  if (process.env.CLOUDFLARE_API_TOKEN) {
    log(`  ${style('✓', 'green')} CLOUDFLARE_API_TOKEN set (token mode)`);
  } else {
    const r = runWrangler(wrangler, ['whoami']);
    if (r.status !== 0) die(`wrangler whoami failed. Run: wrangler login\n${r.stderr}`);
    const emailMatch = r.stdout.match(/associated with the email\s+(\S+)/i) || r.stdout.match(/email\s+(\S+@\S+)/i);
    log(`  ${style('✓', 'green')} authenticated${emailMatch ? ` as ${emailMatch[1]}` : ''}`);
    const accountIds = [...r.stdout.matchAll(/\b([0-9a-f]{32})\b/g)].map(m => m[1]);
    const unique = [...new Set(accountIds)];
    if (unique.length > 1 && !args['account-id'] && !process.env.CLOUDFLARE_ACCOUNT_ID) {
      die('Multiple Cloudflare accounts detected. Pass --account-id=<id> or set CLOUDFLARE_ACCOUNT_ID.');
    }
  }
  const accountId = args['account-id'] || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  if (accountId) log(`  ${style('✓', 'green')} account ${style(accountId, 'gray')}`);
  return { accountId };
}

function withAccount(args, accountId) {
  return accountId ? ['--account-id', accountId, ...args] : args;
}

function jsonFromStdout(stdout) {
  const start = stdout.indexOf('[');
  const startObj = stdout.indexOf('{');
  const idx = (start === -1) ? startObj : (startObj === -1 ? start : Math.min(start, startObj));
  if (idx === -1) throw new Error(`No JSON found in:\n${stdout}`);
  return JSON.parse(stdout.slice(idx));
}

async function listD1(w, acc) {
  const r = runWrangler(w, withAccount(['d1', 'list', '--json'], acc));
  if (r.status !== 0) throw new Error(`d1 list failed: ${r.stderr || r.stdout}`);
  return jsonFromStdout(r.stdout);
}
async function createD1(w, acc, name) {
  const r = runWrangler(w, withAccount(['d1', 'create', name], acc));
  if (r.status !== 0) throw new Error(`d1 create ${name} failed: ${r.stderr || r.stdout}`);
}

async function listKv(w, acc) {
  const r = runWrangler(w, withAccount(['kv', 'namespace', 'list'], acc));
  if (r.status !== 0) throw new Error(`kv namespace list failed: ${r.stderr || r.stdout}`);
  return jsonFromStdout(r.stdout);
}
async function createKv(w, acc, title) {
  const r = runWrangler(w, withAccount(['kv', 'namespace', 'create', title], acc));
  if (r.status !== 0) throw new Error(`kv namespace create ${title} failed: ${r.stderr || r.stdout}`);
}

async function listR2(w, acc) {
  const r = runWrangler(w, withAccount(['r2', 'bucket', 'list'], acc));
  if (r.status !== 0) throw new Error(`r2 bucket list failed: ${r.stderr || r.stdout}`);
  try {
    const parsed = jsonFromStdout(r.stdout);
    return Array.isArray(parsed) ? parsed : (parsed.buckets ?? []);
  } catch {
    const names = [...r.stdout.matchAll(/^\s*(?:name:\s*)?([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\s*$/gm)].map(m => m[1]);
    return names.map(name => ({ name }));
  }
}
async function createR2(w, acc, name) {
  const r = runWrangler(w, withAccount(['r2', 'bucket', 'create', name], acc));
  if (r.status === 0) return;
  const msg = (r.stderr + r.stdout).toLowerCase();
  if (msg.includes('already exists') || msg.includes('10004')) return;
  throw new Error(`r2 bucket create ${name} failed: ${r.stderr || r.stdout}`);
}

async function listPages(w, acc) {
  const r = runWrangler(w, withAccount(['pages', 'project', 'list', '--json'], acc));
  if (r.status !== 0) throw new Error(`pages project list failed: ${r.stderr || r.stdout}`);
  try {
    const parsed = jsonFromStdout(r.stdout);
    return Array.isArray(parsed) ? parsed : (parsed.projects ?? []);
  } catch {
    return [];
  }
}
async function createPages(w, acc, name) {
  const r = runWrangler(w, withAccount(['pages', 'project', 'create', name, '--production-branch', PAGES_PRODUCTION_BRANCH], acc));
  if (r.status === 0) return;
  const msg = (r.stderr + r.stdout).toLowerCase();
  if (msg.includes('already exists')) return;
  if (msg.includes('subdomain') || msg.includes('taken') || msg.includes('unique')) {
    throw new Error(`Pages project name "${name}" is taken globally on Cloudflare. Retry with: --name-suffix=<your-suffix>`);
  }
  throw new Error(`pages project create ${name} failed: ${r.stderr || r.stdout}`);
}

async function planAndExecute(wrangler, accountId, args) {
  const suffix = args['name-suffix'];
  const suf = suffix ? `-${suffix}` : '';
  const dryRun = args['dry-run'];

  const d1Name = `${D1_NAME}${suf}`;
  const r2Names = Object.fromEntries(R2_BUCKETS.map(b => [b.key, `${b.baseName}${suf}`]));
  const pagesName = `${PAGES_PROJECT}${suf}`;

  log(style('\n▸ Discovering existing resources', 'bold', 'blue'));
  const [d1List, kvList, r2List, pagesList] = await Promise.all([
    listD1(wrangler, accountId),
    listKv(wrangler, accountId),
    listR2(wrangler, accountId),
    listPages(wrangler, accountId),
  ]);

  const d1Existing = d1List.find(d => d.name === d1Name);
  const kvByTitle = new Map(kvList.map(k => [k.title, k.id]));
  const r2Set = new Set(r2List.map(b => b.name));
  const pagesSet = new Set(pagesList.map(p => p.name));

  const plan = [];
  plan.push({ type: 'D1', name: d1Name, status: d1Existing ? 'reuse' : 'create', id: d1Existing?.uuid });
  for (const b of R2_BUCKETS) {
    plan.push({ type: 'R2', name: r2Names[b.key], status: r2Set.has(r2Names[b.key]) ? 'reuse' : 'create' });
  }
  for (const title of KV_NAMESPACES) {
    plan.push({ type: 'KV', name: title, status: kvByTitle.has(title) ? 'reuse' : 'create', id: kvByTitle.get(title) });
  }
  plan.push({ type: 'Pages', name: pagesName, status: pagesSet.has(pagesName) ? 'reuse' : 'create' });

  log(style('\n▸ Plan', 'bold', 'blue'));
  printPlanTable(plan);
  if (dryRun) {
    log(style('\nDry-run complete. No resources created, no files written.', 'yellow'));
    return null;
  }

  log(style('\n▸ Executing plan', 'bold', 'blue'));
  if (!d1Existing) {
    process.stdout.write(`  ${style('+', 'green')} create D1 ${d1Name}... `);
    await createD1(wrangler, accountId, d1Name);
    log(style('done', 'green'));
  } else {
    log(`  ${style('·', 'gray')} reuse D1 ${d1Name} ${style(d1Existing.uuid, 'gray')}`);
  }
  for (const b of R2_BUCKETS) {
    const name = r2Names[b.key];
    if (r2Set.has(name)) {
      log(`  ${style('·', 'gray')} reuse R2 ${name}`);
    } else {
      process.stdout.write(`  ${style('+', 'green')} create R2 ${name}... `);
      await createR2(wrangler, accountId, name);
      log(style('done', 'green'));
    }
  }
  for (const title of KV_NAMESPACES) {
    if (kvByTitle.has(title)) {
      log(`  ${style('·', 'gray')} reuse KV ${title} ${style(kvByTitle.get(title), 'gray')}`);
    } else {
      process.stdout.write(`  ${style('+', 'green')} create KV ${title}... `);
      await createKv(wrangler, accountId, title);
      log(style('done', 'green'));
    }
  }
  if (pagesSet.has(pagesName)) {
    log(`  ${style('·', 'gray')} reuse Pages ${pagesName}`);
  } else {
    process.stdout.write(`  ${style('+', 'green')} create Pages ${pagesName}... `);
    await createPages(wrangler, accountId, pagesName);
    log(style('done', 'green'));
  }

  log(style('\n▸ Resolving IDs', 'bold', 'blue'));
  const [d1List2, kvList2] = await Promise.all([listD1(wrangler, accountId), listKv(wrangler, accountId)]);
  const d1Final = d1List2.find(d => d.name === d1Name);
  if (!d1Final) throw new Error(`D1 ${d1Name} not visible after create`);
  const kvFinal = new Map(kvList2.map(k => [k.title, k.id]));
  for (const title of KV_NAMESPACES) {
    if (!kvFinal.has(title)) throw new Error(`KV ${title} not visible after create`);
  }

  return {
    d1: { name: d1Name, id: d1Final.uuid },
    r2: r2Names,
    kv: Object.fromEntries(KV_NAMESPACES.map(t => [t, kvFinal.get(t)])),
    pages: { name: pagesName },
    accountId,
  };
}

function printPlanTable(plan) {
  const w = { type: 5, name: Math.max(4, ...plan.map(p => p.name.length)), status: 6 };
  const pad = (s, n) => String(s).padEnd(n);
  log(`  ${style(pad('TYPE', w.type), 'bold')}  ${style(pad('NAME', w.name), 'bold')}  ${style('STATUS', 'bold')}`);
  for (const p of plan) {
    const color = p.status === 'create' ? 'green' : (p.status === 'skip' ? 'yellow' : 'gray');
    log(`  ${pad(p.type, w.type)}  ${pad(p.name, w.name)}  ${style(p.status, color)}${p.id ? '  ' + style(p.id, 'gray') : ''}`);
  }
}

function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

async function loadUserEnv() {
  const path = join(REPO, '.env');
  if (!existsSync(path)) return {};
  try { return parseDotenv(await readFile(path, 'utf8')); } catch { return {}; }
}

function buildLegacyMap(state) {
  return {
    'your-database-name':          state.d1.name,
    'your-d1-database-id':         state.d1.id,
    'your-attachments-bucket':     state.r2.storage,
    'your-jwt-keys-kv-id':         state.kv.JWT_KEYS,
    'your-cache-kv-id':            state.kv.CACHE,
  };
}

function buildEnvsubstMap(state, userEnv) {
  const m = {
    '${D1_DATABASE_NAME}':       state.d1.name,
    '${D1_DATABASE_ID}':         state.d1.id,
    '${R2_BUCKET}':              state.r2.storage,
    '${KV_JWT_KEYS_ID}':         state.kv.JWT_KEYS,
    '${KV_CACHE_ID}':            state.kv.CACHE,
  };
  for (const k of ['DOMAIN', 'ALLOWED_ORIGINS', 'OAUTH_LINUXDO_CLIENT_ID']) {
    if (userEnv[k]) m[`\${${k}}`] = userEnv[k];
  }
  return m;
}

function applyReplacements(text, map) {
  let out = text;
  for (const [needle, value] of Object.entries(map)) {
    out = out.split(needle).join(value);
  }
  const stripped = out.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
  const stillThere = [...stripped.matchAll(/\$\{[A-Z0-9_]+\}/g)].map(m => m[0]);
  return { out, remaining: [...new Set(stillThere)] };
}

async function renderToml(srcRel, dstRel, legacyMap, envsubstMap) {
  const src = join(REPO, srcRel);
  const dst = join(REPO, dstRel);
  let text = await readFile(src, 'utf8');
  for (const [k, v] of Object.entries(legacyMap)) text = text.split(k).join(v);
  const { out, remaining } = applyReplacements(text, envsubstMap);
  await writeFile(dst, out);
  return { dst, remaining };
}

async function renderEnv(state) {
  const src = join(REPO, ENV_FILE.example);
  const dst = join(REPO, ENV_FILE.target);
  let text = await readFile(src, 'utf8');
  text = text.split('your_d1_database_id').join(state.d1.id);
  text = text.split('your_pages_project_name').join(state.pages.name);
  if (state.accountId) text = text.split('your_account_id').join(state.accountId);
  if (!existsSync(dst)) await writeFile(dst, text);
  return dst;
}

async function main() {
  const args = parseCli();
  log(style('PMail Bootstrap', 'bold', 'cyan'));
  log(style(`  repo: ${REPO}`, 'gray'));
  if (args['dry-run'])       log(style('  mode: dry-run', 'yellow'));
  if (args['name-suffix'])   log(style(`  suffix: -${args['name-suffix']}`, 'gray'));

  const wrangler = resolveWrangler();
  const { accountId } = preflight(wrangler, args);

  const state = await planAndExecute(wrangler, accountId, args);
  if (!state) return;

  log(style('\n▸ Writing config files', 'bold', 'blue'));
  const userEnv = await loadUserEnv();
  const legacyMap = buildLegacyMap(state);
  const envsubstMap = buildEnvsubstMap(state, userEnv);

  const allRemaining = new Set();
  for (const f of TOML_FILES) {
    const { dst, remaining } = await renderToml(f.example, f.target, legacyMap, envsubstMap);
    log(`  ${style('✓', 'green')} ${dst.replace(REPO + '/', '')}`);
    remaining.forEach(r => allRemaining.add(r));
  }
  const envPath = await renderEnv(state);
  log(`  ${style('✓', 'green')} ${envPath.replace(REPO + '/', '')}${existsSync(envPath) && (await readFile(envPath, 'utf8')).includes('your_') ? style(' (existing, preserved)', 'gray') : ''}`);

  if (allRemaining.size) {
    warn(`Unfilled template variables: ${[...allRemaining].join(', ')}`);
    log(style('     → set these in .env and re-run, or edit wrangler.toml directly.', 'gray'));
  }

  log(style('\n✓ Bootstrap complete.', 'bold', 'green'));
  log(style('\nNext steps:', 'bold'));
  log(`  1. Fill ${style('DOMAIN / ALLOWED_ORIGINS / OAUTH_LINUXDO_CLIENT_ID', 'cyan')} in .env, then re-run to fill [vars]`);
  log(`  2. Set worker secrets:`);
  log(`       ${style('cd workers/api  && npx wrangler secret put TURNSTILE_SECRET_KEY', 'cyan')}`);
  log(`       ${style('cd workers/api  && npx wrangler secret put OAUTH_LINUXDO_CLIENT_SECRET', 'cyan')}`);
  log(`  3. Configure GitHub Secrets (see docs/DEPLOYMENT.md §3.2) and:`);
  log(`       ${style('git push origin main', 'cyan')}    # GitHub Actions deploys`);
}

main().catch(err => die(err.stack || err.message || String(err)));
