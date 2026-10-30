#!/usr/bin/env node
/**
 * Prepares Jira comment bodies from the commits in a git range.
 *
 * The script never talks to Jira. It reads git history and prints the comment
 * bodies that a Jira client — the Atlassian MCP server, or a person copying
 * and pasting — can post. Generating the text here and doing the network call
 * elsewhere keeps the wording deterministic and reviewable in a diff, and it
 * means the script needs no credentials.
 *
 * A commit is tied to a ticket by looking for the project key in this order:
 * the commit subject, then the body, then the branch name. The first place
 * that mentions exactly one key wins. A commit that mentions several keys is
 * reported as ambiguous rather than guessed at, because silently picking one
 * would file the work under the wrong ticket.
 *
 * Squash merges are expanded into the commits they contain, so a branch that
 * was merged with `--squash` still files against the right ticket.
 *
 * Usage:
 *   node scripts/jira-commit-report.mjs [--range <git range>] [--json]
 *
 * Environment:
 *   JIRA_PROJECT_KEY  The project key to look for. Defaults to RES.
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_RANGE = 'origin/main..HEAD';

/** Reads the project key out of the environment. */
function projectKey() {
  const key = process.env.JIRA_PROJECT_KEY ?? 'RES';

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(
      `JIRA_PROJECT_KEY is not a valid project key: ${JSON.stringify(key)}`,
    );
  }

  return key.toUpperCase();
}

/** Runs a git command and returns its stdout. */
function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

/** Parses the command line. */
function parseArgs(argv) {
  const options = { range: DEFAULT_RANGE, json: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--range') {
      options.range = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--range=')) {
      options.range = arg.slice('--range='.length);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.range) {
    throw new Error('--range needs a value, for example origin/main..HEAD');
  }

  return options;
}

/** Prints the usage text. */
function usage() {
  console.log(`Usage: node scripts/jira-commit-report.mjs [--range <git range>] [--json]

Options:
  --range <git range>  Commits to report on. Defaults to ${DEFAULT_RANGE}.
  --json               Print the report as JSON instead of text.
  -h, --help           Show this message.

Environment:
  JIRA_PROJECT_KEY     The project key to look for. Defaults to RES.`);
}

/**
 * Returns the name of the current branch.
 *
 * `rev-parse --abbrev-ref HEAD` prints `HEAD` when the repository is in the
 * detached state, which happens in CI and after a checkout of a commit hash.
 * The branch is only a hint in the report, so the detached state falls back to
 * the short commit hash instead of printing a useless `HEAD`.
 */
function readBranchName() {
  const name = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  if (name && name !== 'HEAD') return name;

  return git(['rev-parse', '--short', 'HEAD']).trim();
}

/**
 * Reads the commits of a range, oldest first.
 *
 * The metadata and the file statistics are read in two passes. A single pass
 * would be ambiguous, because a commit body may span several lines and would
 * be indistinguishable from the numstat lines that follow it.
 */
function readCommits(range) {
  const separator = '\x1e';
  const field = '\x1f';

  const raw = git([
    'log',
    `--format=${separator}%H${field}%an${field}%ae${field}%s${field}%b${field}%P`,
    range,
  ]);

  const commits = raw
    .split(separator)
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const [sha, author, email, subject, body, parents] = chunk.split(field);
      return {
        sha,
        shortSha: sha.slice(0, 7),
        author,
        email,
        subject,
        body: body ?? '',
        parents: (parents ?? '').trim().split(/\s+/).filter(Boolean),
      };
    })
    .reverse();

  return commits;
}

/**
 * Reads the per-commit file statistics of a range.
 *
 * @returns {Map<string, { path: string, added: number, removed: number }[]>}
 */
function readFileStats(range) {
  const raw = git(['log', '--numstat', '--format=%H', range]);

  const stats = new Map();
  let current = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (/^[0-9a-f]{40}$/.test(trimmed)) {
      current = trimmed;
      if (!stats.has(current)) stats.set(current, []);
      continue;
    }

    if (!current || trimmed.length === 0) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;

    const [added, removed, path] = parts;

    // A binary file has no line counts. Git writes `-` in both columns.
    if (added === '-' && removed === '-') {
      stats.get(current).push({ path: normalisePath(path), binary: true });
      continue;
    }

    stats.get(current).push({
      path: normalisePath(path),
      added: added === '-' ? 0 : Number(added),
      removed: removed === '-' ? 0 : Number(removed),
    });
  }

  return stats;
}

/**
 * Returns the destination path of a numstat entry.
 *
 * Git writes a rename as `old => new`, or as `pre{old => new}post` when only
 * part of the path changed. Both forms name the destination in the second
 * position.
 */
function normalisePath(path) {
  const arrow = path.indexOf('=>');
  if (arrow === -1) return path;

  const after = path.slice(arrow + 2).trim();
  const brace = after.indexOf('}');

  return brace === -1 ? after : after.slice(brace + 1);
}

/**
 * Splits the body of a squash merge into the commits it contains.
 *
 * Git writes such a body as a series of blocks, each starting with a
 * `commit <sha>` line, followed by the author and date, then the subject and
 * the message indented by four spaces.
 */
function parseSquashCommits(body) {
  const blockPattern =
    /^commit ([0-9a-f]{40})\nAuthor:.*?\nDate:.*?\n\n((?: {4}.*\n?|\n)*)/gm;

  const parsed = [];

  for (const match of body.matchAll(blockPattern)) {
    const [, sha, block] = match;
    const lines = block.split('\n');
    const subjectLine = lines.find((line) => /^ {4}\S/.test(line));

    if (!subjectLine) continue;

    parsed.push({
      sha,
      shortSha: sha.slice(0, 7),
      subject: subjectLine.trim(),
      body: lines
        .filter((line) => /^ {4}/.test(line))
        .map((line) => line.slice(4))
        .join('\n')
        .trim(),
    });
  }

  return parsed;
}

/**
 * Finds the ticket keys mentioned in a text.
 *
 * @returns {string[]} The distinct keys, in order of appearance.
 */
function findKeys(text, pattern) {
  const found = [];
  const matcher = new RegExp(pattern.source, 'g');

  for (const match of text.matchAll(matcher)) {
    const key = match[0].toUpperCase();
    if (!found.includes(key)) found.push(key);
  }

  return found;
}

/**
 * Resolves the ticket of a commit.
 *
 * @returns {{ key: string | null, source: string, ambiguous: string[] }}
 */
function resolveTicket(commit, branch, pattern) {
  const subjectKeys = findKeys(commit.subject, pattern);

  if (subjectKeys.length === 1) {
    return { key: subjectKeys[0], source: 'subject', ambiguous: [] };
  }
  if (subjectKeys.length > 1) {
    return { key: null, source: 'subject', ambiguous: subjectKeys };
  }

  const bodyKeys = findKeys(commit.body, pattern);

  if (bodyKeys.length === 1) {
    return { key: bodyKeys[0], source: 'body', ambiguous: [] };
  }
  if (bodyKeys.length > 1) {
    return { key: null, source: 'body', ambiguous: bodyKeys };
  }

  const branchKeys = findKeys(branch, pattern);

  if (branchKeys.length === 1) {
    return { key: branchKeys[0], source: 'branch', ambiguous: [] };
  }
  if (branchKeys.length > 1) {
    return { key: null, source: 'branch', ambiguous: branchKeys };
  }

  return { key: null, source: 'none', ambiguous: [] };
}

/**
 * Builds the markdown body of a ticket comment.
 *
 * The formatting is deliberately plain: Jira renders a markdown list, but a
 * markdown table depends on the renderer, and a comment that loses its
 * structure on one board is worse than a comment with no structure at all.
 */
function buildCommentBody(ticket, commits, branch, stats, statsKey) {
  const lines = [];

  lines.push(
    `**Commit report** — ${commits.length} commit${commits.length === 1 ? '' : 's'} on \`${branch}\``,
  );
  lines.push('');

  for (const commit of commits) {
    lines.push(`- \`${commit.shortSha}\` — ${commit.subject} — *${commit.author}*`);
  }

  const touched = new Map();

  for (const commit of commits) {
    // The statistics of a commit inside a squash merge are the statistics of
    // the merge, so the mapping decides which commit is looked up.
    const key = statsKey.get(commit.sha) ?? commit.sha;

    for (const file of stats.get(key) ?? []) {
      const existing = touched.get(file.path);

      if (existing) {
        existing.added += file.added;
        existing.removed += file.removed;
      } else {
        touched.set(file.path, { ...file });
      }
    }
  }

  if (touched.size > 0) {
    lines.push('');
    lines.push('**Files changed**');
    lines.push('');

    const ordered = [...touched.entries()].sort(([, a], [, b]) => {
      const aSize = a.binary ? 0 : a.added + a.removed;
      const bSize = b.binary ? 0 : b.added + b.removed;
      return bSize - aSize;
    });

    for (const [path, file] of ordered.slice(0, 20)) {
      lines.push(
        file.binary
          ? `- \`${path}\` (binary)`
          : `- \`${path}\` (+${file.added} −${file.removed})`,
      );
    }

    if (ordered.length > 20) {
      lines.push(`- … and ${ordered.length - 20} more file(s)`);
    }
  }

  return lines.join('\n');
}

/**
 * Builds the report.
 *
 * @returns {{ range: string, projectKey: string, branch: string, comments: object[], skipped: object[] }}
 */
function buildReport(range) {
  const key = projectKey();
  const pattern = new RegExp(`\\b${key}-\\d+\\b`, 'gi');

  const branch = readBranchName();
  const commits = readCommits(range);
  const stats = readFileStats(range);

  const tickets = new Map();
  const skipped = [];
  const statsKey = new Map();

  for (const commit of commits) {
    const expanded = commit.parents.length > 1 ? [] : parseSquashCommits(commit.body);

    if (expanded.length === 0) {
      const ticket = resolveTicket(commit, branch, pattern);

      if (!ticket.key) {
        skipped.push({
          sha: commit.shortSha,
          subject: commit.subject,
          reason:
            ticket.ambiguous.length > 0
              ? `mentions ${ticket.ambiguous.join(', ')}`
              : 'no ticket key',
        });
        continue;
      }

      const entry = tickets.get(ticket.key) ?? {
        issueKey: ticket.key,
        sources: new Set(),
        commits: [],
      };

      entry.sources.add(ticket.source);
      entry.commits.push(commit);
      statsKey.set(commit.sha, commit.sha);
      tickets.set(ticket.key, entry);
      continue;
    }

    // A squash merge stands for the commits it contains. Report those instead,
    // so the ticket is the one that the individual work belonged to.
    for (const inner of expanded) {
      const ticket = resolveTicket(
        { subject: inner.subject, body: inner.body },
        branch,
        pattern,
      );

      if (!ticket.key) {
        skipped.push({
          sha: inner.shortSha || commit.shortSha,
          subject: inner.subject,
          reason:
            ticket.ambiguous.length > 0
              ? `mentions ${ticket.ambiguous.join(', ')}`
              : 'no ticket key',
        });
        continue;
      }

      const entry = tickets.get(ticket.key) ?? {
        issueKey: ticket.key,
        sources: new Set(),
        commits: [],
      };

      entry.sources.add(ticket.source);
      entry.commits.push({
        sha: inner.sha || commit.sha,
        shortSha: inner.shortSha || commit.shortSha,
        author: commit.author,
        email: commit.email,
        subject: inner.subject,
        body: inner.body,
      });

      // The commits inside a squash merge are not in the range, so the file
      // statistics of the merge itself stand in for all of them.
      statsKey.set(inner.sha || commit.sha, commit.sha);
      tickets.set(ticket.key, entry);
    }
  }

  const comments = [...tickets.values()]
    .sort((a, b) => a.issueKey.localeCompare(b.issueKey))
    .map((entry) => ({
      issueKey: entry.issueKey,
      sources: [...entry.sources].sort(),
      commits: entry.commits,
      body: buildCommentBody(entry, entry.commits, branch, stats, statsKey),
    }));

  return {
    range,
    projectKey: key,
    branch,
    comments,
    skipped,
  };
}

/** Prints the report as text. */
function printText(report) {
  console.log(`Range    ${report.range}`);
  console.log(`Branch   ${report.branch}`);
  console.log(`Project  ${report.projectKey}`);
  console.log('');

  if (report.comments.length === 0) {
    console.log('No commit carries a ticket key.');
  }

  for (const comment of report.comments) {
    console.log(`--- ${comment.issueKey} (via ${comment.sources.join(', ')}) ---`);
    console.log(comment.body);
    console.log('');
  }

  if (report.skipped.length > 0) {
    console.log('Skipped, no ticket key:');
    for (const item of report.skipped) {
      console.log(`  ${item.sha}  ${item.subject}  — ${item.reason}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  const report = buildReport(options.range);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printText(report);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
