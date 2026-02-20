# CableOps

**Network topology designer & cable management tool.**

Design, visualize, and document your physical network infrastructure with an interactive drag-and-drop canvas.

![CableOps](public/logo.svg)

## Features

- **Interactive Topology Canvas** — Drag-and-drop network device placement with real-time wire routing
- **9 Device Types** — Switch, Router, PC, Server, Phone, Camera, Firewall, Access Point, Cloud
- **Port Management** — Right-click ports to configure VLAN, link speed, aliases, and reservations
- **Smart Wire Routing** — Bezier curve connections with gradient coloring that shows peer device colors
- **Clickable Wires** — Click any connection to select it, then delete with one click
- **Room & Barrier Annotations** — Right-click the canvas to draw rooms, walls, and labels for floor plan context
- **Color-Coded Devices** — Assign colors per device; ports display the connected peer's color for quick identification
- **Device Editing** — Rename devices (double-click), change colors, and modify port counts
- **Connection Table** — Tabular view of all connections with search and filtering
- **Authentication** — Built-in user auth via better-auth with session management
- **Real-Time Persistence** — All changes saved instantly to PostgreSQL via tRPC

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TanStack Router/Start, Tailwind CSS v4 |
| **State & Data** | TanStack Query, tRPC v11 |
| **Backend** | Vite 7 SSR, Nitro |
| **Database** | PostgreSQL, Drizzle ORM |
| **Auth** | better-auth with Drizzle adapter |
| **UI** | Radix UI primitives, Lucide icons |
| **Tooling** | TypeScript (strict), Biome, Vitest |

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **PostgreSQL** ≥ 15 (or use the included Docker Compose)

### Setup

```bash
# Clone the repository
git clone https://github.com/emon5122/cableops.git
cd cableops

# Install dependencies
pnpm install

# Start PostgreSQL (if using Docker)
docker compose up -d

# Copy environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and BETTER_AUTH_SECRET

# Push the database schema
pnpm db:push

# Start the dev server
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret key for session signing |
| `BETTER_AUTH_URL` | Base URL for auth callbacks (e.g., `http://localhost:3000`) |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server on port 3000 |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Lint with Biome |
| `pnpm format` | Format with Biome |
| `pnpm check` | Lint + format check |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:push` | Push schema directly (dev) |
| `pnpm db:studio` | Open Drizzle Studio GUI |

## Project Structure

```
src/
├── components/
│   ├── topology/         # Canvas, device icons, port context menu
│   ├── workspace/        # Sidebar, connections table
│   ├── auth/             # Sign-in / sign-up forms
│   └── ui/               # Reusable UI primitives
├── db/
│   ├── schema.ts         # Drizzle schema (devices, connections, annotations, etc.)
│   └── index.ts          # Database client
├── integrations/
│   ├── trpc/             # tRPC router, client, React hooks
│   ├── better-auth/      # Auth configuration
│   └── tanstack-query/   # Query provider
├── lib/
│   ├── topology-types.ts # Type definitions, layout constants, geometry helpers
│   ├── auth.ts           # Server-side auth setup
│   ├── auth-client.ts    # Client-side auth hooks
│   └── utils.ts          # General utilities
├── routes/               # TanStack Router file-based routes
│   ├── __root.tsx
│   ├── index.tsx
│   ├── workspace.$workspaceId.tsx
│   └── auth/
└── styles.css            # Tailwind CSS entry point
```

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
