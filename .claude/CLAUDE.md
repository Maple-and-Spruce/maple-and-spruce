# Claude Code Instructions for Maple & Spruce

> Quick reference for Claude when working on this codebase

## Project Overview

Maple & Spruce is a folk arts collective platform - retail store + creative space offering handmade goods, workshops, and music lessons. Currently **Etsy-only** (no physical store yet).

**Current Phase**: Phase 1 - Etsy integration & artist payout tracking

## Key Documentation

- [AGENTS.md](./AGENTS.md) - Detailed rules for Claude behavior
- [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md) - Business requirements & features
- [docs/PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md) - Code patterns & architecture
- [docs/DECISIONS.md](../docs/DECISIONS.md) - Architecture Decision Records
- [docs/BACKLOG.md](../docs/BACKLOG.md) - Ideas & future features

## Quick Reference

### Tech Stack
- **Frontend**: Next.js 15 + React 19
- **UI**: MUI (Material Design) with brand colors
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Backend**: Firebase Cloud Functions
- **Payments**: Stripe (future)

### Brand Colors
| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings, text |
| Sage Green | `#6B7B5E` | Buttons, accents |
| Warm Gray | `#7A7A6E` | Body text |

### Git Workflow
1. Always create feature branches from `main`
2. Branch naming: `feature/issue-number-short-description`
3. Commit frequently with clear messages
4. Create PRs for review before merging

### Code Patterns
- Use Repository Pattern for all Firestore access
- Use discriminated unions for state (not boolean flags)
- Follow existing folder structure in `docs/PATTERNS-AND-PRACTICES.md`

## Before Starting Work

1. Check GitHub issues for current priorities
2. Create a feature branch
3. Reference the relevant documentation
4. Follow the patterns established in this codebase
