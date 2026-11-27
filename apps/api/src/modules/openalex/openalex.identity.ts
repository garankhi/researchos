import { FPT_UNIVERSITY } from './openalex.client.js';
import type { OpenAlexWork, OpenAlexWorkAuthor } from './openalex.types.js';

/**
 * Identity resolution shared by the lookup, the ingest and the candidates.
 *
 * A researcher is identified by a chain, strongest signal first:
 *
 * 1. the OpenAlex author id — the only stable, unambiguous identifier
 *    OpenAlex has;
 * 2. the ORCID — stable, but the researcher may never have registered
 *    one;
 * 3. the name plus the affiliation — the permanent fallback, because a
 *    researcher may have no OpenAlex or ORCID profile at all.
 *
 * The third tier is the one this module implements. It is deliberately
 * conservative: a name that matches several authorships resolves to
 * nothing, because claiming the wrong authorship is worse than asking
 * the researcher to pick.
 */

/**
 * The short OpenAlex author id of a canonical id.
 *
 * OpenAlex reports `https://openalex.org/A5023888391`; the profile stores
 * the short form. Both land on the same key, so the comparison never
 * depends on which form one side carries.
 */
export function shortAuthorId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const bare = trimmed.startsWith('http')
    ? (trimmed.split('/').pop() ?? '')
    : trimmed;
  return bare === '' ? null : bare;
}

/** Name parts that carry no identity: honorifics and suffixes. */
const NAME_NOISE = new Set([
  'dr',
  'dr.',
  'mr',
  'mr.',
  'mrs',
  'mrs.',
  'ms',
  'ms.',
  'prof',
  'prof.',
  'professor',
  'phd',
  'ph.d.',
  'ph.d',
  'md',
  'm.d.',
  'assoc',
  'assoc.',
  'assistant',
]);

/**
 * The significant name tokens of a byline.
 *
 * Order-insensitive and diacritic-insensitive, because Vietnamese
 * bylines vary widely: the family name comes first, the given names are
 * abbreviated or expanded, and OpenAlex records the byline exactly as
 * the publisher wrote it (`"Thi Thuy An Ngo"`, `"Nguyen Van An"`,
 * `"An-Van Nguyen"`). Comparing the token *sets* is what makes one
 * researcher match across those spellings.
 *
 * Hyphens and dots split a token (`"An-Van"` -> `an`, `van`), and the
 * initials a publisher abbreviates are dropped (`"T. A. Ngo"` -> `ngo`),
 * because an initial carries no identity on its own.
 */
export function nameTokens(value: string | null | undefined): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tokens: string[] = [];
  for (const raw of normalized.split(/[^a-z0-9]+/)) {
    if (raw === '') {
      continue;
    }
    if (NAME_NOISE.has(raw)) {
      continue;
    }
    // A single letter is an initial, not a name part.
    if (raw.length === 1) {
      continue;
    }
    tokens.push(raw);
  }
  return tokens;
}

/**
 * Whether two bylines name the same person.
 *
 * The rule has two parts, and both matter.
 *
 * **The name tokens have to be the same set.** `"An-Van Nguyen"` and
 * `"Nguyen Van An"` carry the same tokens and are the same name written
 * the other way round; `"Thi Thuy An Ngo"` and `"Ngo Thi Thuy An"` are
 * the same for the same reason.
 *
 * **A byline that carries only a family name matches a longer one.**
 * `"Dr. T. A. Ngo"` reduces to `ngo` once the initials are dropped, and
 * it is the same person as `"Thi Thuy An Ngo"`. This is the only
 * expansion that is allowed, and only when the short side is a bare
 * surname — a byline that names a family name *and* a given name has to
 * match the given name too.
 *
 * The rule this replaces — every token of the shorter name has to
 * appear in the longer one — accepted `"Dat Quang Tran"` for `"Tran
 * Quang"`, because `tran` and `quang` both appear in the longer name.
 * A token subset is not a name match: the extra token is a *different*
 * given name, not a spelling variation. It also accepted `"Tran Quang
 * Khai"`, which is a different researcher at FPT University.
 *
 * Being strict here costs a false negative rather than a false
 * positive: a work whose byline spells the name differently is left
 * unattributed instead of being attributed to the wrong researcher. The
 * researcher confirms their OpenAlex author during onboarding, and the
 * author id then resolves every work exactly.
 */
export function namesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  if (a.length === b.length) {
    return sameTokens(a, b);
  }
  // A longer byline only matches a shorter one when the shorter one is
  // a bare family name, and that family name is the longer one's.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length !== 1) {
    return false;
  }
  return (
    longer[0] === shorter[0] || longer[longer.length - 1] === shorter[0]
  );
}

/** Whether two token lists carry the same tokens, order aside. */
function sameTokens(left: string[], right: string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((token, index) => token === b[index]);
}

/**
 * Whether an authorship's affiliation is FPT University.
 *
 * The affiliation is matched on the institution's display name, because
 * the raw affiliation strings are what an unlinked authorship carries —
 * there is no institution id to match on for those. The name is compared
 * on a token basis too: `"FPT University, Can Tho, Viet Nam"` contains the
 * tokens of `"FPT University"`.
 */
export function affiliationMatchesFpt(
  affiliations: readonly string[] | null | undefined,
): boolean {
  if (!affiliations || affiliations.length === 0) {
    return false;
  }
  const needle = nameTokens(FPT_UNIVERSITY.name);
  return affiliations.some((affiliation) => {
    const tokens = nameTokens(affiliation);
    if (tokens.length === 0) {
      return false;
    }
    return needle.every((token) => tokens.includes(token));
  });
}

/**
 * The authorship of a work that the researcher occupies.
 *
 * The tier-3 resolution: the byline name matches and the affiliation
 * matches. Returns null when nothing matches, or when more than one
 * authorship matches — the caller must not guess between two candidates.
 */
export function findAuthorshipByName(
  work: Pick<OpenAlexWork, 'authors'>,
  researcherName: string | null | undefined,
  options: { requireAffiliation?: boolean } = {},
): OpenAlexWorkAuthor | null {
  const matches = work.authors.filter((author) => {
    if (!namesMatch(author.name, researcherName)) {
      return false;
    }
    if (options.requireAffiliation === false) {
      return true;
    }
    return affiliationMatchesFpt(author.affiliations);
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Whether a work's named byline sits at FPT University.
 *
 * The works filter pairs the name and the affiliation at the *work*
 * level, so a work passes the filter when a co-author is at FPT
 * University even when the named byline is not. This is the check that
 * narrows such a work back to the researcher.
 *
 * The resolution is the strict one: exactly one authorship may match the
 * name, and it has to be at FPT University. Two bylines with the same
 * name leave the work unattributed — it is dropped rather than guessed
 * at, because attaching another researcher's work to this one is worse
 * than leaving it out.
 */
export function authorshipIsAtFpt(
  work: Pick<OpenAlexWork, 'authors'>,
  researcherName: string,
): boolean {
  return findAuthorshipByName(work, researcherName) !== null;
}

/**
 * Narrows a works page to the works whose named byline is at FPT
 * University.
 *
 * Applied to the name-based fetch, and to the identifier-based fetch as
 * well. The identifier fetch is scoped to FPT at the *work* level, so a
 * work passes it when a co-author is at FPT; this narrows it back down
 * to the works where the researcher themselves are at FPT.
 *
 * The name is matched on tokens, so the byline spelling OpenAlex
 * recorded (`"Tran, Quang Huy"`) still pairs with the account name
 * (`"Tran Quang"`).
 */
export function filterWorksByAuthorship(
  works: OpenAlexWork[],
  researcherName: string,
): OpenAlexWork[] {
  if (researcherName.trim() === '') {
    return works;
  }
  return works.filter((work) => authorshipIsAtFpt(work, researcherName));
}

/**
 * Narrows a works page to the works where the researcher is at FPT
 * University, matched through their identifier.
 *
 * The identifier-based counterpart of `filterWorksByAuthorship`. It is
 * the right filter for the tiers that already resolved the researcher
 * through an identifier: the byline is found by that same identifier,
 * and the affiliation has to match FPT University on *that* byline.
 *
 * A work whose byline is only at FPT through a co-author is dropped —
 * it is another researcher's work.
 */
export function filterWorksByIdentity(
  works: OpenAlexWork[],
  identity: ResearcherIdentity,
): OpenAlexWork[] {
  return works.filter((work) => {
    const authorId = shortAuthorId(identity.openAlexAuthorId);
    if (authorId !== null) {
      const match = work.authors.find(
        (author) =>
          shortAuthorId(author.authorId) === authorId &&
          affiliationMatchesFpt(author.affiliations),
      );
      if (match) {
        return true;
      }
    }
    const orcid = normalizeOrcidValue(identity.orcid);
    if (orcid !== null) {
      const match = work.authors.find(
        (author) =>
          normalizeOrcidValue(author.orcid) === orcid &&
          affiliationMatchesFpt(author.affiliations),
      );
      if (match) {
        return true;
      }
    }
    return authorshipIsAtFpt(work, identity.name);
  });
}

/**
 * The identity of a researcher, as the pull resolved it.
 *
 * The three tiers the platform knows about. `openAlexAuthorId` and
 * `orcid` are the identifiers the researcher confirmed; `name` is the
 * account name, always present, and the affiliation is the hard-coded
 * FPT University.
 */
export interface ResearcherIdentity {
  /** The confirmed OpenAlex author id, or null. */
  openAlexAuthorId: string | null;
  /** The confirmed ORCID, or null. */
  orcid: string | null;
  /** The researcher's name as the account carries it. */
  name: string;
}

/**
 * The order of a work's authorship for a researcher, and how it was found.
 *
 * `tier` records which signal resolved it, so the caller can tell an
 * unambiguous match from a guess. `null` means no tier resolved, and the
 * caller must not claim any authorship.
 */
export interface ResolvedAuthorship {
  /** The 1-based position in the work's author list. */
  order: number;
  /** Which tier resolved it: `AUTHOR_ID`, `ORCID` or `NAME`. */
  tier: 'AUTHOR_ID' | 'ORCID' | 'NAME';
}

/**
 * Resolves the researcher's position in a work's byline.
 *
 * The chain, strongest signal first:
 *
 * 1. **The OpenAlex author id.** The work's authorship carries the id
 *    the pull used, so the comparison is exact. This is the tier every
 *    later pull relies on, once the researcher has confirmed their
 *    author during onboarding.
 * 2. **The ORCID.** The work's authorship carries the ORCID. Stable, but
 *    only for the researchers who registered one.
 * 3. **The name plus the affiliation.** The permanent fallback, for the
 *    researchers with no OpenAlex and no ORCID profile at all. The name
 *    is matched on tokens, and the affiliation has to match FPT
 *    University on the *same* authorship — a byline that only matched
 *    because a co-author was at FPT is not the researcher's.
 *
 * **Every tier is scoped to FPT University.** The researcher is at FPT
 * University, so their authorship is the one at FPT University — and a
 * byline at another institution is another person's, however well its
 * id or ORCID matches.
 *
 * That last rule is not a nicety. An OpenAlex author profile accumulates
 * the bylines of every researcher whose works were merged into it over
 * the years, and an ORCID is often claimed by such a merged profile. A
 * search for one ORCID can therefore return an author at FPT University
 * whose *works* are bylines from all over the world — works whose
 * authorships carry the same ORCID but sit at another institution.
 * Linking those would put another researcher's publication under this
 * researcher's name.
 *
 * Every tier is strict: an ambiguous result resolves to null rather than
 * to a guess, because claiming the wrong authorship would attach another
 * researcher's work to this one.
 */
export function resolveAuthorshipOrder(
  work: Pick<OpenAlexWork, 'authors'>,
  identity: ResearcherIdentity,
): ResolvedAuthorship | null {
  const authorId = shortAuthorId(identity.openAlexAuthorId);
  if (authorId !== null) {
    const match = work.authors.find(
      (author) =>
        shortAuthorId(author.authorId) === authorId &&
        affiliationMatchesFpt(author.affiliations),
    );
    if (match) {
      return { order: match.order, tier: 'AUTHOR_ID' };
    }
  }

  const orcid = normalizeOrcidValue(identity.orcid);
  if (orcid !== null) {
    const match = work.authors.find(
      (author) =>
        normalizeOrcidValue(author.orcid) === orcid &&
        affiliationMatchesFpt(author.affiliations),
    );
    if (match) {
      return { order: match.order, tier: 'ORCID' };
    }
  }

  const byName = findAuthorshipByName(work, identity.name);
  if (byName) {
    return { order: byName.order, tier: 'NAME' };
  }

  return null;
}

/**
 * Normalises an ORCID for comparison.
 *
 * OpenAlex reports the URL form (`https://orcid.org/0000-...`) while the
 * profile may hold the bare form. Both land on the same key.
 */
export function normalizeOrcidValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const orcid = value
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/(dx\.)?orcid\.org\/|orcid:\s*)/, '')
    .trim();
  return orcid === '' ? null : orcid;
}

/**
 * One entry of a stored authors snapshot.
 *
 * The snapshot is the byline the ingest wrote. It carries the OpenAlex
 * author id and the ORCID of each authorship, and — for the works the
 * ingest pulled — the affiliation of that authorship.
 */
export interface SnapshotAuthorEntry {
  /** The byline name. */
  name?: unknown;
  /** The 1-based position in the byline. */
  order?: unknown;
  /** The OpenAlex author id of this authorship. */
  openAlexAuthorId?: unknown;
  /** The ORCID of this authorship. */
  orcid?: unknown;
  /** The affiliation strings of this authorship. */
  affiliations?: unknown;
}

/**
 * The snapshot entries of a stored draft, in byline order.
 *
 * Anything that is not an array, or an entry without a usable name, is
 * skipped rather than throwing: a corrupt snapshot must not take the
 * whole accept path down.
 */
export function snapshotEntries(snapshot: unknown): SnapshotAuthorEntry[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  return snapshot
    .filter(
      (entry): entry is SnapshotAuthorEntry =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    )
    .filter((entry) => typeof entry.name === 'string' && entry.name !== '');
}

/**
 * The affiliation strings of a snapshot entry.
 *
 * The snapshot stores them as a list, but a snapshot written by an older
 * pull has none at all, and a snapshot written by hand may hold a single
 * string. Both are read.
 */
function snapshotAffiliations(entry: SnapshotAuthorEntry): string[] {
  const raw = entry.affiliations;
  if (typeof raw === 'string') {
    return raw.trim() === '' ? [] : [raw.trim()];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim() !== '') {
      out.push(item.trim());
    }
  }
  return out;
}

/**
 * Resolves the researcher's position in a *stored* authors snapshot.
 *
 * The stored counterpart of `resolveAuthorshipOrder`, and it follows the
 * same chain: the OpenAlex author id, then the ORCID, then the name plus
 * the affiliation.
 *
 * **Every tier is scoped to FPT University**, for the same reason as
 * `resolveAuthorshipOrder`: an OpenAlex author profile — and the ORCID
 * it carries — can belong to a byline at another institution. A stored
 * snapshot records the affiliation of each authorship, so the check is
 * possible here, and it is what keeps a foreign work from being accepted
 * as the researcher's own.
 *
 * The name tier is the interesting one. A snapshot written before the
 * affiliation was recorded carries no affiliation at all, so the name
 * tier accepts the match on the name alone — the affiliation check only
 * narrows a snapshot that actually has affiliations. That keeps a work
 * pulled by an older version of the pull acceptable, while a work pulled
 * now — which always records the affiliation — is checked properly.
 *
 * The identifier tiers are stricter: they require the FPT affiliation
 * outright. An ORCID or an author id is shared with the bylines of other
 * researchers, and an entry with no recorded affiliation cannot be told
 * apart from those — so it does not qualify.
 *
 * The name tier is still strict: two snapshot entries matching the same
 * name resolve to nothing.
 */
export function resolveSnapshotOrder(
  snapshot: unknown,
  identity: ResearcherIdentity,
): number | null {
  const entries = snapshotEntries(snapshot);
  if (entries.length === 0) {
    return null;
  }

  const authorId = shortAuthorId(identity.openAlexAuthorId);
  if (authorId !== null) {
    const match = entries.find(
      (entry) =>
        shortAuthorId(entry.openAlexAuthorId) === authorId &&
        snapshotAffiliationIsFpt(entry),
    );
    const order = snapshotOrder(match);
    if (order !== null) {
      return order;
    }
  }

  const orcid = normalizeOrcidValue(identity.orcid);
  if (orcid !== null) {
    const match = entries.find(
      (entry) =>
        normalizeOrcidValue(entry.orcid) === orcid &&
        snapshotAffiliationIsFpt(entry),
    );
    const order = snapshotOrder(match);
    if (order !== null) {
      return order;
    }
  }

  const byName = entries.filter((entry) =>
    namesMatch(entry.name as string, identity.name),
  );
  if (byName.length === 1) {
    const affiliations = snapshotAffiliations(byName[0]);
    if (affiliations.length === 0 || affiliationMatchesFpt(affiliations)) {
      return snapshotOrder(byName[0]);
    }
  }

  return null;
}

/**
 * Whether a snapshot entry is recorded at FPT University.
 *
 * **Strict**: the entry has to carry the FPT affiliation. An entry with
 * no affiliation at all does not qualify for the identifier tiers.
 *
 * The identifier tiers are the dangerous ones — an ORCID or an author
 * id is shared with the bylines of other researchers, and an entry with
 * no recorded affiliation cannot be told apart from those. The name
 * tier is the safe one: the name has to match the researcher's own,
 * and it has to be unambiguous.
 */
function snapshotAffiliationIsFpt(entry: SnapshotAuthorEntry): boolean {
  const affiliations = snapshotAffiliations(entry);
  return affiliations.length > 0 && affiliationMatchesFpt(affiliations);
}

/** The order of a snapshot entry, when it has a usable one. */
function snapshotOrder(entry: SnapshotAuthorEntry | undefined): number | null {
  if (!entry) {
    return null;
  }
  return typeof entry.order === 'number' && Number.isInteger(entry.order)
    ? entry.order
    : null;
}
