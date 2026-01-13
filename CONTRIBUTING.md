# Contributing to Janusz

Thanks for your interest in contributing to Janusz! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/janusz-app.git
cd janusz-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env  # Edit with your values

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

## Git Workflow

### Pre-commit Hooks

This project uses [Husky](https://typicode.github.io/husky/) to run automated checks before each commit. These hooks ensure code quality and prevent broken code from entering the repository.

**What runs automatically:**

1. **ESLint** - Lints and auto-fixes JavaScript/TypeScript/Vue files
2. **TypeScript** - Type checks all TypeScript files
3. **Tests** - Runs the full test suite (100 tests, ~3 seconds)

**Example:**
```bash
git commit -m "feat: add new feature"
✔ Preparing lint-staged...
✔ Running tasks for staged files...
  ✔ *.{js,ts,vue} — 5 files
    ✔ eslint --fix
  ✔ *.{ts,vue} — 5 files
    ✔ npm run typecheck
  ✔ * — 5 files
    ✔ npm test
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
[feat/new-feature abc123] feat: add new feature
```

### Bypassing Hooks (Not Recommended)

If you absolutely need to skip pre-commit hooks (e.g., WIP commit):

```bash
git commit --no-verify -m "wip: work in progress"
```

**⚠️ Warning:** Use this sparingly. CI will still run these checks, and your PR will fail if there are issues.

### Hook Failures

If pre-commit hooks fail:

1. **ESLint errors:**
   ```bash
   npm run lint:fix  # Auto-fix what's possible
   npm run lint      # Check remaining issues
   ```

2. **TypeScript errors:**
   ```bash
   npm run typecheck  # See all type errors
   ```

3. **Test failures:**
   ```bash
   npm test           # Run all tests
   npm run test:coverage  # See coverage report
   ```

Fix the issues and try committing again.

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- rateLimiter.test.ts
```

### Writing Tests

- Place tests in `test/unit/` or `test/integration/`
- Use descriptive test names: `it('should reject duplicate webhook deliveries')`
- Mock external dependencies (GitHub API, Redis, Database)
- Aim for high coverage on critical paths

**Example:**
```typescript
import { describe, expect, it, vi } from 'vitest'

describe('myFunction', () => {
  it('should handle errors gracefully', () => {
    const result = myFunction(invalidInput)
    expect(result).toEqual({ error: 'Invalid input' })
  })
})
```

## Code Style

This project uses ESLint with [@antfu/eslint-config](https://github.com/antfu/eslint-config).

**Key conventions:**
- 2-space indentation
- Single quotes for strings
- No semicolons
- TypeScript strict mode
- Self-documenting code over comments

**Auto-formatting:**
```bash
npm run lint:fix
```

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes**
   - Write tests for new functionality
   - Update documentation if needed
   - Keep commits atomic and well-described

3. **Commit message format:**
   ```
   <type>(<scope>): <subject>

   <body>

   <footer>
   ```

   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

   Example:
   ```
   fix(webhook): prevent duplicate delivery processing

   Add Redis-based deduplication using delivery ID as nonce.
   Fixes race condition where concurrent webhooks could process
   the same PR multiple times.

   Closes #123
   ```

4. **Push and create PR:**
   ```bash
   git push -u origin feat/your-feature-name
   ```

   Then create a PR on GitHub with:
   - Clear description of changes
   - Link to related issues
   - Screenshots/videos if UI changes
   - Test plan / how to verify

5. **Code review:**
   - Address review comments
   - Keep PR scope focused (split large changes)
   - Maintain passing CI checks

6. **Merge:**
   - Squash commits if needed
   - Delete branch after merge

## Troubleshooting

### Husky hooks not running

```bash
# Reinstall husky hooks
npm run prepare

# Check if hooks are executable
ls -la .husky/
chmod +x .husky/pre-commit  # If needed
```

### Tests fail locally but not in CI

- Ensure you're on the correct Node.js version: `node -v`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for uncommitted changes that affect tests

### Type errors in node_modules

```bash
# Regenerate Nuxt types
npm run postinstall
```

## Architecture

For architectural overview, development patterns, and deployment docs, see:
- `docs/ARCHITECTURE.md` (TBD)
- `TODO.md` - Current roadmap and known issues

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/your-org/janusz-app/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/janusz-app/discussions)

## License

By contributing, you agree that your contributions will be licensed under the project's license.
