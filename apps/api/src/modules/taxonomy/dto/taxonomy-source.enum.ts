/**
 * The source of a taxonomy node.
 *
 * `OPENALEX` marks rows seeded from OpenAlex as the standard reference tree.
 * `LOCAL` marks custom taxonomy terms created locally by the university.
 */
export enum TaxonomySource {
  LOCAL = 'LOCAL',
  OPENALEX = 'OPENALEX',
}
