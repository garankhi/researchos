/**
 * The props every onboarding step receives.
 *
 * The steps are siblings rather than one branching component: each step
 * owns its own layout, and the flow shell owns the navigation. A step
 * therefore receives the data it needs and nothing more.
 *
 * ## Why the steps take callbacks rather than the store
 *
 * The draft lives in a store, but the steps do not read it directly.
 * They take the values they need and the callbacks they act on, so a
 * step is a plain component that can be rendered in a test without a
 * store, and the flow shell stays the one place that knows how the
 * draft is wired.
 */
export interface OnboardingStepProps {
  /** The topic ids the researcher picked, in the draft. */
  topicIds: string[];
  /**
   * The name of each picked topic, by topic id.
   *
   * The draft stores the ids — they are what the finalize call needs —
   * and the names are looked up from the search results, so the step
   * can show what was picked rather than a list of UUIDs.
   */
  topicNames: Record<string, string>;
  /** Adds a topic to the draft. */
  onAdd: (topicId: string, topicName: string) => void;
  /** Removes a topic from the draft. */
  onRemove: (topicId: string) => void;
}
