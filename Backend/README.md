# Astrology E-Commerce Backend API

A high-performance, modular RESTful API built on **Node.js**, **Express**, **MongoDB Atlas**, and **Mongoose**, architected with enterprise security hardening, in-memory caching, microsecond latency profiling, and resilient connection pooling.

---

## 🏛️ Modular Domain Architecture

The backend codebase is organized into **12 decoupled domain modules** located in `src/modules/`:

| Module | Core Responsibilities |
| :--- | :--- |
| **`auth`** | Customer & Admin authentication, JWT token lifecycle, password resets via 6-digit OTP, profile preferences. |
| **`users`** | User management, profile updates, notification consent booleans, customer directory. |
| **`products`** | Product catalog CRUD, multi-criteria search, category filters, slug generation, compound indexing. |
| **`categories`** | Category hierarchy, automatic slugification, active/inactive archiving. |
| **`cart`** | User shopping cart, stock limits validation, subtotal computation, direct add-from-wishlist. |
| **`addresses`** | Saved delivery addresses, Indian mobile (`+91`) format validation, default address assignment. |
| **`orders`** | Order placement, stock reservation lifecycle (30-min window), invoice generation, status transitions. |
| **`payments`** | Razorpay payment integration, online initiation, signature verification, COD workflow, raw webhooks. |
| **`inventory`** | Real-time stock tracking, administrative inventory adjustments, low-stock alerts, reservation cleanup. |
| **`customers`** | Administrative customer management, purchase history, order volume metrics, account status toggling. |
| **`admin`** | Executive administrative dashboard APIs, sales metrics, order fulfillment overviews. |
| **`notifications`** | Multi-channel dispatchers (SMTP email, Twilio SMS, WhatsApp) and administrative notification logs. |

---

## 🛡️ Enterprise Security Hardening

The backend incorporates multi-layered defense-in-depth security:
- **NoSQL Operator Injection Stripping**: Automatically purges MongoDB operator keys (`$gt`, `$where`, `$ne`, `$regex`, and nested dot notation) across request body, query, and params.
- **Cross-Site Scripting (XSS) Sanitization**: Strips dangerous `<script>`, `<iframe>`, inline event handlers (`onload`, `onerror`), and `javascript:` pseudo-protocols.
- **HTTP Parameter Pollution (HPP) Defense**: Collapses polluted scalar query parameters to single values while preserving whitelisted arrays (`category`, `tags`).
- **Tiered In-Memory Rate Limiting**:
  - `apiLimiter`: 300 req / 15 min per IP on general `/api` endpoints.
  - `authLimiter`: 30 req / 15 min per IP on `/auth/login` and `/auth/register`.
  - `paymentLimiter`: 25 req / 15 min per IP on `/payments` endpoints.
  - `otpLimiter`: 10 req / 10 min per IP on password reset requests.
  - Emits standard `RateLimit-*` and `Retry-After` headers with HTTP 429 throttling.
- **Deep Sensitive Data Masking**: Security audit logs automatically redact sensitive fields (`password`, `token`, `otp`, `authorization`, `cvv`, `cardNumber`).
- **HTTP Header Hardening**: Helmet security middleware active and `X-Powered-By` header explicitly disabled.

---

## ⚡ Performance & Caching Engine

- **In-Memory TTL Caching**: High-speed bounded cache with FIFO eviction, prefix-based invalidation upon write mutations, and live hit/miss tracking.
- **HTTP Weak ETags & 304 Not Modified**: Instant conditional response revalidation using SHA-1 weak ETags (`W/"..."`).
- **Native Node.js Gzip Compression**: Automatic response compression yielding ~93% payload size reduction.
- **High-Resolution Request Profiler**: Measures request duration via `process.hrtime.bigint()`, injects `X-Response-Time: <duration>ms` headers before socket flush, and records slow requests (>500ms).
- **MongoDB Connection Pooling**: Configured with `maxPoolSize: 50`, `minPoolSize: 10`, 45s socket timeouts, and IPv4 DNS optimization (`family: 4`).
- **Compound Database Indexes**:
  - `Product`: `{ active: 1, popularity: -1 }`, `{ active: 1, rating: -1 }`, `{ active: 1, createdAt: -1 }`, text index on `{ name, description, category }`.
  - `Order`: `{ user: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`.
  - `User`: `{ role: 1, active: 1 }`, unique index on `email` and `mobile`.

---

## 🚀 Setup & Execution

### 1. Environment Configuration
Copy `.env.example` to `.env` and configure mandatory parameters:
```powershell
copy .env.example .env
```
Mandatory variables:
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for signing JSON Web Tokens

### 2. Administrator Account Initialization
Bootstrap the initial administrative user:
```powershell
npm run create-admin
```

### 3. Database Seeding
Populate the database with authentic Vedic products and categories:
```powershell
npm run seed
```

### 4. Running the Server
```powershell
# Development mode with hot-reloading
npm run dev

# Production mode
npm start
```
Default URL: `http://localhost:5000`

---

## 📡 Key Endpoints

| Endpoint | Method | Access | Description |
| :--- | :---: | :---: | :--- |
| `/api/health` | `GET` | Public | Live telemetry (status, uptime, memory, DB, cache stats, latency) |
| `/api-docs` | `GET` | Public | Interactive Swagger / OpenAPI documentation UI |
| `/api-docs.json` | `GET` | Public | OpenAPI 3.0 specification JSON |
| `/api/auth/register` | `POST` | Rate-Limited | Customer registration with password & mobile validation |
| `/api/auth/login` | `POST` | Rate-Limited | Authentication via email or mobile; returns JWT |
| `/api/products` | `GET` | Cached | Filtered catalog listing with pagination, search, and sorting |
| `/api/products/:id` | `GET` | Cached | Product details by MongoDB ObjectId or SEO slug |
| `/api/cart` | `GET`/`POST`/`PATCH`/`DELETE` | Authenticated | Cart management with real-time stock limits check |
| `/api/orders` | `POST` | Authenticated | Checkout, stock reservation, and order creation |
| `/api/orders/:id/tracking` | `GET` | Authenticated | 5-step milestone progress tracker and parcel meta |
| `/api/payments/:orderId/initiate` | `POST` | Rate-Limited | Razorpay order initiation |
| `/api/returns` | `POST` | Authenticated | 7-day return request with refund preference |
| `/api/admin/dashboard` | `GET` | Admin | Comprehensive analytics, revenue, orders, and stock overview |

---

## 🧪 Automated Testing & Verification

Execute the unified test runner across all system phases:
```powershell
# Run the Master Test Suite (Phases 11-19)
node src/scripts/runMasterTestSuite.js

# Verify 100% syntax validity across all JavaScript files
node src/scripts/verifySyntax.js
```
