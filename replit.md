# PlantPouch - Equipment Manager

## Overview

PlantPouch is a full-stack web application for tracking, maintaining, and managing industrial testing equipment using QR and barcode scanning workflows. The system enables technicians to check out equipment by work order, track equipment status (available, checked out, broken), and maintain equipment history records. Equipment can be organized by system color groups for batch checkout operations. Includes admin barcode scanner for rapid equipment import.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state, Zustand for client-side state persistence
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom industrial dark theme
- **Animations**: Framer Motion for UI transitions

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API under `/api/*` routes
- **Build System**: Custom build script using esbuild for server, Vite for client

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**: 
  - `equipment` - Main equipment records with status, work order assignment, system color
  - `equipmentHistory` - Audit trail of equipment actions (check-in, check-out, broken reports)

### Key Design Patterns
- **Shared Types**: Schema and types defined in `shared/` directory, consumed by both client and server
- **Storage Abstraction**: `IStorage` interface in `server/storage.ts` enables swapping database implementations
- **API Client**: Centralized API functions in `client/src/lib/api.ts` with React Query hooks in `client/src/lib/hooks.ts`

### Development vs Production
- Development: Vite dev server with HMR, proxied through Express
- Production: Static files served from `dist/public`, server bundled to `dist/index.cjs`

## External Dependencies

### Database
- **PostgreSQL**: Required, configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and queries
- **Drizzle Kit**: Database migrations via `npm run db:push`

### Third-Party Libraries
- **Radix UI**: Headless component primitives for accessibility
- **TanStack React Query**: Server state management and caching
- **Zod**: Runtime schema validation (shared between client/server)
- **date-fns**: Date formatting utilities

### Deployment
- Docker support via included `docker-compose.deploy.yml`
- GitHub Container Registry integration via GitHub Actions
- Replit-specific plugins for development (cartographer, dev-banner)