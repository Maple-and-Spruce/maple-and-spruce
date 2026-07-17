import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

// Hoisted mocks for firebase-functions internals so we can intercept
// onRequest registration and exercise the wrapped handler synchronously.
const mocks = vi.hoisted(() => ({
  onRequest: vi.fn(),
  defineSecret: vi.fn(),
  defineString: vi.fn(),
  verifyIdToken: vi.fn(),
  hasAnyRole: vi.fn(),
  initializeApp: vi.fn(),
  apps: [] as unknown[],
}));

vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>(
    'firebase-functions/v2/https'
  );
  return {
    ...actual,
    onRequest: (options: unknown, handler: unknown) => {
      mocks.onRequest(options, handler);
      return handler;
    },
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => {
    mocks.defineSecret(name);
    return { name, value: () => `secret:${name}` };
  },
  defineString: (name: string) => {
    mocks.defineString(name);
    return {
      name,
      // ALLOWED_ORIGINS is read by the CORS middleware
      value: () => (name === 'ALLOWED_ORIGINS' ? 'https://example.test' : `string:${name}`),
    };
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock('firebase-admin', () => ({
  default: {
    apps: mocks.apps,
    initializeApp: mocks.initializeApp,
  },
}));

vi.mock('./auth.utility', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  hasAnyRole: mocks.hasAnyRole,
}));

import {
  assertValid,
  runChecks,
  Functions,
  createPublicFunction,
  createAuthenticatedFunction,
  createAdminFunction,
  createRoleFunction,
  isOriginAllowed,
} from './functions.utility';
import {
  throwNotFound,
  throwInvalidArgument,
  throwFailedPrecondition,
} from './errors.utility';
import { Role } from './auth.utility';

type MockResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  send: (body?: unknown) => void;
  setHeader: (key: string, value: string) => void;
};

function makeRes(): MockResponse {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  } as MockResponse;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
  };
  res.send = (body?: unknown) => {
    res.body = body;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers[key] = value;
  };
  return res;
}

function makeReq(overrides: Partial<{
  method: string;
  body: unknown;
  headers: Record<string, string>;
}> = {}) {
  return {
    method: overrides.method ?? 'POST',
    body: overrides.body ?? {},
    headers: { origin: 'https://example.test', ...(overrides.headers ?? {}) },
  };
}

async function invoke(
  endpoint: unknown,
  req: ReturnType<typeof makeReq>
): Promise<MockResponse> {
  const res = makeRes();
  // The endpoint returned by handle() is the raw async (req,res) handler
  // because our onRequest mock returns it directly. CORS middleware
  // fires next() without awaiting, so the outer await doesn't see the
  // inner async chain — drain microtasks until the response is set.
  const promise = (endpoint as (r: unknown, s: unknown) => Promise<void>)(req, res);
  promise.catch(() => { /* errors handled via res.status() */ });
  for (let i = 0; i < 100 && res.statusCode === 0; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return res;
}

function suite(
  isValid: boolean,
  errors: Record<string, string[]> = {}
): { isValid: () => boolean; getErrors: () => Record<string, string[]> } {
  return {
    isValid: () => isValid,
    getErrors: () => errors,
  };
}

describe('assertValid', () => {
  it('returns void when the result is valid', () => {
    expect(() => assertValid(suite(true))).not.toThrow();
  });

  it('throws an HttpsError(invalid-argument) when invalid', () => {
    let caught: unknown;
    try {
      assertValid(suite(false, { email: ['is required'] }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpsError);
    expect((caught as HttpsError).code).toBe('invalid-argument');
    expect((caught as HttpsError).message).toContain('email: is required');
  });
});

describe('error utilities', () => {
  it('throwNotFound throws HttpsError with not-found code', () => {
    expect(() => throwNotFound('Artist', 'abc')).toThrow(HttpsError);
    try {
      throwNotFound('Artist', 'abc');
    } catch (e) {
      expect((e as HttpsError).code).toBe('not-found');
      expect((e as HttpsError).message).toContain('Artist');
    }
  });

  it('throwInvalidArgument throws HttpsError with invalid-argument code', () => {
    expect(() => throwInvalidArgument('bad input')).toThrow(HttpsError);
    try {
      throwInvalidArgument('bad input');
    } catch (e) {
      expect((e as HttpsError).code).toBe('invalid-argument');
      expect((e as HttpsError).message).toBe('bad input');
    }
  });

  it('throwFailedPrecondition throws HttpsError with failed-precondition code', () => {
    expect(() => throwFailedPrecondition('cannot modify')).toThrow(HttpsError);
    try {
      throwFailedPrecondition('cannot modify');
    } catch (e) {
      expect((e as HttpsError).code).toBe('failed-precondition');
      expect((e as HttpsError).message).toBe('cannot modify');
    }
  });
});

describe('runChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when neither validator nor uniqueness checks are set', async () => {
    await expect(runChecks({ foo: 'bar' }, {})).resolves.toBeUndefined();
  });

  it('runs the validator and throws on invalid input', async () => {
    const validator = vi.fn(() => suite(false, { name: ['too short'] }));
    await expect(runChecks({ name: 'a' }, { validator })).rejects.toThrow(
      /name: too short/
    );
    expect(validator).toHaveBeenCalledWith({ name: 'a' });
  });

  it('runs the validator first, then uniqueness — uniqueness skipped when validation fails', async () => {
    const validator = vi.fn(() => suite(false, { email: ['invalid'] }));
    const exists = vi.fn().mockResolvedValue(true);
    await expect(
      runChecks(
        { email: 'x' },
        {
          validator,
          uniquenessChecks: [{ field: 'email', exists }],
        }
      )
    ).rejects.toThrow();
    expect(exists).not.toHaveBeenCalled();
  });

  it('throws already-exists when a uniqueness check fails', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    let caught: unknown;
    try {
      await runChecks(
        { email: 'taken@example.com' },
        {
          uniquenessChecks: [{ entity: 'Artist', field: 'email', exists }],
        }
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpsError);
    expect((caught as HttpsError).code).toBe('already-exists');
    expect((caught as HttpsError).message).toContain('taken@example.com');
    expect(exists).toHaveBeenCalledWith('taken@example.com');
  });

  it('passes when uniqueness check returns false', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    await expect(
      runChecks(
        { email: 'free@example.com' },
        { uniquenessChecks: [{ field: 'email', exists }] }
      )
    ).resolves.toBeUndefined();
  });

  it('skips uniqueness check when value is undefined', async () => {
    const exists = vi.fn();
    await expect(
      runChecks({}, { uniquenessChecks: [{ field: 'email', exists }] })
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('skips uniqueness check when value is null', async () => {
    const exists = vi.fn();
    await expect(
      runChecks(
        { email: null },
        { uniquenessChecks: [{ field: 'email', exists }] }
      )
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('skips uniqueness check when when() returns false', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    await expect(
      runChecks(
        { email: 'same@example.com', existingEmail: 'same@example.com' },
        {
          uniquenessChecks: [
            {
              field: 'email',
              exists,
              when: (data: { email?: string; existingEmail?: string }) =>
                data.email !== data.existingEmail,
            },
          ],
        }
      )
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('runs uniqueness check when when() returns true', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    await expect(
      runChecks(
        { email: 'new@example.com', existingEmail: 'old@example.com' },
        {
          uniquenessChecks: [
            {
              field: 'email',
              exists,
              when: (data: { email?: string; existingEmail?: string }) =>
                data.email !== data.existingEmail,
            },
          ],
        }
      )
    ).resolves.toBeUndefined();
    expect(exists).toHaveBeenCalledWith('new@example.com');
  });

  it('runs multiple uniqueness checks in order', async () => {
    const order: string[] = [];
    const existsEmail = vi.fn(async () => {
      order.push('email');
      return false;
    });
    const existsHandle = vi.fn(async () => {
      order.push('handle');
      return false;
    });
    await runChecks(
      { email: 'a@b.com', handle: 'a' },
      {
        uniquenessChecks: [
          { field: 'email', exists: existsEmail },
          { field: 'handle', exists: existsHandle },
        ],
      }
    );
    expect(order).toEqual(['email', 'handle']);
  });
});

describe('Functions.endpoint (chain + handle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockReset();
    mocks.hasAnyRole.mockReset();
    mocks.onRequest.mockClear();
    mocks.apps.length = 0;
  });

  it('public endpoint: invokes handler and 200s with { data }', async () => {
    const handler = vi.fn(async (data: { ping: string }) => ({
      pong: data.ping,
    }));
    const endpoint = Functions.endpoint.handle<
      { ping: string },
      { pong: string }
    >(handler);

    const res = await invoke(endpoint, makeReq({ body: { data: { ping: 'hi' } } }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data: { pong: 'hi' } });
    expect(handler).toHaveBeenCalledWith({ ping: 'hi' }, expect.any(Object), {}, {});
  });

  it('accepts request body without { data } envelope', async () => {
    const handler = vi.fn(async (data: { x: number }) => ({ doubled: data.x * 2 }));
    const endpoint = Functions.endpoint.handle<{ x: number }, { doubled: number }>(handler);

    const res = await invoke(endpoint, makeReq({ body: { x: 21 } }));

    expect(res.body).toEqual({ data: { doubled: 42 } });
  });

  it('CORS: preflight OPTIONS short-circuits with 204', async () => {
    const handler = vi.fn();
    const endpoint = Functions.endpoint.handle(handler);

    const res = await invoke(endpoint, makeReq({ method: 'OPTIONS' }));

    expect(res.statusCode).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it('CORS: rejects disallowed origin with 403', async () => {
    const handler = vi.fn();
    const endpoint = Functions.endpoint.handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://evil.test' } })
    );

    expect(res.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('requiringAuth: 401 when no Bearer token', async () => {
    const handler = vi.fn();
    const endpoint = Functions.endpoint.requiringAuth().handle(handler);

    const res = await invoke(endpoint, makeReq());

    expect(res.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('requiringAuth: passes when valid token verified', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'u1@test' });
    const handler = vi.fn(async () => ({ ok: true }));
    const endpoint = Functions.endpoint.requiringAuth().handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      {},
      { uid: 'u1', email: 'u1@test' },
      {},
      {}
    );
  });

  it('requiringRole(Admin): 403 when user lacks role', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1' });
    mocks.hasAnyRole.mockResolvedValue(false);
    const handler = vi.fn();
    const endpoint = Functions.endpoint.requiringRole(Role.Admin).handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('requiringRole(Admin): passes when user has role', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'admin-uid' });
    mocks.hasAnyRole.mockResolvedValue(true);
    const handler = vi.fn(async () => ({ ok: true }));
    const endpoint = Functions.endpoint.requiringRole(Role.Admin).handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.hasAnyRole).toHaveBeenCalledWith('admin-uid', [Role.Admin]);
  });

  it('requiringRole([Admin, MtTeacher]): passes the role set through (any-of)', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'stephanie-uid' });
    mocks.hasAnyRole.mockResolvedValue(true);
    const handler = vi.fn(async () => ({ ok: true }));
    const endpoint = Functions.endpoint
      .requiringRole([Role.Admin, Role.MtTeacher])
      .handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.hasAnyRole).toHaveBeenCalledWith('stephanie-uid', [
      Role.Admin,
      Role.MtTeacher,
    ]);
  });

  it('createRoleFunction: passes the role set to the any-of check', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'nathan-uid' });
    mocks.hasAnyRole.mockResolvedValue(true);
    const handler = vi.fn(async () => ({ ok: true }));
    const endpoint = createRoleFunction(handler, [Role.Admin, Role.Clerk]);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.hasAnyRole).toHaveBeenCalledWith('nathan-uid', [
      Role.Admin,
      Role.Clerk,
    ]);
  });

  it('requiringRole([...]): 403 names every accepted role', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1' });
    mocks.hasAnyRole.mockResolvedValue(false);
    const handler = vi.fn();
    const endpoint = Functions.endpoint
      .requiringRole([Role.Admin, Role.Clerk])
      .handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );

    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toContain('admin or clerk');
    expect(handler).not.toHaveBeenCalled();
  });

  it('validating: rejects invalid input before invoking handler', async () => {
    const handler = vi.fn();
    const validator = vi.fn(() => ({
      isValid: () => false,
      getErrors: () => ({ name: ['required'] }),
    }));
    const endpoint = Functions.endpoint.validating(validator).handle(handler);

    const res = await invoke(endpoint, makeReq({ body: { data: {} } }));

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: { message: expect.stringContaining('name: required') },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('validating: passes valid input through to handler', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const validator = vi.fn(() => ({
      isValid: () => true,
      getErrors: () => ({}),
    }));
    const endpoint = Functions.endpoint.validating(validator).handle(handler);

    const res = await invoke(endpoint, makeReq({ body: { data: { name: 'ok' } } }));

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('ensuringUnique: rejects on conflict before invoking handler', async () => {
    const handler = vi.fn();
    const exists = vi.fn().mockResolvedValue(true);
    const endpoint = Functions.endpoint
      .ensuringUnique<{ email: string }>({
        entity: 'Artist',
        field: 'email',
        exists,
      })
      .handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ body: { data: { email: 'taken@test' } } })
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: { message: expect.stringContaining('taken@test') },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler errors are caught and surfaced as 400', async () => {
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const endpoint = Functions.endpoint.handle(handler);

    const res = await invoke(endpoint, makeReq());

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'boom', status: 'INVALID_ARGUMENT' },
    });
  });

  it('usingSecrets / usingStrings: values forwarded to handler', async () => {
    const handler = vi.fn(async (_data, _ctx, secrets, strings) => ({
      secrets,
      strings,
    }));
    const endpoint = Functions.endpoint
      .usingSecrets('STRIPE_KEY')
      .usingStrings('FEATURE_FLAG')
      .handle(handler);

    const res = await invoke(endpoint, makeReq());

    expect(res.body).toEqual({
      data: {
        secrets: { STRIPE_KEY: 'secret:STRIPE_KEY' },
        strings: { FEATURE_FLAG: 'string:FEATURE_FLAG' },
      },
    });
  });

  it('withOptions: passes runtime options to onRequest', async () => {
    Functions.endpoint
      .withOptions({
        memory: '512MiB',
        concurrency: 10,
        minInstances: 1,
        timeoutSeconds: 120,
      })
      .handle(vi.fn());

    const [opts] = mocks.onRequest.mock.calls.at(-1) ?? [];
    expect(opts).toMatchObject({
      memory: '512MiB',
      concurrency: 10,
      minInstances: 1,
      timeoutSeconds: 120,
    });
  });

  describe('warmup sentinel', () => {
    it('short-circuits with 200 { warm: true } and skips the handler', async () => {
      const handler = vi.fn();
      const endpoint = Functions.endpoint.handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { data: { __warmup: true } } })
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: { warm: true } });
      expect(handler).not.toHaveBeenCalled();
    });

    it('accepts unwrapped { __warmup: true } body too', async () => {
      const handler = vi.fn();
      const endpoint = Functions.endpoint.handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { __warmup: true } })
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: { warm: true } });
      expect(handler).not.toHaveBeenCalled();
    });

    it('bypasses required auth — anonymous warmup is allowed', async () => {
      const handler = vi.fn();
      const endpoint = Functions.endpoint.requiringAuth().handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { data: { __warmup: true } } })
      );

      expect(res.statusCode).toBe(200);
      expect(mocks.verifyIdToken).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('bypasses required role check', async () => {
      const handler = vi.fn();
      const endpoint = Functions.endpoint
        .requiringRole(Role.Admin)
        .handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { data: { __warmup: true } } })
      );

      expect(res.statusCode).toBe(200);
      expect(mocks.hasAnyRole).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('bypasses validator — warmup body is not a real request', async () => {
      const handler = vi.fn();
      const validator = vi.fn(() => ({
        isValid: () => false,
        getErrors: () => ({ name: ['required'] }),
      }));
      const endpoint = Functions.endpoint.validating(validator).handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { data: { __warmup: true } } })
      );

      expect(res.statusCode).toBe(200);
      expect(validator).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('bypasses uniqueness checks', async () => {
      const handler = vi.fn();
      const exists = vi.fn().mockResolvedValue(true);
      const endpoint = Functions.endpoint
        .ensuringUnique<{ email: string }>({ field: 'email', exists })
        .handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({ body: { data: { __warmup: true } } })
      );

      expect(res.statusCode).toBe(200);
      expect(exists).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('still enforces CORS — warmup from a disallowed origin is rejected', async () => {
      const handler = vi.fn();
      const endpoint = Functions.endpoint.handle(handler);

      const res = await invoke(
        endpoint,
        makeReq({
          body: { data: { __warmup: true } },
          headers: { origin: 'https://evil.test' },
        })
      );

      expect(res.statusCode).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT short-circuit when __warmup is not strictly true', async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const endpoint = Functions.endpoint.handle(handler);

      const res = await invoke(
        endpoint,
        // truthy but not === true; treated as a real request payload
        makeReq({ body: { data: { __warmup: 'yes' } } })
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: { ok: true } });
      expect(handler).toHaveBeenCalled();
    });
  });

  it('chain composition: validating + ensuringUnique runs validator first', async () => {
    const handler = vi.fn();
    const validator = vi.fn(() => ({
      isValid: () => false,
      getErrors: () => ({ email: ['invalid'] }),
    }));
    const exists = vi.fn().mockResolvedValue(true);
    const endpoint = Functions.endpoint
      .validating(validator)
      .ensuringUnique<{ email: string }>({ field: 'email', exists })
      .handle(handler);

    const res = await invoke(
      endpoint,
      makeReq({ body: { data: { email: 'x' } } })
    );

    expect(res.statusCode).toBe(400);
    expect(validator).toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('legacy wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onRequest.mockClear();
  });

  it('createPublicFunction: no auth required', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const endpoint = createPublicFunction(handler);
    const res = await invoke(endpoint, makeReq());
    expect(res.statusCode).toBe(200);
  });

  it('createAuthenticatedFunction: requires auth', async () => {
    const handler = vi.fn();
    const endpoint = createAuthenticatedFunction(handler);
    const res = await invoke(endpoint, makeReq());
    expect(res.statusCode).toBe(401);
  });

  it('createAdminFunction: requires admin role', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1' });
    mocks.hasAnyRole.mockResolvedValue(false);
    const handler = vi.fn();
    const endpoint = createAdminFunction(handler);
    const res = await invoke(
      endpoint,
      makeReq({ headers: { origin: 'https://example.test', authorization: 'Bearer t' } })
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('isOriginAllowed', () => {
  const allow = ['http://localhost:3000', 'https://mapleandsprucefolkarts.com'];

  it('allows an origin on the configured allowlist (any environment)', () => {
    expect(isOriginAllowed('http://localhost:3000', allow, false)).toBe(true);
    expect(
      isOriginAllowed('https://mapleandsprucefolkarts.com', allow, false)
    ).toBe(true);
  });

  it('allows any localhost / 127.0.0.1 port in the emulator', () => {
    // Worktree offset ports (e.g. 3000+2610) aren't on the allowlist.
    expect(isOriginAllowed('http://localhost:5610', allow, true)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:8123', allow, true)).toBe(true);
  });

  it('rejects off-allowlist localhost ports outside the emulator', () => {
    expect(isOriginAllowed('http://localhost:5610', allow, false)).toBe(false);
  });

  it('rejects non-localhost origins even in the emulator', () => {
    expect(isOriginAllowed('https://evil.example.com', allow, true)).toBe(false);
    // Guard against a localhost-lookalike hostname.
    expect(
      isOriginAllowed('http://localhost.evil.com', allow, true)
    ).toBe(false);
  });
});
