import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'tests']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
}
walk(root);

const errors = [];
const playUrl = 'https://play.google.com/store/apps/details?id=com.y1ksoftware.expensetracker';
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${rel}: missing title`);
  if (!/<meta\s+name=["']description["']/i.test(html)) errors.push(`${rel}: missing meta description`);
  if (!/<link\s+rel=["']canonical["']/i.test(html)) errors.push(`${rel}: missing canonical`);
  if (!/<h1\b/i.test(html)) errors.push(`${rel}: missing H1`);
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch (error) { errors.push(`${rel}: invalid JSON-LD (${error.message})`); }
  }
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const ref = match[1];
    if (!ref.startsWith('/') || ref.startsWith('//')) continue;
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!clean) continue;
    let target = path.join(root, clean);
    if (clean.endsWith('/')) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) errors.push(`${rel}: broken local reference ${ref}`);
  }
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/Get a (Free )?Quote/i.test(text) && !['#contact', '/#contact'].includes(href)) {
      errors.push(`${rel}: quote CTA does not target the enquiry section (${href})`);
    }
    if (/(Google Play|Download Expense Tracker)/i.test(text) && href !== playUrl) {
      errors.push(`${rel}: incorrect Expense Tracker download URL (${href})`);
    }
  }
}

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const field of ['name', 'email', 'phone', 'service', 'project', 'website']) {
  if (!new RegExp(`name=["']${field}["']`).test(home)) errors.push(`index.html: contact form missing ${field} field`);
}
if (!home.includes('mailto:y1ksoftwaresupport@gmail.com')) errors.push('index.html: missing direct email fallback');
const script = fs.readFileSync(path.join(root, 'assets/site.js'), 'utf8');
if (!script.includes('mailto:y1ksoftwaresupport@gmail.com?subject=${subject}&body=${body}')) errors.push('assets/site.js: enquiry email generation missing or incorrect');
if (fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim() !== 'y1ksoftware.in') errors.push('CNAME: expected y1ksoftware.in');
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
if (!robots.includes('Sitemap: https://y1ksoftware.in/sitemap.xml')) errors.push('robots.txt: sitemap declaration missing');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} HTML files: metadata, headings, JSON-LD, and local references are valid.`);
