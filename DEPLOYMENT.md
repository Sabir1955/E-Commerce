# Production Deployment & Operations Runbook

This runbook covers the end-to-end production deployment, configuration, process management, reverse proxying, and operational monitoring for the Sacred Astrology Products E-Commerce Platform.

---

## 1. System Requirements & Topology

- **Operating System**: Ubuntu 22.04 LTS / Debian 12 / Enterprise Linux
- **Node.js Runtime**: Node.js 20 LTS or newer
- **Process Manager**: PM2 (`npm install -g pm2`)
- **Web Server / Reverse Proxy**: nginx (`apt install nginx`)
- **Database**: PostgreSQL 15+ (Local or Managed RDS / Cloud SQL)
- **Payment Gateways**: Razorpay, Easebuzz
- **Log Management**: PM2 Logrotate, Systemd journald

---

## 2. Server Provisioning & Initial Setup

Update system dependencies and install the Node.js runtime and reverse proxy:

```bash
# Update package repositories
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS (v20.x) and PostgreSQL client tools
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx postgresql-client

# Install PM2 globally
sudo npm install -g pm2
```

Clone the repository to `/var/www/astro-ecommerce`:

```bash
sudo mkdir -p /var/www/astro-ecommerce
sudo chown -R $USER:$USER /var/www/astro-ecommerce
git clone https://github.com/ashraf-g/astro.git /var/www/astro-ecommerce
cd /var/www/astro-ecommerce
```

---

## 3. Environment Configuration

### Backend Configuration (`Backend/.env`)

Create `Backend/.env` based on `Backend/.env.example`:

```bash
cp Backend/.env.example Backend/.env
nano Backend/.env
```

Ensure production values are configured:
- `NODE_ENV=production`
- `PORT=5000`
- `HOST=0.0.0.0`
- `DATABASE_URL`: Production PostgreSQL connection string (`postgresql://user:pass@host:5432/astro_ecommerce`).
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `JWT_SECRET`: High-entropy 64-character cryptographic string.
- `JWT_EXPIRES_IN=7d`
- `RAZORPAY_KEY_ID`: Live key provided by Razorpay dashboard (`rzp_live_...`).
- `RAZORPAY_KEY_SECRET`: Live secret key provided by Razorpay dashboard.
- `RAZORPAY_WEBHOOK_SECRET`: Live webhook secret configured in Razorpay dashboard.
- `SHIPROCKET_EMAIL`: Verified Shiprocket API credentials.
- `SHIPROCKET_PASSWORD`: Shiprocket API password.
- `SMTP_HOST`: Production transactional email SMTP relay (e.g., SendGrid, AWS SES).

---

## 4. Dependencies Installation & Application Build

Install dependencies and compile frontend production bundles:

```bash
# Backend installation
cd /var/www/astro-ecommerce/Backend
npm ci --omit=dev

# Bootstrap Admin and Seed Initial Catalog
npm run create-admin
npm run seed

# Frontend installation and production build
cd /var/www/astro-ecommerce/Frontend
npm ci
npm run build
```

---

## 5. PM2 Process Manager Configuration

Create the PM2 configuration file named `ecosystem.config.js` at `/var/www/astro-ecommerce/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "astro-backend-api",
      cwd: "/var/www/astro-ecommerce/Backend",
      script: "src/server.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5000
      },
      max_memory_restart: "500M",
      exp_backoff_restart_delay: 100
    },
    {
      name: "astro-frontend-ssr",
      cwd: "/var/www/astro-ecommerce/Frontend",
      script: "dist/e-commerce-app/server/server.mjs",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 4200
      },
      max_memory_restart: "400M"
    }
  ]
};
```

Launch the cluster and configure auto-start on system reboot:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 6. Nginx Reverse Proxy & SSL Configuration

Configure an optimized nginx virtual host configuration at `/etc/nginx/sites-available/astro-ecommerce`:

```nginx
server {
    listen 80;
    server_name store.astrologyproducts.com api.astrologyproducts.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name store.astrologyproducts.com;

    ssl_certificate /etc/letsencrypt/live/store.astrologyproducts.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/store.astrologyproducts.com/privkey.pem;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript application/xml+rss text/javascript image/svg+xml;

    # Static assets caching
    location /static/ {
        alias /var/www/astro-ecommerce/Frontend/dist/e-commerce-app/browser/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # SSR Storefront Proxy
    location / {
        proxy_pass http://127.0.0.1:4200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads & Media Assets
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

Enable site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/astro-ecommerce /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Payment Webhook Security (Razorpay)

Configure your production webhook endpoint in Razorpay Merchant Dashboard:
- Webhook URL: `https://store.astrologyproducts.com/api/webhooks/razorpay`
- Active Events:
  - `payment.captured`
  - `payment.failed`
  - `order.paid`
  - `refund.processed`
- Secret: The exact string set in `RAZORPAY_WEBHOOK_SECRET`.

All webhooks are cryptographically validated using HMAC SHA256 signatures before triggering stock updates and order status transitions.

---

## 8. Health Checks & Monitoring

Verify the services via automated health checks:

- Backend Health: `https://store.astrologyproducts.com/api/health`
- Swagger Documentation: `https://store.astrologyproducts.com/api-docs/`
- Process Status: `pm2 status`
- Real-time Log Stream: `pm2 logs`
- Telemetry & Latency Profiling: Query `/api/health` to review heap memory consumption and latency metrics.
