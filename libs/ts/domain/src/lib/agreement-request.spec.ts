import { describe, it, expect } from 'vitest';
import {
  instructorAgreementState,
  type AgreementRequest,
} from './agreement-request';

const NOW = new Date('2026-10-17T12:00:00Z');

function request(
  id: string,
  createdAt: string,
  overrides: Partial<AgreementRequest> = {}
): AgreementRequest {
  return {
    id,
    templateId: 'tpl-1',
    templateVersion: 1,
    signerEmail: 'robin@example.com',
    signerName: 'Robin Ashfield',
    deliveryMethod: 'email',
    instructorId: 'inst-1',
    signingToken: `tok-${id}`,
    expiresAt: new Date('2026-11-01T00:00:00Z'),
    status: 'pending',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    ...overrides,
  };
}

describe('instructorAgreementState', () => {
  it('is not sent when there are no requests', () => {
    expect(instructorAgreementState([], NOW)).toEqual({ kind: 'not-sent' });
  });

  it('is not sent when every request was cancelled', () => {
    expect(
      instructorAgreementState(
        [request('r1', '2026-10-01', { status: 'cancelled' })],
        NOW
      )
    ).toEqual({ kind: 'not-sent' });
  });

  it('is pending while the newest request can still be signed', () => {
    const r = request('r1', '2026-10-10');
    expect(instructorAgreementState([r], NOW)).toEqual({
      kind: 'pending',
      request: r,
    });
  });

  it('is expired once the link has run out, even before the nightly job marks it', () => {
    const r = request('r1', '2026-09-01', {
      expiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    expect(instructorAgreementState([r], NOW)).toEqual({
      kind: 'expired',
      request: r,
    });
  });

  it('is expired when the job has marked it', () => {
    const r = request('r1', '2026-09-01', { status: 'expired' });
    expect(instructorAgreementState([r], NOW).kind).toBe('expired');
  });

  it('follows the newest request, whatever order they arrive in', () => {
    const old = request('r1', '2026-09-01', { status: 'expired' });
    const resent = request('r2', '2026-10-10');
    expect(instructorAgreementState([old, resent], NOW)).toEqual({
      kind: 'pending',
      request: resent,
    });
    expect(instructorAgreementState([resent, old], NOW).kind).toBe('pending');
  });

  it('stays signed when a later request is sent', () => {
    const signed = request('r1', '2026-09-01', {
      status: 'signed',
      signedAgreementId: 'sa-1',
    });
    const later = request('r2', '2026-10-10');
    expect(instructorAgreementState([later, signed], NOW)).toEqual({
      kind: 'signed',
      request: signed,
    });
  });

  it('accepts dates that crossed the wire as strings', () => {
    const r = {
      ...request('r1', '2026-10-10'),
      createdAt: '2026-10-10T00:00:00Z',
      expiresAt: '2026-11-01T00:00:00Z',
    } as unknown as AgreementRequest;
    expect(instructorAgreementState([r], NOW).kind).toBe('pending');
  });
});
