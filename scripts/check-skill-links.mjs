// Checks the Cursor skills in `.cursor/skills/` for broken links.
//
// Usage:
//   node scripts/check-skill-links.mjs
//
// A link is broken when the file it points at does not exist, or when it
// carries an anchor that no heading in that file matches.
//
// The anchor rules follow GitHub: lowercase the heading, drop the
// punctuation, and turn each space into a hyphen. A heading that starts
// with a backtick keeps the hyphen that separates it from the next word,
// which is why the anchors here sometimes carry a double hyphen.
//
// The check runs over every skill, because a skill that links into another
// skill breaks when that other skill is reorganized.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const SKILLS = join(ROOT, '.cursor', 'skills');

/** The markdown files of a skill, as paths relative to the repo root. */
function skillFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      files.push(...skillFiles(full));
    } else if (full.endsWith('.md')) {
      files.push(full);
    }
  }

  return files;
}

/** The anchor GitHub would give a heading. */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** The anchors of a markdown file. */
function anchorsOf(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => slugify(line.replace(/^#{1,6}\s+/, '')));
}

if (!existsSync(SKILLS)) {
  console.error(`No skills directory at ${SKILLS}.`);
  process.exit(1);
}

const files = readdirSync(SKILLS)
  .map((name) => join(SKILLS, name))
  .filter((path) => statSync(path).isDirectory())
  .flatMap(skillFiles);

let broken = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const name = relative(ROOT, file);

  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = match[1];

    // A remote link, a mail link and a bare anchor are not ours to check.
    if (/^(https?:|mailto:|#)/.test(link)) {
      continue;
    }

    const [target, anchor] = link.split('#');
    const targetPath = resolve(dirname(file), target);

    if (!existsSync(targetPath)) {
      console.log(`MISSING FILE    ${name} -> ${link}`);
      broken++;
      continue;
    }

    if (!anchor) {
      continue;
    }

    if (!anchorsOf(targetPath).includes(anchor)) {
      console.log(`MISSING ANCHOR  ${name} -> ${link}`);
      console.log(`   have: ${anchorsOf(targetPath).join(', ')}`);
      broken++;
    }
  }
}

console.log(
  broken === 0
    ? `All links in ${files.length} skill files resolve.`
    : `${broken} broken link(s).`,
);

process.exit(broken === 0 ? 0 : 1);
