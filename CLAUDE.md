# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server (includes worker process)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test                # Run all tests
npm run test:coverage       # Run tests with coverage

# Database migrations
npm run db:generate         # Generate migration from schema changes
npm run db:migrate          # Apply pending migrations
npm run db:push             # Push schema directly (dev only)
npm run db:studio           # Open Drizzle Studio

# Tree-sitter grammars
npm run build:grammars      # Build custom tree-sitter grammars

# Git hooks
npm run prepare             # Setup husky git hooks

# Build
npm run build               # Production build
```

## Architecture Overview

Janusz is a **GitHub App** that provides autonomous AI-powered PR reviews. The system consists of:

1. **GitHub Webhook Handler** (`server/api/webhook.post.ts`) - Receives PR events and queues jobs
2. **Background Worker** (`server/plugins/worker.ts`) - Processes jobs from Redis queue using BullMQ
3. **AI Review Engine** - Analyzes code changes and generates comments
4. **Web Dashboard** - Nuxt 4 UI for monitoring and configuration

### Core Flow

```
GitHub Webhook → webhook.post.ts → BullMQ Queue → Worker → AI Analysis → GitHub Check Run/Comments
```

## Key Components

### Job Processing System

The worker processes two job types (`shared/types/JobType.ts`):
- **REVIEW** - Full PR analysis (triggered on PR open/sync)
- **REPLY** - Response to comment replies (triggered on new comment)

Job flow:
1. `webhook.post.ts` validates GitHub webhook signature and creates job in DB
2. Job is added to BullMQ queue (`processJob.ts` routes to appropriate handler)
3. `reviewService.ts` handles reviews, `replyService.ts` handles replies
4. Job status and execution history are tracked in `jobs` table via `jobService.ts`
5. `jobExecutionCollector.ts` captures detailed execution metrics (timing, model usage, token counts)

### AI Integration

**AI Service** (`server/utils/aiService.ts`):
- Primary: Google Gemini (gemini-3-flash-preview, gemini-2.5-flash)
- Fallback: OpenRouter free tier models
- Automatic retry with fallback across providers
- Uses Zod schemas for structured output (`januszPrompts.ts`)

**Context Enhancement** (`server/utils/repoService.ts`):
- Clones repository temporarily
- Uses tree-sitter to index code symbols
- AI selects relevant files for context ("Maciej" - context selector)
- Enriches diff analysis with surrounding code

**Multi-Agent Review** (`server/utils/multiAgentReview.ts`):
- Parallel or sequential execution modes (configured per repository)
- Multiple AI agents analyze different aspects of the PR
- Results are aggregated and deduplicated

### GitHub Integration

**GitHub Client** (`server/utils/createGitHubClient.ts`):
- App-based authentication (installation tokens)
- Methods: `getPrDiff()`, `createCheckRun()`, `postReview()`, `getExistingReviewComments()`

**Review Comments**:
- Deduplicated by signature (file + line + content hash)
- Only new comments are posted to avoid spam
- Supports 4 severity levels: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

**Severity System**:
- AI returns raw severity values: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- Values are preserved throughout the system (no mapping)

### Repository-Specific Settings

**Per-repository configuration** (`server/utils/repositorySettingsService.ts`):
- Enable/disable reviews
- Severity threshold filtering
- File exclusion patterns (glob via minimatch)
- Custom prompts (review, reply, description, context selection)
- Agent execution mode: `sequential` or `parallel` (default: sequential)
- Preferred AI model (future implementation)

Settings are applied in `reviewService.ts` before AI analysis.

### Database

**Drizzle ORM** with PostgreSQL (`server/database/schema.ts`):
- `jobs` - Job tracking with status, attempts, execution history, timestamps
- `logs` - Structured logging by service type
- `repository_settings` - Per-repository configuration

**Service Types** (`shared/types/ServiceType.ts`):
- `worker`, `webhook`, `context-selector`, `repo-indexer`, `redis`, `api`

Each service uses `useLogger()` with consistent emoji prefixes (🚀, ⏭️, ℹ️, etc.)

### Authentication & Authorization

**GitHub OAuth** (`nuxt-auth-utils`):
- User session stored securely with GitHub token
- `getUserInstallationIds()` caches user's accessible installations
- API endpoints verify access via installation ID matching

**Admin Access** (`app/composables/useAdminAccess.ts`):
- Checks `BULL_BOARD_ADMINS` environment variable (comma-separated GitHub usernames)
- Required for Bull Board dashboard at `/admin/queue`

## File Structure Patterns

```
server/
├── api/                    # H3/Nitro API endpoints
│   ├── webhook.post.ts    # GitHub webhook handler
│   ├── repositories/      # Repository settings CRUD
│   └── jobs/              # Job management (retry, list, stream)
├── database/
│   └── schema.ts          # Drizzle schema definitions
├── utils/
│   ├── reviewService.ts   # Main PR review logic
│   ├── analyzePr.ts       # AI analysis orchestration
│   ├── aiService.ts       # Multi-provider AI client
│   ├── repoService.ts     # Repository cloning & context
│   ├── repositorySettingsService.ts  # Per-repo config
│   ├── jobExecutionCollector.ts      # Job execution metrics collection
│   ├── multiAgentReview.ts # Multi-agent review orchestration
│   └── januszPrompts.ts   # AI system prompts & schemas
└── plugins/
    └── worker.ts          # BullMQ worker initialization

app/
├── pages/
│   ├── index.vue          # Dashboard stats
│   ├── jobs.vue           # Job monitoring
│   ├── logs.vue           # Log viewer
│   └── repositories/      # Repository management UI
└── composables/
    └── useAdminAccess.ts  # Admin authorization

shared/
└── types/                 # Shared TypeScript types
    ├── JobDto.ts          # Job data transfer objects
    ├── JobExecutionHistory.ts  # Execution metrics schema
    └── ...
```

## Important Implementation Details

### Severity Threshold Filtering

When filtering comments by severity threshold:
- Count severity BEFORE filtering (for accurate stats)
- Apply `meetsSeverityThreshold()` from `repositorySettingsService.ts`
- Severity values: `CRITICAL=4`, `HIGH=3`, `MEDIUM=2`, `LOW=1`
- Threshold options: `low=1`, `medium=2`, `high=3`, `critical=4`

### Database Query Patterns

Always use `and()` for multi-condition WHERE clauses:
```typescript
.where(
  and(
    eq(table.installationId, installationId),
    eq(table.repositoryFullName, repositoryFullName),
  ),
)
```

### Error Handling

- Worker jobs: Update DB status, fallback comments on final failure
- API endpoints: Return appropriate HTTP status codes (401, 403, 404, 500)
- Use `useLogger()` instead of `console.error`

### Repository Cloning

- Temporary clones in `/tmp` with automatic cleanup
- Security checks for path traversal attempts
- File size limits (500KB max via `Limits.MAX_FILE_SIZE_BYTES`)

## Environment Variables Required

See `.env.example` for complete list. Critical:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis for BullMQ
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` - GitHub App auth
- `WEBHOOK_SECRET` - Webhook signature verification
- `GEMINI_API_KEY` or `OPENROUTER_API_KEY` - At least one AI provider

## Common Patterns

### Adding New Repository Settings

1. Update `server/database/schema.ts` → `repositorySettings` JSONB schema
2. Run `pnpm db:generate && pnpm db:migrate`
3. Update `repositorySettingsService.ts` → `DEFAULT_SETTINGS`
4. Update settings UI in `app/pages/repositories/[owner]/[repo]/settings.vue`
5. Apply settings in `reviewService.ts` or `analyzePr.ts`

### Adding New AI Providers

1. Implement provider function in `aiService.ts` (see `askOpenRouter`, `askGemini`)
2. Add model to fallback chain in `askAI()`
3. Add API key to `nuxt.config.ts` → `runtimeConfig`
4. Document in `.env.example`
