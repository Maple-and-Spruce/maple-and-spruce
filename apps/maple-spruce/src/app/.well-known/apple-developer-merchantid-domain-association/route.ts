import { APPLE_PAY_DOMAIN_ASSOCIATION } from './domain-association';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(APPLE_PAY_DOMAIN_ASSOCIATION, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
