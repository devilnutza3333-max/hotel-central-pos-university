import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(path.join(root, 'app/api/pos/route.ts'), 'utf8');
const ui = readFileSync(path.join(root, 'app/pos-app.tsx'), 'utf8');
const head = api.slice(api.indexOf('export async function GET('), api.indexOf('export async function POST('));

test('snapshot order query retains limits for tables and finance', () => {
  assert.match(head, /db\.select\(\)\.from\(orders\)[\s\S]*?\.limit\(scope === "finance" \? 1000 : 100\)/);
});

test('snapshot order items query is scoped by order IDs rather than all-history', () => {
  assert.match(head, /const itemRows = orderRows\.length[\s\S]*?inArray\(orderItems\.orderId,[\s\S]*?\.limit\(scope === "finance" \? 1000 : 100\)/);
  assert.doesNotMatch(head, /db\.select\(\)\.from\(orderItems\)\.where\(ne\(orderItems\.status, "void"\)\)/);
});

test('polling waits 12 seconds and skips hidden tabs / duplicate polling', () => {
  assert.match(ui, /setInterval\(scheduledRefresh, 12_000\)/);
  assert.match(ui, /const interval = fastScreen \? 12_000 : 30_000/);
  assert.match(ui, /document\.visibilityState !== "visible" \|\| polling \|\| !snapshotRef\.current/);
  assert.match(ui, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(ui, /document\.removeEventListener\("visibilitychange", onVisible\)/);
});

test('migration files and Cloudflare D1 configuration remain included', () => {
  assert.ok(existsSync(path.join(root, 'drizzle/0014_stock_counts.sql')));
  assert.ok(existsSync(path.join(root, 'scripts/prepare-cloudflare-deploy.mjs')));
  const hosting = JSON.parse(readFileSync(path.join(root, '.openai/hosting.json'), 'utf8'));
  assert.equal(hosting.d1, 'DB');
});

test('deployment package uses pinned pnpm lockfile', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.packageManager, 'pnpm@11.25.0');
  assert.ok(existsSync(path.join(root, 'pnpm-lock.yaml')));
});
