# Contributing to ReviewAI

Thanks for your interest in contributing! Here's how to get set up and what we're looking for.

---

## Development setup

```bash
git clone https://github.com/yourusername/reviewai.git
cd reviewai

# Start infrastructure
docker-compose up postgres redis -d

# Install all workspace dependencies
npm install

# Configure environment
cp github-app/.env.example github-app/.env
# Fill in ANTHROPIC_API_KEY and GitHub App credentials

# Start development servers
npm run dev
```

The dashboard runs at `http://localhost:3000` with mock data immediately.
The backend API runs at `http://localhost:3001`.

For live GitHub webhook testing, use smee.io:
```bash
npx smee-client --url https://smee.io/YOUR_CHANNEL \
  --target http://localhost:3001/api/webhook
```

---

## Running tests

```bash
# All tests
cd github-app && npm test

# Unit tests only (fast, no infra needed)
npm run test:unit

# Integration tests (requires Postgres + Redis running)
npm run test:integration

# Watch mode during development
npm run test:watch
```

---

## Project structure

```
github-app/src/
├── vcs/           ← VCS provider abstraction (add new providers here)
│   ├── provider.js   Interface definition
│   ├── github.js     GitHub implementation
│   ├── gitlab.js     GitLab implementation
│   └── factory.js    Provider resolution
├── review/        ← Core AI review logic
│   ├── engine.js     Orchestration (fetch → prompt → call → post → persist)
│   ├── prompt.js     Prompt builder
│   ├── parser.js     Response validation (Zod)
│   ├── template.js   PR template enforcement
│   └── router.js     Dashboard metrics API
├── webhooks/      ← VCS event listeners
├── notifications/ ← Slack alerts
└── middleware/    ← Security, rate limiting, auth
```

---

## Adding a new VCS provider

1. Create `github-app/src/vcs/yourprovider.js` implementing all methods from `VCSProvider`
2. Register it in `github-app/src/vcs/factory.js`
3. Create `github-app/src/webhooks/yourprovider.js` to handle webhook events
4. Mount the webhook router in `github-app/src/index.js`
5. Add tests in `github-app/tests/unit/vcs-factory.test.js`
6. Add setup instructions to README.md

See `gitlab.js` as a reference implementation.

---

## Coding standards

- **Node.js 20+ ESM** — use `import/export`, not `require()`
- **Zod for all external data** — never trust unvalidated input from GitHub, GitLab, or the AI
- **Async/await throughout** — no callback-style code
- **Tests for new features** — unit tests required; integration tests for anything touching the DB
- **No secrets in code** — all credentials via environment variables

---

## What we're looking for

Great contributions:
- New VCS provider integrations (Bitbucket, Azure DevOps, Gitea)
- Improvements to the review prompt (better context injection, language-specific rules)
- Dashboard features (per-author metrics, team comparison, PR size analysis)
- Fine-tuning pipeline improvements (better quality filtering, more data sources)
- Performance improvements (caching, batching, smarter diff truncation)

---

## Submitting a PR

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes with tests
3. Run `npm test` — all tests must pass
4. Open a PR with a description that fills in all three template sections (What / Why / Testing) — ReviewAI will review it automatically 🙂
