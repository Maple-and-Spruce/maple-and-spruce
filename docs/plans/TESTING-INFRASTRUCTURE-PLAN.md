# Testing Infrastructure Implementation Plan

> **Issue**: #24 - Add testing infrastructure
> **Status**: Implemented
> **Date**: 2026-01-19

---

## Executive Summary

This plan establishes unit testing for Maple & Spruce using:
- **Vitest** for unit tests (already installed)
- **CI/CD integration** via GitHub Actions

### Scope

| In Scope | Out of Scope (Deferred) |
|----------|------------------------|
| Vitest unit tests for validation suites | E2E tests (Playwright) |
| Vitest unit tests for domain helpers | Repository integration tests |
| CI job to run tests on PRs | Firebase emulator tests |
| 80% coverage requirement | Square service tests |

### Testing Strategy

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit tests | Vitest | Validation suites, domain logic, utilities |
| Component tests | Storybook + Chromatic | UI components in isolation (already complete) |
| E2E tests | Playwright | Full user flows (deferred) |

---

## Current State

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| Vitest | Installed | `package.json` (v4.0.17) |
| Storybook | Complete | All 15 components have stories |
| Chromatic | Configured | Visual regression in CI |

### What's Missing

- No Vitest workspace configuration
- No unit tests for validation suites
- No unit tests for domain logic
- No test job in CI workflow

---

## Implementation Plan

### Phase 1: Vitest Configuration

**Goal**: Set up Vitest workspace and library configs.

#### 1.1 Workspace Configuration

Create workspace-level Vitest config:

```
/vitest.workspace.ts          # Workspace config (points to lib configs)
```

#### 1.2 Library Test Configurations

Add Vitest config and test target to each library:

| Library | Config File |
|---------|-------------|
| `libs/ts/validation/` | `vitest.config.ts` |
| `libs/ts/domain/` | `vitest.config.ts` |

---

### Phase 2: Validation Suite Tests

**Goal**: 80%+ coverage on all validation suites (pure functions, no mocking needed).

#### Files to Create

```
libs/ts/validation/src/lib/
├── artist.validation.spec.ts          # NEW
├── product.validation.spec.ts         # NEW
├── category.validation.spec.ts        # NEW
├── sale.validation.spec.ts            # NEW
├── payout.validation.spec.ts          # NEW
├── inventory-movement.validation.spec.ts  # NEW
└── sync-conflict.validation.spec.ts   # NEW
```

#### Test Cases Per Suite

Each validation suite should test:

1. **Happy path** - Valid data passes validation
2. **Required fields** - Missing required fields fail
3. **Format validation** - Invalid formats fail (email, phone, etc.)
4. **Boundary conditions** - Min/max values, edge cases
5. **Single-field mode** - The `field` parameter for on-blur validation

#### Example: Artist Validation Tests

```typescript
describe('artistValidation', () => {
  describe('valid data', () => {
    it('passes with all required fields', () => { ... });
  });

  describe('name field', () => {
    it('fails when name is missing', () => { ... });
    it('fails when name is too short', () => { ... });
  });

  describe('email field', () => {
    it('fails when email is missing', () => { ... });
    it('fails when email format is invalid', () => { ... });
  });

  describe('phone field', () => {
    it('passes when phone is empty (optional)', () => { ... });
    it('fails when phone format is invalid', () => { ... });
  });

  describe('defaultCommissionRate field', () => {
    it('fails when commission rate is missing', () => { ... });
    it('fails when commission rate is negative', () => { ... });
    it('fails when commission rate exceeds 1', () => { ... });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => { ... });
  });
});
```

---

### Phase 3: Domain Helper Tests

**Goal**: Test any utility functions in domain types.

#### Files to Create

```
libs/ts/domain/src/lib/
├── product.spec.ts                    # NEW (test generateSku)
```

#### Known Functions to Test

| Function | Location | Test Cases |
|----------|----------|------------|
| `generateSku()` | `product.ts` | Returns valid format, uniqueness |

---

### Phase 4: CI Integration

**Goal**: Run unit tests automatically on every PR, require 80% coverage.

#### 4.1 Add Test Job to build-check.yml

```yaml
unit-tests:
  name: Unit Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm install --frozen-lockfile
    - name: Run unit tests with coverage
      run: npx nx run-many --target=test --all --coverage
```

#### 4.2 Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "nx run-many --target=test --all",
    "test:coverage": "nx run-many --target=test --all --coverage"
  }
}
```

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `vitest.workspace.ts` | Workspace Vitest configuration |
| `libs/ts/validation/vitest.config.ts` | Validation lib test config |
| `libs/ts/validation/src/lib/*.spec.ts` | Validation suite tests (7 files) |
| `libs/ts/domain/vitest.config.ts` | Domain lib test config |
| `libs/ts/domain/src/lib/product.spec.ts` | Domain helper tests |

### Modified Files

| File | Change |
|------|--------|
| `.github/workflows/build-check.yml` | Add unit-tests job |
| `package.json` | Add test scripts |
| `libs/ts/validation/project.json` | Add test target |
| `libs/ts/domain/project.json` | Add test target |

---

## Success Criteria

- [ ] `npx nx run-many --target=test --all` passes
- [ ] All 7 validation suites have tests
- [ ] `generateSku()` has tests
- [ ] 80%+ coverage on tested libraries
- [ ] CI runs unit tests on every PR

---

## Deferred Items

These items are explicitly out of scope for this implementation:

| Item | Reason | Future Consideration |
|------|--------|---------------------|
| E2E tests (Playwright) | Features still evolving, Storybook covers components | Add when preparing for production launch |
| Repository tests | Requires Firebase mocking complexity | Add when repository logic becomes more complex |
| Square service tests | Working code, mocking Square SDK is complex | Add if bugs emerge |
| Firebase emulator tests | Setup complexity | Consider for integration testing phase |

---

## References

- [GitHub Issue #24](https://github.com/david-shortman/maple-and-spruce/issues/24)
- [Vitest Documentation](https://vitest.dev/)
- [Nx + Vitest Guide](https://nx.dev/recipes/testing/vitest)
- [Vest Validation](https://vestjs.dev/)

---

## Approval

- [ ] Plan reviewed
- [ ] Ready to implement

---

*Created: 2026-01-19*
