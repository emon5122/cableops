# Contributing to CableOps

Thank you for your interest in contributing to CableOps! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for everyone.

## Getting Started

1. **Fork** the repository and clone your fork
2. **Install dependencies**: `pnpm install`
3. **Set up the database**: See the [README](README.md) for PostgreSQL setup
4. **Create a branch**: `git checkout -b feature/your-feature-name`
5. **Make your changes** and test them
6. **Submit a pull request**

## Development Workflow

### Running Locally

```bash
pnpm dev          # Start dev server
pnpm test         # Run tests
pnpm check        # Lint + format check
```

### Code Style

- We use **Biome** for linting and formatting — run `pnpm check` before committing
- **TypeScript strict mode** is enforced — no `any` types allowed
- Use the `@/*` import alias for all `src/` imports
- Follow existing patterns in the codebase

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add firewall device type with SVG icon
fix: correct wire gradient direction for color exchange
docs: update README with annotation feature description
```

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Ensure `pnpm build` passes with zero errors
- Add tests for new functionality when applicable
- Update documentation if your change affects the user-facing API or UI

## Project Architecture

| Directory | Purpose |
|-----------|---------|
| `src/components/topology/` | Canvas rendering, device icons, port menus |
| `src/components/workspace/` | Sidebar, connections table |
| `src/db/` | Drizzle ORM schema and client |
| `src/integrations/trpc/` | tRPC router definitions and React bindings |
| `src/lib/` | Shared types, constants, geometry helpers |
| `src/routes/` | TanStack Router file-based routes |

### Key Design Decisions

- **SVG for wires, HTML for devices**: Wires are rendered in an SVG overlay; device nodes are HTML divs for richer interactivity
- **Port color exchange**: Connected ports display the *peer* device's color, not their own
- **Bezier wire routing**: Smart cubic bezier curves with spread factor to prevent wire overlap
- **Annotation system**: Canvas annotations (rooms, walls, labels) stored in the database for persistence

## Reporting Issues

When reporting bugs, please include:

- Steps to reproduce the issue
- Expected vs. actual behavior
- Browser and OS information
- Screenshots if applicable

## Questions?

Open a [GitHub Discussion](../../discussions) for general questions or ideas.
