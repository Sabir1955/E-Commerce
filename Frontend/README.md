# Astrology E-Commerce Frontend (Storefront & Dashboard)

A modern, high-performance web storefront and administrative dashboard built with **Angular 22.2** (`@angular/ssr`), standalone components, and a rich, culturally authentic **Vedic design system**.

---

## 🎨 Sacred Brand Palette & Design Tokens

The frontend styling strictly uses Vanilla CSS custom properties (`var(--...)`) conforming to the 8 curated brand colors:

| Color Token | Value | Applied Elements |
| :--- | :--- | :--- |
| `--color-warm-cream` | `#D8B88E` | Primary accent, hero banners, badges, highlights |
| `--color-deep-maroon` | `#8F1830` | Sacred primary actions, header branding, buy-now buttons |
| `--color-brick-red` | `#A63A42` | Secondary CTA buttons, trust badges, discount ribbons |
| `--color-dark-navy` | `#20233B` | Cosmic dark background canvas, deep surface layers |
| `--color-muted-gold` | `#B99A45` | Sacred borders, star ratings, yantra accents, shloka cards |
| `--color-dusty-purple` | `#5B4167` | Auxiliary cards, celestial gradients, category pill badges |
| `--color-off-white` | `#F0E7D5` | Primary typographic text, high-contrast headings |
| `--color-dark-brown` | `#30272A` | Elevated surface layers, card backgrounds, modal dialogs |

---

## 🛍️ Customer Experience Features

- **Mandala & Celestial Orbit Animation**: CSS-driven orbital animations depicting planetary alignment, sacred geometry, and cultural trust pillars.
- **Dynamic Catalog Discovery**: Multi-criteria search (name, category, description, tags), price sliders, attribute filters, and sorting by sales popularity, customer rating, or newest arrivals.
- **Devotee Reviews & Ratings**: 1–5 star interactive reviews with verified devotee purchase badges and recalculation.
- **Interactive Cart & Wishlist**: Real-time inventory limits validation, stock depletion warnings, and seamless wishlist-to-cart migration.
- **5-Step Milestone Tracking**: Visual progress timeline (`Order Placed` $\to$ `Processing` $\to$ `Shipped` $\to$ `Out for Delivery` $\to$ `Delivered`) with parcel metadata and courier deep-links.
- **7-Day Return & Replacement**: Transparent return eligibility checks based on order delivery timestamp, with customer refund method preferences.
- **Self-Contained Local Assets**: 100% free of external CDN/Unsplash dependencies; all assets are served from `/uploads/placeholders/` and `/images/navgraha-yantra.svg`.

---

## 🏛️ Project Structure

```text
Frontend/
├── src/
│   ├── app/
│   │   ├── core/                  # Services (Cart, Catalog, Auth, Storage, HTTP)
│   │   ├── features/              # Storefront & Admin Component Modules
│   │   │   ├── catalog/           # Product listing, filters, search, sorting
│   │   │   ├── product-details/   # Detail view, reviews, star ratings, Add to Cart
│   │   │   ├── cart/              # Cart table, quantity adjustments, stock guard
│   │   │   ├── checkout/          # Delivery address, payment options (COD / Online)
│   │   │   ├── tracking/          # 5-step milestone timeline & shipment status
│   │   │   ├── returns/           # Return request submission and tracking
│   │   │   ├── wishlist/          # Saved sacred products & cart transfer
│   │   │   └── admin/             # Executive dashboard, product & order management
│   │   ├── shared/                # Vedic UI components (badges, shloka cards)
│   │   ├── app.routes.ts          # Angular Router route declarations
│   │   ├── app.config.ts          # Client application provider configuration
│   │   ├── app.config.server.ts   # Server-side rendering (SSR) providers
│   │   ├── main.ts                # Client bootstrap entrypoint
│   │   └── main.server.ts         # Server SSR bootstrap entrypoint
│   ├── public/                    # Static public assets (SVGs, favicon)
│   ├── index.html                 # Font preconnections & SEO metadata
│   ├── styles.css                 # Sacred Vedic Design System CSS Tokens
│   └── server.ts                  # Express SSR Node server
├── angular.json                   # Angular workspace configuration with budgets
└── package.json
```

---

## 🚀 Development & Production Build

### Running Locally
```powershell
# Development server with live reload
npm start

# Watch mode
npm run watch
```
Storefront opens at `http://localhost:4200`.

### Production SSR Build
```powershell
npm run build
```
- **Prerendering**: Automatically prerenders all 16 static routes.
- **Bundle Optimization**: Initial transfer size optimized to ~129 kB with output hashing.
- **Budget Compliance**: Stays well within the 750 kB warning and 1.5 MB maximum limits.

### Serving the Production SSR Bundle
```powershell
npm run serve:ssr:e-commerce-app
```
Runs the compiled Node SSR server at `http://localhost:4000`.

---

## 🧪 Testing & Code Quality

```powershell
# Run Angular unit tests
npm test
```
All component styles adhere strictly to Angular component style budgets (<8 kB).
