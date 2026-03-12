# Project Rules

## Goal

This repo provisions a four-agent OpenClaw executive assistant suite for Feishu:

- `strategist`
- `chief-of-staff`
- `life-concierge`
- `second-brain`

## Preferred Flow

1. Update templates under `templates/` and shared markdown under `shared-profile/`.
2. Keep markdown generation logic in `lib/profile-renderer.mjs`.
3. If `.state/feishu-accounts.json` is missing or incomplete, use `npm run provision:feishu` to create or reconcile Feishu apps.
4. Use `npm run configure:openclaw` to install the suite into `~/.openclaw`.
5. Use `npm run ensure:native-capabilities` to dedupe, enable, and verify OpenClaw native tools/plugins before treating them as missing.
6. Use `bash scripts/install-skills.sh` when bundled repo skills must also be installed.
7. If the user explicitly asks for OpenViking memory, use `npm run install:openviking-memory` instead of hand-rolling plugin setup.

## Editing Notes

- Treat `.state/` as local runtime state. Do not commit secrets or generated bot credentials.
- If you change questionnaire fields, also update:
  - `lib/profile-schema.mjs`
  - `lib/profile-renderer.mjs`
  - `apps/questionnaire/app.js`
  - `templates/skills/executive-profile-onboarding/`
- Do not point installed agents back to repo files. The installer must copy templates into `~/.openclaw/executive-feishu-suite`.

## Validation

- `npm run render:profile -- --demo`
- `npm run configure:openclaw -- --dry-run`
- `npm run ensure:native-capabilities -- --dry-run`
- `npm run validate:skill`
