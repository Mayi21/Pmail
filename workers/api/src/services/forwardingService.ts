import type { Env } from '../index';

export interface CFDestinationAddress {
  tag: string;
  email: string;
  verified: string | null;
  created: string;
  modified: string;
}

export interface CFError {
  code: number;
  message: string;
}

interface CFResponse<T> {
  success: boolean;
  errors: CFError[];
  messages: unknown[];
  result: T;
  result_info?: { count: number; total_count: number };
}

export class ForwardingService {
  private readonly token: string;
  private readonly accountId: string;

  constructor(env: Env) {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('Cloudflare API not configured');
    }
    this.token = env.CLOUDFLARE_API_TOKEN;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
  }

  private get baseUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/routing/addresses`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<CFResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const body = await res.json() as CFResponse<T>;
    if (!res.ok || !body.success) {
      const err = body.errors?.[0];
      throw Object.assign(
        new Error(`Cloudflare API error ${err?.code ?? res.status}: ${err?.message ?? res.statusText}`),
        { cfCode: err?.code, status: res.status },
      );
    }
    return body;
  }

  async createDestinationAddress(email: string): Promise<CFDestinationAddress> {
    try {
      const body = await this.request<CFDestinationAddress>('', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return body.result;
    } catch (err: any) {
      // 10006 = destination already exists; fall back to listing
      if (err?.cfCode === 10006) {
        const existing = await this.findByEmail(email);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async getDestinationAddress(tag: string): Promise<CFDestinationAddress> {
    const body = await this.request<CFDestinationAddress>(`/${tag}`, { method: 'GET' });
    return body.result;
  }

  async deleteDestinationAddress(tag: string): Promise<void> {
    await this.request<unknown>(`/${tag}`, { method: 'DELETE' });
  }

  private async findByEmail(email: string): Promise<CFDestinationAddress | null> {
    const qs = `?email=${encodeURIComponent(email)}&per_page=50`;
    const body = await this.request<CFDestinationAddress[]>(qs, { method: 'GET' });
    return body.result.find(a => a.email.toLowerCase() === email.toLowerCase()) ?? null;
  }
}
