READ_ORDER:
  - ./AI_SPEC.yaml
  - ./AGENTS.md
  - ./README.md
  - ./scripts/configure-openclaw-suite.mjs
  - ./scripts/ensure-native-capabilities.mjs
  - ./scripts/provision-feishu-bots.mjs
  - ./scripts/install-skills.sh

EXECUTION_MODE: DO_NOT_CHAT_DO_NOT_DESIGN_RUN_SPEC

PRIMARY_RULES:
  - treat AI_SPEC.yaml as source_of_truth
  - if prose conflicts_with_yaml use_yaml
  - do_not_rename_agents
  - do_not_create_duplicate_feishu_apps
  - do_not_skip_bootstrap_greetings
  - do_not_skip_skill_install
  - if ~/.openclaw/openclaw.json missing create_minimal_then_continue
  - if ./.state/feishu-accounts.json missing_or_incomplete run provision
  - if ./.state/feishu-accounts.json already_complete reuse_it_and_skip_provision
  - native OpenClaw capabilities are not duplicated; dedupe_then_enable_then_verify

SUCCESS_CONDITION:
  - four_agents_installed
  - shared_profile_installed
  - onboarding_skill_installed
  - bundled_repo_skills_installed
  - native_openclaw_capabilities_verified
  - extra_skills_installed_if_user_provided
  - first_dm_on_pending_profile_enters_interactive_onboarding
  - voice_input_and_feishu_voice_reply_available
  - doubao_free_image_generation_available

RUN:
  - npm install
  - if ./.state/feishu-accounts.json missing_or_incomplete: npm run provision:feishu
  - npm run configure:openclaw
  - npm run ensure:native-capabilities
  - bash scripts/install-skills.sh

OPTIONAL_FLAGS:
  profile_json: npm run configure:openclaw -- --profile-json /abs/path/to/profile.json
  extra_skills: npm run configure:openclaw -- --extra-skills /abs/path/to/skillA,/abs/path/to/skillB
  openviking_memory: npm run install:openviking-memory -- --yes

VERIFY:
  - inspect files listed in AI_SPEC.yaml.verify
  - inspect ~/.openclaw/openclaw.json mutations listed in AI_SPEC.yaml.openclaw_config_rules
  - inspect docs/native-capabilities.md and run `npm run ensure:native-capabilities`
  - if provision_executed_or_accounts_file_exists inspect ./.state/feishu-accounts.json for four accounts
  - inspect docs/feishu-voice.md and ensure related voice skills were installed
  - inspect docs/doubao-image.md and ensure `doubao-image-studio` and `peekaboo` support were configured
  - if user explicitly requested OpenViking memory, inspect docs/openviking-memory.md and run the wrapper script instead of reimplementing the plugin install
