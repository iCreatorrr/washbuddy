# Wash Buddy

## Overview

Wash Buddy is a multi-sided marketplace for commercial bus washing, connecting bus drivers/fleets (customers) with wash facilities (providers). It aims to streamline the bus washing process through a comprehensive booking platform that includes scheduling, availability management, and end-to-end wash lifecycle facilitation. The platform features robust role-based access control (RBAC) for customers, providers, and administrators. The business vision is to become the premier platform for commercial vehicle maintenance, starting with bus washing, by providing an efficient service that meets fleet operational needs and optimizes resource utilization for wash providers.

## User Preferences

I prefer clear and concise communication.
I appreciate detailed explanations when new features or complex logic are introduced.
I prefer an iterative development approach, with frequent check-ins and opportunities for feedback.
Please ask before making any major architectural changes or significant modifications to existing features.
I like to understand the "why" behind design decisions.

## System Architecture

The project is structured as a monorepo using `pnpm workspaces`. The backend is an `Express 5` API server with `TypeScript 5.9` on `Node.js 24`. `PostgreSQL` with `Prisma ORM 5.22` handles data persistence. Authentication is custom session-based, using `scrypt` for password hashing and `connect-pg-simple` for session storage. The frontend is a `React` application built with `Vite`, styled with `Tailwind CSS`, and uses `Wouter` for routing.

### UI/UX Decisions
- **Design System**: Custom UI components ensure consistency.
- **Animations**: `Framer Motion` for enhanced user experience.
- **Mapping**: `Leaflet` for interactive location and route planning.
- **Color Scheme**: Optimized for clarity and usability, with distinct status indicators.
- **Responsive Design**: Supports both desktop and mobile interfaces.

### Technical Implementations
- **Monorepo Structure**: Separates `api-server`, `db` (Prisma schema), and `washbuddy-web` (frontend).
- **API Design**: RESTful API covering authentication, providers, locations, services, vehicles, availability, bookings, reviews, and notifications.
- **Booking State Machine**: Manages the complex lifecycle of bookings through various statuses (e.g., REQUESTED, COMPLETED, SETTLED) and cancellation/dispute paths.
- **Role-Based Access Control**: Middleware (`requireAuth`, `requireRole`) enforces permissions for API endpoints and frontend routes based on user roles (e.g., DRIVER, FLEET_ADMIN, PROVIDER_ADMIN, PLATFORM_SUPER_ADMIN).
- **Data Handling**: Monetary values are stored as integer cents with ISO currency codes.
- **Build System**: `esbuild` for efficient ESM bundling.
- **Demo Data System**: A robust `DemoDataRegistry` generates deterministic and purgeable demo data across various seed modes, regions, personas, and scenarios, including a `Future Booking Seed Subsystem` for realistic booking generation.
- **Fleet Module**: Supports multi-phase development for enterprise fleet operations, including:
    - **Data & RBAC**: Introduces `FleetDepot`, `FleetVehicleGroup`, `WashRequest` (with its own state machine), `FleetRecurringProgram`, and various fleet-specific roles (FLEET_ADMIN, DISPATCHER, MAINTENANCE_MANAGER, READ_ONLY_ANALYST, DRIVER).
    - **UI & API**: Provides fleet workspace UI (Overview, Vehicles, Wash Requests, Recurring Programs, Settings) with corresponding API endpoints and RBAC enforcement.
    - **Driver Request Workflow**: Enables drivers to create, view, cancel, and message about wash requests, with idempotency and auto-approval policies.
    - **Approval Workflow**: Allows fleet admins/dispatchers to approve, modify, or decline driver wash requests, with a driver confirmation step for modifications.
    - **Recurring Automation**: Manages recurring wash programs, including creation, updates, activation/deactivation, and task generation based on cadences (e.g., WEEKLY, MONTHLY, EVERY_X_DAYS).
    - **Notifications & Reporting**: Implements fleet-specific notification triggers for workflow events and provides reporting APIs for wash compliance, request analytics, and program performance.
    - **Operator Booking & Approval UX**: Fleet operators (admins, dispatchers, maintenance managers) can directly book washes for vehicles (bypassing approval for themselves) and inline approve pending driver requests. Drivers retain the "Request a Wash" workflow.
    - **Driver/Customer Experience Split**: Fleet DRIVER-only users are routed to the customer experience (`/search` — map view, proximity search, route planner, bookings, vehicles) instead of the fleet operator dashboard. Operators (FLEET_ADMIN, DISPATCHER, MAINTENANCE_MANAGER, READ_ONLY_ANALYST) get the fleet dashboard. Drivers retain access to fleet wash requests via a "Wash Requests" nav link.
    - **E2E Testing & RBAC Hardening**: Comprehensive end-to-end tests validate all fleet features and enforce RBAC across all persona roles, with identified and fixed bugs related to access controls.

## External Dependencies

- **Database**: PostgreSQL
- **ORM**: Prisma
- **Session Store**: `connect-pg-simple`
- **Mapping Services**:
    - `Leaflet` (frontend map rendering)
    - `Nominatim` (live city search)
    - `OSRM API` (routing and ETA calculations)
- **Build Tool**: `esbuild`
- **Package Manager**: `pnpm`