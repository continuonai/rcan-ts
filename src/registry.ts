/**
 * rcan-ts — RegistryClient
 * TypeScript parity with rcan-py RegistryClient.
 *
 * @see https://rcan.dev/spec#section-registry
 */

import { RCANRegistryError } from "./errors.js";

const DEFAULT_BASE_URL = "https://rcan-spec.pages.dev";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RobotRegistration {
  manufacturer: string;
  model: string;
  version: string;
  device_id: string;
  description?: string;
  contact_email?: string;
  verification_tier?: string;
  source?: string;
}

export interface Robot extends RobotRegistration {
  rrn: string;
  registered_at: string;
  updated_at: string;
  verification_tier: string;
  status: string;
}

export interface RegistrationResult {
  rrn: string;
  api_key: string;
}

export interface ListResult {
  robots: Robot[];
  total: number;
  limit: number;
  offset: number;
}

// ── RegistryClient ────────────────────────────────────────────────────────────

export class RegistryClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(opts?: { baseUrl?: string; apiKey?: string; timeout?: number }) {
    this.baseUrl = (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = opts?.apiKey;
    this.timeout = opts?.timeout ?? 10000;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _fetch(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private _authHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new RCANRegistryError(
        "API key required for write operations. Pass apiKey to RegistryClient."
      );
    }
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async _checkResponse<T>(resp: Response): Promise<T> {
    if (!resp.ok) {
      let msg = `Registry API error: ${resp.status}`;
      try {
        const body = (await resp.json()) as { error?: string };
        if (body?.error) msg = body.error;
      } catch {
        /* ignore */
      }
      throw new RCANRegistryError(msg);
    }
    return (await resp.json()) as T;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Register a new robot. Returns RRN + API key. */
  async register(robot: RobotRegistration): Promise<RegistrationResult> {
    const resp = await this._fetch("/api/v1/robots", {
      method: "POST",
      body: JSON.stringify(robot),
    });
    return this._checkResponse<RegistrationResult>(resp);
  }

  /** Look up a robot by RRN. */
  async get(rrn: string): Promise<Robot> {
    const resp = await this._fetch(`/api/v1/robots/${encodeURIComponent(rrn)}`);
    return this._checkResponse<Robot>(resp);
  }

  /** List robots with optional pagination and tier filter. */
  async list(opts?: {
    limit?: number;
    offset?: number;
    tier?: string;
  }): Promise<ListResult> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts?.tier) params.set("tier", opts.tier);
    const qs = params.toString() ? `?${params}` : "";
    const resp = await this._fetch(`/api/v1/robots${qs}`);
    return this._checkResponse<ListResult>(resp);
  }

  /** Update robot fields. Requires API key. */
  async patch(rrn: string, updates: Partial<Robot>): Promise<Robot> {
    const resp = await this._fetch(
      `/api/v1/robots/${encodeURIComponent(rrn)}`,
      {
        method: "PATCH",
        headers: this._authHeaders(),
        body: JSON.stringify(updates),
      }
    );
    return this._checkResponse<Robot>(resp);
  }

  /** Delete (soft-delete) a robot. Requires API key. */
  async delete(rrn: string): Promise<void> {
    const resp = await this._fetch(
      `/api/v1/robots/${encodeURIComponent(rrn)}`,
      {
        method: "DELETE",
        headers: this._authHeaders(),
      }
    );
    if (!resp.ok) {
      await this._checkResponse<void>(resp);
    }
  }

  /** Search robots by query, manufacturer, model, or tier. */
  async search(opts: {
    q?: string;
    manufacturer?: string;
    model?: string;
    tier?: string;
  }): Promise<Robot[]> {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.manufacturer) params.set("manufacturer", opts.manufacturer);
    if (opts.model) params.set("model", opts.model);
    if (opts.tier) params.set("tier", opts.tier);
    const qs = params.toString() ? `?${params}` : "";
    const resp = await this._fetch(`/api/v1/robots/search${qs}`);
    if (!resp.ok) {
      // Fall back to list endpoint with filters
      const listResp = await this._fetch(`/api/v1/robots${qs}`);
      const data = await this._checkResponse<ListResult | { results?: Robot[] }>(listResp);
      if ("robots" in data) return data.robots;
      if ("results" in data && data.results) return data.results;
      return [];
    }
    const data = (await resp.json()) as Robot[] | { results?: Robot[] } | ListResult;
    if (Array.isArray(data)) return data;
    if ("results" in data && data.results) return data.results;
    if ("robots" in data) return (data as ListResult).robots;
    return [];
  }
}
