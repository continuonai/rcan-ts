/**
 * rcan/competition — Competition protocol messages and scope.
 *
 * Implements the competition scope and message types for RCAN v1.10+.
 * Robots can enter competitions, publish scores, receive season standings,
 * and log private personal research results.
 *
 * Spec: §3 MessageTypes 37–40
 */

import { MessageType } from "./message.js";

// ── Scope ────────────────────────────────────────────────────────────────

/** Competition scope level — chat-level scope (observation, not control). */
export const COMPETITION_SCOPE_LEVEL = 2.0;

// ── Enums / Union Types ──────────────────────────────────────────────────

export type CompetitionFormat =
  | "sprint"
  | "endurance"
  | "precision"
  | "efficiency";

export type CompetitionBadge = "gold" | "silver" | "bronze" | "participant";

export type RunType = "personal" | "community";

// ── Payload Types ────────────────────────────────────────────────────────

export interface StandingEntry {
  rank: number;
  rrn: string;
  score: number;
  badge: CompetitionBadge;
}

export interface ResearchMetrics {
  success_rate: number;
  p66_rate: number;
  token_efficiency: number;
  latency_score: number;
  [key: string]: number;
}

// ── Message Interfaces ───────────────────────────────────────────────────

export interface CompetitionEnter {
  type: typeof MessageType.COMPETITION_ENTER;
  competition_id: string;
  competition_format: CompetitionFormat;
  hardware_tier: string;
  model_id: string;
  robot_rrn: string;
  entered_at: number;
}

export interface CompetitionScore {
  type: typeof MessageType.COMPETITION_SCORE;
  competition_id: string;
  candidate_id: string;
  score: number;
  hardware_tier: string;
  verified: boolean;
  submitted_at: number;
}

export interface SeasonStanding {
  type: typeof MessageType.SEASON_STANDING;
  season_id: string;
  class_id: string;
  standings: StandingEntry[];
  days_remaining: number;
  broadcast_at: number;
}

export interface PersonalResearchResult {
  type: typeof MessageType.PERSONAL_RESEARCH_RESULT;
  run_id: string;
  run_type: RunType;
  candidate_id: string;
  score: number;
  hardware_tier: string;
  model_id: string;
  owner_uid: string;
  metrics: ResearchMetrics;
  submitted_to_community: boolean;
  created_at: number;
}

// ── Factory Functions ────────────────────────────────────────────────────

let _idCounter = 0;

function _generateRunId(): string {
  return `run-${Date.now()}-${++_idCounter}`;
}

export function makeCompetitionEnter(
  params: Partial<Omit<CompetitionEnter, "type">> = {},
): CompetitionEnter {
  return {
    type: MessageType.COMPETITION_ENTER,
    competition_id: params.competition_id ?? "",
    competition_format: params.competition_format ?? "sprint",
    hardware_tier: params.hardware_tier ?? "",
    model_id: params.model_id ?? "",
    robot_rrn: params.robot_rrn ?? "",
    entered_at: params.entered_at ?? Date.now() / 1000,
  };
}

export function makeCompetitionScore(
  params: Partial<Omit<CompetitionScore, "type">> = {},
): CompetitionScore {
  const score = params.score ?? 0.0;
  if (score < 0.0 || score > 1.0) {
    throw new Error(`score must be in [0.0, 1.0], got ${score}`);
  }
  return {
    type: MessageType.COMPETITION_SCORE,
    competition_id: params.competition_id ?? "",
    candidate_id: params.candidate_id ?? "",
    score,
    hardware_tier: params.hardware_tier ?? "",
    verified: params.verified ?? false,
    submitted_at: params.submitted_at ?? Date.now() / 1000,
  };
}

export function makeSeasonStanding(
  params: Partial<Omit<SeasonStanding, "type">> = {},
): SeasonStanding {
  return {
    type: MessageType.SEASON_STANDING,
    season_id: params.season_id ?? "",
    class_id: params.class_id ?? "",
    standings: params.standings ?? [],
    days_remaining: params.days_remaining ?? 0,
    broadcast_at: params.broadcast_at ?? Date.now() / 1000,
  };
}

export function makePersonalResearchResult(
  params: Partial<Omit<PersonalResearchResult, "type">> = {},
): PersonalResearchResult {
  const score = params.score ?? 0.0;
  if (score < 0.0 || score > 1.0) {
    throw new Error(`score must be in [0.0, 1.0], got ${score}`);
  }
  return {
    type: MessageType.PERSONAL_RESEARCH_RESULT,
    run_id: params.run_id ?? _generateRunId(),
    run_type: params.run_type ?? "personal",
    candidate_id: params.candidate_id ?? "",
    score,
    hardware_tier: params.hardware_tier ?? "",
    model_id: params.model_id ?? "",
    owner_uid: params.owner_uid ?? "",
    metrics: params.metrics ?? {
      success_rate: 0,
      p66_rate: 0,
      token_efficiency: 0,
      latency_score: 0,
    },
    submitted_to_community: params.submitted_to_community ?? false,
    created_at: params.created_at ?? Date.now() / 1000,
  };
}

// ── Scope Validation ─────────────────────────────────────────────────────

/**
 * Check if the given scope level permits competition operations.
 * Competition messages require scope >= 2.0 (chat level).
 */
export function validateCompetitionScope(scopeLevel: number): boolean {
  return scopeLevel >= COMPETITION_SCOPE_LEVEL;
}
