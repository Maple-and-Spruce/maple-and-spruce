/**
 * Etsy HTTP client
 *
 * Thin fetch wrapper that:
 * - Attaches x-api-key and Authorization headers
 * - Retries once on 401 (token may have expired mid-request)
 * - Tracks rate limits from response headers
 * - Provides typed request methods (get, post, put, patch, delete)
 *
 * This module has zero external dependencies — uses only Node.js fetch.
 */
import type { OAuthService } from '../oauth/oauth.service.js';
import type { EtsyApiError } from '../types/common.types.js';

const ETSY_API_BASE = 'https://api.etsy.com/v3/application';

/** Minimum delay between requests to stay under 5 QPS */
const MIN_REQUEST_INTERVAL_MS = 210;

export class EtsyHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(`Etsy API error ${status}: ${statusText} — ${body}`);
    this.name = 'EtsyHttpError';
  }
}

export class EtsyHttp {
  private lastRequestTime = 0;

  constructor(
    private readonly apiKey: string,
    private readonly sharedSecret: string,
    private readonly oauth: OAuthService
  ) {}

  /**
   * GET request.
   *
   * @param path - API path (e.g., "/shops/12345/listings")
   * @param params - Optional query parameters
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request with JSON or form-data body.
   *
   * @param path - API path
   * @param body - Request body (JSON-serializable)
   */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: this.toFormData(body),
    });
  }

  /**
   * POST request with multipart form data (for image uploads).
   *
   * @param path - API path
   * @param formData - FormData with file and metadata
   */
  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type — fetch sets it with boundary for multipart
    });
  }

  /**
   * PUT request with JSON body.
   *
   * @param path - API path
   * @param body - Request body
   */
  async put<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH request with form-encoded body.
   *
   * @param path - API path
   * @param body - Fields to update
   */
  async patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: this.toFormData(body),
    });
  }

  /**
   * DELETE request.
   *
   * @param path - API path
   */
  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    await this.request<void>(url, { method: 'DELETE' });
  }

  /**
   * Core request method with auth headers and 401 retry.
   */
  private async request<T>(
    url: string,
    init: RequestInit,
    isRetry = false
  ): Promise<T> {
    await this.throttle();

    const accessToken = await this.oauth.getValidAccessToken();

    const headers = new Headers(init.headers);
    headers.set('x-api-key', `${this.apiKey}:${this.sharedSecret}`);
    headers.set('Authorization', `Bearer ${accessToken}`);

    const response = await fetch(url, { ...init, headers });

    if (response.status === 401 && !isRetry) {
      // Token may have expired between getValidAccessToken and the request.
      // Force a refresh and retry once.
      const tokens = await this.oauth['tokenStorage'].getTokens();
      if (tokens) {
        await this.oauth.refreshAccessToken(tokens.refreshToken);
      }
      return this.request<T>(url, init, true);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new EtsyHttpError(response.status, response.statusText, body);
    }

    // DELETE responses may have no body
    if (
      response.status === 204 ||
      response.headers.get('content-length') === '0'
    ) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Simple throttle to stay under Etsy's 5 QPS rate limit.
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Build a full API URL from a path and optional query parameters.
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${ETSY_API_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  /**
   * Convert an object to URL-encoded form data.
   * Arrays are joined as comma-separated values.
   */
  private toFormData(body: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, String(value));
      }
    }
    return params.toString();
  }
}
