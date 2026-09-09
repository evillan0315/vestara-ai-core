# Git Commit & Push Skill

This skill covers the workflow for creating commits, pushing to GitHub, and managing PRs in the Vestara Admin Dashboard repository.

## Prerequisites

- Repository has a GitHub remote named `origin` (already configured)
- Using conventional commit format
- pnpm as package manager (per `packageManager` in root package.json)

---

## Core Commands

### 1. Check Status & Diff

```bash
# Show staged/unstaged changes
git status -s

# Show full diff of working tree
git diff

# Show diff of staged changes
git diff --cached

# Show recent commits
git log --oneline -10
```

### 2. Stage Files

```bash
# Stage specific files (preferred - never use -A or .)
git add <file1> <file2>

# Stage all changes in a directory
git add path/to/dir/
```

### 3. Create Conventional Commit

**Format:** `<type>: <description>`

**Types:**

| Type       | Use For                                    |
| ---------- | ------------------------------------------ |
| `feat`     | New features                               |
| `fix`      | Bug fixes                                  |
| `refactor` | Code restructuring without behavior change |
| `chore`    | Maintenance, deps, config, tooling         |
| `docs`     | Documentation only                         |
| `ci`       | CI/CD pipeline changes                     |
| `test`     | Test additions/changes                     |
| `perf`     | Performance improvements                   |

**Examples:**

```bash
git commit -m "feat: add user authentication API endpoints"
git commit -m "fix: resolve token refresh race condition"
git commit -m "refactor: extract shared validation utilities"
git commit -m "chore: update dependencies and fix linting"
git commit -m "docs: add API documentation for auth routes"
```

**Rules:**

- Use imperative mood ("add" not "added")
- Keep first line under 72 chars
- Add body for context if needed (blank line after subject)

### 4. Push to GitHub

```bash
# Push current branch to origin
git push origin <branch-name>

# Push with upstream tracking (first push)
git push -u origin <branch-name>
```

### 5. Create Pull Request (via GitHub CLI)

```bash
# Create PR against develop branch (default)
gh pr create --base develop --title "feat: add user auth" --body "..."

# Create draft PR
gh pr create --draft --base develop --title "..."

# List PRs
gh pr list
```

---

## Branch Strategy

| Branch      | Purpose                             |
| ----------- | ----------------------------------- |
| `main`      | Production-ready, protected         |
| `develop`   | Integration branch for next release |
| `feature/*` | Feature branches (from develop)     |
| `fix/*`     | Bug fix branches (from develop)     |
| `release/*` | Release preparation                 |
| `hotfix/*`  | Emergency fixes (from main)         |

**Naming convention:**

```bash
feature/auth-login-page
fix/token-refresh-bug
chore/update-dependencies
```

---

## Typical Workflow

```bash
# 1. Start from develop
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes, stage, commit
git add apps/api/src/routes/auth.ts
git commit -m "feat: add login endpoint with JWT"

# 4. Push and create PR
git push -u origin feature/your-feature-name
gh pr create --base develop --title "feat: add login endpoint" --body "Description of changes"

# 5. After review & merge, clean up
git checkout develop
git pull origin develop
git branch -d feature/your-feature-name
```

---

## Quality Gates (Run Before Commit)

```bash
# Lint + format (Biome)
pnpm lint

# Build all packages
bash build-order.sh

# Run tests
pnpm test
```

**Shortcuts per package:**

```bash
pnpm --filter @vestara/api lint
pnpm --filter @vestara/types test
```

---

## Common Issues & Fixes

| Issue                                  | Fix                                              |
| -------------------------------------- | ------------------------------------------------ |
| `git push` rejected (non-fast-forward) | `git pull --rebase origin <branch>` then push    |
| Forgot to add file to last commit      | `git add <file> && git commit --amend --no-edit` |
| Wrong commit message                   | `git commit --amend` (before push)               |
| Need to split commits                  | `git rebase -i HEAD~n`                           |

---

## GitHub CLI Setup

Ensure `gh` is authenticated:

```bash
gh auth status
gh auth login  # if not authenticated
```

---

## Related Files

- Root `package.json` - scripts, package manager
- `turbo.json` - build pipeline
- `.github/` - workflows, PR templates
- `AGENTS.md` - project instructions
- `ROADMAP.md` - development phases
