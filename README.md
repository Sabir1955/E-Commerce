sabir ali khan .......
 Sacred Astrology Products E-Commerce Platform   
A production-grade, full-stack E-Commerce application crafted specifically for authentic astrology products, sacred yantras, energized gemstones, rudraksha malas, and pooja essentials. Built with high performance, enterprise security, and a culturally authentic Vedic aesthetic.

---

1232123## 🌟 Key Features

### 🛍️ Customer Storefront (Angular 22.2 SSR)
- **Vedic Cultural Aesthetic**: Harmonious 8-color sacred palette featuring Warm Cream (`#D8B88E`), Deep Maroon (`#8F1830`), Brick Red (`#A63A42`), Dark Navy (`#20233B`), and Muted Gold (`#B99A45`) with devanagari Sanskrit subtitles and sacred iconography.
- **Dynamic Celestial Orbit & Mandala**: Smooth CSS animations and visual trust pillars (100% Vedic Sanctified, Astrologer Certified, Sacred Packaging, Worldwide Delivery).
- **Product Catalog & Multi-Criteria Discovery**: Real-time keyword search, category filtering, price sliders, stock availability filters, and sorting by sales popularity, customer rating, or newest arrivals.
- **Devotee Reviews & Star Ratings**: 1–5 star interactive reviews with verified buyer badges and automated score recalculation.
- **Sacred Cart & Wishlist**: Real-time inventory boundary validation, seamless wishlist-to-cart transfer, and persistent local caching.
- **5-Step Order Tracking Timeline**: Visual milestone tracker (`Order Placed` $\to$ `Processing` $\to$ `Shipped` $\to$ `Out for Delivery` $\to$ `Delivered`) with parcel metadata and shipment timeline.
- **7-Day Return & Replacement Workflow**: Seamless return requests with eligibility checks, reason selection, and refund method preferences (`original_payment`, `wallet`, `bank_transfer`).
- **100% Local Self-Contained Assets**: Zero external placeholder dependencies (no Unsplash or external CDNs); all assets and placeholders are bundled locally as lightweight SVGs.

### 🛡️ Backend API & Architecture (Node.js & Express)
- **Modular Domain Architecture**: 12 decoupled domain modules (`auth`, `users`, `products`, `categories`, `cart`, `addresses`, `orders`, `payments`, `inventory`, `customers`, `admin`, `notifications`).
- **Enterprise Security Hardening**:
  - NoSQL Injection stripping (purges `$`, `$where`, `$gt`, and dot notation).
  - XSS Protection (removes dangerous tags, inline event handlers, and `javascript:` protocols).
  - HTTP Parameter Pollution (HPP) defense with array whitelist preservation.
  - Tiered In-Memory Rate Limiting (`apiLimiter`, `authLimiter`, `paymentLimiter`, `otpLimiter`) with standard `RateLimit-*` and `Retry-After` headers.
  - Deep recursive credential masking in security audit logs (`password`, `token`, `otp`, `authorization`, `cvv`).
  - Helmet security headers and disabled `X-Powered-By`.
- **Performance & Caching Engine**:
  - In-memory bounded TTL cache with FIFO eviction and hit/miss metrics tracking.
  - HTTP weak ETag generation (`W/"..."`) with instant HTTP 304 Not Modified responses.
  - Native Node.js Gzip compression achieving 93% payload reduction.
  - Microsecond-level high-resolution performance profiler injecting `X-Response-Time` headers and monitoring slow requests (>500ms).
  - Production-tuned MongoDB Atlas connection pooling (min 10, max 50 sockets, 45s socket timeout, IPv4 preference).
- **Payment & Courier Integrations**:
  - Dual online payment gateway integration (Razorpay & Easebuzz with order creation, signature verification, and automated callback handling).
  - Shiprocket automated courier booking, pickup scheduling, and AWB tracking.
  - Multi-channel notification dispatchers (SMTP Email, Twilio SMS, WhatsApp).

---

## 🏛️ System Architecture

```text
E-Commerce Workspace Root
├── Backend/                       # Node.js & Express Modular API Server
│   ├── src/
│   │   ├── config/                # Environment, Database Pooling & Storage
│   │   ├── middleware/            # Security, Cache, RateLimiter, Profiler, Validation
│   │   ├── models/                # Mongoose Models with Compound Indexes
│   │   ├── modules/               # 12 Decoupled Business Domain Modules
│   │   ├── routes/                # Master & Auxiliary Express Routers
│   │   ├── services/              # Cache, Audit, Inventory, Notifications
│   │   └── scripts/               # Test Suites (Phases 1-19) & Master Runner
│   ├── uploads/                   # Local Static Assets & Placeholder SVGs
│   └── package.json
│
├── Frontend/                      # Angular 22.2 SSR Standalone Application
│   ├── src/
│   │   ├── app/                   # Components, Layouts, Guards, Services
│   │   ├── public/                # Public SVG assets, Favicon, Brand Placeholders
│   │   ├── index.html             # SEO Meta, Font Preconnection
│   │   └── styles.css             # Sacred Vedic Design System Tokens
│   └── angular.json
│
├── DEPLOYMENT.md                  # Comprehensive Production Deployment Guide
└── README.md                      # Master Platform Documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.0.0 or newer (v20+ recommended)
- **MongoDB**: MongoDB Atlas cluster or local MongoDB instance (v5.0+)
- **Git**

---

### 1. Backend Setup & Launch

```powershell
# Navigate to backend directory
cd Backend

# Install dependencies
npm install

# Configure environment variables
copy .env.example .env
# Edit .env and supply your MONGODB_URI, JWT_SECRET, etc.

# Create administrator account
npm run create-admin

# Seed initial Vedic product catalog & categories
npm run seed

# Start development server
npm run dev
```

The API server will listen on `http://localhost:5000`.
- **Health Check & Telemetry**: `http://localhost:5000/api/health`
- **Interactive Swagger Docs**: `http://localhost:5000/api-docs`

---

### 2. Frontend Setup & Launch

```powershell
# Navigate to frontend directory
cd ../Frontend

# Install dependencies
npm install

# Start local SSR development server
npm start
# OR standard dev server
npm run watch
```

The customer storefront will open at `http://localhost:4200`.

---

### 3. Running Production Verification Test Suite

The platform includes an automated master test runner that validates all architecture, security, performance, and business logic layers:

```powershell
cd Backend
node src/scripts/runMasterTestSuite.js
```

This executes test suites across all phases with 96+ automated assertions verifying 100% pass rates in under 15 seconds.

---

## 🎨 Sacred Brand Palette & Design System

The application strictly adheres to the curated 8-color Vedic brand palette:

| Token Name | Hex Code | Purpose / Usage |
| :--- | :--- | :--- |
| **Warm Cream** | `#D8B88E` | Primary accent, hero banners, badges, highlights |
| **Deep Maroon** | `#8F1830` | Sacred primary actions, header branding, buy-now buttons |
| **Brick Red** | `#A63A42` | Secondary buttons, trust badges, discount ribbons |
| **Dark Navy** | `#20233B` | Base background, deep cosmic canvas, dark mode foundation |
| **Muted Gold** | `#B99A45` | Sacred borders, star ratings, yantra accents, shloka cards |
| **Dusty Purple** | `#5B4167` | Auxiliary cards, celestial gradients, tag backgrounds |
| **Off White** | `#F0E7D5` | Primary typographic content, high-contrast headings |
| **Dark Brown** | `#30272A` | Card backgrounds, elevated surfaces, modal backdrops |

---

## 📜 API Documentation

Interactive OpenAPI / Swagger documentation is baked into the backend and accessible in any browser:
- **Swagger UI**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- **OpenAPI JSON**: [http://localhost:5000/api-docs.json](http://localhost:5000/api-docs.json)

For detailed deployment procedures, environment variable reference, and production maintenance runbooks, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 📄 License
Proprietary & Confidential. All rights reserved.
