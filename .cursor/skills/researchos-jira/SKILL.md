---
name: researchos-jira
description: Files work against the ResearchOS Jira project — maps commits and branches onto RES tickets, posts commit reports as Jira comments, keeps ticket status in step with the code, and records the team workflow. Use when the user mentions Jira, a RES ticket, filing commits against a ticket, posting a commit report, or when a branch or commit needs to be linked to work in the RES project.
---

# ResearchOS Jira

The RES project in Jira is the team's task board. The code lives in git and the
tasks live in Jira, so the rule that keeps the two honest is one sentence:

> Every commit that does work names the ticket it does the work for.

This skill is the *how*. The generator that produces the comment text lives in
`scripts/jira-commit-report.mjs`. The workflow the humans follow is written
down in `docs/jira-workflow.md`.

## The pieces

| Thing | Value |
| --- | --- |
| Project | `RES` — "ResearchOS", a simplified software project |
| Ticket | `RES-<number>` |
| Site | `thientm2727.atlassian.net` |
| `cloudId` | `6d1be1ff-50cc-4d67-8485-8ac2808c6bc2` |
| MCP server | `user-atlassian`, from `https://mcp.atlassian.com/v2/mcp` |

The `cloudId` is a constant for this site. Every Jira tool call needs it as a
**top-level** argument, never nested inside `inputs`.

## Before starting

Confirm the server is reachable and that the ticket exists:

```text
getAccessibleAtlassianResources   → confirms the cloudId and your access
searchJiraIssuesUsingJql          → confirms the ticket exists
```

`searchJiraIssuesUsingJql` **rejects an unbounded query**. A bare
`ORDER BY updated DESC` returns `400 Unbounded JQL queries are not allowed
here`. Always bind the query:

```jql
project = RES AND status != Done ORDER BY updated DESC
```

## Step 1 — Produce the report

Do not write the comment text by hand. The generator reads git and prints it,
so the wording is the same every time and it can be reviewed in a diff.

```powershell
node scripts/jira-commit-report.mjs --range origin/main..HEAD
```

| Flag | Meaning |
| --- | --- |
| `--range <range>` | Which commits to report on. Defaults to `origin/main..HEAD`. |
| `--json` | Print the report as JSON, for the agent to read. |
| `-h` | Usage. |

`JIRA_PROJECT_KEY` overrides the project key. It defaults to `RES`.

The generator looks for the ticket key in the commit subject, then the commit
body, then the branch name. The first place that names exactly one ticket
wins.

Three details worth knowing:

- **Several tickets in one commit is not a guess.** The commit is reported as
  ambiguous and skipped. File it under one ticket and the other work becomes
  invisible.
- **A squash merge is expanded.** The commits inside it are reported
  individually, so a branch merged with `--squash` still files against the
  right ticket.
- **A commit with no ticket is not silently dropped.** It appears in the
  skipped list with the reason.

## Step 2 — Post the comment

Read the report with `--json`, then post each body to its ticket:

```text
addOrEditJiraIssueComment
  cloudId:      6d1be1ff-50cc-4d67-8485-8ac2808c6bc2
  issueIdOrKey: RES-17
  commentBody:  <the body from the report>
```

Omit `commentId` to add a comment. Pass a `commentId` to edit one.

The body is **markdown**, which is the default. Only set
`contentFormat: html` when the body carries inline media, because a markdown
round trip drops it.

**Post one comment per ticket, not one per commit.** The report already groups
the commits by ticket.

Do not post a comment when the report has no comments. An empty report means
the branch carries no ticket, and that is a question for the person, not an
empty comment on a ticket.

## Step 3 — Move the ticket

The RES workflow for a `Task`:

| Status | Category | Meaning |
| --- | --- | --- |
| `To Do` | new | Not started. |
| `In Development` | indeterminate | In progress. |
| `In Review` | indeterminate | Waiting for review. |
| `To Test` | indeterminate | Reviewed, handed to the tester. |
| `Done` | done | Finished. |
| `Closed` | new | Cancelled or archived. |

`transitionJiraIssue` takes a **transition id**, and a transition's name is not
its target status — "Done" may be reached by a transition called
`Review->Done`. Read the available transitions first:

```text
listJiraIssueTransitions
  cloudId:      6d1be1ff-50cc-4d67-8485-8ac2808c6bc2
  issueIdOrKey: RES-17
```

Match on the status a transition *leads to*, then pass that transition's id:

```text
transitionJiraIssue
  cloudId:      6d1be1ff-50cc-4d67-8485-8ac2808c6bc2
  issueIdOrKey: RES-17
  transitionId: <id from listJiraIssueTransitions>
```

The tool returns the status the issue actually landed in, so no read-back is
needed.

`transitionJiraIssue` also accepts a `fields` object for setting fields during
the transition. A comment passed in `update` may be dropped without error —
use `addOrEditJiraIssueComment` for comments.

## Step 4 — Create a ticket

When work has no ticket yet:

```text
createJiraIssue
  cloudId:      6d1be1ff-50cc-4d67-8485-8ac2808c6bc2
  projectKey:   RES
  issueType:    Task
  summary:      <one line>
```

Custom fields go in `additional_fields`, keyed by field name or by
`customfield_*` id. A rejected create returns a `repairHint` naming the field
at fault — read it and retry rather than guessing again.

If sprint assignment fails, the response still carries the new issue's key and
`sprintAssignment.assigned: false`. Do not create the issue again.

## Common mistakes

| Mistake | What happens | Instead |
| --- | --- | --- |
| Unbounded JQL | `400 Unbounded JQL queries are not allowed` | Bind it: `project = RES AND ...` |
| `cloudId` inside `inputs` | The call fails validation | `cloudId` is a sibling of `name` and `inputs` |
| Guessing an operation name | The call fails | Call `discover` with a verb and the product noun |
| Transition name as target status | The transition is not found | Read `listJiraIssueTransitions`, match on the target status |
| A comment in `transitionJiraIssue.update` | Silently dropped | Use `addOrEditJiraIssueComment` |
| Picking one ticket for a commit mentioning two | The other work vanishes | Split it, or ask |
| Guessing a `cloudId` | `400` on every call | `getAccessibleAtlassianResources` once per session |
| An empty comment | Noise on the ticket | Do not post when the report is empty |

## Operations not in the primary tool list

The MCP server exposes about 327 operations. Only some are primary tools. For
the rest, use `discover` to find the exact name and its inputs, then run it
with the tool matching its risk tier:

```text
discover       → { query: "list jira sprint boards" }
executeRead   → read-only lookups
executeWrite  → creates and updates
executeDestructive → deletes and irreversible changes
```

`cloudId` is required on `execute*` calls and must be a top-level argument.
