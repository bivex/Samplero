## Customer UI Architecture

### Chosen implementation path

The safest near-term buyer-facing UI for this repository is a **static customer portal** served by Strapi from `public/customer/`.

Why this path:

- no extra package installation
- same-origin requests to `/api/...`
- can reuse existing `users-permissions` auth
- can ship immediately on top of the already implemented `license-server` content API

### Runtime shape

- **Backend**: Strapi + `plugins/license-server`
- **Admin**: existing plugin admin SPA
- **Customer UI**: static app at `/customer/index.html`
- **Auth**: `POST /api/auth/local`, `POST /api/auth/local/register`, `GET /api/users/me`
- **Data API**:
  - `GET /api/license-server/products`
  - `GET /api/license-server/products/:slug`
  - `POST /api/license-server/orders`
    - creates the pending order first
  - `GET /api/license-server/me/licenses`
  - `GET /api/license-server/me/downloads`
  - `GET /api/license-server/me/orders`
  - `POST /api/license-server/me/orders/:id/redeem-coupon`
  - `POST /api/license-server/me/licenses/:licenseId/activations/:activationId/revoke`
  - claim moderation endpoints from `pending_activation_claims[]`

### Route model for the portal

- `#/store` — storefront and featured products
- `#/products/:slug` — product detail + latest versions + order CTA
- `#/account/licenses` — license cabinet
- `#/account/licenses/:id` — license detail + recovery workspace
- `#/account/downloads` — download hub
- `#/account/orders` — order history
- `#/account/orders/:id` — order detail + post-purchase CTA
  - pending orders can redeem an admin-issued full-discount coupon from this view
- `#/support` — self-serve help and support guidance

### State boundaries

- **Public state**
  - products list
  - selected product detail
- **Auth state**
  - JWT in `localStorage`
  - current user profile from `/api/users/me`
- **Cabinet state**
  - licenses
  - activation/device history
  - downloads
  - orders
  - pending activation claims

### UX mapping to existing contracts

- storefront uses public product endpoints
- checkout creates a **pending** order through `POST /api/license-server/orders`
- paid fulfillment remains webhook/payment driven on the backend
- cabinet uses the existing purchase contract documented in `frontend-purchase-contract.md`
- download buttons must call the protected download endpoint first, then open the returned signed URL

### Known API gap versus full wireframes

The current customer contract now supports:

- storefront
- post-purchase messaging
- full-discount coupon redemption from pending order detail
- license key display
- per-license device/activation history in the cabinet
- customer-safe device revocation
- downloads hub
- order history
- activation claim approval/rejection

The current contract still does **not** provide a dedicated standalone device-detail page or the full admin-grade operational history for every device event. Richer device forensic views can still be a later phase if needed.

### Delivery plan

#### Phase 1

- static customer portal shell
- storefront
- login/register
- licenses/downloads/orders cabinet
- activation claim confirm/reject

#### Phase 2

- richer checkout flow
- post-purchase success screen with stronger fulfillment CTA
- better support and recovery UX

#### Phase 3

- device detail / activation history once customer API is expanded
- saved support state / deep links / richer account details

### Manual QA entry point

- open `http://localhost:1337/customer/index.html`
- register a customer account or log in with an existing one
- create a pending order from the storefront
- verify cabinet tabs load after authentication