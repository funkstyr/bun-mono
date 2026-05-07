# bun-mono

This file provides context about the project for AI assistants.

## Project Overview

- **Ecosystem**: Typescript

## Tech Stack

- **Runtime**: bun
- **Package Manager**: bun

### Frontend

- Framework: tanstack-start
- CSS: tailwind
- UI Library: shadcn-ui
- State: tanstack-store

### Backend

- Framework: hono
- API: orpc
- Validation: arktype

### Database

- Database: sqlite
- ORM: drizzle

### Authentication

- Provider: better-auth

### Additional Features

- Testing: vitest-playwright
- Email: react-email
- Realtime: partykit
- Logging: pino
- Observability: opentelemetry

## Project Structure

```
bun-mono/
├── apps/
│   ├── web/         # Frontend application
│   └── server/      # Backend API
├── packages/
│   ├── api/         # API layer
│   ├── auth/        # Authentication
│   └── db/          # Database schema
```

## Common Commands

- `bun install` - Install dependencies
- `bun dev` - Start development server
- `bun build` - Build for production
- `bun test` - Run tests
- `bun db:push` - Push database schema
- `bun db:studio` - Open database UI

## Maintenance

Keep CLAUDE.md updated when:

- Adding/removing dependencies
- Changing project structure
- Adding new features or services
- Modifying build/dev workflows

AI assistants should suggest updates to this file when they notice relevant changes.
