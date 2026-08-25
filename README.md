# E-Commerce Backend RESTful API

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9_Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![AWS](https://img.shields.io/badge/AWS-EC2_&_S3-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

A modular monolith RESTful backend API for an electronics e-commerce store (computers, phones, accessories), covering authentication, catalog, inventory concurrency locking, shopping cart, coupons, checkout, VNPay Sandbox payments, and automated CI/CD on AWS.

## 🛠️ Tech Stack

- **Backend Core**: Node.js 22 LTS, TypeScript 5.9 (Strict), Express 5.x
- **Database & Cache**: PostgreSQL 17, Prisma ORM, Redis 7, BullMQ
- **Validation & Docs**: Zod, `@asteasolutions/zod-to-openapi`, Swagger UI (OpenAPI 3.0)
- **Security & Utilities**: JWT (Rotation & Reuse Detection), bcrypt, Helmet, CORS, Pino Logger
- **Testing**: Vitest, Supertest (Unit, Integration & Concurrency tests)
- **DevOps & Cloud**: Docker, Docker Compose, AWS EC2, AWS S3, Caddy (Auto HTTPS), GitHub Actions (CI/CD), GHCR

---

## 🌐 Live Deployment

- **Swagger API Documentation**: [https://vung-ecommerce.duckdns.org/docs](https://vung-ecommerce.duckdns.org/docs)
- **OpenAPI Schema (JSON)**: [https://vung-ecommerce.duckdns.org/docs.json](https://vung-ecommerce.duckdns.org/docs.json)
- **Readiness Healthcheck**: [https://vung-ecommerce.duckdns.org/health/ready](https://vung-ecommerce.duckdns.org/health/ready)

---

## 📁 Directory Structure

```text
ecommerce-backend/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # CI pipeline (lint, typecheck, prisma, tests, build)
│       └── cd.yml                 # CD pipeline (GHCR image build, SSH deploy to EC2)
├── prisma/
│   ├── migrations/                # Database migration history
│   ├── schema.prisma              # Database schema definition
│   └── seed.ts                    # Database seeding script (Admin & initial data)
├── src/
│   ├── config/                    # Environment variables validation (Zod) & Pino logger
│   ├── constants/                 # Shared system constants (Roles, Error codes, Permissions)
│   ├── database/                  # Prisma client & Redis client instances
│   ├── docs/                      # OpenAPI 3.0 registry and Swagger setup
│   ├── i18n/                      # Internationalization (English & Vietnamese error messages)
│   ├── middlewares/               # Express middlewares (auth, permission, validation, error)
│   ├── modules/                   # Modular Monolith domain modules
│   │   ├── admin/                 # Admin operations (staff management, permission assignment)
│   │   ├── auth/                  # Authentication (register, login, refresh token rotation, logout)
│   │   ├── users/                 # User profile & multi-address management
│   │   ├── catalog/               # Category tree, brands, products, variants, specifications
│   │   ├── inventory/             # Stock ledger (onHand, reserved), movements, concurrency locking
│   │   ├── carts/                 # Shopping cart management & live stock checks
│   │   ├── coupons/               # Discount coupons (percentage & fixed amount, quotas)
│   │   ├── orders/                # Order lifecycle state machine, atomic checkout
│   │   ├── payments/              # Payment gateways (COD & VNPay PAY 2.1.0 with IPN)
│   │   └── reviews/               # Product reviews & admin moderation
│   ├── routes/                    # Aggregate root API routes (/api/v1)
│   ├── utils/                     # Utility helpers (API response formatting, pagination)
│   ├── app.ts                     # Express application factory & middleware pipeline
│   └── server.ts                  # HTTP server bootstrap & graceful shutdown hooks
├── tests/                         # Unit, integration, concurrency & security test suite
├── Caddyfile                      # Caddy reverse proxy & auto HTTPS configuration
├── Dockerfile                     # Multi-stage production Docker build (runner, migrator)
├── compose.yaml                   # Local development Docker Compose stack
├── compose.prod.yaml              # Production Docker Compose stack
└── package.json                   # Dependencies, scripts, and package metadata
```

---

## 💻 Local Development Setup

### 1. Prerequisites
- **Node.js**: `v22.12.0` or higher
- **npm**: `v10.x` or higher
- **Docker Desktop** & **Docker Compose**

### 2. Clone & Install
```bash
git clone https://github.com/vung2k2/ecommerce-backend.git
cd ecommerce-backend
npm install
```

### 3. Environment Setup
```bash
cp .env.example .env
```

### 4. Start Database & Cache
```bash
docker compose up -d postgres
```

### 5. Run Migrations & Seed Data
```bash
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

### 6. Start Development Server
```bash
npm run dev
```

- **Local API Base**: `http://localhost:3000/api/v1`
- **Swagger Documentation**: `http://localhost:3000/docs`
- **Healthcheck**: `http://localhost:3000/health/ready`

### 7. Run Tests & Quality Checks
```bash
# Run test suite
npm run test:run

# Run typechecking
npm run typecheck

# Run linter
npm run lint
```

---

## 📄 License & Author

- **Author**: Nguyen Luong Vung ([@vung2k2](https://github.com/vung2k2))
- **Repository**: [https://github.com/vung2k2/ecommerce-backend](https://github.com/vung2k2/ecommerce-backend)
- **License**: Released under the [MIT License](LICENSE).
