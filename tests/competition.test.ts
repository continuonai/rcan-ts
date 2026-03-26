/**
 * Tests for rcan/competition — competition protocol messages (v1.10).
 */
import {
  COMPETITION_SCOPE_LEVEL,
  makeCompetitionEnter,
  makeCompetitionScore,
  makeSeasonStanding,
  makePersonalResearchResult,
  validateCompetitionScope,
} from "../src/competition";
import { MessageType } from "../src/message";

describe("CompetitionEnter", () => {
  it("creates with defaults", () => {
    const msg = makeCompetitionEnter();
    expect(msg.type).toBe(MessageType.COMPETITION_ENTER);
    expect(msg.type).toBe(37);
    expect(msg.competition_format).toBe("sprint");
    expect(msg.competition_id).toBe("");
  });

  it("accepts all params", () => {
    const msg = makeCompetitionEnter({
      competition_id: "sprint-2026-04-pi5-hailo8l",
      competition_format: "sprint",
      hardware_tier: "pi5-hailo8l",
      model_id: "gemini-2.5-flash",
      robot_rrn: "RRN-000000000001",
    });
    expect(msg.competition_id).toBe("sprint-2026-04-pi5-hailo8l");
    expect(msg.hardware_tier).toBe("pi5-hailo8l");
    expect(msg.model_id).toBe("gemini-2.5-flash");
    expect(msg.robot_rrn).toBe("RRN-000000000001");
  });

  it("supports all competition formats", () => {
    const formats = ["sprint", "endurance", "precision", "efficiency"] as const;
    for (const fmt of formats) {
      const msg = makeCompetitionEnter({ competition_format: fmt });
      expect(msg.competition_format).toBe(fmt);
    }
  });

  it("entered_at defaults to approximately now", () => {
    const before = Date.now() / 1000;
    const msg = makeCompetitionEnter();
    const after = Date.now() / 1000;
    expect(msg.entered_at).toBeGreaterThanOrEqual(before);
    expect(msg.entered_at).toBeLessThanOrEqual(after);
  });
});

describe("CompetitionScore", () => {
  it("creates with defaults", () => {
    const msg = makeCompetitionScore();
    expect(msg.type).toBe(MessageType.COMPETITION_SCORE);
    expect(msg.type).toBe(38);
    expect(msg.verified).toBe(false);
    expect(msg.score).toBe(0.0);
  });

  it("accepts all params", () => {
    const msg = makeCompetitionScore({
      competition_id: "sprint-2026-04-pi5-hailo8l",
      candidate_id: "lower_cost_gate",
      score: 0.8846,
      hardware_tier: "pi5-hailo8l",
      verified: true,
    });
    expect(msg.score).toBeCloseTo(0.8846);
    expect(msg.verified).toBe(true);
    expect(msg.candidate_id).toBe("lower_cost_gate");
  });

  it("score boundary: 0.0", () => {
    const msg = makeCompetitionScore({ score: 0.0 });
    expect(msg.score).toBe(0.0);
  });

  it("score boundary: 1.0", () => {
    const msg = makeCompetitionScore({ score: 1.0 });
    expect(msg.score).toBe(1.0);
  });

  it("throws on score > 1.0", () => {
    expect(() => makeCompetitionScore({ score: 1.01 })).toThrow();
  });

  it("throws on score < 0.0", () => {
    expect(() => makeCompetitionScore({ score: -0.1 })).toThrow();
  });

  it("verified defaults to false", () => {
    const msg = makeCompetitionScore({ score: 0.5 });
    expect(msg.verified).toBe(false);
  });
});

describe("SeasonStanding", () => {
  it("creates with defaults", () => {
    const msg = makeSeasonStanding();
    expect(msg.type).toBe(MessageType.SEASON_STANDING);
    expect(msg.type).toBe(39);
    expect(msg.standings).toEqual([]);
    expect(msg.days_remaining).toBe(0);
  });

  it("accepts full standings", () => {
    const standings = [
      { rank: 1, rrn: "RRN-000000000001", score: 0.9101, badge: "gold" as const },
      { rank: 2, rrn: "RRN-000000000005", score: 0.8812, badge: "silver" as const },
      { rank: 3, rrn: "RRN-000000000012", score: 0.8503, badge: "bronze" as const },
    ];
    const msg = makeSeasonStanding({
      season_id: "2026-03",
      class_id: "pi5-hailo8l__gemini-2.5-flash",
      standings,
      days_remaining: 9,
    });
    expect(msg.season_id).toBe("2026-03");
    expect(msg.class_id).toBe("pi5-hailo8l__gemini-2.5-flash");
    expect(msg.standings).toHaveLength(3);
    expect(msg.standings[0].badge).toBe("gold");
    expect(msg.days_remaining).toBe(9);
  });

  it("standings preserve badge values", () => {
    const badges = ["gold", "silver", "bronze", "participant"] as const;
    for (const badge of badges) {
      const msg = makeSeasonStanding({
        standings: [{ rank: 1, rrn: "RRN-1", score: 0.9, badge }],
      });
      expect(msg.standings[0].badge).toBe(badge);
    }
  });

  it("empty standings by default", () => {
    const msg = makeSeasonStanding({ season_id: "2026-04" });
    expect(msg.standings).toEqual([]);
  });
});

describe("PersonalResearchResult", () => {
  it("creates with defaults", () => {
    const msg = makePersonalResearchResult();
    expect(msg.type).toBe(MessageType.PERSONAL_RESEARCH_RESULT);
    expect(msg.type).toBe(40);
    expect(msg.run_type).toBe("personal");
    expect(msg.submitted_to_community).toBe(false);
    expect(msg.run_id).toBeTruthy();
  });

  it("accepts all params", () => {
    const metrics = {
      success_rate: 0.93,
      p66_rate: 0.97,
      token_efficiency: 0.72,
      latency_score: 0.68,
    };
    const msg = makePersonalResearchResult({
      run_type: "personal",
      candidate_id: "lower_cost_gate",
      score: 0.8846,
      hardware_tier: "pi5-hailo8l",
      model_id: "gemini-2.5-flash",
      owner_uid: "GAi2kq961zWUnXMQzu6qLCmCOtR2",
      metrics,
      submitted_to_community: false,
    });
    expect(msg.candidate_id).toBe("lower_cost_gate");
    expect(msg.score).toBeCloseTo(0.8846);
    expect(msg.owner_uid).toBe("GAi2kq961zWUnXMQzu6qLCmCOtR2");
    expect(msg.metrics.success_rate).toBe(0.93);
    expect(msg.submitted_to_community).toBe(false);
  });

  it("supports community run type", () => {
    const msg = makePersonalResearchResult({ run_type: "community", score: 0.75 });
    expect(msg.run_type).toBe("community");
  });

  it("submitted_to_community can be true", () => {
    const msg = makePersonalResearchResult({ score: 0.9, submitted_to_community: true });
    expect(msg.submitted_to_community).toBe(true);
  });

  it("score boundary: 0.0 and 1.0", () => {
    expect(makePersonalResearchResult({ score: 0.0 }).score).toBe(0.0);
    expect(makePersonalResearchResult({ score: 1.0 }).score).toBe(1.0);
  });

  it("throws on score out of range", () => {
    expect(() => makePersonalResearchResult({ score: 1.5 })).toThrow();
    expect(() => makePersonalResearchResult({ score: -0.1 })).toThrow();
  });

  it("auto-generates unique run_ids", () => {
    const a = makePersonalResearchResult();
    const b = makePersonalResearchResult();
    expect(a.run_id).not.toBe(b.run_id);
  });

  it("preserves explicit run_id", () => {
    const msg = makePersonalResearchResult({ run_id: "my-run-123", score: 0.5 });
    expect(msg.run_id).toBe("my-run-123");
  });

  it("submitted_to_community defaults to false", () => {
    expect(makePersonalResearchResult().submitted_to_community).toBe(false);
  });
});

describe("validateCompetitionScope", () => {
  it("COMPETITION_SCOPE_LEVEL is 2.0", () => {
    expect(COMPETITION_SCOPE_LEVEL).toBe(2.0);
  });

  it("chat scope (2.0) is permitted", () => {
    expect(validateCompetitionScope(2.0)).toBe(true);
  });

  it("control scope (3.0) is permitted", () => {
    expect(validateCompetitionScope(3.0)).toBe(true);
  });

  it("below chat (1.9) is rejected", () => {
    expect(validateCompetitionScope(1.9)).toBe(false);
  });

  it("observe scope (1.0) is rejected", () => {
    expect(validateCompetitionScope(1.0)).toBe(false);
  });
});
