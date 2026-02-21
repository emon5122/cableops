# CableOps

**Network topology designer & cable management tool.**

Design, visualize, and document your physical network infrastructure with an interactive drag-and-drop canvas.

![CableOps](public/logo.svg)

## Features

- **Interactive Topology Canvas** — Drag-and-drop network device placement with real-time wire routing
- **18 Device Types** — Layer-1/2/3 and endpoint models including switch, router, firewall, AP, cloud, server, phone, smartphone, laptop, tablet, and more
- **Port Management** — Right-click ports to configure VLAN, link speed, aliases, and reservations
- **Interface-Centric Networking** — Per-interface IP, DHCP, NAT, gateway, SSID, and port role configuration
- **Static Routing** — Per-device route table entries with destination CIDR, next-hop, metric, and optional egress interface
- **Smart Wire Routing** — Bezier curve connections with gradient coloring that shows peer device colors
- **Clickable Wires** — Click any connection to select it, then delete with one click
- **Room & Barrier Annotations** — Right-click the canvas to draw rooms, walls, and labels for floor plan context
- **Color-Coded Devices** — Assign colors per device; ports display the connected peer's color for quick identification
- **Device Editing** — Rename devices (double-click), change colors, and modify port counts
- **Connection Table** — Tabular view of all connections with search and filtering
- **Segment & Reachability Analysis** — L2/L3 segment discovery, duplicate IP checks, subnet mismatch detection, gateway analysis, and forwarding diagnostics
- **Authentication** — Built-in user auth via better-auth with session management
- **Real-Time Persistence** — All changes saved instantly to PostgreSQL via tRPC

## Architecture Summary

CableOps is an **interface-first network validation engine** with visual topology modeling.

- **Interface-Centric**: networking behavior is modeled on `interfaces` per `(deviceId, portNumber)`
- **Workspace-Isolated**: all topology entities are scoped to `workspaceId`
- **Capability vs Config Split**: device capability is separate from runtime interface config
- **Routing-Aware**: static routes are stored separately in `routes`
- **Simulation-Oriented**: segmentation and reachability logic is deterministic and validation-focused

### Core Model

- `devices`: hardware/logical nodes and capabilities (`deviceType`, `ipForwarding`, `portCount`, position)
- `interfaces`: per-port config (`ipAddress`, `vlan`, `portMode`, `dhcpEnabled`, `natEnabled`, `gateway`, `ssid`)
- `connections`: physical/wifi links (`deviceAId:portA` ↔ `deviceBId:portB`)
- `routes`: static route entries per device (`destination`, `nextHop`, `interfacePort`, `metric`)
- `workspaces`: tenant boundary and cascade root
- `annotations`: canvas-only visual context

### Enforced Constraints

- Unique `(deviceId, portNumber)` in `interfaces`
- Workspace and endpoint validation in tRPC mutations
- Port existence checks against device `portCount`
- CIDR validation for route destinations and interface-aware DHCP range checks
- Indexed query paths for `workspaceId`, `deviceId`, `deviceAId`, and `deviceBId`

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

## Self-Hosting

The easiest way to run CableOps is with Docker. A pre-built image is published automatically via CI/CD.

### Quick Start (Docker Compose)

Create a `docker-compose.yml`:

```yaml
services:
  app:
    image: emon5122/cableops:latest
    container_name: cableops
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://cableops:changeme@db:5432/cableops
      BETTER_AUTH_URL: http://localhost:3000
      BETTER_AUTH_SECRET: <generate-a-random-secret>

  db:
    image: postgres:17-alpine
    container_name: cableops-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: cableops
      POSTGRES_USER: cableops
      POSTGRES_PASSWORD: changeme
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cableops -d cableops"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

Then run:

```bash
docker compose up -d
```

CableOps will be available at [http://localhost:3000](http://localhost:3000). Database migrations run automatically on startup.

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/dbname`) |
| `BETTER_AUTH_SECRET` | Yes | Random secret for session signing. Generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Yes | Public URL of your CableOps instance (e.g. `https://cableops.example.com`) |

### Running with an Existing PostgreSQL

If you already have a PostgreSQL server, run just the app container:

```bash
docker run -d \
  --name cableops \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@your-db-host:5432/cableops \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  -e BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  emon5122/cableops:latest
```

### Reverse Proxy

When running behind a reverse proxy (Nginx, Caddy, Traefik), set `BETTER_AUTH_URL` to your public URL:

```
BETTER_AUTH_URL=https://cableops.example.com
```

### Updating

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on container start — no manual steps needed.

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
| `pnpm check-types` | TypeScript type-check (`tsc --noEmit`) |
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
