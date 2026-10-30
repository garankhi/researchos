CREATE TYPE "user_type" AS ENUM (
  'FACULTY',
  'STUDENT'
);

CREATE TYPE "access_role" AS ENUM (
  'RESEARCHER'
);

CREATE TYPE "taxonomy_source" AS ENUM (
  'LOCAL',
  'OPENALEX'
);

CREATE TYPE "visibility_level" AS ENUM (
  'PRIVATE',
  'RESEARCH_GROUP',
  'FPTU_COMMUNITY'
);

CREATE TYPE "data_provenance_type" AS ENUM (
  'PAPER',
  'AI_TRACE',
  'AI_INF',
  'HUMAN',
  'EXT',
  'UNK'
);

CREATE TYPE "interest_source" AS ENUM (
  'DECLARED',
  'INFERRED'
);

CREATE TYPE "interest_status" AS ENUM (
  'SUGGESTED',
  'ACTIVE',
  'REJECTED'
);

CREATE TYPE "claim_status" AS ENUM (
  'SUGGESTED',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE "availability_status_type" AS ENUM (
  'OPEN_FOR_COLLABORATION',
  'SEEKING_GROUP',
  'MENTORING_ONLY',
  'LIMITED_AVAILABILITY',
  'NOT_AVAILABLE'
);

CREATE TYPE "group_member_role" AS ENUM (
  'CORE_MEMBER',
  'COLLABORATOR',
  'STUDENT_MEMBER'
);

CREATE TYPE "post_type" AS ENUM (
  'GENERAL_NEWS',
  'PUBLICATION',
  'AWARD',
  'PROJECT_UPDATE'
);

CREATE TYPE "opportunity_kind" AS ENUM (
  'RESEARCH_COLLABORATION',
  'PROJECT_FORMATION',
  'DATA_METHOD_EXCHANGE',
  'FUNDING_CALL'
);

CREATE TYPE "target_audience" AS ENUM (
  'FACULTY',
  'STUDENT',
  'ANY_RESEARCHER'
);

CREATE TYPE "opportunity_status" AS ENUM (
  'DRAFT',
  'OPEN',
  'FILLED',
  'CLOSED',
  'EXPIRED'
);

CREATE TYPE "opportunity_application_status" AS ENUM (
  'PENDING',
  'INVITED_TO_DISCUSS',
  'DECLINED',
  'WITHDRAWN'
);

CREATE TYPE "expected_role_type" AS ENUM (
  'CO_PI',
  'METHODOLOGY_LEAD',
  'DOMAIN_EXPERT',
  'DATA_ENGINEER',
  'STUDENT_RESEARCHER',
  'CO_AUTHOR',
  'ADVISOR_CONSULTANT'
);

CREATE TYPE "project_type" AS ENUM (
  'UNIVERSITY_GRANT',
  'MINISTRY_GRANT',
  'STATE_GRANT',
  'INDUSTRY_LAB',
  'INTERNATIONAL_JOINT',
  'COLLABORATIVE_RESEARCH'
);

CREATE TYPE "milestone_status" AS ENUM (
  'ON_TRACK',
  'DELAYED',
  'BLOCKED',
  'COMPLETED'
);

CREATE TYPE "project_status" AS ENUM (
  'PROPOSAL_DRAFT',
  'APPROVED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'PUBLISHED_DELIVERED',
  'CANCELLED'
);

CREATE TYPE "record_status" AS ENUM (
  'DRAFT',
  'RESEARCHER_CONFIRMED',
  'VALIDATED',
  'ARCHIVED'
);

CREATE TYPE "publication_status" AS ENUM (
  'UNPUBLISHED',
  'PUBLISHED'
);

CREATE TYPE "output_sharing_status" AS ENUM (
  'DRAFT',
  'SHARED',
  'ARCHIVED'
);

CREATE TYPE "group_output_status" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'REMOVED'
);

CREATE TYPE "edge_type" AS ENUM (
  'CITES',
  'RELATED_TO',
  'ADDRESSES',
  'ANSWERS',
  'USES_METHOD',
  'USES_DATASET',
  'INHERITS_METHOD',
  'INHERITS_DATA',
  'EXTENDS'
);

CREATE TYPE "edge_validation_status" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE "seminar_type" AS ENUM (
  'RESEARCH_SEMINAR',
  'PAPER_SHARING',
  'METHOD_SHARING',
  'WORKSHOP',
  'PROGRESS_SEMINAR',
  'GROUP_MEETING'
);

CREATE TYPE "entity_types" AS ENUM (
  'RESEARCHER',
  'GROUP',
  'PROJECT',
  'TOPIC',
  'OUTPUT'
);

CREATE TYPE "research_update_type" AS ENUM (
  'OUTPUT_SHARED',
  'OUTPUT_REVISION_RELEASED',
  'OUTPUT_LINKED_TO_GROUP',
  'OPPORTUNITY_OPENED',
  'SEMINAR_PUBLISHED',
  'PROJECT_UPDATED'
);

CREATE TYPE "digest_subject_type" AS ENUM (
  'OUTPUT',
  'OPPORTUNITY',
  'SEMINAR',
  'PROJECT'
);

CREATE TYPE "delivery_status" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "fptu_guid" varchar(100) UNIQUE NOT NULL,
  "user_type" user_type NOT NULL,
  "email" varchar(255) NOT NULL,
  "full_name" varchar(255) NOT NULL,
  "academic_title" varchar(100),
  "department_unit" varchar(255) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_login_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "user_role_assignments" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "role" access_role NOT NULL DEFAULT 'RESEARCHER',
  "granted_by" uuid NOT NULL,
  "granted_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "revoked_by" uuid,
  "revoked_at" timestamptz,
  "reason" text,
  CONSTRAINT "ck_no_self_grant" CHECK (user_id <> granted_by),
  CONSTRAINT "ck_grant_revocation" CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_at >= granted_at))
);

CREATE TABLE "oidc_identities" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "issuer" text NOT NULL,
  "subject" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "oidc_login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "state_hash" char(64) UNIQUE NOT NULL,
  "nonce_hash" char(64) NOT NULL,
  "browser_binding_hash" char(64) NOT NULL,
  "issuer" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "pkce_verifier_ciphertext" text NOT NULL,
  "encryption_key_id" varchar(100) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  CONSTRAINT "ck_oidc_attempt_expiry" CHECK (expires_at > created_at),
  CONSTRAINT "ck_oidc_attempt_consumption" CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at))
);

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "identity_id" uuid NOT NULL,
  "session_token_hash" char(64) UNIQUE NOT NULL,
  "idp_sid" text,
  "authenticated_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "last_seen_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "expires_at" timestamptz NOT NULL,
  "idle_expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "revocation_reason" text,
  CONSTRAINT "ck_session_expiry" CHECK (expires_at > created_at AND idle_expires_at > created_at AND idle_expires_at <= expires_at),
  CONSTRAINT "ck_session_times" CHECK (authenticated_at <= created_at AND last_seen_at >= created_at),
  CONSTRAINT "ck_session_revocation" CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE "researcher_profiles" (
  "user_id" uuid PRIMARY KEY,
  "orcid_id" varchar(19) UNIQUE,
  "scopus_author_id" varchar(50),
  "google_scholar_url" text,
  "availability_status" availability_status_type NOT NULL DEFAULT 'NOT_AVAILABLE',
  "bio" text,
  "avatar_storage_key" text,
  "profile_confirmed_at" timestamptz,
  "papers_reviewed_at" timestamptz,
  "onboarding_completed_at" timestamptz,
  "last_synced_at" timestamptz,
  "llkh_last_exported_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "research_fields" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "internal_code" varchar(50) UNIQUE,
  "name" varchar(255) NOT NULL,
  "name_vi" varchar(255),
  "description" text,
  "source" taxonomy_source NOT NULL DEFAULT 'OPENALEX',
  "external_id" varchar(255),
  "source_updated_at" timestamptz,
  "last_synced_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_field_source" CHECK ((source = 'LOCAL' AND external_id IS NULL) OR (source <> 'LOCAL' AND external_id IS NOT NULL AND length(btrim(external_id)) > 0))
);

CREATE TABLE "research_subfields" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "field_id" uuid NOT NULL,
  "internal_code" varchar(50) UNIQUE,
  "name" varchar(255) NOT NULL,
  "name_vi" varchar(255),
  "description" text,
  "source" taxonomy_source NOT NULL DEFAULT 'OPENALEX',
  "external_id" varchar(255),
  "source_updated_at" timestamptz,
  "last_synced_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_subfield_source" CHECK ((source = 'LOCAL' AND external_id IS NULL) OR (source <> 'LOCAL' AND external_id IS NOT NULL AND length(btrim(external_id)) > 0))
);

CREATE TABLE "research_topics" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "subfield_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "source" taxonomy_source NOT NULL DEFAULT 'LOCAL',
  "external_id" varchar(255),
  "source_updated_at" timestamptz,
  "created_by" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_synced_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_topic_nonempty" CHECK (length(btrim(name)) > 0),
  CONSTRAINT "ck_topic_source" CHECK ((source = 'LOCAL' AND external_id IS NULL AND created_by IS NOT NULL) OR (source <> 'LOCAL' AND external_id IS NOT NULL AND length(btrim(external_id)) > 0))
);

CREATE TABLE "research_interests" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "source_type" interest_source NOT NULL,
  "status" interest_status NOT NULL DEFAULT 'SUGGESTED',
  "provenance_tag" data_provenance_type NOT NULL DEFAULT 'HUMAN',
  "evidence_note" text,
  "declared_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "reviewed_at" timestamptz
);

CREATE TABLE "research_groups" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(255) NOT NULL,
  "lead_id" uuid NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "group_members" (
  "group_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" group_member_role NOT NULL DEFAULT 'COLLABORATOR',
  "joined_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("group_id", "user_id")
);

CREATE TABLE "group_directions" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "group_id" uuid NOT NULL,
  "topic_id" uuid,
  "title" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "research_outputs" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "doi" varchar(255) UNIQUE,
  "owner_id" uuid,
  "created_by" uuid,
  "sharing_status" output_sharing_status NOT NULL DEFAULT 'DRAFT',
  "current_release_id" uuid,
  "visibility" visibility_level NOT NULL DEFAULT 'PRIVATE',
  "access_group_id" uuid,
  "provenance_tag" data_provenance_type NOT NULL DEFAULT 'PAPER',
  "last_synced_at" timestamptz,
  "first_shared_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_shared_output" CHECK (sharing_status <> 'SHARED' OR (owner_id IS NOT NULL AND current_release_id IS NOT NULL AND first_shared_at IS NOT NULL)),
  CONSTRAINT "ck_output_archive" CHECK ((sharing_status = 'ARCHIVED') = (archived_at IS NOT NULL)),
  CONSTRAINT "ck_output_access_scope" CHECK ((visibility = 'RESEARCH_GROUP' AND access_group_id IS NOT NULL) OR (visibility <> 'RESEARCH_GROUP' AND access_group_id IS NULL))
);

CREATE TABLE "output_revisions" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "output_id" uuid NOT NULL,
  "revision_no" int NOT NULL,
  "title" varchar(500) NOT NULL,
  "abstract" text,
  "venue" varchar(255),
  "publisher" varchar(255),
  "publication_year" int,
  "publication_status" publication_status NOT NULL DEFAULT 'UNPUBLISHED',
  "output_type" varchar(50) NOT NULL DEFAULT 'PAPER',
  "external_url" text,
  "authors_snapshot" jsonb NOT NULL DEFAULT ('[]'::jsonb),
  "created_by" uuid NOT NULL,
  "released_by" uuid,
  "released_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_output_revision_no" CHECK (revision_no > 0),
  CONSTRAINT "ck_publication_year" CHECK (publication_year IS NULL OR publication_year BETWEEN 1000 AND 9999),
  CONSTRAINT "ck_revision_authors" CHECK (jsonb_typeof(authors_snapshot) = 'array'),
  CONSTRAINT "ck_revision_release" CHECK ((released_at IS NULL AND released_by IS NULL) OR (released_at IS NOT NULL AND released_by IS NOT NULL AND released_at >= created_at))
);

CREATE TABLE "output_external_ids" (
  "output_id" uuid NOT NULL,
  "source" varchar(50) NOT NULL,
  "external_id" varchar(255) NOT NULL,
  "last_synced_at" timestamptz,
  PRIMARY KEY ("source", "external_id")
);

CREATE TABLE "output_authors" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "output_id" uuid NOT NULL,
  "user_id" uuid,
  "author_name_string" varchar(255) NOT NULL,
  "author_order" int NOT NULL,
  "is_corresponding_author" boolean NOT NULL DEFAULT false,
  CONSTRAINT "ck_author_order" CHECK (author_order > 0)
);

CREATE TABLE "publication_claims" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "output_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "author_id" uuid,
  "status" claim_status NOT NULL DEFAULT 'SUGGESTED',
  "match_source" varchar(50) NOT NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_claim_review" CHECK ((status = 'SUGGESTED' AND reviewed_at IS NULL) OR (status IN ('CONFIRMED', 'REJECTED') AND reviewed_at IS NOT NULL)),
  CONSTRAINT "ck_confirmed_claim_author" CHECK (status <> 'CONFIRMED' OR author_id IS NOT NULL)
);

CREATE TABLE "output_topics" (
  "output_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "added_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("revision_id", "topic_id")
);

CREATE TABLE "output_files" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "output_id" uuid NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "storage_key" text UNIQUE NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "visibility" visibility_level NOT NULL DEFAULT 'PRIVATE',
  "access_group_id" uuid,
  "is_available" boolean NOT NULL DEFAULT true,
  "uploaded_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_file_size" CHECK (size_bytes > 0),
  CONSTRAINT "ck_file_access_scope" CHECK ((visibility = 'RESEARCH_GROUP' AND access_group_id IS NOT NULL) OR (visibility <> 'RESEARCH_GROUP' AND access_group_id IS NULL))
);

CREATE TABLE "output_revision_files" (
  "output_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  PRIMARY KEY ("revision_id", "file_id")
);

CREATE TABLE "group_output_links" (
  "output_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "requested_revision_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "requested_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "status" group_output_status NOT NULL DEFAULT 'PENDING',
  "decided_by" uuid,
  "decided_at" timestamptz,
  "decision_note" text,
  "accepted_revision_id" uuid,
  "accepted_by" uuid,
  "accepted_at" timestamptz,
  "removed_by" uuid,
  "removed_at" timestamptz,
  CONSTRAINT "ck_group_accepted_pin" CHECK ((accepted_revision_id IS NULL AND accepted_by IS NULL AND accepted_at IS NULL) OR (accepted_revision_id IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
  CONSTRAINT "ck_group_accept_requested" CHECK (status <> 'ACCEPTED' OR (accepted_revision_id IS NOT NULL AND accepted_revision_id = requested_revision_id)),
  CONSTRAINT "ck_group_decision" CHECK ((status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR (status IN ('ACCEPTED','REJECTED','REMOVED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT "ck_group_removal" CHECK ((status = 'REMOVED' AND removed_by IS NOT NULL AND removed_at IS NOT NULL AND accepted_revision_id IS NULL) OR (status <> 'REMOVED' AND removed_by IS NULL AND removed_at IS NULL)),
  PRIMARY KEY ("output_id", "group_id")
);

CREATE TABLE "achievement_posts" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "group_id" uuid,
  "project_id" uuid,
  "output_id" uuid,
  "title" varchar(255) NOT NULL,
  "post_type" post_type NOT NULL DEFAULT 'GENERAL_NEWS',
  "content" text NOT NULL,
  "award_issuer" varchar(255),
  "award_year" int,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "research_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "group_id" uuid,
  "project_id" uuid,
  "creator_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "opportunity_kind" opportunity_kind NOT NULL,
  "target_audience" target_audience NOT NULL DEFAULT 'ANY_RESEARCHER',
  "expected_role" varchar(255),
  "required_expertise_tags" text[],
  "description" text,
  "response_sla_days" int NOT NULL DEFAULT 5,
  "application_deadline" timestamptz,
  "status" opportunity_status NOT NULL DEFAULT 'DRAFT',
  "published_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_opportunity_sla" CHECK (response_sla_days > 0),
  CONSTRAINT "ck_published_opportunity" CHECK (status = 'DRAFT' OR (application_deadline IS NOT NULL AND published_at IS NOT NULL AND length(btrim(title)) > 0 AND description IS NOT NULL AND length(btrim(description)) > 0)),
  CONSTRAINT "ck_expected_role_text" CHECK (expected_role IS NULL OR length(btrim(expected_role)) > 0)
);

CREATE TABLE "opportunity_applications" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "opportunity_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "applicant_note" text NOT NULL,
  "status" opportunity_application_status NOT NULL DEFAULT 'PENDING',
  "response_note" text,
  "response_due_at" timestamptz NOT NULL,
  "responded_by" uuid,
  "applied_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "responded_at" timestamptz,
  "withdrawn_at" timestamptz,
  CONSTRAINT "ck_response_deadline" CHECK (response_due_at >= applied_at),
  CONSTRAINT "ck_application_response" CHECK ((status IN ('PENDING', 'WITHDRAWN') AND responded_by IS NULL AND responded_at IS NULL) OR (status IN ('INVITED_TO_DISCUSS', 'DECLINED') AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND responded_at >= applied_at)),
  CONSTRAINT "ck_application_withdrawal" CHECK ((status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_at >= applied_at) OR (status <> 'WITHDRAWN' AND withdrawn_at IS NULL))
);

CREATE TABLE "research_projects" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(100) UNIQUE,
  "title" varchar(500) NOT NULL,
  "project_type" project_type NOT NULL,
  "group_id" uuid,
  "direction_id" uuid,
  "lead_id" uuid NOT NULL,
  "funding_source" varchar(255),
  "budget_amount" decimal(15,2),
  "start_date" date,
  "end_date" date,
  "status" project_status NOT NULL DEFAULT 'PROPOSAL_DRAFT',
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_project_budget" CHECK (budget_amount IS NULL OR budget_amount >= 0),
  CONSTRAINT "ck_project_dates" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT "ck_direction_needs_group" CHECK (direction_id IS NULL OR group_id IS NOT NULL)
);

CREATE TABLE "project_members" (
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" expected_role_type NOT NULL,
  "joined_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("project_id", "user_id")
);

CREATE TABLE "project_milestones" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "project_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "due_date" date NOT NULL,
  "status" milestone_status NOT NULL DEFAULT 'ON_TRACK',
  "notes" text,
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "mentoring_records" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "mentor_id" uuid NOT NULL,
  "student_user_id" uuid,
  "project_id" uuid,
  "student_name" varchar(255) NOT NULL,
  "student_id_code" varchar(50),
  "level" varchar(50) NOT NULL,
  "thesis_title" text NOT NULL,
  "academic_year" int NOT NULL,
  "rbl_origin_id" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "interest_circles" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(255) NOT NULL,
  "primary_topic_id" uuid NOT NULL,
  "initiator_id" uuid NOT NULL,
  "upgraded_to_group_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "interest_circle_members" (
  "circle_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("circle_id", "user_id")
);

CREATE TABLE "research_records" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "title" varchar(500) NOT NULL,
  "project_id" uuid,
  "milestone_id" uuid,
  "owner_id" uuid NOT NULL,
  "group_id" uuid,
  "topic_id" uuid,
  "problem_statement" text,
  "research_questions" text[],
  "claim" text,
  "evidence" text,
  "methodology" text,
  "finding" text,
  "evidence_of_ai_use" boolean NOT NULL DEFAULT false,
  "ai_task_description" text,
  "ai_contribution_summary" text,
  "human_decision_points" text,
  "record_status" record_status NOT NULL DEFAULT 'DRAFT',
  "visibility" visibility_level NOT NULL DEFAULT 'PRIVATE',
  "pub_status" publication_status NOT NULL DEFAULT 'UNPUBLISHED',
  "trace_id" varchar(100),
  "provenance_tag" data_provenance_type NOT NULL DEFAULT 'HUMAN',
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_milestone_needs_project" CHECK (milestone_id IS NULL OR project_id IS NOT NULL),
  CONSTRAINT "ck_record_group_scope" CHECK (visibility <> 'RESEARCH_GROUP' OR group_id IS NOT NULL)
);

CREATE TABLE "record_lineage" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "successor_record_id" uuid NOT NULL,
  "predecessor_record_id" uuid,
  "inheritance_type" varchar(100) NOT NULL,
  "rbl_origin_flag" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_lineage_not_self" CHECK (successor_record_id <> predecessor_record_id)
);

CREATE TABLE "knowledge_graph_edges" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "source_entity_type" varchar(50) NOT NULL,
  "source_entity_id" uuid NOT NULL,
  "target_entity_type" varchar(50) NOT NULL,
  "target_entity_id" uuid NOT NULL,
  "relationship_type" edge_type NOT NULL,
  "ai_confidence_score" decimal(3,2),
  "validation_status" edge_validation_status NOT NULL DEFAULT 'PENDING',
  "confirmed_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_edge_confirmation" CHECK (validation_status <> 'CONFIRMED' OR confirmed_by_user_id IS NOT NULL),
  CONSTRAINT "ck_edge_confidence" CHECK (ai_confidence_score IS NULL OR ai_confidence_score BETWEEN 0 AND 1),
  CONSTRAINT "ck_edge_entity_types" CHECK (source_entity_type IN ('RESEARCH_RECORD', 'OUTPUT', 'PROJECT') AND target_entity_type IN ('RESEARCH_RECORD', 'OUTPUT', 'PROJECT'))
);

CREATE TABLE "user_follows" (
  "follower_id" uuid NOT NULL,
  "entity_type" entity_types NOT NULL,
  "entity_id" uuid NOT NULL,
  "followed_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_follow_not_self" CHECK (entity_type <> 'RESEARCHER' OR follower_id <> entity_id),
  PRIMARY KEY ("follower_id", "entity_type", "entity_id")
);

CREATE TABLE "research_seminars" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "group_id" uuid,
  "organizer_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "seminar_type" seminar_type NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "published_at" timestamptz,
  "location_or_link" text NOT NULL,
  "research_context" text,
  "follow_up_actions" text,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "digest_preferences" (
  "user_id" uuid PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "timezone" varchar(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "language" varchar(10) NOT NULL DEFAULT 'vi',
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "research_updates" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "event_key" varchar(255) UNIQUE NOT NULL,
  "event_type" research_update_type NOT NULL,
  "actor_id" uuid NOT NULL,
  "output_id" uuid,
  "revision_id" uuid,
  "group_id" uuid,
  "opportunity_id" uuid,
  "seminar_id" uuid,
  "project_id" uuid,
  "occurred_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE "digest_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "status" delivery_status NOT NULL DEFAULT 'PENDING',
  "attempts" int NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "locked_until" timestamptz,
  "provider_message_id" text,
  "last_error" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_digest_period" CHECK (period_end > period_start),
  CONSTRAINT "ck_digest_attempts" CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT "ck_digest_sent" CHECK ((status = 'SENT' AND sent_at IS NOT NULL) OR (status <> 'SENT' AND sent_at IS NULL))
);

CREATE TABLE "digest_items" (
  "delivery_id" uuid NOT NULL,
  "subject_type" digest_subject_type NOT NULL,
  "subject_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "matched_reasons" jsonb NOT NULL DEFAULT ('[]'::jsonb),
  "content_snapshot" jsonb NOT NULL,
  CONSTRAINT "ck_digest_item_json" CHECK (jsonb_typeof(matched_reasons) = 'array' AND jsonb_typeof(content_snapshot) = 'object'),
  PRIMARY KEY ("delivery_id", "subject_type", "subject_id")
);

CREATE UNIQUE INDEX "uq_users_email_normalized" ON "users" ((lower(btrim(email))));

CREATE INDEX ON "user_role_assignments" ("user_id", "role");

-- At most one unrevoked grant per user/role.
--
-- The predicate is what lets a role be granted again after it was revoked:
-- the revoked row stays as history, but it is excluded from the uniqueness
-- check, so the slot is free. Two simultaneously unrevoked grants for the
-- same user and role still collide.
CREATE UNIQUE INDEX "uq_user_role_assignments_active"
  ON "user_role_assignments" ("user_id", "role")
  WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX ON "oidc_identities" ("issuer", "subject");

CREATE UNIQUE INDEX ON "oidc_identities" ("id", "user_id");

CREATE INDEX ON "user_sessions" ("user_id", "expires_at");

CREATE INDEX ON "user_sessions" ("identity_id", "idp_sid");

CREATE UNIQUE INDEX ON "research_fields" ("source", "external_id");

CREATE UNIQUE INDEX ON "research_subfields" ("source", "external_id");

CREATE INDEX ON "research_subfields" ("field_id");

CREATE UNIQUE INDEX ON "research_topics" ("source", "external_id");

-- One LOCAL topic per normalized name within a subfield.
--
-- The plain UNIQUE("source", "external_id") index above cannot enforce this:
-- LOCAL rows are forced to have external_id IS NULL by ck_topic_source, and
-- NULLs never collide in a unique index. So duplicate LOCAL names ("Machine
-- Learning", "machine learning", " Machine Learning ") were all accepted.
--
-- The predicate is what makes this safe: an imported topic may legitimately
-- share a name with a LOCAL one, or with another imported topic, without
-- being merged. The rule applies to LOCAL rows only.
--
-- This replaces the former non-unique idx_topic_subfield_name. Imported
-- topics are looked up by ("source", "external_id"); name search goes
-- through trigram/full-text, not this index.
CREATE UNIQUE INDEX "uq_research_topics_local_name"
  ON "research_topics" ("subfield_id", (lower(btrim("name"))))
  WHERE "source" = 'LOCAL';

CREATE UNIQUE INDEX ON "research_interests" ("user_id", "topic_id");

CREATE INDEX ON "research_interests" ("topic_id", "user_id");

CREATE INDEX ON "group_members" ("user_id", "group_id");

CREATE UNIQUE INDEX ON "group_directions" ("id", "group_id");

CREATE INDEX ON "research_outputs" ("owner_id");

-- Required by the composite foreign key
-- ("id", "current_release_id") -> output_revisions ("output_id", "id").
-- Prisma requires a unique constraint on the referencing side to model this
-- relation as one-to-one. Every other composite relation in this file follows
-- the same rule.
CREATE UNIQUE INDEX ON "research_outputs" ("id", "current_release_id");

CREATE UNIQUE INDEX ON "output_revisions" ("output_id", "revision_no");

CREATE UNIQUE INDEX ON "output_revisions" ("output_id", "id");

CREATE INDEX ON "output_external_ids" ("output_id", "source");

CREATE UNIQUE INDEX ON "output_authors" ("output_id", "author_order");

CREATE UNIQUE INDEX ON "output_authors" ("output_id", "user_id");

CREATE INDEX ON "output_authors" ("user_id", "output_id");

CREATE UNIQUE INDEX ON "output_authors" ("id", "output_id");

CREATE UNIQUE INDEX ON "publication_claims" ("output_id", "user_id");

CREATE INDEX ON "output_topics" ("topic_id", "revision_id");

CREATE UNIQUE INDEX ON "output_files" ("output_id", "id");

CREATE INDEX ON "group_output_links" ("group_id", "status", "requested_at");

CREATE INDEX ON "research_opportunities" ("group_id");

CREATE INDEX ON "research_opportunities" ("project_id");

CREATE INDEX ON "research_opportunities" ("status", "application_deadline");

CREATE INDEX ON "opportunity_applications" ("opportunity_id", "applicant_id", "applied_at");

CREATE INDEX ON "opportunity_applications" ("applicant_id", "applied_at");

CREATE INDEX ON "opportunity_applications" ("opportunity_id", "status", "applied_at");

-- At most one active application per applicant per opportunity.
--
-- The predicate is what allows a resubmission: a withdrawn row is kept as
-- history but excluded from the uniqueness check, so the applicant can apply
-- again. Two simultaneously active applications for the same applicant and
-- opportunity still collide.
CREATE UNIQUE INDEX "uq_opportunity_applications_active"
  ON "opportunity_applications" ("opportunity_id", "applicant_id")
  WHERE "status" <> 'WITHDRAWN';

CREATE INDEX ON "project_members" ("user_id", "project_id");

CREATE UNIQUE INDEX ON "project_milestones" ("id", "project_id");

CREATE INDEX ON "project_milestones" ("project_id");

CREATE INDEX ON "research_records" ("owner_id");

CREATE INDEX ON "knowledge_graph_edges" ("source_entity_type", "source_entity_id");

CREATE INDEX ON "knowledge_graph_edges" ("target_entity_type", "target_entity_id");

CREATE UNIQUE INDEX ON "knowledge_graph_edges" ("source_entity_type", "source_entity_id", "target_entity_type", "target_entity_id", "relationship_type");

CREATE INDEX ON "user_follows" ("entity_type", "entity_id", "follower_id");

CREATE INDEX ON "research_updates" ("occurred_at");

CREATE UNIQUE INDEX ON "digest_deliveries" ("user_id", "period_start", "period_end");

COMMENT ON TABLE "users" IS 'FACULTY baseline = RESEARCHER. STUDENT baseline = GUEST. Active RESEARCHER grants elevate a student. Inactive users have no access. See effective_user_access SQL view; API must enforce it.';

COMMENT ON COLUMN "users"."fptu_guid" IS 'Verified institutional identifier. Do not infer authorization from email domain alone.';

COMMENT ON TABLE "user_role_assignments" IS 'SQL partial unique index permits one unrevoked assignment per user/role. Authorized institutional access operator grants/revokes through the backend; researcher or group leader alone does not imply grant permission. Keep history.';

COMMENT ON TABLE "oidc_identities" IS 'OIDC identity is the verified (iss, sub) pair, not email. Issuer/client configuration and secrets are server-side. Link to institutional user only after trusted identity verification.';

COMMENT ON TABLE "oidc_login_attempts" IS 'Short-lived Authorization Code + PKCE S256 state. Hash state/nonce/browser-binding secrets; encrypt verifier using a key outside DB. Atomic consume prevents replay. Validate issuer, signature, audience, azp/exp/nonce and browser binding before creating session. No authorization code or raw ID/access/refresh token stored.';

COMMENT ON TABLE "user_sessions" IS 'Opaque session cookie; persist only its cryptographic hash. No cached application roles: re-evaluate effective_user_access on every request. Logout revokes the row; rotation revokes old session and creates new. API validates cookie, expiry, account status and CSRF protection. OIDC integration is not implemented by this table.';

COMMENT ON TABLE "researcher_profiles" IS 'Shared by faculty and students. Profile existence does not grant researcher access. API completes onboarding only after profile/paper review and at least one ACTIVE interest.';

COMMENT ON COLUMN "researcher_profiles"."papers_reviewed_at" IS 'May be set after explicitly confirming no matching publications.';

COMMENT ON TABLE "research_fields" IS 'OpenAlex Field, not Domain. internal_code is optional FPTU code, never the provider ID. Upsert imported nodes using (source,external_id), not name.';

COMMENT ON TABLE "research_subfields" IS 'OpenAlex Subfield belongs to exactly one Field. Import parent by its external ID before child. No Area Owner.';

COMMENT ON TABLE "research_topics" IS 'Other creates an active LOCAL topic immediately. SQL partial UNIQUE(subfield_id,lower(name)) WHERE source=LOCAL prevents duplicate local names. Imported IDs may share labels with LOCAL or other imported IDs without merging; UI displays source/ID. Import never updates by name or overwrites LOCAL. No taxonomy approval queue.';

COMMENT ON TABLE "research_interests" IS 'One effective interest per user/topic. User selection, even of OPENALEX topics, is DECLARED/ACTIVE. Personal inference is INFERRED/SUGGESTED; acceptance preserves INFERRED and sets ACTIVE. Rejection keeps negative feedback. Guest cannot write interests.';

COMMENT ON TABLE "research_groups" IS 'Membership queries include lead_id as well as group_members. Researcher access and resource visibility must still be checked.';

COMMENT ON COLUMN "research_groups"."lead_id" IS 'Single authority for group leadership; LEAD is not duplicated in group_members.role.';

COMMENT ON TABLE "research_outputs" IS 'One work regardless of authors/groups. DRAFT/SHARED/ARCHIVED describe internal sharing, not journal publication. Owner plus effective researcher access is required to edit/release. Current visibility applies to ALL versions and linked groups; a group link never widens access. Discovery uses released_output_versions, not drafts.';

COMMENT ON COLUMN "research_outputs"."doi" IS 'API stores canonical lowercase DOI without URL prefix; NULL for outputs without DOI.';

COMMENT ON COLUMN "research_outputs"."owner_id" IS 'Single managing owner for MVP. Imported unclaimed metadata can have NULL owner but cannot be shared. Authorship claims never assign ownership automatically.';

COMMENT ON TABLE "output_revisions" IS 'NULL released_at = editable draft. Release is an owner action, not a review. SQL freezes released metadata and revision-topic/file links. Publish revision and current_release_id atomically. New draft does not change current personal/group release.';

COMMENT ON COLUMN "output_external_ids"."source" IS 'E.g. OPENALEX, SCOPUS, CROSSREF. Presence here records metadata origin, not a quality certification.';

COMMENT ON COLUMN "output_authors"."user_id" IS 'Optional internal account mapping; external coauthors need no login.';

COMMENT ON TABLE "publication_claims" IS 'API confirms the claim and maps output_authors.user_id in one transaction after resolving author conflicts. A claim never approves institutional publication.';

COMMENT ON COLUMN "publication_claims"."author_id" IS 'Stable authorship identifier; must belong to output_id.';

COMMENT ON TABLE "output_topics" IS 'Topics of a specific output revision. Filter Discovery only through current released revision; draft tags never affect shared search. SQL freezes links once revision is released.';

COMMENT ON TABLE "output_files" IS 'Immutable payload metadata; visibility/availability may be restricted immediately. Download requires BOTH output access and file access, plus a released revision attachment unless requester is manager. Group approval never grants file access.';

COMMENT ON TABLE "output_revision_files" IS 'Reuse one immutable stored file in multiple revisions. Composite FKs ensure revision and file belong to the same output. Frozen after release.';

COMMENT ON TABLE "group_output_links" IS 'Group curation only. Leader may directly insert ACCEPTED for an owned released work; no self-application. Pending/rejected new request preserves previous accepted pin. Removal clears ONLY this group pin. New released revision needs separate acceptance to replace group content. Root visibility always applies. No minimum group size.';

COMMENT ON TABLE "research_opportunities" IS 'Personal opportunities allow NULL group/project and are managed by creator. Group/project scope requires its management rights; creator alone grants no scoped authority. Kind, target audience and free-text role are independent and grant no access. SLA is calendar days including weekends/holidays. Deadline is the exact application cutoff.';

COMMENT ON TABLE "opportunity_applications" IS 'SQL partial UNIQUE(opportunity_id,applicant_id) WHERE status <> WITHDRAWN. Resubmission inserts new ID only after previous withdrawal. Terminal rows are immutable; transition only from PENDING. SQL locks parent when inserting, checks OPEN/deadline/archive and researcher eligibility. Backend authenticates withdrawal actor and response handler; conditional updates prevent response/withdraw races. Closing does not decline old applications.';

COMMENT ON COLUMN "opportunity_applications"."response_due_at" IS 'SQL insert trigger sets applied_at and snapshots SLA in calendar days (Asia/Ho_Chi_Minh). Never recalculated on opportunity edit.';

COMMENT ON TABLE "project_members" IS 'Project leadership remains research_projects.lead_id; membership is independent of group membership.';

COMMENT ON TABLE "research_records" IS 'Retained advanced-phase module; not the publication table. API enforces validation transitions, group/project access and audit history.';

COMMENT ON COLUMN "research_records"."group_id" IS 'Explicit access scope for RESEARCH_GROUP visibility, even without a project.';

COMMENT ON COLUMN "research_records"."topic_id" IS 'Subfield and Field are derived from this Topic.';

COMMENT ON TABLE "knowledge_graph_edges" IS 'Polymorphic endpoints intentionally retained; backend validates existence, access and deletion handling. There are no database FKs for these endpoint UUIDs.';

COMMENT ON TABLE "user_follows" IS 'OUTPUT supports following a paper. API validates polymorphic target, visibility and cleanup. Follow does not grant access.';

COMMENT ON COLUMN "research_seminars"."organizer_id" IS 'Always a user; group affiliation is group_id. Removed ambiguous organizer_type.';

COMMENT ON TABLE "digest_preferences" IS 'Researcher opt-in only. Weekly MVP; no daily/monthly selector. Worker skips empty periods and rechecks role, account status, opt-out and visibility immediately before delivery.';

COMMENT ON TABLE "research_updates" IS 'Small durable feed of meaningful sharing actions, NOT a general event bus. SQL records personal releases, accepted group revisions, opportunity opens and seminar publication in the same transaction. Project events are explicit future-module writes. No events on ordinary updated_at/sync. Typed target shape constrained in SQL.';

COMMENT ON TABLE "digest_deliveries" IS 'One weekly delivery per recipient/window. Only create if eligible items exist. BullMQ coordinates jobs; DB ledger persists attempts (max 5), leases and delivery result. id is provider idempotency key. SENT is terminal; unknown provider outcome requires reconciliation, not blind resend. Transactional application responses are independent.';

COMMENT ON TABLE "digest_items" IS 'SQL derives subject type/ID from event_id. A work matched by multiple follows/group events remains one item. Worker chooses latest relevant event, merges reasons, and renders authorized released content; snapshot records content selected for delivery. Recheck/prune before send. Event FK traces the selected event; no draft payloads.';

ALTER TABLE "user_role_assignments" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_role_assignments" ADD FOREIGN KEY ("granted_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_role_assignments" ADD FOREIGN KEY ("revoked_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "researcher_profiles" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "oidc_identities" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_sessions" ADD FOREIGN KEY ("identity_id", "user_id") REFERENCES "oidc_identities" ("id", "user_id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_subfields" ADD FOREIGN KEY ("field_id") REFERENCES "research_fields" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_topics" ADD FOREIGN KEY ("subfield_id") REFERENCES "research_subfields" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_topics" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_interests" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_interests" ADD FOREIGN KEY ("topic_id") REFERENCES "research_topics" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_groups" ADD FOREIGN KEY ("lead_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_members" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_directions" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_directions" ADD FOREIGN KEY ("topic_id") REFERENCES "research_topics" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_outputs" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_outputs" ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_outputs" ADD FOREIGN KEY ("access_group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_outputs" ADD FOREIGN KEY ("id", "current_release_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_revisions" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_revisions" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_revisions" ADD FOREIGN KEY ("released_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_external_ids" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_authors" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_authors" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "publication_claims" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "publication_claims" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "publication_claims" ADD FOREIGN KEY ("author_id", "output_id") REFERENCES "output_authors" ("id", "output_id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_topics" ADD FOREIGN KEY ("output_id", "revision_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_topics" ADD FOREIGN KEY ("topic_id") REFERENCES "research_topics" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_topics" ADD FOREIGN KEY ("added_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_files" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_files" ADD FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_files" ADD FOREIGN KEY ("access_group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_revision_files" ADD FOREIGN KEY ("output_id", "revision_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "output_revision_files" ADD FOREIGN KEY ("output_id", "file_id") REFERENCES "output_files" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("output_id", "requested_revision_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("output_id", "accepted_revision_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("requested_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("decided_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("accepted_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "group_output_links" ADD FOREIGN KEY ("removed_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "achievement_posts" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "achievement_posts" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "achievement_posts" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "achievement_posts" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_opportunities" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_opportunities" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_opportunities" ADD FOREIGN KEY ("creator_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "opportunity_applications" ADD FOREIGN KEY ("opportunity_id") REFERENCES "research_opportunities" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "opportunity_applications" ADD FOREIGN KEY ("applicant_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "opportunity_applications" ADD FOREIGN KEY ("responded_by") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_projects" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_projects" ADD FOREIGN KEY ("direction_id", "group_id") REFERENCES "group_directions" ("id", "group_id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_projects" ADD FOREIGN KEY ("lead_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "project_members" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "project_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "project_milestones" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "mentoring_records" ADD FOREIGN KEY ("mentor_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "mentoring_records" ADD FOREIGN KEY ("student_user_id") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "mentoring_records" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "interest_circles" ADD FOREIGN KEY ("primary_topic_id") REFERENCES "research_topics" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "interest_circles" ADD FOREIGN KEY ("initiator_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "interest_circles" ADD FOREIGN KEY ("upgraded_to_group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "interest_circle_members" ADD FOREIGN KEY ("circle_id") REFERENCES "interest_circles" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "interest_circle_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_records" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_records" ADD FOREIGN KEY ("milestone_id", "project_id") REFERENCES "project_milestones" ("id", "project_id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_records" ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_records" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_records" ADD FOREIGN KEY ("topic_id") REFERENCES "research_topics" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "record_lineage" ADD FOREIGN KEY ("successor_record_id") REFERENCES "research_records" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "record_lineage" ADD FOREIGN KEY ("predecessor_record_id") REFERENCES "research_records" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "knowledge_graph_edges" ADD FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_follows" ADD FOREIGN KEY ("follower_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_seminars" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_seminars" ADD FOREIGN KEY ("organizer_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "digest_preferences" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("output_id") REFERENCES "research_outputs" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("output_id", "revision_id") REFERENCES "output_revisions" ("output_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("group_id") REFERENCES "research_groups" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("opportunity_id") REFERENCES "research_opportunities" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("seminar_id") REFERENCES "research_seminars" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "research_updates" ADD FOREIGN KEY ("project_id") REFERENCES "research_projects" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "digest_deliveries" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "digest_items" ADD FOREIGN KEY ("delivery_id") REFERENCES "digest_deliveries" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "digest_items" ADD FOREIGN KEY ("event_id") REFERENCES "research_updates" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

-- ---------------------------------------------------------------------------
-- Triggers and views
--
-- These objects close the gap between the COMMENT ON statements above and the
-- objects that actually exist. Prisma cannot introspect any of them, which is
-- exactly why ResearchOS.sql is the source of truth and the Prisma datamodel
-- is derived from it rather than the other way round.
-- ---------------------------------------------------------------------------

-- Sets applied_at and snapshots the response SLA on every application.
--
-- response_due_at is NOT NULL with no column default, so without this trigger
-- the table cannot be written to at all. The SLA is snapshotted from the
-- opportunity at insert time and is never recalculated when the opportunity
-- is later edited.
CREATE OR REPLACE FUNCTION public.trg_opportunity_applications_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sla_days integer;
  v_status opportunity_status;
  v_deadline timestamptz;
  v_archived_at timestamptz;
BEGIN
  -- Lock the parent row for the rest of the transaction so the opportunity
  -- cannot be closed, archived or have its deadline moved between the checks
  -- below and the insert.
  SELECT o.response_sla_days, o.status, o.application_deadline, o.archived_at
    INTO v_sla_days, v_status, v_deadline, v_archived_at
    FROM public.research_opportunities o
   WHERE o.id = NEW.opportunity_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity % does not exist', NEW.opportunity_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'opportunity % is archived', NEW.opportunity_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'opportunity % is not open (status is %)', NEW.opportunity_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_deadline IS NULL OR v_deadline < CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'the application deadline for opportunity % has passed', NEW.opportunity_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- applied_at is assigned here so the snapshot of the SLA and the deadline
  -- are derived from the same instant.
  NEW.applied_at := CURRENT_TIMESTAMP;

  -- Calendar days, including weekends and holidays. Asia/Ho_Chi_Minh has no
  -- daylight saving, so adding a day interval is exact.
  NEW.response_due_at := NEW.applied_at + make_interval(days => v_sla_days);

  RETURN NEW;
END;
$$;

CREATE TRIGGER "tg_opportunity_applications_before_insert"
  BEFORE INSERT ON "opportunity_applications"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opportunity_applications_before_insert();

-- Effective access for a user.
--
-- FACULTY baseline is RESEARCHER. STUDENT baseline is GUEST. An active
-- (unrevoked) RESEARCHER grant elevates a student. Inactive users have no
-- access at all, which is why their effective role is NONE rather than GUEST.
--
-- The API must re-evaluate this on every request. No cached roles.
CREATE OR REPLACE VIEW public.effective_user_access AS
WITH active_researcher_grants AS (
  SELECT DISTINCT ura.user_id
    FROM public.user_role_assignments ura
   WHERE ura.role = 'RESEARCHER'
     AND ura.revoked_at IS NULL
)
SELECT
  u.id AS user_id,
  u.fptu_guid,
  u.email,
  u.user_type,
  u.is_active,
  CASE
    WHEN NOT u.is_active THEN 'NONE'::text
    WHEN u.user_type = 'FACULTY' THEN 'RESEARCHER'::text
    WHEN g.user_id IS NOT NULL THEN 'RESEARCHER'::text
    ELSE 'GUEST'::text
  END AS effective_role,
  (
    u.is_active
    AND (u.user_type = 'FACULTY' OR g.user_id IS NOT NULL)
  ) AS is_researcher
FROM public.users u
LEFT JOIN active_researcher_grants g ON g.user_id = u.id;

-- The only surface discovery may search.
--
-- A released revision is the current release of an output that is shared.
-- Drafts are excluded by construction, so a draft can never leak into a
-- shared search result.
CREATE OR REPLACE VIEW public.released_output_versions AS
SELECT
  o.id AS output_id,
  o.doi,
  o.owner_id,
  o.created_by,
  o.sharing_status,
  o.visibility,
  o.access_group_id,
  o.provenance_tag,
  o.first_shared_at,
  r.id AS revision_id,
  r.revision_no,
  r.title,
  r.abstract,
  r.venue,
  r.publisher,
  r.publication_year,
  r.publication_status,
  r.output_type,
  r.external_url,
  r.authors_snapshot,
  r.released_by,
  r.released_at,
  r.created_at AS revision_created_at,
  r.updated_at AS revision_updated_at
FROM public.research_outputs o
JOIN public.output_revisions r
  ON r.output_id = o.id
 AND r.id = o.current_release_id
WHERE o.sharing_status = 'SHARED'
  AND r.released_at IS NOT NULL;

COMMENT ON VIEW public.effective_user_access IS 'Effective access per user. FACULTY baseline = RESEARCHER, STUDENT baseline = GUEST, an active RESEARCHER grant elevates a student, inactive users have no access (NONE). The API re-evaluates this on every request and must not cache roles.';

COMMENT ON VIEW public.released_output_versions IS 'The current released revision of every shared output. Discovery searches this view only, so drafts never appear in shared results.';
