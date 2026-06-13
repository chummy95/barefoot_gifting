# Barefoot Gifting — Admin & Customer Dashboard

This adds a full backend (Vercel serverless functions + Postgres + Vercel Blob)
to the existing static site, plus:

- **/admin** — Admin dashboard (products, media library, orders, comments/reviews, customers, settings & Paystack)
- **/account** — Customer account dashboard (order history, profile)
- **/api/\*** — REST API powering both dashboards and (optionally) the storefront

## 1. Prerequisites

- A [Vercel](https://vercel.com) account
- Node.js installed locally (to run `npm run db:init`)

## 2. Deploy & connect storage

1. Push this project to a Git repo and import it into Vercel (or run `vercel` from this folder).
2. In the Vercel project dashboard → **Storage**:
   - Add **Postgres** (Neon-backed). This automatically sets `POSTGRES_URL`.
   - Add **Blob**. This automatically sets `BLOB_READ_WRITE_TOKEN`.
3. In **Settings → Environment Variables**, add:
   - `JWT_SECRET` — any long random string
   - `PAYSTACK_SECRET_KEY` — from [Paystack → Settings → API Keys](https://dashboard.paystack.com/#/settings/developers)
   - `PAYSTACK_PUBLIC_KEY` — same page
   - `PUBLIC_BASE_URL` — your deployed URL, e.g. `https://barefootgifting.vercel.app`

## 3. Initialize the database

Locally:
```bash
npm install
vercel env pull .env.local      # pulls POSTGRES_URL etc. from your Vercel project
export $(cat .env.local | xargs)
ADMIN_EMAIL="you@barefootgifting.com" ADMIN_PASSWORD="choose-a-strong-password" npm run db:init
```

This creates all tables (see `schema.sql`) and one admin user.
Log in at **`/admin`** with the email/password you set above — change the
password by re-running `db:init` with a new `ADMIN_PASSWORD` whenever needed.

## 4. Paystack setup

1. Log into the admin dashboard → **Settings**.
2. Paste your **Paystack Public Key** and turn checkout **On**.
3. Copy the **Webhook URL** shown (`/api/paystack/webhook`) and paste it into
   Paystack → **Settings → API Keys & Webhooks**.
4. The **Secret Key** is read from the `PAYSTACK_SECRET_KEY` environment
   variable only — it's never stored in the database for security.

### Checkout flow
1. Customer checks out → frontend calls `POST /api/orders` (creates a `pending` order).
2. Frontend calls `POST /api/paystack/initialize` with `{ orderId }` → redirects
   the customer to the returned `authorization_url`.
3. Paystack redirects back to `/checkout-success.html?reference=...`, which
   calls `GET /api/paystack/verify` to confirm and mark the order `paid`.
4. The webhook is a backup confirmation in case the redirect doesn't fire.

> **Note:** `checkout.html` currently submits without calling these APIs.
> Wire its submit handler to call `/api/orders` then `/api/paystack/initialize`
> to go live with payments — ask and I can do this next.

## 5. Admin Dashboard (`/admin`)

| Page | What it does |
|---|---|
| Dashboard | Revenue, order/product/customer counts, recent orders |
| Products | Add/edit/delete products, manage per-product image galleries, mark "customizable" (Little Luxes), set badges, draft/published status |
| Media Library | Upload, view, copy URL, delete images (stored on Vercel Blob) |
| Orders | View all orders + items + customization details, update order status |
| Comments & Reviews | Approve/spam/delete product reviews & blog comments |
| Customers | List of registered customers with order counts & lifetime spend |
| Settings | Store name, delivery fee/threshold, Paystack public key & webhook URL, API reference |

## 6. Customer Dashboard (`/account`)

- Sign in / create account (`/account/index.html`)
- Order history with line-item detail (`/account/dashboard.html`)
- Profile / delivery address (`/account/profile.html`)

A "My Account" icon was added to the nav on every storefront page, linking to `/account`.

## 7. API Reference

All endpoints are under `/api`. Admin-only endpoints require
`Authorization: Bearer <token>` from `POST /api/auth/login` for a user with `role = 'admin'`.

| Method & Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | — | Customer sign-up |
| `POST /api/auth/login` | — | Sign in (admin or customer) |
| `GET/PUT /api/auth/me` | user | View/update own profile |
| `GET /api/products` | — (drafts need admin) | List products + images |
| `POST /api/products` | admin | Create product |
| `GET/PUT/DELETE /api/products/:idOrSlug` | GET public, write admin | Manage one product |
| `GET/POST /api/media` | admin | Media library |
| `DELETE/PATCH /api/media/:id` | admin | Remove / rename media |
| `GET/POST /api/orders` | user (own) / admin (all) | Order history / create order |
| `GET/PATCH /api/orders/:id` | user (own) / admin | View order / update status |
| `GET/POST /api/comments` | — (writes are moderated) | Reviews & blog comments |
| `PATCH/DELETE /api/comments/:id` | admin | Moderate comments |
| `GET /api/customers` | admin | Customer list with spend |
| `GET /api/stats` | admin | Dashboard summary numbers |
| `GET/PUT /api/settings` | GET public-safe / PUT admin | Store & Paystack config |
| `POST /api/paystack/initialize` | — | Start a Paystack transaction |
| `GET /api/paystack/verify` | — | Verify payment by reference |
| `POST /api/paystack/webhook` | Paystack signature | Server-to-server payment confirmation |

## 8. Next steps / things not yet wired up

- `checkout.html` doesn't call the order/payment APIs yet — currently just a static form.
- The storefront (`shop.html`, `product.html`) reads its product list from
  hardcoded HTML, not `/api/products` yet. Wiring this up would let admin
  product edits show up live on the site.
- Product reviews UI on `product.html` doesn't yet post to `/api/comments`.
