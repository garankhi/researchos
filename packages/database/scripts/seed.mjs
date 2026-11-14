// The ResearchOS seed.
//
// Run with: pnpm db:seed
//
// This is one file on purpose. The taxonomy, the development accounts and
// the demo records are written by the same run, because the demo records
// reference the taxonomy topics and the seeded accounts. Splitting them into
// separate scripts would only mean the caller has to remember the order.
//
// The seed needs no network and no API key: the taxonomy comes from the
// snapshot that is committed to the repository, so a new machine is ready
// in about a second instead of the ninety seconds the online seed needs.
// The snapshot is refreshed by hand with `pnpm db:taxonomy:export`.
//
// The taxonomy is seeded once, not synced. A topic proposed by a user is the
// only one that goes through a review queue; the imported ones need no
// approval.
//
// The taxonomy is imported with the compiled Prisma client rather than with
// raw SQL, so the column and relation names are checked at compile time.
// Prisma 7 emits its client as TypeScript into `src/generated/prisma`, and
// this script runs on plain Node, so the compiled copy in `dist/` is the one
// that is importable. `db:seed` therefore builds the package first.
//
// Every write is an upsert on the identity the schema defines for that
// table, so the seed is idempotent: running it twice leaves the same rows,
// with the same internal ids.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { redactDatabaseUrl, resolveDatabaseUrl } from './database-url.mjs';
import { fail, log } from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The snapshot file. It lives next to the scripts that read it, because it
 * belongs to the seed rather than to the schema.
 */
const SNAPSHOT_PATH = resolve(packageRoot, 'scripts', 'data', 'openalex-taxonomy.json');

/**
 * The schema version of the snapshot file that this script understands.
 */
const SNAPSHOT_VERSION = 1;

/**
 * The number of upserts that run at the same time.
 *
 * The upserts are independent of each other, so they are sent in batches
 * instead of one at a time. The number is kept modest so that the connection
 * pool is not overwhelmed.
 */
const UPSERT_CONCURRENCY = 16;

/**
 * The password of the development accounts.
 *
 * It is a placeholder, not a secret. It only has to be changed before an
 * account is used for anything that matters, which is why the accounts are
 * seeded with `must_change_password` turned off only in the local
 * development setup.
 */
const DEFAULT_PASSWORD = 'ResearchOS!Dev2026';

// ---------------------------------------------------------------------------
// The accounts
// ---------------------------------------------------------------------------

/**
 * The accounts the seed writes.
 *
 * The mix mirrors the roles the application has to be developed against:
 * an admin who can reach the administration endpoints, a researcher who can
 * create content, and a guest who can only read what is public.
 *
 * `user_type` decides the baseline access on its own. A `FACULTY` account is
 * a researcher without any role assignment, a `STAFF` account starts as a
 * guest, and a `STUDENT` account starts as a guest too.
 *
 * The demo accounts are the people the demo records belong to. Their
 * personnel fields — `department_unit`, `academic_title` and
 * `academic_degree` — are filled in by hand from the faculty roster,
 * because the HR provider is deferred (RES-135).
 */
const USERS = [
  {
    email: 'admin@researchos.local',
    full_name: 'Dev Admin',
    user_type: 'STAFF',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: ['ADMIN', 'RESEARCHER'],
  },
  {
    email: 'faculty@researchos.local',
    full_name: 'Dev Faculty',
    user_type: 'FACULTY',
    academic_title: 'PGS',
    academic_degree: 'TS',
    department_unit: 'FPTU',
    // A faculty account is a researcher through the baseline rule in
    // `effective_user_access`, so it needs no role assignment.
    roles: [],
  },
  {
    email: 'student@researchos.local',
    full_name: 'Dev Student',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: ['RESEARCHER'],
  },
  {
    email: 'guest@researchos.local',
    full_name: 'Dev Guest',
    user_type: 'STAFF',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: [],
  },
  {
    email: 'quang.tran@researchos.local',
    full_name: 'Tran Quang',
    user_type: 'FACULTY',
    academic_title: 'TS',
    academic_degree: 'PGS',
    department_unit: 'Khoa Toan Tin',
    roles: [],
  },
  {
    email: 'minh.nguyen@researchos.local',
    full_name: 'Nguyen Minh',
    user_type: 'FACULTY',
    academic_title: 'ThS',
    academic_degree: 'TS',
    department_unit: 'Khoa Toan Tin',
    roles: [],
  },
  {
    email: 'thao.le@researchos.local',
    full_name: 'Le Thao',
    user_type: 'FACULTY',
    academic_title: 'TS',
    academic_degree: 'PGS',
    department_unit: 'Truong Kinh Te',
    roles: [],
  },
  {
    email: 'hung.pham@researchos.local',
    full_name: 'Pham Hung',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'Khoa Toan Tin',
    roles: ['RESEARCHER'],
  },

  // ---------------------------------------------------------------------
  // The extended demo cast
  //
  // The four accounts above are the fixed development roles. The accounts
  // below are the cast the demo records belong to: enough people for the
  // groups to have leads and members, for the opportunities to have
  // applicants and responders, and for the publications to have
  // co-authors beyond their owner.
  //
  // Every one of them is a researcher — `FACULTY` through the baseline
  // rule, `STUDENT` through an explicit `RESEARCHER` role — because the
  // triggers refuse a group without an active lead, an application from
  // a non-researcher, and a follow from a non-researcher.
  // ---------------------------------------------------------------------
  {
    email: 'lan.pham@researchos.local',
    full_name: 'Pham Lan',
    user_type: 'FACULTY',
    academic_title: 'TS',
    academic_degree: 'PGS',
    department_unit: 'Khoa Toan Tin',
    roles: [],
  },
  {
    email: 'dung.tran@researchos.local',
    full_name: 'Tran Dung',
    user_type: 'FACULTY',
    academic_title: 'ThS',
    academic_degree: 'TS',
    department_unit: 'Khoa Toan Tin',
    roles: [],
  },
  {
    email: 'hoa.bui@researchos.local',
    full_name: 'Bui Hoa',
    user_type: 'FACULTY',
    academic_title: 'TS',
    academic_degree: 'PGS',
    department_unit: 'Truong Kinh Te',
    roles: [],
  },
  {
    email: 'nam.do@researchos.local',
    full_name: 'Do Nam',
    user_type: 'FACULTY',
    academic_title: 'ThS',
    academic_degree: 'TS',
    department_unit: 'Truong Kinh Te',
    roles: [],
  },
  {
    email: 'linh.tran@researchos.local',
    full_name: 'Tran Linh',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'Khoa Toan Tin',
    roles: ['RESEARCHER'],
  },
  {
    email: 'anh.vo@researchos.local',
    full_name: 'Vo Anh',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'Khoa Toan Tin',
    roles: ['RESEARCHER'],
  },
  {
    email: 'khanh.ly@researchos.local',
    full_name: 'Ly Khanh',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'Truong Kinh Te',
    roles: ['RESEARCHER'],
  },
  {
    email: 'son.nguyen@researchos.local',
    full_name: 'Nguyen Son',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'Truong Kinh Te',
    roles: ['RESEARCHER'],
  },
];

/**
 * The demo researcher profiles.
 *
 * A profile is keyed by the user it belongs to, so it is created together
 * with the account and updated in place.
 *
 * `profile_confirmed_at` is what makes the researcher visible: the search
 * index only holds a confirmed profile, and an unconfirmed one is not
 * readable either. The demo profiles are confirmed, because the demo has to
 * be searchable.
 */
const PROFILES = [
  {
    email: 'quang.tran@researchos.local',
    orcid_id: '0000-0002-1825-0097',
    scopus_author_id: '66000000001',
    google_scholar_url: 'https://scholar.google.com/citations?user=demo-quang-tran',
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Researches machine learning for industrial systems, with a focus on explainable models.',
  },
  {
    email: 'minh.nguyen@researchos.local',
    orcid_id: '0000-0001-5109-3700',
    scopus_author_id: '66000000002',
    google_scholar_url: 'https://scholar.google.com/citations?user=demo-minh-nguyen',
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Works on natural language processing and knowledge representation for Vietnamese text.',
  },
  {
    email: 'thao.le@researchos.local',
    orcid_id: '0000-0003-1415-926X',
    scopus_author_id: '66000000003',
    google_scholar_url: null,
    availability_status: 'SEEKING_GROUP',
    bio: 'Studies sustainable supply chains and the finance of green transitions.',
  },
  {
    email: 'hung.pham@researchos.local',
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'NOT_AVAILABLE',
    bio: 'Master’s student working on data mining for logistics research.',
  },
  {
    email: 'lan.pham@researchos.local',
    orcid_id: '0000-0001-6244-9987',
    scopus_author_id: '66000000004',
    google_scholar_url: 'https://scholar.google.com/citations?user=demo-pham-lan',
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Builds time series forecasting models for industrial sensor streams and energy demand.',
  },
  {
    email: 'dung.tran@researchos.local',
    orcid_id: '0000-0002-9071-3356',
    scopus_author_id: '66000000005',
    google_scholar_url: null,
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Leads the computer vision work on defect detection in manufacturing lines.',
  },
  {
    email: 'hoa.bui@researchos.local',
    orcid_id: '0000-0001-8391-4472',
    scopus_author_id: '66000000006',
    google_scholar_url: 'https://scholar.google.com/citations?user=demo-bui-hoa',
    availability_status: 'MENTORING_ONLY',
    bio: 'Supervises master’s students on green finance and corporate climate disclosure.',
  },
  {
    email: 'nam.do@researchos.local',
    orcid_id: '0000-0002-3180-6644',
    scopus_author_id: '66000000007',
    google_scholar_url: null,
    availability_status: 'SEEKING_GROUP',
    bio: 'Studies inventory and supply chain optimisation under demand uncertainty.',
  },
  {
    email: 'linh.tran@researchos.local',
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'OPEN_FOR_COLLABORATION',
    bio: 'Graduate student working on retrieval-augmented generation for Vietnamese academic search.',
  },
  {
    email: 'anh.vo@researchos.local',
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'NOT_AVAILABLE',
    bio: 'Graduate student working on anomaly detection in industrial sensor networks.',
  },
  {
    email: 'khanh.ly@researchos.local',
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'LIMITED_AVAILABILITY',
    bio: 'Graduate student studying carbon accounting and emissions reporting for manufacturers.',
  },
  {
    email: 'son.nguyen@researchos.local',
    orcid_id: null,
    scopus_author_id: null,
    google_scholar_url: null,
    availability_status: 'SEEKING_GROUP',
    bio: 'Graduate student interested in reinforcement learning for robotics and control.',
  },
];

/**
 * The demo groups.
 *
 * The lead has to be an active researcher, because the trigger
 * `guard_group_leader_eligibility` rejects a group whose lead is not one.
 */
const GROUPS = [
  {
    code: 'FPTU-AILAB',
    name: 'AI and Data Systems Lab',
    description:
      'Machine learning, natural language processing and explainable AI for Vietnamese industry.',
    lead_email: 'quang.tran@researchos.local',
    members: [
      { email: 'minh.nguyen@researchos.local', role: 'GROUP_LEADER' },
      { email: 'hung.pham@researchos.local', role: 'MEMBER' },
      { email: 'lan.pham@researchos.local', role: 'GROUP_LEADER' },
      { email: 'dung.tran@researchos.local', role: 'MEMBER' },
      { email: 'linh.tran@researchos.local', role: 'MEMBER' },
      { email: 'anh.vo@researchos.local', role: 'MEMBER' },
    ],
  },
  {
    code: 'FPTU-SUSTAIN',
    name: 'Sustainable Supply Chain Group',
    description:
      'Green supply chains, sustainable finance and the energy transition in manufacturing.',
    lead_email: 'thao.le@researchos.local',
    members: [
      { email: 'hung.pham@researchos.local', role: 'MEMBER' },
      { email: 'hoa.bui@researchos.local', role: 'GROUP_LEADER' },
      { email: 'nam.do@researchos.local', role: 'MEMBER' },
      { email: 'khanh.ly@researchos.local', role: 'MEMBER' },
    ],
  },
  {
    code: 'FPTU-FORECAST',
    name: 'Forecasting and Operations Lab',
    description:
      'Time series forecasting, inventory optimisation and decision support under uncertainty.',
    lead_email: 'lan.pham@researchos.local',
    members: [
      { email: 'nam.do@researchos.local', role: 'GROUP_LEADER' },
      { email: 'anh.vo@researchos.local', role: 'MEMBER' },
      { email: 'son.nguyen@researchos.local', role: 'MEMBER' },
    ],
  },
  {
    code: 'FPTU-CVLAB',
    name: 'Computer Vision for Manufacturing Lab',
    description:
      'Visual inspection, defect detection and robotics on the factory floor.',
    lead_email: 'dung.tran@researchos.local',
    members: [
      { email: 'son.nguyen@researchos.local', role: 'GROUP_LEADER' },
      { email: 'quang.tran@researchos.local', role: 'MEMBER' },
      { email: 'anh.vo@researchos.local', role: 'MEMBER' },
    ],
  },
  {
    code: 'FPTU-GREENFIN',
    name: 'Green Finance Research Circle',
    description:
      'Climate disclosure, carbon accounting and the instruments that fund the transition.',
    lead_email: 'hoa.bui@researchos.local',
    members: [
      { email: 'thao.le@researchos.local', role: 'GROUP_LEADER' },
      { email: 'khanh.ly@researchos.local', role: 'MEMBER' },
    ],
  },
  {
    code: 'FPTU-VLPR',
    name: 'Vietnamese Language and Retrieval Group',
    description:
      'Vietnamese language technology, retrieval and evaluation for scientific text.',
    lead_email: 'minh.nguyen@researchos.local',
    members: [
      { email: 'quang.tran@researchos.local', role: 'GROUP_LEADER' },
      { email: 'linh.tran@researchos.local', role: 'MEMBER' },
      { email: 'hung.pham@researchos.local', role: 'MEMBER' },
    ],
  },
];

/**
 * The demo research directions of a group.
 *
 * A direction may point at a taxonomy topic, but the link is optional: a
 * direction can exist before the taxonomy catches up.
 */
const DIRECTIONS = [
  {
    group_code: 'FPTU-AILAB',
    title: 'Explainable AI for industrial decision support',
    description:
      'How far an explanation of a model can be trusted before a human makes the call.',
    topic_external_id: 'https://openalex.org/T12026',
  },
  {
    group_code: 'FPTU-AILAB',
    title: 'Vietnamese language understanding for scientific texts',
    description:
      'A benchmark and a set of models for Vietnamese academic text.',
    topic_external_id: 'https://openalex.org/T10181',
  },
  {
    group_code: 'FPTU-AILAB',
    title: 'Robust learning under distribution shift',
    description:
      'Keeping a deployed model accurate when the sensor distribution moves underneath it.',
    topic_external_id: 'https://openalex.org/T11689',
  },
  {
    group_code: 'FPTU-SUSTAIN',
    title: 'Financing the green transition in manufacturing',
    description:
      'Which instruments actually move a factory off fossil fuel, and which do not.',
    topic_external_id: 'https://openalex.org/T10047',
  },
  {
    group_code: 'FPTU-SUSTAIN',
    title: 'Supply chain visibility under demand uncertainty',
    description:
      'How much of a supply chain a planner can actually see before the disruption arrives.',
    topic_external_id: 'https://openalex.org/T10328',
  },
  {
    group_code: 'FPTU-FORECAST',
    title: 'Probabilistic forecasting for demand and energy load',
    description:
      'Forecasts that carry their own uncertainty, rather than a single point estimate.',
    topic_external_id: 'https://openalex.org/T12205',
  },
  {
    group_code: 'FPTU-FORECAST',
    title: 'Anomaly detection in industrial telemetry',
    description:
      'Finding the equipment fault before it becomes a production stoppage.',
    topic_external_id: 'https://openalex.org/T11512',
  },
  {
    group_code: 'FPTU-CVLAB',
    title: 'Visual inspection and defect detection on the line',
    description:
      'Replacing the manual inspection step without losing the recall the safety case needs.',
    topic_external_id: 'https://openalex.org/T11714',
  },
  {
    group_code: 'FPTU-CVLAB',
    title: 'Reinforcement learning for robotic control',
    description:
      'Learning the motion policy for a robot that works next to people.',
    topic_external_id: 'https://openalex.org/T10462',
  },
  {
    group_code: 'FPTU-GREENFIN',
    title: 'Carbon accounting for mid-sized manufacturers',
    description:
      'A reporting method a factory can actually run without a dedicated sustainability team.',
    topic_external_id: 'https://openalex.org/T10539',
  },
  {
    group_code: 'FPTU-GREENFIN',
    title: 'Corporate climate disclosure and governance',
    description:
      'What the disclosure rules ask of a firm, and what they change about its decisions.',
    topic_external_id: 'https://openalex.org/T10019',
  },
  {
    group_code: 'FPTU-VLPR',
    title: 'Retrieval for Vietnamese academic corpora',
    description:
      'Finding the right passage in a Vietnamese scientific corpus is the hard part.',
    topic_external_id: 'https://openalex.org/T10286',
  },
  {
    group_code: 'FPTU-VLPR',
    title: 'Graph-structured reasoning over scholarly data',
    description:
      'A citation graph carries more signal than a bag of words about the same paper.',
    topic_external_id: 'https://openalex.org/T11273',
  },
];

/**
 * The demo research interests.
 *
 * An interest is declared by the researcher, so `source_type` is `DECLARED`
 * and the status is `ACTIVE`. The trigger `guard_researcher_feature`
 * rejects a declared interest that is still a suggestion, because a declared
 * interest is explicitly selected and not inferred.
 */
const INTERESTS = [
  {
    email: 'quang.tran@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T12026',
      'https://openalex.org/T11689',
      'https://openalex.org/T10181',
    ],
  },
  {
    email: 'minh.nguyen@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10181',
      'https://openalex.org/T12072',
      'https://openalex.org/T10286',
    ],
  },
  {
    email: 'thao.le@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10047',
      'https://openalex.org/T10539',
      'https://openalex.org/T10019',
    ],
  },
  {
    email: 'hung.pham@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T11912',
      'https://openalex.org/T10286',
      'https://openalex.org/T10538',
    ],
  },
  {
    email: 'lan.pham@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T12205',
      'https://openalex.org/T11270',
      'https://openalex.org/T11689',
    ],
  },
  {
    email: 'dung.tran@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T11714',
      'https://openalex.org/T10462',
      'https://openalex.org/T10191',
    ],
  },
  {
    email: 'hoa.bui@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10019',
      'https://openalex.org/T10539',
      'https://openalex.org/T10047',
    ],
  },
  {
    email: 'nam.do@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10328',
      'https://openalex.org/T12205',
      'https://openalex.org/T10054',
    ],
  },
  {
    email: 'linh.tran@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10286',
      'https://openalex.org/T10181',
      'https://openalex.org/T11273',
    ],
  },
  {
    email: 'anh.vo@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T11512',
      'https://openalex.org/T12205',
      'https://openalex.org/T10080',
    ],
  },
  {
    email: 'khanh.ly@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10539',
      'https://openalex.org/T10019',
      'https://openalex.org/T11821',
    ],
  },
  {
    email: 'son.nguyen@researchos.local',
    topic_external_ids: [
      'https://openalex.org/T10462',
      'https://openalex.org/T10191',
      'https://openalex.org/T11714',
    ],
  },
];

/**
 * The demo opportunities.
 *
 * An opportunity is created as a `DRAFT` and then published, because the
 * trigger `normalize_opportunity` refuses a create with any other status.
 * Publishing needs a title, a description, an application deadline and a
 * publication time, which is what `ck_published_opportunity` demands.
 *
 * The deadline is a relative number of days, so the seeded opportunity is
 * always open when the seed runs.
 */
const OPPORTUNITIES = [
  {
    group_code: 'FPTU-AILAB',
    creator_email: 'quang.tran@researchos.local',
    title: 'PhD student wanted: robust machine learning for sensor data',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'STUDENT',
    expected_role: 'PhD student',
    required_expertise_tags: ['machine learning', 'time series', 'python'],
    description:
      'A funded PhD position inside the AI and Data Systems Lab, working on models that keep their accuracy when the sensor drifts.',
    response_sla_days: 5,
    deadline_in_days: 30,
  },
  {
    group_code: 'FPTU-AILAB',
    creator_email: 'minh.nguyen@researchos.local',
    title: 'Co-author wanted on a Vietnamese NLP benchmark paper',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Co-author',
    required_expertise_tags: ['nlp', 'evaluation', 'vietnamese'],
    description:
      'We have the corpus and the annotation guidelines, and we are looking for a co-author who has run an evaluation study before.',
    response_sla_days: 7,
    deadline_in_days: 45,
  },
  {
    group_code: 'FPTU-SUSTAIN',
    creator_email: 'thao.le@researchos.local',
    title: 'Data exchange: emissions data from manufacturing partners',
    opportunity_kind: 'DATA_METHOD_EXCHANGE',
    target_audience: 'FACULTY',
    expected_role: 'Data provider',
    required_expertise_tags: ['sustainability', 'emissions', 'manufacturing'],
    description:
      'Partners who can share anonymised emissions data are welcome. In exchange the group shares the models it builds on top of it.',
    response_sla_days: 10,
    deadline_in_days: 60,
  },
  {
    group_code: 'FPTU-AILAB',
    creator_email: 'quang.tran@researchos.local',
    title: 'Co-author wanted: explainability evaluation for industrial models',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Co-author',
    required_expertise_tags: ['explainable ai', 'evaluation', 'human studies'],
    description:
      'We need someone who has run a human evaluation of model explanations and can write the protocol up cleanly.',
    response_sla_days: 7,
    deadline_in_days: 40,
  },
  {
    group_code: 'FPTU-FORECAST',
    creator_email: 'lan.pham@researchos.local',
    title: 'Master’s project: probabilistic forecasting of factory energy load',
    opportunity_kind: 'PROJECT_FORMATION',
    target_audience: 'STUDENT',
    expected_role: 'Master’s student',
    required_expertise_tags: ['time series', 'forecasting', 'python'],
    description:
      'A funded master’s project on demand forecasting for a mid-sized manufacturer, with real load data and a group that meets every week.',
    response_sla_days: 7,
    deadline_in_days: 50,
  },
  {
    group_code: 'FPTU-FORECAST',
    creator_email: 'nam.do@researchos.local',
    title: 'Data exchange: anonymised production and inventory records',
    opportunity_kind: 'DATA_METHOD_EXCHANGE',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Data provider',
    required_expertise_tags: ['supply chain', 'inventory', 'operations research'],
    description:
      'We are looking for partners willing to share anonymised order and stock records so the inventory models can be tested outside our own case.',
    response_sla_days: 12,
    deadline_in_days: 75,
  },
  {
    group_code: 'FPTU-CVLAB',
    creator_email: 'dung.tran@researchos.local',
    title: 'Co-author wanted on visual inspection for surface defects',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Co-author',
    required_expertise_tags: ['computer vision', 'deep learning', 'manufacturing'],
    description:
      'A defect-detection dataset and a running baseline are in place. We want a co-author who has dealt with the recall-versus-precision trade-off on a real line.',
    response_sla_days: 8,
    deadline_in_days: 55,
  },
  {
    group_code: 'FPTU-CVLAB',
    creator_email: 'son.nguyen@researchos.local',
    title: 'Master’s project: reinforcement learning for robotic grasping',
    opportunity_kind: 'PROJECT_FORMATION',
    target_audience: 'STUDENT',
    expected_role: 'Master’s student',
    required_expertise_tags: ['reinforcement learning', 'robotics', 'python'],
    description:
      'A simulation-first project on learned grasping policies, with hardware access in the second half of the project.',
    response_sla_days: 10,
    deadline_in_days: 65,
  },
  {
    group_code: 'FPTU-GREENFIN',
    creator_email: 'hoa.bui@researchos.local',
    title: 'Funding call: climate disclosure research collaboration',
    opportunity_kind: 'FUNDING_CALL',
    target_audience: 'FACULTY',
    expected_role: 'Co-PI',
    required_expertise_tags: ['climate disclosure', 'corporate governance', 'finance'],
    description:
      'A joint proposal on what climate disclosure changes about corporate decisions, with a small internal seed fund attached.',
    response_sla_days: 14,
    deadline_in_days: 90,
  },
  {
    group_code: 'FPTU-VLPR',
    creator_email: 'minh.nguyen@researchos.local',
    title: 'Co-author wanted: retrieval evaluation for Vietnamese corpora',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Co-author',
    required_expertise_tags: ['information retrieval', 'evaluation', 'vietnamese'],
    description:
      'The corpus is annotated and the baseline is in place. We are looking for someone comfortable designing retrieval metrics.',
    response_sla_days: 7,
    deadline_in_days: 45,
  },
  {
    group_code: 'FPTU-VLPR',
    creator_email: 'quang.tran@researchos.local',
    title: 'Project formation: knowledge graph over the faculty publication record',
    opportunity_kind: 'PROJECT_FORMATION',
    target_audience: 'STUDENT',
    expected_role: 'Master’s student',
    required_expertise_tags: ['knowledge graph', 'graph learning', 'python'],
    description:
      'A master’s project building a citation graph over the faculty record, with an evaluation against a text-only baseline.',
    response_sla_days: 9,
    deadline_in_days: 60,
  },
  {
    group_code: 'FPTU-SUSTAIN',
    creator_email: 'thao.le@researchos.local',
    title: 'Co-author wanted: carbon accounting method for mid-sized firms',
    opportunity_kind: 'RESEARCH_COLLABORATION',
    target_audience: 'ANY_RESEARCHER',
    expected_role: 'Co-author',
    required_expertise_tags: ['carbon accounting', 'sustainability', 'operations research'],
    description:
      'We need a co-author who has actually sat with a factory and worked out what they can measure every month.',
    response_sla_days: 10,
    deadline_in_days: 70,
  },
];

/**
 * The demo publications.
 *
 * A publication is a `research_outputs` row with a released revision. The
 * work is shared, so it is visible in Discovery and in Search without a
 * publish step: the publish action belongs to the deferred external epic
 * (RES-130).
 *
 * The visibility is copied onto the row rather than derived, because
 * `ck_output_access_scope` requires a group-scoped work to name its group.
 */
const OUTPUTS = [
  {
    doi: '10.5555/researchos.demo.0001',
    owner_email: 'quang.tran@researchos.local',
    title: 'Adversarial robustness in industrial sensor networks',
    abstract:
      'We study how a drift in the sensor distribution degrades a deployed classifier, and compare three repair strategies on a public manufacturing dataset.',
    venue: 'Journal of Industrial Informatics',
    publisher: 'FPTU Press',
    publication_year: 2025,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0001',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T11689'],
    authors: [
      { email: 'quang.tran@researchos.local', name: 'Tran Quang', order: 1, corresponding: true },
      { email: 'minh.nguyen@researchos.local', name: 'Nguyen Minh', order: 2, corresponding: false },
      { email: 'lan.pham@researchos.local', name: 'Pham Lan', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0002',
    owner_email: 'minh.nguyen@researchos.local',
    title: 'A benchmark for Vietnamese scientific text understanding',
    abstract:
      'We release a benchmark of Vietnamese scientific passages with annotated question pairs, and report the baseline scores of six models.',
    venue: 'Proceedings of the National Conference on Language Technology',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0002',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10181'],
    authors: [
      { email: 'minh.nguyen@researchos.local', name: 'Nguyen Minh', order: 1, corresponding: true },
      { email: 'quang.tran@researchos.local', name: 'Tran Quang', order: 2, corresponding: false },
      { email: 'linh.tran@researchos.local', name: 'Tran Linh', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0003',
    owner_email: 'thao.le@researchos.local',
    title: 'Financing the green transition in Vietnamese manufacturing',
    abstract:
      'We map the instruments available to a mid-sized manufacturer and find that the ones with the largest headline subsidy are not the ones that change the investment decision.',
    venue: 'Journal of Sustainable Finance',
    publisher: 'FPTU Press',
    publication_year: 2025,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0003',
    visibility: 'RESEARCH_GROUP',
    group_code: 'FPTU-SUSTAIN',
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10047', 'https://openalex.org/T10539'],
    authors: [
      { email: 'thao.le@researchos.local', name: 'Le Thao', order: 1, corresponding: true },
      { email: 'hoa.bui@researchos.local', name: 'Bui Hoa', order: 2, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0004',
    owner_email: 'lan.pham@researchos.local',
    title: 'Probabilistic load forecasting for mid-sized factories',
    abstract:
      'We compare interval forecasts with point forecasts on hourly factory load data, and show that the interval quality matters more than the point accuracy for scheduling decisions.',
    venue: 'International Journal of Energy Systems',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0004',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T12205', 'https://openalex.org/T11270'],
    authors: [
      { email: 'lan.pham@researchos.local', name: 'Pham Lan', order: 1, corresponding: true },
      { email: 'nam.do@researchos.local', name: 'Do Nam', order: 2, corresponding: false },
      { email: 'anh.vo@researchos.local', name: 'Vo Anh', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0005',
    owner_email: 'dung.tran@researchos.local',
    title: 'Recall-aware visual inspection of surface defects',
    abstract:
      'We show that the defect recall a safety case requires pushes the operating point far from what an average F1 score would pick, and report the cost of that gap on two production lines.',
    venue: 'Conference on Industrial Machine Vision',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0005',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T11714'],
    authors: [
      { email: 'dung.tran@researchos.local', name: 'Tran Dung', order: 1, corresponding: true },
      { email: 'quang.tran@researchos.local', name: 'Tran Quang', order: 2, corresponding: false },
      { email: 'son.nguyen@researchos.local', name: 'Nguyen Son', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0006',
    owner_email: 'hoa.bui@researchos.local',
    title: 'What climate disclosure changes in corporate governance',
    abstract:
      'We compare governance outcomes before and after a disclosure mandate, and find the effect concentrates in firms with a weak board rather than in the average firm.',
    venue: 'Journal of Corporate Governance',
    publisher: 'FPTU Press',
    publication_year: 2025,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0006',
    visibility: 'RESEARCH_GROUP',
    group_code: 'FPTU-GREENFIN',
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10019'],
    authors: [
      { email: 'hoa.bui@researchos.local', name: 'Bui Hoa', order: 1, corresponding: true },
      { email: 'thao.le@researchos.local', name: 'Le Thao', order: 2, corresponding: false },
      { email: 'khanh.ly@researchos.local', name: 'Ly Khanh', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0007',
    owner_email: 'nam.do@researchos.local',
    title: 'Inventory visibility under uncertain demand',
    abstract:
      'We quantify how much of a multi-tier supply chain a planner can actually see, and show that visibility below the second tier changes replenishment policy more than any forecast improvement.',
    venue: 'Journal of Supply Chain Management',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0007',
    visibility: 'RESEARCH_GROUP',
    group_code: 'FPTU-FORECAST',
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10328'],
    authors: [
      { email: 'nam.do@researchos.local', name: 'Do Nam', order: 1, corresponding: true },
      { email: 'lan.pham@researchos.local', name: 'Pham Lan', order: 2, corresponding: false },
      { email: 'hung.pham@researchos.local', name: 'Pham Hung', order: 3, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0008',
    owner_email: 'minh.nguyen@researchos.local',
    title: 'Retrieval evaluation for Vietnamese academic corpora',
    abstract:
      'We propose a passage-level retrieval evaluation for Vietnamese scientific corpora, and report the gap between the metrics commonly used and the ones practitioners actually act on.',
    venue: 'Proceedings of the National Conference on Language Technology',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0008',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10286'],
    authors: [
      { email: 'minh.nguyen@researchos.local', name: 'Nguyen Minh', order: 1, corresponding: true },
      { email: 'linh.tran@researchos.local', name: 'Tran Linh', order: 2, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0009',
    owner_email: 'son.nguyen@researchos.local',
    title: 'Learned grasping policies for a robot working near people',
    abstract:
      'We train a grasping policy in simulation and transfer it to hardware, and report the safety behaviour it shows when the grasp fails mid-motion.',
    venue: 'International Conference on Robotics and Automation',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0009',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10462', 'https://openalex.org/T10191'],
    authors: [
      { email: 'son.nguyen@researchos.local', name: 'Nguyen Son', order: 1, corresponding: true },
      { email: 'dung.tran@researchos.local', name: 'Tran Dung', order: 2, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0010',
    owner_email: 'anh.vo@researchos.local',
    title: 'Early detection of equipment faults in industrial telemetry',
    abstract:
      'We compare unsupervised and supervised early-warning signals on a year of sensor telemetry, and report the lead time each method actually delivers before a real stoppage.',
    venue: 'Journal of Industrial Informatics',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0010',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T11512'],
    authors: [
      { email: 'anh.vo@researchos.local', name: 'Vo Anh', order: 1, corresponding: true },
      { email: 'lan.pham@researchos.local', name: 'Pham Lan', order: 2, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0011',
    owner_email: 'khanh.ly@researchos.local',
    title: 'A monthly carbon accounting method a factory can actually run',
    abstract:
      'We derive a monthly emissions accounting method from measurements a mid-sized manufacturer already takes, and report the first-year results for four partner firms.',
    venue: 'Journal of Sustainable Finance',
    publisher: 'FPTU Press',
    publication_year: 2026,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0011',
    visibility: 'RESEARCH_GROUP',
    group_code: 'FPTU-GREENFIN',
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10539', 'https://openalex.org/T11821'],
    authors: [
      { email: 'khanh.ly@researchos.local', name: 'Ly Khanh', order: 1, corresponding: true },
      { email: 'hoa.bui@researchos.local', name: 'Bui Hoa', order: 2, corresponding: false },
    ],
  },
  {
    doi: '10.5555/researchos.demo.0012',
    owner_email: 'hung.pham@researchos.local',
    title: 'Mining logistics data for inventory and route decisions',
    abstract:
      'We apply data mining to a year of logistics records and find that the strongest signal for stock-out risk is the delivery-time variance rather than the demand forecast.',
    venue: 'Proceedings of the National Conference on Language Technology',
    publisher: 'FPTU Press',
    publication_year: 2025,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.5555/researchos.demo.0012',
    visibility: 'FPTU_COMMUNITY',
    group_code: null,
    provenance_tag: 'PAPER',
    topic_external_ids: ['https://openalex.org/T10538', 'https://openalex.org/T11912'],
    authors: [
      { email: 'hung.pham@researchos.local', name: 'Pham Hung', order: 1, corresponding: true },
      { email: 'nam.do@researchos.local', name: 'Do Nam', order: 2, corresponding: false },
    ],
  },
];

/**
 * The demo applications.
 *
 * An application is a researcher asking for a place in an opportunity, so it
 * ties a person to an opportunity, and through the opportunity to the
 * group that published it.
 *
 * The trigger `guard_application` only lets an application start as
 * `PENDING`, and only for an open, unexpired opportunity and a researcher
 * applicant. The response is a separate write, and it needs the responder
 * to be allowed to manage the opportunity.
 *
 * The responder is therefore the creator of the opportunity or a lead of
 * the group it belongs to — never the applicant.
 */
const APPLICATIONS = [
  {
    opportunity_title: 'PhD student wanted: robust machine learning for sensor data',
    applicant_email: 'anh.vo@researchos.local',
    applicant_note:
      'My master’s thesis is on drift in sensor streams, and I would like to continue into a PhD on the same problem.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'PhD student wanted: robust machine learning for sensor data',
    applicant_email: 'linh.tran@researchos.local',
    applicant_note:
      'I work on retrieval, but the robustness half of the problem is what interests me most.',
    status: 'INVITED_TO_DISCUSS',
    responder_email: 'quang.tran@researchos.local',
    response_note:
      'Your evaluation work would be a good fit. Let us talk about the funding arrangements.',
  },
  {
    opportunity_title: 'Co-author wanted on a Vietnamese NLP benchmark paper',
    applicant_email: 'hung.pham@researchos.local',
    applicant_note:
      'I have run an evaluation study for the logistics data mining paper and can bring the methodology across.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Co-author wanted: explainability evaluation for industrial models',
    applicant_email: 'anh.vo@researchos.local',
    applicant_note:
      'I am interested in the human side of the evaluation and have experience with operator interviews.',
    status: 'INVITED_TO_DISCUSS',
    responder_email: 'quang.tran@researchos.local',
    response_note:
      'This matches what we need. Let us sketch the evaluation protocol.',
  },
  {
    opportunity_title: 'Master’s project: probabilistic forecasting of factory energy load',
    applicant_email: 'son.nguyen@researchos.local',
    applicant_note:
      'I have worked on forecasting for a course project and would like to apply it to real load data.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Master’s project: reinforcement learning for robotic grasping',
    applicant_email: 'son.nguyen@researchos.local',
    applicant_note:
      'Reinforcement learning is the subject I want to work on, and the simulation-first structure suits me.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Co-author wanted on visual inspection for surface defects',
    applicant_email: 'lan.pham@researchos.local',
    applicant_note:
      'We have run a line study on the same recall-versus-precision question and can share the measurements.',
    status: 'DECLINED',
    responder_email: 'dung.tran@researchos.local',
    response_note:
      'Thank you — the dataset here is already fixed, so there is no room for a second line study.',
  },
  {
    opportunity_title: 'Co-author wanted: carbon accounting method for mid-sized firms',
    applicant_email: 'khanh.ly@researchos.local',
    applicant_note:
      'The monthly measurement method is the part I want to work on, and I can commit the field work.',
    status: 'INVITED_TO_DISCUSS',
    responder_email: 'thao.le@researchos.local',
    response_note:
      'Good — the field work is exactly the bottleneck. Let us agree on the measurement set.',
  },
  {
    opportunity_title: 'Funding call: climate disclosure research collaboration',
    applicant_email: 'thao.le@researchos.local',
    applicant_note:
      'Our group already has the disclosure data, and the seed fund would let us run the panel study.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Co-author wanted: retrieval evaluation for Vietnamese corpora',
    applicant_email: 'linh.tran@researchos.local',
    applicant_note:
      'I am finishing a master’s project on the same corpus and would like to extend it into a paper.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Project formation: knowledge graph over the faculty publication record',
    applicant_email: 'anh.vo@researchos.local',
    applicant_note:
      'I have worked with the citation export and would like to build the graph pipeline.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Data exchange: anonymised production and inventory records',
    applicant_email: 'hung.pham@researchos.local',
    applicant_note:
      'Our group has records from two suppliers that we could share in anonymised form.',
    status: 'PENDING',
  },
  {
    opportunity_title: 'Data exchange: emissions data from manufacturing partners',
    applicant_email: 'nam.do@researchos.local',
    applicant_note:
      'We can bring the supplier-side emissions data the study needs.',
    status: 'WITHDRAWN',
  },
];

/**
 * The demo follows.
 *
 * A follow is a researcher watching another researcher, a group, a topic or
 * a publication. The trigger `guard_researcher_feature` refuses a follow
 * from an account without researcher access.
 *
 * The entity is named by the kind it is, so a follow on a group points at
 * the group and not at a researcher who happens to share its id.
 */
const FOLLOWS = [
  {
    follower_email: 'hung.pham@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-AILAB',
  },
  {
    follower_email: 'hung.pham@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-FORECAST',
  },
  {
    follower_email: 'hung.pham@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'lan.pham@researchos.local',
  },
  {
    follower_email: 'linh.tran@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-VLPR',
  },
  {
    follower_email: 'linh.tran@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-AILAB',
  },
  {
    follower_email: 'linh.tran@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'minh.nguyen@researchos.local',
  },
  {
    follower_email: 'anh.vo@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-CVLAB',
  },
  {
    follower_email: 'anh.vo@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-FORECAST',
  },
  {
    follower_email: 'anh.vo@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'dung.tran@researchos.local',
  },
  {
    follower_email: 'son.nguyen@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-CVLAB',
  },
  {
    follower_email: 'son.nguyen@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'dung.tran@researchos.local',
  },
  {
    follower_email: 'khanh.ly@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-GREENFIN',
  },
  {
    follower_email: 'khanh.ly@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-SUSTAIN',
  },
  {
    follower_email: 'khanh.ly@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'hoa.bui@researchos.local',
  },
  {
    follower_email: 'nam.do@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-SUSTAIN',
  },
  {
    follower_email: 'nam.do@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'thao.le@researchos.local',
  },
  {
    follower_email: 'quang.tran@researchos.local',
    entity_type: 'GROUP',
    entity_code: 'FPTU-CVLAB',
  },
  {
    follower_email: 'quang.tran@researchos.local',
    entity_type: 'RESEARCHER',
    entity_email: 'lan.pham@researchos.local',
  },
  {
    follower_email: 'quang.tran@researchos.local',
    entity_type: 'OUTPUT',
    entity_doi: '10.5555/researchos.demo.0004',
  },
  {
    follower_email: 'minh.nguyen@researchos.local',
    entity_type: 'OUTPUT',
    entity_doi: '10.5555/researchos.demo.0008',
  },
  {
    follower_email: 'thao.le@researchos.local',
    entity_type: 'OUTPUT',
    entity_doi: '10.5555/researchos.demo.0006',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs the given tasks with a bounded number of them in flight at once.
 *
 * A task that rejects ends the run, but the tasks that are already in
 * flight are still awaited, so that no write is left half applied.
 */
async function runBatched(tasks, limit) {
  const queue = [...tasks];

  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      for (;;) {
        const task = queue.shift();

        if (!task) {
          return;
        }

        await task();
      }
    },
  );

  await Promise.all(workers);
}

/**
 * Reads the snapshot and checks that it can be read by this script.
 */
function readSnapshot() {
  let raw;

  try {
    raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  } catch {
    fail(
      `The taxonomy snapshot is missing: ${SNAPSHOT_PATH}\n` +
        'Regenerate it with:\n' +
        '  pnpm db:taxonomy:export\n',
    );
  }

  let snapshot;

  try {
    snapshot = JSON.parse(raw);
  } catch (error) {
    fail(`The taxonomy snapshot is not valid JSON: ${error.message}`);
  }

  if (snapshot?.version !== SNAPSHOT_VERSION) {
    fail(
      `The taxonomy snapshot has version ${snapshot?.version}, but this script reads ` +
        `version ${SNAPSHOT_VERSION}.\n` +
        'Regenerate it with:\n' +
        '  pnpm db:taxonomy:export\n',
    );
  }

  for (const key of ['research_fields', 'research_subfields', 'research_topics']) {
    if (!Array.isArray(snapshot[key])) {
      fail(`The taxonomy snapshot has no ${key} list.`);
    }
  }

  return snapshot;
}

/**
 * Adds a number of days to a date.
 */
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * The moment a revision was written.
 *
 * The revision is dated in the past, at the publication year of the work.
 * The check `ck_revision_release` demands that a revision is released at
 * or after the moment it was created, and the creation time of the row is
 * generated by the database, so a timestamp the seed computes can be a few
 * milliseconds behind it. A past date removes the race entirely and keeps
 * the seed reproducible.
 */
function writtenAt(publicationYear) {
  return new Date(Date.UTC(publicationYear, 0, 15, 9, 0, 0));
}

// ---------------------------------------------------------------------------
// The taxonomy
// ---------------------------------------------------------------------------

/**
 * The columns of a taxonomy row that the seed writes.
 */
function taxonomyRowData(record, now) {
  return {
    name: record.name,
    description: record.description,
    source: 'OPENALEX',
    external_id: record.external_id,
    source_updated_at: record.source_updated_at ? new Date(record.source_updated_at) : null,
    last_synced_at: now,
    is_active: true,
  };
}

/**
 * Writes the fields into the database.
 *
 * The internal id of every written record is returned, keyed by its
 * external id, so that the levels below can resolve their parent link
 * without a second query per record.
 */
async function seedFields(prisma, records) {
  const idsByExternalId = new Map();
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const data = taxonomyRowData(record, now);

    const field = await prisma.research_fields.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: data,
      update: {
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, field.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);

  return idsByExternalId;
}

/**
 * Writes the subfields into the database.
 *
 * The parent field has to exist first, because the trigger
 * `normalize_taxonomy` rejects a child whose parent comes from a different
 * source, and the foreign key requires the parent row to exist.
 */
async function seedSubfields(prisma, records, idsByExternalId) {
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const parentId = idsByExternalId.get(record.parent_external_id);

    if (!parentId) {
      fail(
        `The parent of ${record.external_id} (${record.parent_external_id}) was not seeded.\n` +
          'The taxonomy levels must be seeded in order.',
      );
    }

    const data = taxonomyRowData(record, now);

    const subfield = await prisma.research_subfields.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: { ...data, field_id: parentId },
      update: {
        field_id: parentId,
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, subfield.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);
}

/**
 * Writes the topics into the database.
 */
async function seedTopics(prisma, records, idsByExternalId) {
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const parentId = idsByExternalId.get(record.parent_external_id);

    if (!parentId) {
      fail(
        `The parent of ${record.external_id} (${record.parent_external_id}) was not seeded.\n` +
          'The taxonomy levels must be seeded in order.',
      );
    }

    const data = taxonomyRowData(record, now);

    const topic = await prisma.research_topics.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: { ...data, subfield_id: parentId },
      update: {
        subfield_id: parentId,
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, topic.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);
}

/**
 * Writes the three taxonomy levels into the database.
 *
 * The levels are written in order, because a subfield needs its field and a
 * topic needs its subfield to exist first.
 *
 * The ids of the written topics are returned, keyed by their external id,
 * so that the demo records can point at them.
 */
export async function seedTaxonomy(prisma, { fields, subfields, topics }) {
  log('Seeding research_fields ...');
  const idsByExternalId = await seedFields(prisma, fields);

  log('Seeding research_subfields ...');
  await seedSubfields(prisma, subfields, idsByExternalId);

  log('Seeding research_topics ...');
  await seedTopics(prisma, topics, idsByExternalId);

  return idsByExternalId;
}

// ---------------------------------------------------------------------------
// The accounts
// ---------------------------------------------------------------------------

/**
 * Writes the accounts, their credentials and their role grants.
 *
 * The seed is idempotent. An account that already exists keeps its id and
 * its roles; only the credentials are refreshed, so that a changed password
 * takes effect on the next run.
 *
 * The returned map is keyed by email, so that the demo records can find the
 * account they belong to.
 */
export async function seedUsers(prisma) {
  const passwordHash = await hash(DEFAULT_PASSWORD);
  const idsByEmail = new Map();

  for (const user of USERS) {
    // The email is the identity of an account. The schema has no `@unique`
    // on it, because the uniqueness is a case-insensitive expression index
    // that Prisma cannot express. The lookup therefore uses `findFirst`.
    const existing = await prisma.users.findFirst({
      where: { email: user.email },
    });

    const row = existing
      ? await prisma.users.update({
          where: { id: existing.id },
          data: {
            full_name: user.full_name,
            user_type: user.user_type,
            academic_title: user.academic_title,
            academic_degree: user.academic_degree,
            department_unit: user.department_unit,
            is_active: true,
          },
        })
      : await prisma.users.create({
          data: {
            email: user.email,
            full_name: user.full_name,
            user_type: user.user_type,
            academic_title: user.academic_title,
            academic_degree: user.academic_degree,
            department_unit: user.department_unit,
            is_active: true,
          },
        });

    idsByEmail.set(user.email, row.id);

    // The credential is refreshed on every run, so that a rotated
    // password takes effect without a manual step. The trigger
    // `stamp_password_change` stamps the change time, and the trigger
    // `revoke_password_sessions` revokes the sessions of the account.
    await prisma.local_credentials.upsert({
      where: { user_id: row.id },
      create: {
        user_id: row.id,
        password_hash: passwordHash,
        must_change_password: false,
      },
      update: {
        password_hash: passwordHash,
        must_change_password: false,
      },
    });

    for (const role of user.roles) {
      // The roles are granted by the system, so `granted_by` stays NULL.
      // The check `ck_grant_source_actor` requires exactly that pairing.
      //
      // The uniqueness of a grant is a partial index on
      // `(user_id, role) WHERE revoked_at IS NULL`, so a revoked grant does
      // not block a new one. An `upsert` cannot be used here, because the
      // index is partial and Prisma would generate an `ON CONFLICT` clause
      // that does not match it. The unrevoked grant is therefore looked up
      // directly, and a new grant is inserted when there is none.
      const active = await prisma.user_role_assignments.findFirst({
        where: { user_id: row.id, role, revoked_at: null },
      });

      if (!active) {
        await prisma.user_role_assignments.create({
          data: {
            user_id: row.id,
            role,
            grant_source: 'SYSTEM',
            granted_by: null,
            reason: 'Development seed account',
          },
        });
      }
    }

    log(
      `  ${user.email.padEnd(30)} ${user.user_type.padEnd(8)} ` +
        `${user.roles.join(',') || 'no role'}`,
    );
  }

  return idsByEmail;
}

// ---------------------------------------------------------------------------
// The demo records
// ---------------------------------------------------------------------------

/**
 * Writes the researcher profiles.
 *
 * A profile is keyed by the user it belongs to. It is created together with
 * the account and updated in place.
 *
 * `profile_confirmed_at` is what makes the researcher visible: the search
 * index only holds a confirmed profile. `onboarding_completed_at` is what
 * lets the researcher past the onboarding gate.
 */
async function seedProfiles(prisma, idsByEmail) {
  const now = new Date();

  for (const profile of PROFILES) {
    const userId = idsByEmail.get(profile.email);

    if (!userId) {
      fail(`The profile of ${profile.email} has no account.`);
    }

    await prisma.researcher_profiles.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        orcid_id: profile.orcid_id,
        scopus_author_id: profile.scopus_author_id,
        google_scholar_url: profile.google_scholar_url,
        availability_status: profile.availability_status,
        bio: profile.bio,
        profile_confirmed_at: now,
        papers_reviewed_at: now,
        onboarding_completed_at: now,
      },
      update: {
        orcid_id: profile.orcid_id,
        scopus_author_id: profile.scopus_author_id,
        google_scholar_url: profile.google_scholar_url,
        availability_status: profile.availability_status,
        bio: profile.bio,
        profile_confirmed_at: now,
        papers_reviewed_at: now,
        onboarding_completed_at: now,
      },
    });
  }
}

/**
 * Writes the groups and their members.
 *
 * A group needs a lead, and the lead has to be an active researcher,
 * because the trigger `guard_group_leader_eligibility` rejects anything
 * else. The members are written after the group, because the membership
 * needs the group to exist.
 */
async function seedGroups(prisma, idsByEmail) {
  const idsByCode = new Map();

  for (const group of GROUPS) {
    const leadId = idsByEmail.get(group.lead_email);

    if (!leadId) {
      fail(`The group ${group.code} has no lead account.`);
    }

    const row = await prisma.research_groups.upsert({
      where: { code: group.code },
      create: {
        code: group.code,
        name: group.name,
        lead_id: leadId,
        description: group.description,
        is_active: true,
        archived_at: null,
      },
      update: {
        name: group.name,
        lead_id: leadId,
        description: group.description,
        is_active: true,
        archived_at: null,
      },
    });

    idsByCode.set(group.code, row.id);

    for (const member of group.members) {
      const userId = idsByEmail.get(member.email);

      if (!userId) {
        fail(`The member ${member.email} of ${group.code} has no account.`);
      }

      await prisma.group_members.upsert({
        where: { group_id_user_id: { group_id: row.id, user_id: userId } },
        create: {
          group_id: row.id,
          user_id: userId,
          role: member.role,
        },
        update: { role: member.role },
      });
    }
  }

  return idsByCode;
}

/**
 * Writes the research directions of the groups.
 *
 * A direction points at a taxonomy topic, but the link is optional, so the
 * topic is looked up rather than required.
 */
async function seedDirections(prisma, idsByCode, idsByTopicExternalId) {
  for (const direction of DIRECTIONS) {
    const groupId = idsByCode.get(direction.group_code);

    if (!groupId) {
      fail(`The direction "${direction.title}" has no group.`);
    }

    const topicId = direction.topic_external_id
      ? idsByTopicExternalId.get(direction.topic_external_id)
      : null;

    if (direction.topic_external_id && !topicId) {
      fail(
        `The topic ${direction.topic_external_id} of "${direction.title}" was not seeded.`,
      );
    }

    const existing = await prisma.group_directions.findFirst({
      where: { group_id: groupId, title: direction.title },
    });

    if (existing) {
      await prisma.group_directions.update({
        where: { id: existing.id },
        data: {
          topic_id: topicId,
          description: direction.description,
        },
      });
    } else {
      await prisma.group_directions.create({
        data: {
          group_id: groupId,
          topic_id: topicId,
          title: direction.title,
          description: direction.description,
        },
      });
    }
  }
}

/**
 * Writes the research interests.
 *
 * An interest is declared by the researcher, so `source_type` is `DECLARED`
 * and the status is `ACTIVE`. The trigger `guard_researcher_feature`
 * rejects a declared interest that is still a suggestion, because a
 * declared interest is explicitly selected and not inferred.
 */
async function seedInterests(prisma, idsByEmail, idsByTopicExternalId) {
  const now = new Date();

  for (const interest of INTERESTS) {
    const userId = idsByEmail.get(interest.email);

    if (!userId) {
      fail(`The interests of ${interest.email} have no account.`);
    }

    for (const externalId of interest.topic_external_ids) {
      const topicId = idsByTopicExternalId.get(externalId);

      if (!topicId) {
        fail(`The topic ${externalId} of ${interest.email} was not seeded.`);
      }

      await prisma.research_interests.upsert({
        where: { user_id_topic_id: { user_id: userId, topic_id: topicId } },
        create: {
          user_id: userId,
          topic_id: topicId,
          source_type: 'DECLARED',
          status: 'ACTIVE',
          provenance_tag: 'HUMAN',
          declared_at: now,
          reviewed_at: now,
        },
        update: {
          source_type: 'DECLARED',
          status: 'ACTIVE',
          provenance_tag: 'HUMAN',
          reviewed_at: now,
        },
      });
    }
  }
}

/**
 * Writes the opportunities.
 *
 * An opportunity is created as a `DRAFT` and then published, because the
 * trigger `normalize_opportunity` refuses a create with any other status.
 * Publishing needs a title, a description, an application deadline in the
 * future and a publication time, which is what `ck_published_opportunity`
 * demands.
 */
async function seedOpportunities(prisma, idsByEmail, idsByCode) {
  const now = new Date();

  for (const opportunity of OPPORTUNITIES) {
    const creatorId = idsByEmail.get(opportunity.creator_email);

    if (!creatorId) {
      fail(`The opportunity "${opportunity.title}" has no creator account.`);
    }

    const groupId = opportunity.group_code
      ? idsByCode.get(opportunity.group_code)
      : null;

    if (opportunity.group_code && !groupId) {
      fail(`The opportunity "${opportunity.title}" has no group.`);
    }

    const deadline = daysFromNow(opportunity.deadline_in_days);

    const data = {
      group_id: groupId,
      creator_id: creatorId,
      title: opportunity.title,
      opportunity_kind: opportunity.opportunity_kind,
      target_audience: opportunity.target_audience,
      expected_role: opportunity.expected_role,
      required_expertise_tags: opportunity.required_expertise_tags,
      description: opportunity.description,
      response_sla_days: opportunity.response_sla_days,
      application_deadline: deadline,
    };

    const existing = await prisma.research_opportunities.findFirst({
      where: { title: opportunity.title, creator_id: creatorId },
    });

    if (!existing) {
      // The create is a draft, because the trigger refuses anything else.
      await prisma.research_opportunities.create({
        data: { ...data, status: 'DRAFT' },
      });
    } else {
      await prisma.research_opportunities.update({
        where: { id: existing.id },
        data,
      });
    }

    // Publishing is a separate write, because the trigger only allows a
    // non-draft status on an update.
    const row = await prisma.research_opportunities.findFirst({
      where: { title: opportunity.title, creator_id: creatorId },
    });

    await prisma.research_opportunities.update({
      where: { id: row.id },
      data: { status: 'OPEN', published_at: now },
    });
  }
}

/**
 * Writes the publications.
 *
 * A publication is a `research_outputs` row with a released revision. The
 * work is shared, so it is visible in Discovery and in Search without a
 * publish step.
 *
 * The order of the writes matters, because the triggers enforce it:
 *
 * 1. The output is created as a draft, because `ck_shared_output` demands a
 *    released revision before the work may be shared, and the revision needs
 *    the output to exist.
 * 2. The revision is created as a draft and the topics are attached to it,
 *    because `guard_revision_attachment` freezes the attachments of a
 *    released revision.
 * 3. The revision is released, because `guard_revision` only lets a
 *    researcher who owns the work release it.
 * 4. The authors are attached and the output is shared, pointing at the
 *    released revision.
 *
 * The revision is looked up and written directly rather than upserted. The
 * `upsert` cannot be used here: the schema has a partial unique index
 * `uq_output_editable_draft` on `(output_id) WHERE released_at IS NULL`,
 * and Prisma would pick it as the `ON CONFLICT` target. PostgreSQL cannot
 * use a partial index as an `ON CONFLICT` target, so the statement would
 * fail with `42P10`.
 */
async function seedOutputs(prisma, idsByEmail, idsByCode, idsByTopicExternalId) {
  const now = new Date();

  for (const output of OUTPUTS) {
    const ownerId = idsByEmail.get(output.owner_email);

    if (!ownerId) {
      fail(`The publication "${output.title}" has no owner account.`);
    }

    const accessGroupId = output.group_code ? idsByCode.get(output.group_code) : null;

    if (output.group_code && !accessGroupId) {
      fail(`The publication "${output.title}" has no group.`);
    }

    const outputRow = await prisma.research_outputs.upsert({
      where: { doi: output.doi },
      create: {
        doi: output.doi,
        owner_id: ownerId,
        created_by: ownerId,
        sharing_status: 'DRAFT',
        visibility: output.visibility,
        access_group_id: accessGroupId,
        provenance_tag: output.provenance_tag,
        import_state: 'NONE',
      },
      update: {
        owner_id: ownerId,
        created_by: ownerId,
        visibility: output.visibility,
        access_group_id: accessGroupId,
        provenance_tag: output.provenance_tag,
      },
    });

    const authorsSnapshot = output.authors.map((author) => ({
      name: author.name,
      order: author.order,
    }));

    // The revision is found by its number rather than upserted, so that the
    // partial unique index is never used as an `ON CONFLICT` target.
    const existingRevision = await prisma.output_revisions.findFirst({
      where: { output_id: outputRow.id, revision_no: 1 },
    });

    let revision = existingRevision;

    if (!revision) {
      revision = await prisma.output_revisions.create({
        data: {
          output_id: outputRow.id,
          revision_no: 1,
          title: output.title,
          abstract: output.abstract,
          venue: output.venue,
          publisher: output.publisher,
          publication_year: output.publication_year,
          publication_status: 'PUBLISHED',
          output_type: output.output_type,
          external_url: output.external_url,
          authors_snapshot: authorsSnapshot,
          created_by: ownerId,
          created_at: writtenAt(output.publication_year),
        },
      });
    }

    // The topics are attached while the revision is still a draft. The
    // trigger `guard_revision_attachment` refuses an attachment on a
    // released revision, so a revision that is already released keeps the
    // topics it has.
    if (!revision.released_at) {
      for (const externalId of output.topic_external_ids) {
        const topicId = idsByTopicExternalId.get(externalId);

        if (!topicId) {
          fail(`The topic ${externalId} of "${output.title}" was not seeded.`);
        }

        await prisma.output_topics.upsert({
          where: {
            revision_id_topic_id: {
              revision_id: revision.id,
              topic_id: topicId,
            },
          },
          create: {
            output_id: outputRow.id,
            revision_id: revision.id,
            topic_id: topicId,
            added_by: ownerId,
          },
          update: {},
        });
      }

      // The revision is released by the owner of the work, which is what
      // `guard_revision` requires. A released revision is immutable, so
      // this only happens once.
      await prisma.output_revisions.update({
        where: { id: revision.id },
        data: { released_by: ownerId, released_at: now },
      });

      revision = { ...revision, released_by: ownerId, released_at: now };
    }

    for (const author of output.authors) {
      const userId = idsByEmail.get(author.email);

      await prisma.output_authors.upsert({
        where: {
          output_id_author_order: {
            output_id: outputRow.id,
            author_order: author.order,
          },
        },
        create: {
          output_id: outputRow.id,
          user_id: userId ?? null,
          author_name_string: author.name,
          author_order: author.order,
          is_corresponding_author: author.corresponding,
        },
        update: {
          user_id: userId ?? null,
          author_name_string: author.name,
          is_corresponding_author: author.corresponding,
        },
      });
    }

    // The work is shared and points at the released revision, so it is
    // searchable and visible without a publish step.
    await prisma.research_outputs.update({
      where: { id: outputRow.id },
      data: {
        sharing_status: 'SHARED',
        current_release_id: revision.id,
        first_shared_at: outputRow.first_shared_at ?? now,
      },
    });
  }
}

/**
 * Writes the applications.
 *
 * An application starts as `PENDING`, because the trigger `guard_application`
 * refuses any other status on an insert. The response is a second write:
 * the trigger only lets a pending application transition once, and it only
 * lets somebody who can manage the opportunity respond to it.
 *
 * The response is therefore written through a transition rather than an
 * update, so that the trigger sees the same shape it expects.
 */
async function seedApplications(prisma, idsByEmail) {
  for (const application of APPLICATIONS) {
    const applicantId = idsByEmail.get(application.applicant_email);

    if (!applicantId) {
      fail(`The application of ${application.applicant_email} has no account.`);
    }

    const opportunity = await prisma.research_opportunities.findFirst({
      where: { title: application.opportunity_title },
    });

    if (!opportunity) {
      fail(`The opportunity "${application.opportunity_title}" was not seeded.`);
    }

    const existing = await prisma.opportunity_applications.findFirst({
      where: {
        opportunity_id: opportunity.id,
        applicant_id: applicantId,
      },
    });

    // A withdrawn application is kept, so the unique index only covers the
    // applications that are still live. One that was withdrawn is left
    // alone: the history is part of the demo.
    if (existing) {
      if (existing.status === 'WITHDRAWN' || existing.status === application.status) {
        continue;
      }

      const responderId = application.responder_email
        ? idsByEmail.get(application.responder_email)
        : null;

      /*
       * A withdrawal is made by the applicant, not by a responder, so it
       * carries no `responded_by`.
       */
      if (application.status === 'WITHDRAWN') {
        await prisma.opportunity_applications.update({
          where: { id: existing.id },
          data: { status: 'WITHDRAWN' },
        });

        continue;
      }

      if (application.status !== 'PENDING' && !responderId) {
        fail(
          `The response to "${application.opportunity_title}" has no responder account.`,
        );
      }

      await prisma.opportunity_applications.update({
        where: { id: existing.id },
        data: {
          status: application.status,
          responded_by: responderId,
          response_note: application.response_note ?? null,
        },
      });

      continue;
    }
    const created = await prisma.opportunity_applications.create({
      data: {
        opportunity_id: opportunity.id,
        applicant_id: applicantId,
        applicant_note: application.applicant_note,
        status: 'PENDING',
        /*
         * The trigger computes the SLA deadline from the opportunity's
         * response window and overwrites whatever is written here, but
         * Prisma insists on the column, so a placeholder is given.
         */
        response_due_at: new Date(),
      },
    });

    if (application.status === 'PENDING') {
      continue;
    }

    /*
     * A withdrawal is made by the applicant, not by a responder. The
     * trigger treats it as the applicant giving up, so `responded_by`
     * stays empty and only the timestamp is set.
     */
    if (application.status === 'WITHDRAWN') {
      await prisma.opportunity_applications.update({
        where: { id: created.id },
        data: { status: 'WITHDRAWN' },
      });

      continue;
    }

    const responderId = application.responder_email
      ? idsByEmail.get(application.responder_email)
      : null;

    if (!responderId) {
      fail(
        `The response to "${application.opportunity_title}" has no responder account.`,
      );
    }

    await prisma.opportunity_applications.update({
      where: { id: created.id },
      data: {
        status: application.status,
        responded_by: responderId,
        response_note: application.response_note ?? null,
      },
    });
  }
}

/**
 * Writes the follows.
 *
 * A follow points at a researcher, a group, a topic or a publication. The
 * entity is resolved from the name the demo record uses — an email for a
 * researcher, a code for a group, a DOI for a publication — so the seed
 * never has to know a uuid.
 */
async function seedFollows(prisma, idsByEmail, idsByCode) {
  for (const follow of FOLLOWS) {
    const followerId = idsByEmail.get(follow.follower_email);

    if (!followerId) {
      fail(`The follow of ${follow.follower_email} has no account.`);
    }

    let entityId;

    if (follow.entity_type === 'RESEARCHER') {
      entityId = idsByEmail.get(follow.entity_email);

      if (!entityId) {
        fail(`The followed researcher ${follow.entity_email} has no account.`);
      }
    } else if (follow.entity_type === 'GROUP') {
      entityId = idsByCode.get(follow.entity_code);

      if (!entityId) {
        fail(`The followed group ${follow.entity_code} was not seeded.`);
      }
    } else if (follow.entity_type === 'OUTPUT') {
      const output = await prisma.research_outputs.findUnique({
        where: { doi: follow.entity_doi },
        select: { id: true },
      });

      if (!output) {
        fail(`The followed publication ${follow.entity_doi} was not seeded.`);
      }

      entityId = output.id;
    } else {
      fail(`The follow of ${follow.follower_email} has an unknown entity type.`);
    }

    await prisma.user_follows.upsert({
      where: {
        follower_id_entity_type_entity_id: {
          follower_id: followerId,
          entity_type: follow.entity_type,
          entity_id: entityId,
        },
      },
      create: {
        follower_id: followerId,
        entity_type: follow.entity_type,
        entity_id: entityId,
      },
      update: {},
    });
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Writes the demo records.
 *
 * The demo records are the rows the Discovery, Group and Opportunity
 * screens read: confirmed profiles, active groups, published opportunities
 * and shared publications. The search index is not written here — the
 * `sync_search_index` triggers maintain it from the source rows, so the
 * index is populated by the same writes that create the demo records.
 *
 * The taxonomy has to be seeded first, because the demo records point at
 * taxonomy topics.
 */
export async function seedDemoRecords(prisma, idsByTopicExternalId) {
  log('');
  log('Seeding the accounts ...');
  const idsByEmail = await seedUsers(prisma);

  log('');
  log('Seeding the demo profiles ...');
  await seedProfiles(prisma, idsByEmail);

  log('');
  log('Seeding the demo groups ...');
  const idsByCode = await seedGroups(prisma, idsByEmail);

  log('');
  log('Seeding the demo research directions ...');
  await seedDirections(prisma, idsByCode, idsByTopicExternalId);

  log('');
  log('Seeding the demo research interests ...');
  await seedInterests(prisma, idsByEmail, idsByTopicExternalId);

  log('');
  log('Seeding the demo opportunities ...');
  await seedOpportunities(prisma, idsByEmail, idsByCode);

  log('');
  log('Seeding the demo publications ...');
  await seedOutputs(prisma, idsByEmail, idsByCode, idsByTopicExternalId);

  log('');
  log('Seeding the demo applications ...');
  await seedApplications(prisma, idsByEmail);

  log('');
  log('Seeding the demo follows ...');
  await seedFollows(prisma, idsByEmail, idsByCode);
}

/**
 * Reads the ids of the topics the demo records point at.
 *
 * This is the demo-only path: the taxonomy is not written again, it is
 * read back from the rows that are already there. Only the topics the demo
 * records use are read, so the query stays small.
 */
export async function readDemoTopicIds(prisma) {
  const externalIds = new Set();

  for (const interest of INTERESTS) {
    for (const externalId of interest.topic_external_ids) {
      externalIds.add(externalId);
    }
  }

  for (const direction of DIRECTIONS) {
    if (direction.topic_external_id) {
      externalIds.add(direction.topic_external_id);
    }
  }

  for (const output of OUTPUTS) {
    for (const externalId of output.topic_external_ids) {
      externalIds.add(externalId);
    }
  }

  const topics = await prisma.research_topics.findMany({
    where: { source: 'OPENALEX', external_id: { in: [...externalIds] } },
    select: { id: true, external_id: true },
  });

  const idsByExternalId = new Map();

  for (const topic of topics) {
    idsByExternalId.set(topic.external_id, topic.id);
  }

  return idsByExternalId;
}

/**
 * Reports the counts of every table the seed writes.
 */
export async function reportCounts(prisma) {
  const [
    fields,
    subfields,
    topics,
    users,
    profiles,
    groups,
    directions,
    interests,
    opportunities,
    outputs,
    applications,
    follows,
    searchIndex,
  ] = await Promise.all([
    prisma.research_fields.count(),
    prisma.research_subfields.count(),
    prisma.research_topics.count(),
    prisma.users.count(),
    prisma.researcher_profiles.count(),
    prisma.research_groups.count(),
    prisma.group_directions.count(),
    prisma.research_interests.count(),
    prisma.research_opportunities.count(),
    prisma.research_outputs.count(),
    prisma.opportunity_applications.count(),
    prisma.user_follows.count(),
    prisma.search_index.count(),
  ]);

  log('');
  log('Seed complete.');
  log(`  research_fields       ${fields}`);
  log(`  research_subfields    ${subfields}`);
  log(`  research_topics       ${topics}`);
  log(`  users                 ${users}`);
  log(`  researcher_profiles   ${profiles}`);
  log(`  research_groups       ${groups}`);
  log(`  group_directions      ${directions}`);
  log(`  research_interests    ${interests}`);
  log(`  opportunities         ${opportunities}`);
  log(`  research_outputs      ${outputs}`);
  log(`  applications          ${applications}`);
  log(`  follows               ${follows}`);
  log(`  search_index          ${searchIndex}`);
}

/**
 * Writes the taxonomy and the demo records into the database.
 *
 * This is the whole seed: the taxonomy from the local snapshot, the
 * accounts, and the demo records that reference them.
 */
export async function seedAll(prisma) {
  const snapshot = readSnapshot();

  log('Snapshot contents:');
  log(`  research_fields    ${snapshot.research_fields.length}`);
  log(`  research_subfields ${snapshot.research_subfields.length}`);
  log(`  research_topics    ${snapshot.research_topics.length}`);
  log('');

  const idsByTopicExternalId = await seedTaxonomy(prisma, {
    fields: snapshot.research_fields,
    subfields: snapshot.research_subfields,
    topics: snapshot.research_topics,
  });

  await seedDemoRecords(prisma, idsByTopicExternalId);
}

/**
 * The run.
 *
 * The module is also imported by the online seed, which reuses the taxonomy
 * and the demo writers. The run therefore only happens when this file is
 * the entry point.
 *
 * The `--demo` flag skips the taxonomy and writes only the demo records. It
 * is the flag the e2e suite uses: the taxonomy is slow to import and the
 * suite needs the demo rows, not the reference tree.
 */
async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const demoOnly = process.argv.slice(2).includes('--demo');

  log(demoOnly ? 'ResearchOS demo seed' : 'ResearchOS seed');
  log(`  database ${redactDatabaseUrl(databaseUrl)}`);

  if (!demoOnly) {
    log(`  snapshot ${SNAPSHOT_PATH}`);
  }

  log('');

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    if (demoOnly) {
      const idsByTopicExternalId = await readDemoTopicIds(prisma);

      await seedDemoRecords(prisma, idsByTopicExternalId);
    } else {
      await seedAll(prisma);
    }

    await reportCounts(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error?.name === 'SeedError') {
      process.stderr.write(`\n${error.message}\n`);
      process.exit(1);
    }

    throw error;
  }
}
