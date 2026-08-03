import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  classifyInitializer,
  expandRouter,
  isRouterCall,
} from './check-callable-roles';

/**
 * Router awareness in the callable-roles analyzer (ADR-029, #731).
 *
 * This is security infrastructure, not a nicety. A domain router is ONE Cloud
 * Function whose routes each carry their own gate. If the analyzer classifies
 * the router as a single callable it reports "public" (the router chain has no
 * requiringRole), and the only way to silence that is to allowlist the router
 * — which would mark every admin route inside it as public and blind the check
 * to exactly the regression it exists to catch (ADR-028, #620).
 *
 * Every domain in #732–#744 lands more routes behind this, so these assertions
 * guard a growing surface.
 */

/** Parse a source snippet and hand back the initializer of `export const x = …`. */
function initializerOf(code: string): ts.Expression {
  const sf = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && !found) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error('no initializer found in snippet');
  return found;
}

describe('isRouterCall', () => {
  it('recognises Functions.router({...})', () => {
    expect(
      isRouterCall(initializerOf('const a = Functions.router({});')),
    ).toBeDefined();
  });

  it('recognises a bare createRouter({...})', () => {
    expect(
      isRouterCall(initializerOf('const a = createRouter({});')),
    ).toBeDefined();
  });

  it('does NOT treat an ordinary endpoint as a router', () => {
    expect(
      isRouterCall(initializerOf('const a = Functions.endpoint.handle(h);')),
    ).toBeUndefined();
  });

  it('does not confuse a same-named method on another object', () => {
    expect(
      isRouterCall(initializerOf('const a = express.router({});')),
    ).toBeUndefined();
  });
});

describe('expandRouter', () => {
  const expand = (code: string) => {
    const call = isRouterCall(initializerOf(code));
    if (!call) throw new Error('expected a router call');
    return expandRouter(call, 'demoApi', 'apps/functions/src/index.ts');
  };

  it('reports one entry per route, namespaced by the router', () => {
    const routes = expand(`const a = Functions.router({
      getThing: Functions.endpoint.requiringRole(Role.Admin).asRoute(h1),
      lookupThing: Functions.endpoint.asRoute(h2),
    });`);

    expect(routes.map((r) => r.name)).toEqual([
      'demoApi.getThing',
      'demoApi.lookupThing',
    ]);
  });

  // The whole point: a mixed-auth router must not collapse to one verdict.
  it('classifies each route independently, not by the router', () => {
    const routes = expand(`const a = Functions.router({
      adminThing: Functions.endpoint.requiringRole(Role.Admin).asRoute(h1),
      authThing: Functions.endpoint.requiringAuth().asRoute(h2),
      publicThing: Functions.endpoint.asRoute(h3),
    });`);

    expect(Object.fromEntries(routes.map((r) => [r.name, r.gate]))).toEqual({
      'demoApi.adminThing': 'role',
      'demoApi.authThing': 'auth',
      'demoApi.publicThing': 'public',
    });
  });

  it('keeps the role gate when other chain methods follow it', () => {
    const routes = expand(`const a = Functions.router({
      createThing: Functions.endpoint
        .requiringRole(Role.Admin)
        .validating(thingValidation)
        .ensuringUnique({ entity: 'Thing', field: 'code', exists: e })
        .asRoute(h),
    });`);

    expect(routes[0].gate).toBe('role');
  });

  // A hole in static analysis must fail loudly, never pass silently.
  it('reports unknown when the routes are not an object literal', () => {
    const routes = expand(
      'const a = Functions.router(buildRoutesDynamically());',
    );

    expect(routes).toHaveLength(1);
    expect(routes[0].gate).toBe('unknown');
    expect(routes[0].name).toContain('unreadable routes');
  });

  it('reports unknown for a spread route map rather than skipping it', () => {
    const routes = expand(`const a = Functions.router({
      ...sharedRoutes,
      publicThing: Functions.endpoint.asRoute(h),
    });`);

    expect(routes.some((r) => r.gate === 'unknown')).toBe(true);
  });
});

describe('classifyInitializer treats asRoute like handle', () => {
  it('an ungated asRoute is public', () => {
    expect(
      classifyInitializer(
        initializerOf('const a = Functions.endpoint.asRoute(h);'),
      ),
    ).toBe('public');
  });

  it('a role-gated asRoute is role', () => {
    expect(
      classifyInitializer(
        initializerOf(
          'const a = Functions.endpoint.requiringRole(Role.Admin).asRoute(h);',
        ),
      ),
    ).toBe('role');
  });
});
