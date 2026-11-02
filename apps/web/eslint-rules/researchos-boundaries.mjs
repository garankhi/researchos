/**
 * ESLint rules that enforce the ResearchOS frontend boundaries.
 *
 * These three rules used to be prose in the `researchos-ui` skill. Prose
 * does not fail a build, so a reviewer was the only thing standing between
 * the codebase and a cross-feature import or a domain entity leaking into a
 * shared primitive.
 *
 * Each rule here mirrors one documented convention:
 *
 * | Rule | Convention |
 * | --- | --- |
 * | `no-domain-entities-in-ui` | `components/ui/` knows nothing about a domain |
 * | `no-cross-feature-imports` | Features do not import each other |
 * | `feature-name-matches-backend-module` | A feature folder mirrors a backend module |
 *
 * The rules live here rather than in `eslint.config.mjs` because they need
 * the filesystem — the backend module list is read from disk, not hardcoded.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SRC_DIR = path.join(APP_ROOT, 'src');
const API_MODULES_DIR = path.join(
  APP_ROOT,
  '..',
  'api',
  'src',
  'modules',
);

/**
 * Business entities that must not appear in a shared primitive.
 *
 * These are the nouns of the domain, taken from the backend modules the
 * architecture doc plans for. Infrastructure nouns — `health`, `demo`,
 * `query`, `theme` — are deliberately absent: they are not business
 * concepts, and blocking them would make the rule noise.
 */
const DEFAULT_DOMAIN_ENTITIES = [
  'Profile',
  'Publication',
  'Taxonomy',
  'Opportunity',
  'Project',
  'Circle',
  'Group',
  'Export',
  'Integration',
  'Digest',
  'Assistant',
];

/**
 * Returns the path relative to `apps/web`, with forward slashes.
 * Returns `null` for files outside the app.
 */
function relativeToApp(filename) {
  const relative = path.relative(APP_ROOT, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join('/');
}

/**
 * Returns the feature a file belongs to, or `null`.
 *
 * `src/features/taxonomy/hooks/use-taxonomy.ts` belongs to `taxonomy`.
 */
function featureOf(filename) {
  const relative = relativeToApp(filename);
  if (!relative) return null;

  const segments = relative.split('/');
  const featuresIndex = segments.indexOf('features');
  if (featuresIndex === -1) return null;

  return segments[featuresIndex + 1] ?? null;
}

/**
 * Returns `true` when the file lives in `src/components/ui/`.
 */
function isSharedUiPrimitive(filename) {
  const relative = relativeToApp(filename);
  if (!relative) return false;
  return relative.startsWith('src/components/ui/');
}

/**
 * Resolves an import source to an absolute path inside the app.
 *
 * Handles the `@/` alias and relative paths. A bare package specifier
 * (`react`, `@mui/material`) resolves to `null` — it is not our code.
 */
function resolveImport(source, fromFile) {
  let absolute;

  if (source.startsWith('@/')) {
    absolute = path.join(SRC_DIR, source.slice(2));
  } else if (source.startsWith('.')) {
    absolute = path.resolve(path.dirname(fromFile), source);
  } else {
    return null;
  }

  return absolute.split(path.sep).join('/');
}

/**
 * Reads the backend module names, or `null` when the backend is not
 * present (a web-only checkout, a partial clone).
 */
function backendModules() {
  try {
    if (!fs.existsSync(API_MODULES_DIR)) return null;
    return fs
      .readdirSync(API_MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return null;
  }
}

const noDomainEntitiesInUi = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow business-domain entities in shared UI primitives (`components/ui/`).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entities: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      entityInUi:
        '`{{entity}}` is a business-domain entity and must not appear in `components/ui/`. A shared primitive knows nothing about a domain — move this to `features/<domain>/components/`.',
    },
  },

  create(context) {
    // The rule only applies to the shared primitives. A domain entity in
    // `features/taxonomy/components/` is exactly where it belongs.
    if (!isSharedUiPrimitive(context.filename)) return {};

    const options = context.options[0] ?? {};
    const entities = options.entities ?? DEFAULT_DOMAIN_ENTITIES;

    if (!entities.length) return {};

    /**
     * Matches an entity at the start of an identifier: `Profile` and
     * `ProfileCard` match, `Unprofiled` does not. The PascalCase boundary
     * keeps the rule from firing on unrelated words that merely contain an
     * entity name.
     */
    const identifierPattern = new RegExp(
      `^(?:${entities.join('|')})(?![a-z])`,
    );

    /**
     * In JSX text there is no identifier to anchor to, so the entity is
     * matched on a word boundary.
     */
    const textPattern = new RegExp(`\\b(?:${entities.join('|')})\\b`);

    function entityOf(name) {
      return entities.find((candidate) => name.startsWith(candidate));
    }

    function reportEntity(node, entity) {
      context.report({
        node,
        messageId: 'entityInUi',
        data: { entity },
      });
    }

    /**
     * Checks the name a module binds: an import specifier, an exported
     * name, or a declared variable. A property key (`obj.Profile`) is a
     * data shape rather than a domain coupling, so it is not checked.
     */
    function checkBoundName(node, name) {
      if (!identifierPattern.test(name)) return;
      const entity = entityOf(name);
      if (entity) reportEntity(node, entity);
    }

    return {
      ImportSpecifier(node) {
        checkBoundName(node, node.imported.name);
      },

      ImportDefaultSpecifier(node) {
        checkBoundName(node, node.local.name);
      },

      ExportSpecifier(node) {
        checkBoundName(node, node.exported.name);
      },

      TSTypeReference(node) {
        const typeName = node.typeName;
        if (typeName.type === 'Identifier') {
          checkBoundName(node, typeName.name);
        }
      },

      JSXText(node) {
        const match = textPattern.exec(node.value);
        if (!match) return;
        reportEntity(node, match[0]);
      },
    };
  },
};

const noCrossFeatureImports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a feature from importing another feature\'s files directly.',
    },
    schema: [],
    messages: {
      crossFeature:
        '`{{from}}` must not import from `{{to}}`. Features do not import each other — call the other feature\'s hook through its barrel (`@/features/{{to}}`) instead.',
    },
  },

  create(context) {
    const filename = context.filename;
    const ownFeature = featureOf(filename);

    // The rule only applies inside a feature folder.
    if (!ownFeature) return {};

    function checkSource(node, source) {
      const resolved = resolveImport(source, filename);
      if (!resolved) return;

      const segments = resolved.split('/');
      const featuresIndex = segments.indexOf('features');
      if (featuresIndex === -1) return;

      const targetFeature = segments[featuresIndex + 1];
      if (!targetFeature || targetFeature === ownFeature) return;

      context.report({
        node,
        messageId: 'crossFeature',
        data: { from: ownFeature, to: targetFeature },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source.value);
      },

      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node, node.source.value);
      },

      ExportAllDeclaration(node) {
        checkSource(node, node.source.value);
      },

      ImportExpression(node) {
        const source = node.source;
        if (source.type === 'Literal' && typeof source.value === 'string') {
          checkSource(node, source.value);
        }
      },
    };
  },
};

const featureNameMatchesBackendModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every `features/<name>/` folder to mirror a backend module of the same name.',
    },
    schema: [],
    messages: {
      noBackendModule:
        '`features/{{feature}}/` has no matching backend module `apps/api/src/modules/{{feature}}/`. A feature folder is named after the backend module it belongs to, so a reviewer can trace a screen back to its API.',
    },
  },

  create(context) {
    const feature = featureOf(context.filename);
    if (!feature) return {};

    // The backend may not be checked out. Skipping is better than failing
    // every file in a web-only workspace.
    const modules = backendModules();
    if (!modules) return {};

    if (modules.includes(feature)) return {};

    return {
      Program(node) {
        context.report({
          node,
          messageId: 'noBackendModule',
          data: { feature },
        });
      },
    };
  },
};

const noRelativeImportsIntoGeneratedApi = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow relative imports that reach into the Orval-generated `src/lib/api/` tree.',
    },
    schema: [],
    messages: {
      relativeGeneratedImport:
        'Relative import `{{source}}` reaches into the generated `src/lib/api/` tree, which `clean: true` deletes on the next Orval run. Use the `@/lib/api` barrel (or a type-only import from `@/lib/api/models`).',
    },
  },

  create(context) {
    const filename = context.filename;

    // The generated tree imports itself — that is how Orval wires the
    // barrels together. The rule is about *hand-written* code reaching in.
    const relative = relativeToApp(filename);
    if (!relative) return {};
    if (relative.startsWith('src/lib/api/')) return {};

    function checkSource(node, source) {
      // The `@/` alias is already covered by `no-restricted-imports` in
      // `eslint.config.mjs`; this rule exists for the alias-free path.
      if (!source.startsWith('.')) return;

      const resolved = resolveImport(source, filename);
      if (!resolved) return;

      const generated = `${path.join(SRC_DIR, 'lib', 'api').split(path.sep).join('/')}/`;
      if (!resolved.startsWith(generated)) return;

      context.report({
        node,
        messageId: 'relativeGeneratedImport',
        data: { source },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source.value);
      },

      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node, node.source.value);
      },

      ExportAllDeclaration(node) {
        checkSource(node, node.source.value);
      },
    };
  },
};

export const researchosRules = {
  'no-domain-entities-in-ui': noDomainEntitiesInUi,
  'no-cross-feature-imports': noCrossFeatureImports,
  'feature-name-matches-backend-module': featureNameMatchesBackendModule,
  'no-relative-imports-into-generated-api': noRelativeImportsIntoGeneratedApi,
};

export const researchosBoundaryPlugin = {
  meta: {
    name: 'researchos-boundaries',
    version: '1.0.0',
  },
  rules: researchosRules,
};
