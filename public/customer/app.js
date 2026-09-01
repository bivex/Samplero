/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:32
 * Last Updated: 2026-03-22 02:32
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

(function () {
  const API_BASE = "/api/license-server";
  const AUTH_LOCAL_ENDPOINT = "/api/auth/local";
  const AUTH_REGISTER_ENDPOINT = "/api/auth/local/register";
  const USERS_ME_ENDPOINT = "/api/users/me";
  const AUTH_STORAGE_KEY = "samplero-customer-portal-auth";
  const PRODUCT_SEARCH_MIN_QUERY_LENGTH = 2;

  const state = {
    route: normalizeRoute(window.location.hash),
    auth: restoreAuth(),
    redirectAfterAuth: null,
    flash: null,
    loading: {
      products: false,
      product: false,
      cabinet: false,
      auth: false,
      order: false,
      orderDetail: false,
      action: false,
      download: false,
    },
    products: [],
    catalog: {
      query: "",
      total: 0,
      requestId: 0,
      baseProducts: [],
      baseTotal: 0,
    },
    selectedProduct: null,
    selectedOrder: null,
    orders: {
      couponByOrderId: {},
    },
    cabinet: {
      licenses: [],
      downloads: [],
      orders: [],
    },
  };

  let productSearchTimer = null;

  const root = document.getElementById("app");

  function restoreAuth() {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { token: null, user: null };
    } catch (_error) {
      return { token: null, user: null };
    }
  }

  function persistAuth() {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state.auth));
  }

  function normalizeRoute(hash) {
    const cleaned = String(hash || "#/store").replace(/^#/, "") || "/store";
    return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  }

  function isAuthenticated() {
    return !!state.auth.token;
  }

  function isAccountRoute(route) {
    return String(route || "").startsWith("/account/");
  }

  function readProductSlugFromRoute(route) {
    const match = String(route || "").match(/^\/products\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readOrderIdFromRoute(route) {
    const match = String(route || "").match(/^\/account\/orders\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readLicenseIdFromRoute(route) {
    const match = String(route || "").match(/^\/account\/licenses\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function rememberProtectedRoute(route) {
    state.redirectAfterAuth = route || "/account/licenses";
  }

  function consumeRedirectAfterAuth(fallbackRoute) {
    const target = state.redirectAfterAuth || fallbackRoute;
    state.redirectAfterAuth = null;
    return target;
  }

  function describeRouteIntent(route) {
    if (!route) return "customer cabinet";
    if (route === "/store") return "product checkout";
    if (route.startsWith("/account/licenses/")) return "license recovery";
    if (route.startsWith("/account/licenses")) return "license recovery";
    if (route.startsWith("/account/downloads")) return "download recovery";
    if (route.startsWith("/account/orders")) return "order history";
    if (route.startsWith("/products/")) return "product checkout";
    return "customer cabinet";
  }

  function getOrderRoute(orderId) {
    return `/account/orders/${encodeURIComponent(orderId)}`;
  }

  function getLicenseRoute(licenseId) {
    return `/account/licenses/${encodeURIComponent(licenseId)}`;
  }

  function findCabinetOrderById(orderId) {
    return state.cabinet.orders.find((order) => String(order.id) === String(orderId)) || null;
  }

  function findCabinetLicenseById(licenseId) {
    return state.cabinet.licenses.find((license) => String(license.id) === String(licenseId)) || null;
  }

  function getPendingClaimCount() {
    return state.cabinet.licenses.reduce(
      (sum, license) => sum + ((license.pending_activation_claims || []).length),
      0,
    );
  }

  function getActiveDeviceCount() {
    return state.cabinet.licenses.reduce(
      (sum, license) => sum + Number(license.active_activations_count || 0),
      0,
    );
  }

  function getLatestOrder() {
    return state.cabinet.orders[0] || null;
  }

  function getRecoverableLicense() {
    if (!state.cabinet.licenses.length) {
      return null;
    }

    const ranked = state.cabinet.licenses.slice().sort((left, right) => {
      const leftScore = (left.has_pending_activation_claim ? 10 : 0) + Number(left.active_activations_count || 0);
      const rightScore = (right.has_pending_activation_claim ? 10 : 0) + Number(right.active_activations_count || 0);
      return rightScore - leftScore;
    });

    return ranked[0] || null;
  }

  function getOrderCouponCode(orderId) {
    return state.orders.couponByOrderId[String(orderId)] || "";
  }

  function setOrderCouponCode(orderId, value) {
    state.orders.couponByOrderId[String(orderId)] = String(value || "");
  }

  function currencyFromCents(cents, currency) {
    const amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (_error) {
      return `${amount.toFixed(2)} ${currency || "USD"}`;
    }
  }

  function formatMoney(cents, currency) {
    return cents == null ? "—" : currencyFromCents(cents, currency);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatRelativeTime(value) {
    if (!value) return "never";
    const millis = Date.parse(value);
    if (Number.isNaN(millis)) return String(value);

    const diffSeconds = Math.round((millis - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);
    const units = [
      [86400, "day"],
      [3600, "hour"],
      [60, "minute"],
    ];

    for (const [unitSeconds, label] of units) {
      if (absSeconds >= unitSeconds) {
        const amount = Math.round(absSeconds / unitSeconds);
        return diffSeconds >= 0
          ? `in ${amount} ${label}${amount === 1 ? "" : "s"}`
          : `${amount} ${label}${amount === 1 ? "" : "s"} ago`;
      }
    }

    return diffSeconds >= 0 ? "in under a minute" : "under a minute ago";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeCopyText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function titleCase(value) {
    return normalizeCopyText(value)
      .replace(/[_-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function humanizeSlug(value) {
    return titleCase(normalizeCopyText(value).replace(/[-_]+/g, " "));
  }

  function isPlaceholderCopy(value) {
    const text = normalizeCopyText(value).toLowerCase();
    return !text
      || /^(x{2,}|placeholder|coming soon|tbd|todo|n\/a|test|demo)$/i.test(text)
      || /^([x._-])\1+$/i.test(text);
  }

  function getProductTypeLabel(type) {
    const normalized = normalizeCopyText(type);
    return isPlaceholderCopy(normalized) ? "Product" : titleCase(normalized);
  }

  function getProductDisplayName(product) {
    const explicitName = normalizeCopyText(product?.name);
    if (!isPlaceholderCopy(explicitName)) {
      return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(explicitName)
        ? humanizeSlug(explicitName)
        : explicitName;
    }

    const slugLabel = humanizeSlug(product?.slug);
    if (!isPlaceholderCopy(slugLabel)) return slugLabel;

    return getProductTypeLabel(product?.type);
  }

  function getProductMarketingDescription(product) {
    const explicitDescription = normalizeCopyText(product?.description);
    if (!isPlaceholderCopy(explicitDescription)) return explicitDescription;

    return `${getProductTypeLabel(product?.type)} purchase with secure delivery, account access, download recovery, and ownership tools inside your Samplero portal.`;
  }

  function getOrderActionLabel() {
    if (state.loading.order) return "Preparing checkout…";
    return isAuthenticated() ? "Start checkout" : "Sign in to purchase";
  }

  function setFlash(type, text) {
    if (!text) {
      state.flash = null;
      render();
      return;
    }

    const toastify = window.Toastify;
    if (typeof toastify === "function") {
      state.flash = null;
      toastify({
        text,
        duration: type === "error" ? 5200 : 3600,
        gravity: "top",
        position: "right",
        stopOnFocus: true,
        close: true,
        style: {
          background: type === "success"
            ? "linear-gradient(135deg, #1fa971, #24c8a5)"
            : type === "error"
              ? "linear-gradient(135deg, #b33a4a, #ff6b6b)"
              : "linear-gradient(135deg, #5a77ff, #7c5cff)",
          color: "#f8fbff",
          borderRadius: "14px",
          boxShadow: "0 14px 32px rgba(0, 0, 0, 0.28)",
        },
      }).showToast();
      render();
      return;
    }

    state.flash = { type, text };
    render();
  }

  async function request(path, options) {
    const { method = "GET", body, auth = false } = options || {};
    const headers = { Accept: "application/json" };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (auth && state.auth.token) {
      headers.Authorization = `Bearer ${state.auth.token}`;
    }

    const response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function loadProducts() {
    const searchQuery = String(arguments[0] ?? state.catalog.query ?? "").trim();
    const requestId = state.catalog.requestId + 1;

    state.catalog.query = searchQuery;
    state.catalog.requestId = requestId;
    state.loading.products = true;
    render();
    try {
      const endpoint = searchQuery
        ? `${API_BASE}/products/search?limit=24&offset=0&is_active=true&q=${encodeURIComponent(searchQuery)}`
        : `${API_BASE}/products?limit=24&offset=0&is_active=true`;
      const payload = await request(endpoint);

      if (requestId !== state.catalog.requestId) {
        return;
      }

      state.products = Array.isArray(payload?.products) ? payload.products : [];
      state.catalog.total = Number.isFinite(payload?.total) ? payload.total : state.products.length;
      if (!searchQuery) {
        state.catalog.baseProducts = state.products.slice();
        state.catalog.baseTotal = state.catalog.total;
      }
    } catch (error) {
      if (requestId !== state.catalog.requestId) {
        return;
      }

      if (searchQuery && error.status === 400) {
        state.products = state.catalog.baseProducts.slice();
        state.catalog.total = state.catalog.baseTotal;
        render();
        return;
      }

      setFlash(
        "error",
        error.message || (searchQuery ? "Failed to search products." : "Failed to load products."),
      );
    } finally {
      if (requestId === state.catalog.requestId) {
        state.loading.products = false;
        render();
      }
    }
  }

  function scheduleProductSearch(value) {
    state.catalog.query = String(value || "").trim();

    if (productSearchTimer) {
      window.clearTimeout(productSearchTimer);
    }

    if (!state.catalog.query) {
      loadProducts("");
      return;
    }

    if (state.catalog.query.length < PRODUCT_SEARCH_MIN_QUERY_LENGTH) {
      state.loading.products = false;
      state.catalog.requestId += 1;
      state.products = state.catalog.baseProducts.slice();
      state.catalog.total = state.catalog.baseTotal;
      render();
      return;
    }

    productSearchTimer = window.setTimeout(() => {
      loadProducts(state.catalog.query);
    }, 250);
  }

  async function loadProduct(slug) {
    if (!slug) {
      state.selectedProduct = null;
      render();
      return;
    }

    state.loading.product = true;
    render();
    try {
      state.selectedProduct = await request(`${API_BASE}/products/${encodeURIComponent(slug)}`);
    } catch (error) {
      setFlash("error", error.message || "Failed to load product.");
      state.selectedProduct = null;
    } finally {
      state.loading.product = false;
      render();
    }
  }

  async function refreshUserProfile() {
    if (!state.auth.token) return;

    try {
      state.auth.user = await request(USERS_ME_ENDPOINT, { auth: true });
      persistAuth();
    } catch (_error) {
      logout(false);
    }
  }

  async function loadCabinet() {
    if (!isAuthenticated()) return;

    state.loading.cabinet = true;
    render();
    try {
      const [licenses, downloads, orders] = await Promise.all([
        request(`${API_BASE}/me/licenses`, { auth: true }),
        request(`${API_BASE}/me/downloads`, { auth: true }),
        request(`${API_BASE}/me/orders`, { auth: true }),
      ]);

      state.cabinet.licenses = Array.isArray(licenses) ? licenses : [];
      state.cabinet.downloads = Array.isArray(downloads?.downloads) ? downloads.downloads : [];
      state.cabinet.orders = Array.isArray(orders?.orders) ? orders.orders : [];
      if (state.selectedOrder?.id) {
        const refreshedOrder = findCabinetOrderById(state.selectedOrder.id);
        if (refreshedOrder) {
          state.selectedOrder = { ...state.selectedOrder, ...refreshedOrder };
        }
      }
    } catch (error) {
      if (error.status === 401) {
        logout(false);
      }
      setFlash("error", error.message || "Failed to load your cabinet.");
    } finally {
      state.loading.cabinet = false;
      render();
    }
  }

  function go(route) {
    window.location.hash = route.startsWith("#") ? route : `#${route}`;
  }

  function focusAuthPanel() {
    const identifierInput = root.querySelector('form[data-form="login"] input[name="identifier"]');
    const authCard = identifierInput?.closest(".card");

    if (!identifierInput || !authCard) return;

    window.requestAnimationFrame(() => {
      authCard.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        identifierInput.focus({ preventScroll: true });
        if (identifierInput.value && typeof identifierInput.select === "function") {
          identifierInput.select();
        }
      }, 120);
    });
  }

  async function loadOrder(orderId) {
    if (!orderId || !isAuthenticated()) {
      state.selectedOrder = null;
      render();
      return;
    }

    const cached = findCabinetOrderById(orderId);
    if (cached) {
      state.selectedOrder = cached;
    }

    state.loading.orderDetail = true;
    render();
    try {
      state.selectedOrder = await request(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        auth: true,
      });
    } catch (error) {
      if (error.status === 401) {
        logout(false);
        return;
      }
      if (error.status === 404) {
        state.selectedOrder = null;
      }
      setFlash("error", error.message || "Failed to load order details.");
    } finally {
      state.loading.orderDetail = false;
      render();
    }
  }

  async function handleHashChange() {
    state.route = normalizeRoute(window.location.hash);
    const productSlug = readProductSlugFromRoute(state.route);
    const orderId = readOrderIdFromRoute(state.route);
    const licenseId = readLicenseIdFromRoute(state.route);

    if (productSlug) {
      await loadProduct(productSlug);
    } else if (state.selectedProduct && !state.route.startsWith("/products/")) {
      state.selectedProduct = null;
    }

    if (isAccountRoute(state.route) && !isAuthenticated()) {
      rememberProtectedRoute(state.route);
      state.selectedOrder = null;
      render();
      return;
    }

    if (orderId && isAuthenticated()) {
      await loadCabinet();
      await loadOrder(orderId);
      return;
    }

    if (isAccountRoute(state.route) && isAuthenticated()) {
      state.selectedOrder = null;
      await loadCabinet();
      return;
    }

    if (!orderId) {
      state.selectedOrder = null;
    }

    if (!licenseId) {
      render();
      return;
    }

    render();
  }

  async function login(formData) {
    state.loading.auth = true;
    render();
    try {
      const payload = await request(AUTH_LOCAL_ENDPOINT, {
        method: "POST",
        body: {
          identifier: formData.get("identifier"),
          password: formData.get("password"),
        },
      });

      state.auth = { token: payload.jwt, user: payload.user };
      persistAuth();
      await refreshUserProfile();
      await loadCabinet();
      setFlash("success", "Signed in successfully.");
      go(consumeRedirectAfterAuth("/account/licenses"));
    } catch (error) {
      setFlash("error", error.message || "Sign in failed.");
    } finally {
      state.loading.auth = false;
      render();
    }
  }

  async function register(formData) {
    state.loading.auth = true;
    render();
    try {
      const payload = await request(AUTH_REGISTER_ENDPOINT, {
        method: "POST",
        body: {
          username: formData.get("username"),
          email: formData.get("email"),
          password: formData.get("password"),
        },
      });

      state.auth = { token: payload.jwt, user: payload.user };
      persistAuth();
      await refreshUserProfile();
      await loadCabinet();
      setFlash("success", "Account created. Welcome to Samplero.");
      go(consumeRedirectAfterAuth("/account/licenses"));
    } catch (error) {
      setFlash("error", error.message || "Registration failed.");
    } finally {
      state.loading.auth = false;
      render();
    }
  }

  function logout(showMessage) {
    state.auth = { token: null, user: null };
    state.redirectAfterAuth = null;
    state.selectedOrder = null;
    state.cabinet = { licenses: [], downloads: [], orders: [] };
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    if (showMessage !== false) {
      setFlash("success", "Signed out.");
    }
    go("/store");
  }

  async function createOrder(productId) {
    if (!isAuthenticated()) {
      state.redirectAfterAuth = state.route;
      setFlash("info", "Sign in first to continue checkout, then retry the order action.");
      render();
      focusAuthPanel();
      return;
    }

    state.loading.order = true;
    render();
    try {
      const order = await request(`${API_BASE}/orders`, {
        method: "POST",
        auth: true,
        body: {
          payment_method: "card",
          items: [{ product_id: Number(productId), quantity: 1 }],
        },
      });

      setFlash(
        "success",
        `Pending order ${order.order_reference || `#${order.id}`} created. Complete payment via the configured payment flow or redeem an admin coupon from the order detail page.`,
      );
      state.selectedOrder = order;
      await loadCabinet();
      go(getOrderRoute(order.id));
    } catch (error) {
      setFlash("error", error.message || "Failed to create order.");
    } finally {
      state.loading.order = false;
      render();
    }
  }

  async function redeemOrderCoupon(orderId) {
    const couponCode = getOrderCouponCode(orderId).trim();

    if (!couponCode) {
      setFlash("error", "Enter a coupon code first.");
      render();
      return;
    }

    state.loading.action = true;
    render();
    try {
      const order = await request(`${API_BASE}/me/orders/${encodeURIComponent(orderId)}/redeem-coupon`, {
        method: "POST",
        auth: true,
        body: { coupon_code: couponCode },
      });
      setOrderCouponCode(orderId, "");
      state.selectedOrder = order;
      setFlash("success", `Coupon ${order.receipt?.coupon_code || couponCode} fully paid this order. Downloads and licenses are ready now.`);
      await loadCabinet();
    } catch (error) {
      setFlash("error", error.message || "Failed to redeem this coupon.");
    } finally {
      state.loading.action = false;
      render();
    }
  }

  async function resolveDownload(productId, versionId) {
    state.loading.download = true;
    render();
    try {
      const payload = await request(`${API_BASE}/products/${productId}/versions/${versionId}/download`, {
        auth: true,
      });

      if (payload?.download_url) {
        window.open(payload.download_url, "_blank", "noopener,noreferrer");
        setFlash("success", "Signed download URL generated.");
      } else {
        throw new Error("Download URL not available");
      }
    } catch (error) {
      setFlash("error", error.message || "Failed to prepare download.");
    } finally {
      state.loading.download = false;
      render();
    }
  }

  async function handleClaimDecision(endpoint, successMessage) {
    state.loading.action = true;
    render();
    try {
      await request(endpoint, { method: "POST", auth: true });
      setFlash("success", successMessage);
      await loadCabinet();
    } catch (error) {
      setFlash("error", error.message || "Failed to update activation claim.");
    } finally {
      state.loading.action = false;
      render();
    }
  }

  async function revokeActivation(endpoint) {
    state.loading.action = true;
    render();
    try {
      await request(endpoint, { method: "POST", auth: true });
      setFlash("success", "Device access revoked. The license slot is available again.");
      await loadCabinet();
    } catch (error) {
      setFlash("error", error.message || "Failed to revoke this activation.");
    } finally {
      state.loading.action = false;
      render();
    }
  }

  function getCustomerRouteFromApiHref(href) {
    const normalized = String(href || "");
    if (normalized === `${API_BASE}/me/downloads`) return "/account/downloads";
    if (normalized === `${API_BASE}/me/licenses`) return "/account/licenses";

    const orderMatch = normalized.match(/^\/api\/license-server\/orders\/([^/]+)$/);
    if (orderMatch) {
      return getOrderRoute(orderMatch[1]);
    }

    return null;
  }

  function parseDownloadEndpoint(href) {
    const match = String(href || "").match(/^\/api\/license-server\/products\/([^/]+)\/versions\/([^/]+)\/download$/);
    return match ? { productId: match[1], versionId: match[2] } : null;
  }

  async function runOrderCta(type, href, label) {
    if (!href) return;

    if (/^\/(store|support|products|account)\b/.test(href)) {
      go(href);
      return;
    }

    const download = parseDownloadEndpoint(href);
    if (download) {
      await resolveDownload(download.productId, download.versionId);
      return;
    }

    const customerRoute = getCustomerRouteFromApiHref(href);
    if (customerRoute) {
      if (customerRoute === state.route) {
        const orderId = readOrderIdFromRoute(customerRoute);
        if (orderId) {
          await loadOrder(orderId);
          setFlash("info", `${label || "Action"} refreshed.`);
        }
        return;
      }
      go(customerRoute);
      return;
    }

    if (/^https?:/i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    setFlash("info", `${label || type || "Action"} is available via ${href}`);
  }

  function renderFlash() {
    if (!state.flash) return "";
    return `<div class="banner banner--${escapeHtml(state.flash.type || "info")}">${escapeHtml(state.flash.text)}</div>`;
  }

  function renderNav() {
    const items = [
      ["/store", "Store"],
      ["/account/licenses", "My licenses"],
      ["/account/downloads", "Downloads"],
      ["/account/orders", "Orders"],
      ["/support", "Support"],
    ];

    return items
      .map(([href, label]) => `<a class="pill ${state.route.startsWith(href) ? "is-active" : ""}" href="#${href}">${label}</a>`)
      .join("");
  }

  function getPortalPrimaryShortcut() {
    const pendingClaimCount = getPendingClaimCount();
    const latestOrder = getLatestOrder();
    const recoverableLicense = getRecoverableLicense();

    if (pendingClaimCount > 0 && recoverableLicense) {
      return { label: "Review device access", href: `#${getLicenseRoute(recoverableLicense.id)}` };
    }

    if (latestOrder) {
      return { label: "Resume latest order", href: `#${getOrderRoute(latestOrder.id)}` };
    }

    if (isAuthenticated() && state.cabinet.downloads.length > 0) {
      return { label: "Open my downloads", href: "#/account/downloads" };
    }

    if (isAuthenticated() && state.cabinet.licenses.length > 0) {
      return { label: "Open my licenses", href: "#/account/licenses" };
    }

    return { label: isAuthenticated() ? "Open recovery center" : "Explore products", href: isAuthenticated() ? "#/support" : "#/store" };
  }

  function renderHeaderActions() {
    const primaryShortcut = getPortalPrimaryShortcut();
    const secondaryShortcut = isAuthenticated()
      ? { label: "Need install help?", href: "#/support" }
      : { label: "Purchase help", href: "#/support" };

    return `
      <div class="topbar__actions">
        <a class="button-link is-primary" href="${escapeHtml(primaryShortcut.href)}">${escapeHtml(primaryShortcut.label)}</a>
        <a class="button-link" href="${escapeHtml(secondaryShortcut.href)}">${escapeHtml(secondaryShortcut.label)}</a>
      </div>
    `;
  }

  function renderPortalFooter() {
    const primaryShortcut = getPortalPrimaryShortcut();
    const pendingClaimCount = getPendingClaimCount();
    const activeDeviceCount = getActiveDeviceCount();

    return `
      <footer class="portal-footer">
        <div class="portal-footer__intro stack">
          <div class="meta">
            <span class="badge portal-footer__badge">Trusted customer workspace</span>
            <span class="badge">Secure delivery</span>
            <span class="badge">Ownership recovery</span>
          </div>
          <div>
            <strong>Samplero ownership, streamlined.</strong>
            <div class="muted">Return after checkout, recover access on a new machine, reopen downloads, and keep every purchase connected to one account with clear next steps.</div>
          </div>
        </div>
        <div class="portal-footer__grid">
          <div class="portal-footer__group stack">
            <div class="kicker">Continue where you left off</div>
            <a class="button-link is-primary portal-footer__cta" href="${escapeHtml(primaryShortcut.href)}">${escapeHtml(primaryShortcut.label)}</a>
            <a class="button-link" href="#/support">Open recovery center</a>
          </div>
          <div class="portal-footer__group stack">
            <div class="kicker">Portal snapshot</div>
            <div class="muted">${isAuthenticated() ? `Signed in as ${escapeHtml(state.auth.user?.email || state.auth.user?.username || "customer")}` : "Guest preview — sign in to unlock secure downloads, order history, and ownership recovery."}</div>
            <div class="meta">
              <span class="badge">Licenses ${escapeHtml(state.cabinet.licenses.length)}</span>
              <span class="badge">Devices ${escapeHtml(activeDeviceCount)}</span>
              <span class="badge">Pending claims ${escapeHtml(pendingClaimCount)}</span>
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  function renderProtectedRouteCard(title, description) {
    return `
      <div class="card stack">
        <div class="kicker">Sign in required</div>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(description)}</p>
        <div class="inline-actions">
          <button class="button is-primary" type="button" data-action="focus-auth">Sign in now</button>
          <a class="button-link" href="#/store">Back to catalog</a>
          <a class="button-link" href="#/support">Get recovery help</a>
        </div>
      </div>
    `;
  }

  function getActivationLastSeenAt(activation) {
    return activation.last_check_in_at || activation.updated_at || activation.activated_at || null;
  }

  function getActivationCertificateLabel(activation) {
    if (activation.certificate_serial) {
      return activation.certificate_serial;
    }

    return activation.requires_mtls ? "Pending / unavailable" : "mTLS disabled";
  }

  function getActivationHealth(activation) {
    if (activation.revoked_at) {
      return {
        label: "Revoked",
        detail: `This installation was revoked ${formatRelativeTime(activation.revoked_at)} and no longer consumes an active slot.`,
      };
    }

    const lastSeenAt = getActivationLastSeenAt(activation);

    if (!lastSeenAt) {
      return {
        label: "New device",
        detail: "The activation exists, but this device has not checked in yet.",
      };
    }

    const lastSeenMillis = Date.parse(lastSeenAt);
    const recentlySeen = !Number.isNaN(lastSeenMillis) && (Date.now() - lastSeenMillis) <= (24 * 60 * 60 * 1000);

    if (recentlySeen) {
      return {
        label: "Healthy",
        detail: `Last check-in ${formatRelativeTime(lastSeenAt)} — this installation still looks active.`,
      };
    }

    return {
      label: "Needs review",
      detail: `Last check-in ${formatRelativeTime(lastSeenAt)}. If this device is gone, revoke it to free a slot.`,
    };
  }

  function renderActivationHistoryOverview(license) {
    const activations = Array.isArray(license.activations) ? license.activations : [];
    const pendingClaims = Array.isArray(license.pending_activation_claims) ? license.pending_activation_claims : [];
    const activeActivations = activations.filter((activation) => activation.active);
    const mtlsProtected = activeActivations.filter((activation) => activation.requires_mtls).length;
    const recentlySeen = activeActivations.filter((activation) => {
      const lastSeenAt = getActivationLastSeenAt(activation);
      const millis = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
      return !Number.isNaN(millis) && (Date.now() - millis) <= (24 * 60 * 60 * 1000);
    }).length;

    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat__label">Active now</div><div class="stat__value">${escapeHtml(activeActivations.length)}</div></div>
        <div class="stat"><div class="stat__label">Pending approvals</div><div class="stat__value">${escapeHtml(pendingClaims.length)}</div></div>
        <div class="stat"><div class="stat__label">mTLS devices</div><div class="stat__value">${escapeHtml(mtlsProtected)}</div></div>
        <div class="stat"><div class="stat__label">Seen in 24h</div><div class="stat__value">${escapeHtml(recentlySeen)}</div></div>
      </div>
    `;
  }

  function renderActivationHistory(license, options = {}) {
    const activations = Array.isArray(license.activations) ? license.activations : [];
    const pendingClaims = Array.isArray(license.pending_activation_claims) ? license.pending_activation_claims : [];
    const limit = Number.isFinite(options.limit) ? Number(options.limit) : null;
    const compact = options.compact === true;
    const showOverview = options.showOverview !== false;

    if (!activations.length) {
      return `
        ${showOverview ? renderActivationHistoryOverview(license) : ""}
        <div class="callout stack">
          <strong>No device activations yet.</strong>
          <div class="muted">${pendingClaims.length
            ? `${pendingClaims.length} activation request${pendingClaims.length === 1 ? " is" : "s are"} still waiting for confirmation in the customer portal.`
            : "The first successful desktop activation will appear here with trust, check-in, and certificate history."}</div>
        </div>
      `;
    }

    const visibleActivations = limit ? activations.slice(0, limit) : activations;

    return `
      ${showOverview ? renderActivationHistoryOverview(license) : ""}
      <div class="list">${visibleActivations.map((activation) => {
        const health = getActivationHealth(activation);
        const lastSeenAt = getActivationLastSeenAt(activation);
        const certificateLabel = getActivationCertificateLabel(activation);

        return `
      <div class="callout stack">
        <div class="card__header">
          <div>
            <div class="kicker">${escapeHtml(activation.device_fingerprint || "Unknown device")}</div>
            <strong>${escapeHtml(activation.platform || "Unknown platform")}</strong>
            <div class="muted">${compact
              ? `Last seen ${escapeHtml(formatRelativeTime(lastSeenAt))}`
              : `${escapeHtml(activation.plugin_version || "Plugin version unavailable")} • ${escapeHtml(health.detail)}`}</div>
          </div>
          <div class="meta">
            <span class="badge">${escapeHtml(activation.status || "unknown")}</span>
            <span class="badge">${escapeHtml(health.label)}</span>
            <span class="badge">trust: ${escapeHtml(activation.trust_label || "unknown")}</span>
            ${activation.requires_mtls ? '<span class="badge">mTLS</span>' : ""}
          </div>
        </div>
        <div class="tableish">
          <div class="tableish__row"><span>Plugin version</span><strong>${escapeHtml(activation.plugin_version || "—")}</strong></div>
          <div class="tableish__row"><span>Activated</span><strong>${escapeHtml(formatDate(activation.activated_at))}</strong></div>
          <div class="tableish__row"><span>Last check-in</span><strong>${escapeHtml(lastSeenAt ? `${formatDate(lastSeenAt)} (${formatRelativeTime(lastSeenAt)})` : "—")}</strong></div>
          <div class="tableish__row"><span>Certificate</span><strong>${escapeHtml(certificateLabel)}</strong></div>
          <div class="tableish__row"><span>Protection</span><strong>${activation.requires_mtls ? "mTLS-protected activation" : "Signed activation only"}</strong></div>
          <div class="tableish__row"><span>Revoked at</span><strong>${escapeHtml(formatDate(activation.revoked_at))}</strong></div>
        </div>
        ${activation.revoke_endpoint ? `
          <div class="inline-actions">
            <button class="button is-danger" data-action="revoke-activation" data-endpoint="${escapeHtml(activation.revoke_endpoint)}">
              ${state.loading.action ? "Working…" : "Revoke this device"}
            </button>
            <a class="button-link" href="#/support">Need recovery help?</a>
          </div>
          <div class="muted">Revoking this installation immediately frees one slot for a replacement machine.</div>
        ` : `<div class="muted">${escapeHtml(health.detail)}</div>`}
      </div>
    `;
      }).join("")}</div>
      ${limit && activations.length > visibleActivations.length
        ? `<div class="muted">Showing ${escapeHtml(visibleActivations.length)} of ${escapeHtml(activations.length)} known devices here. Open the license detail for the full activation history.</div>`
        : ""}
    `;
  }

  function renderReceiptLines(receipt, currency) {
    const lineItems = Array.isArray(receipt?.line_items) ? receipt.line_items : [];
    if (!lineItems.length) {
      return '<div class="empty">Receipt line items are not available yet.</div>';
    }

    return lineItems.map((item) => `
      <div class="tableish__row">
        <span>${escapeHtml(item.product?.name || item.product_name || "Product")} × ${escapeHtml(item.quantity || 1)}</span>
        <strong>${escapeHtml(formatMoney(item.line_total_cents ?? item.total_amount_cents, currency))}</strong>
      </div>
    `).join("");
  }

  function renderReceiptSummary(order) {
    const receipt = order?.receipt || {};
    const hasDiscount = Number(receipt.discount_amount_cents || 0) > 0;

    return `
      <div class="tableish">
        <div class="tableish__row"><span>Subtotal</span><strong>${escapeHtml(formatMoney(receipt.subtotal_amount_cents ?? order?.subtotal_amount_cents ?? order?.total_amount_cents, order?.currency))}</strong></div>
        ${hasDiscount ? `<div class="tableish__row"><span>Coupon ${escapeHtml(receipt.coupon_code || order?.coupon_code || "")}</span><strong>−${escapeHtml(formatMoney(receipt.discount_amount_cents, order?.currency))}</strong></div>` : ""}
        <div class="tableish__row"><span>Total</span><strong>${escapeHtml(formatMoney(order?.total_amount_cents, order?.currency))}</strong></div>
        <div class="tableish__row"><span>Payment method</span><strong>${escapeHtml(receipt.payment_method || order?.payment_method || "—")}</strong></div>
      </div>
    `;
  }

  function renderLicenseSummaryGrid(license) {
    return `
      <div class="stat-grid">
        <div class="stat"><div class="stat__label">Activation limit</div><div class="stat__value">${escapeHtml(license.activation_limit ?? 0)}</div></div>
        <div class="stat"><div class="stat__label">Active devices</div><div class="stat__value">${escapeHtml(license.active_activations_count ?? 0)}</div></div>
        <div class="stat"><div class="stat__label">Known devices</div><div class="stat__value">${escapeHtml(license.activations_count ?? 0)}</div></div>
        <div class="stat"><div class="stat__label">Slots left</div><div class="stat__value">${escapeHtml(license.available_activation_slots ?? 0)}</div></div>
      </div>
    `;
  }

  function renderPendingOrderCouponBox(order) {
    if (!order || order.status !== "pending") {
      return "";
    }

    return `
      <div class="card stack">
        <div class="kicker">Redeem admin coupon</div>
        <div class="muted">If support gave you a full-discount coupon, apply it here to instantly mark this pending order as paid.</div>
        <label class="stack" style="gap:6px;">
          <span class="muted">Coupon code</span>
          <input class="input" type="text" placeholder="FULLFREE2026" data-order-coupon-order-id="${escapeHtml(order.id)}" value="${escapeHtml(getOrderCouponCode(order.id))}" />
        </label>
        <div class="inline-actions">
          <button class="button is-primary" data-action="redeem-order-coupon" data-order-id="${escapeHtml(order.id)}">${state.loading.action ? "Applying…" : "Apply coupon"}</button>
        </div>
      </div>
    `;
  }

  function renderOrderCtaButton(cta, variant) {
    if (!cta?.label || !cta?.href) return "";
    return `
      <button
        class="${variant === "primary" ? "button is-primary" : "button"}"
        data-action="run-order-cta"
        data-cta-type="${escapeHtml(cta.type || "")}" 
        data-cta-href="${escapeHtml(cta.href)}"
        data-cta-label="${escapeHtml(cta.label)}"
      >${escapeHtml(cta.label)}</button>
    `;
  }

  function renderAuthPanel() {
    if (isAuthenticated()) {
      return `
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">Signed in</div>
              <h3>${escapeHtml(state.auth.user?.username || state.auth.user?.email || "Customer")}</h3>
            </div>
            <button class="button is-ghost" data-action="logout">Sign out</button>
          </div>
          <div class="tableish">
            <div class="tableish__row"><span>Email</span><strong>${escapeHtml(state.auth.user?.email || "—")}</strong></div>
            <div class="tableish__row"><span>Portal</span><strong>Ownership workspace</strong></div>
          </div>
          <div class="inline-actions">
            <a class="button-link" href="#/account/licenses">Open my licenses</a>
            <a class="button-link" href="#/account/orders">View order history</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="stack">
        ${state.redirectAfterAuth ? `
          <div class="banner banner--info">
            Sign in to continue to ${escapeHtml(describeRouteIntent(state.redirectAfterAuth))}.
          </div>
        ` : ""}
        <div class="card">
          <div class="kicker">Customer sign in</div>
          <h3>Access your Samplero account</h3>
          <div class="muted">Open downloads, licenses, order history, and recovery tools from one secure place.</div>
          <form class="form" data-form="login">
            <label class="field">
              <span>Email or username</span>
              <input name="identifier" placeholder="you@example.com" autocomplete="username" autocapitalize="off" spellcheck="false" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input name="password" type="password" placeholder="••••••••" autocomplete="current-password" required />
            </label>
            <button class="button is-primary" type="submit">${state.loading.auth ? "Working…" : "Sign in"}</button>
          </form>
        </div>
        <div class="card">
          <div class="kicker">New customer</div>
          <h3>Create your Samplero account</h3>
          <div class="muted">Keep purchases, downloads, activations, and post-purchase recovery attached to one identity.</div>
          <form class="form" data-form="register">
            <label class="field">
              <span>Username</span>
              <input name="username" placeholder="samplero-user" autocomplete="username" autocapitalize="off" spellcheck="false" required />
            </label>
            <label class="field">
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input name="password" type="password" placeholder="Minimum secure password" autocomplete="new-password" required />
            </label>
            <button class="button" type="submit">${state.loading.auth ? "Working…" : "Register"}</button>
          </form>
        </div>
      </div>
    `;
  }

  function renderStorefront() {
    const primaryShortcut = getPortalPrimaryShortcut();
    const secondaryShortcut = isAuthenticated()
      ? { label: "Open recovery center", href: "#/support" }
      : { label: "Get purchase help", href: "#/support" };
    const queryTooShort = state.catalog.query.length > 0
      && state.catalog.query.length < PRODUCT_SEARCH_MIN_QUERY_LENGTH;
    const emptyMessage = state.loading.products
      ? state.catalog.query
        ? "Searching the catalog…"
        : "Loading the catalog…"
      : queryTooShort
        ? `Enter at least ${PRODUCT_SEARCH_MIN_QUERY_LENGTH} characters to search the catalog.`
      : state.catalog.query
        ? `No products matched “${escapeHtml(state.catalog.query)}”.`
        : "No live products are currently available in the storefront.";
    const cards = state.products.length
      ? state.products.map((product) => {
        const displayName = getProductDisplayName(product);
        const description = getProductMarketingDescription(product);
        const typeLabel = getProductTypeLabel(product.type);

        return `
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="meta"><span class="badge">${escapeHtml(typeLabel)}</span></div>
              <h3>${escapeHtml(displayName)}</h3>
            </div>
            <div class="price">${escapeHtml(currencyFromCents(product.price_cents, product.currency))}</div>
          </div>
          <div class="muted">${escapeHtml(description)}</div>
          <div class="card__actions">
            ${product.slug ? `<a class="button-link" href="#/products/${encodeURIComponent(product.slug)}">Preview product</a>` : '<span class="badge">Product page coming soon</span>'}
            <button class="button is-primary" data-action="order-product" data-product-id="${product.id}">
              ${getOrderActionLabel()}
            </button>
          </div>
        </div>
      `;
      }).join("")
      : `<div class="card empty">${emptyMessage}</div>`;

    const searchSummary = state.catalog.query
      ? `<div class="muted">${queryTooShort
        ? `Type ${PRODUCT_SEARCH_MIN_QUERY_LENGTH} or more characters to search the live catalog.`
        : state.loading.products
          ? "Searching the live catalog…"
          : `Showing ${escapeHtml(String(state.catalog.total))} result${state.catalog.total === 1 ? "" : "s"} for “${escapeHtml(state.catalog.query)}”.`}</div>`
      : '<div class="muted">Browse the live Samplero catalog or search by product name, category, or use case.</div>';

    return `
      <div class="stack">
        <div class="hero stack">
          <div class="kicker">Samplero customer access</div>
          <h2 class="hero__title">Buy, unlock, and recover your Samplero products in one polished workspace.</h2>
          <p class="hero__text">From first purchase to reinstall on a new machine, customers can browse releases, complete checkout, reopen downloads, recover licenses, and confirm device activity without dead ends.</p>
          <div class="meta">
            <span class="badge">Secure checkout follow-up</span>
            <span class="badge">Instant downloads</span>
            <span class="badge">Ownership recovery</span>
            <span class="badge">Device approvals</span>
          </div>
          <div class="inline-actions">
            <a class="button-link is-primary" href="${escapeHtml(primaryShortcut.href)}">${escapeHtml(primaryShortcut.label)}</a>
            <a class="button-link" href="${escapeHtml(secondaryShortcut.href)}">${escapeHtml(secondaryShortcut.label)}</a>
          </div>
          <label class="stack" style="gap:8px;">
            <span class="muted">Search products</span>
            <input class="input" type="search" placeholder="Search instruments, bundles, expansions, or keywords" minlength="2" data-store-search-input value="${escapeHtml(state.catalog.query)}" />
          </label>
          ${searchSummary}
        </div>
        <div class="grid grid--cards">
          <div class="callout stack">
            <div class="kicker">Instant access</div>
            <strong>Checkout follow-up, downloads, and licenses stay connected.</strong>
            <div class="muted">Customers can return after purchase and keep every entitlement inside the same workspace.</div>
          </div>
          <div class="callout stack">
            <div class="kicker">Ownership recovery</div>
            <strong>Reinstall on a new machine without digging through old emails.</strong>
            <div class="muted">Use one account to recover keys, approve devices, and reopen the right build fast.</div>
          </div>
          <div class="callout stack">
            <div class="kicker">Premium storefront</div>
            <strong>Commercial presentation up front, support-ready flows after purchase.</strong>
            <div class="muted">The storefront and customer account now feel like one continuous product experience.</div>
          </div>
        </div>
        <div class="grid grid--cards">${cards}</div>
      </div>
    `;
  }

  function renderProductDetail() {
    if (!state.selectedProduct) {
      return `<div class="card empty">${state.loading.product ? "Loading product…" : "Select a product from the catalog."}</div>`;
    }

    const versions = Array.isArray(state.selectedProduct.versions) ? state.selectedProduct.versions : [];
    const latestVersion = versions.find((version) => version.is_latest) || versions[0] || null;
    const productName = getProductDisplayName(state.selectedProduct);
    const productDescription = getProductMarketingDescription(state.selectedProduct);
    const typeLabel = getProductTypeLabel(state.selectedProduct.type);
    const versionsMarkup = versions.length
      ? versions.map((version) => `
          <div class="row">
            <div class="card__header">
              <div>
                <strong>${escapeHtml(version.version || "Version")}</strong>
                <div class="muted">${escapeHtml(version.platform || "all")} • min protocol ${escapeHtml(version.min_license_protocol_version ?? "—")}</div>
              </div>
              <div class="meta">${version.is_latest ? '<span class="badge">latest</span>' : ""}</div>
            </div>
            <div class="muted">${escapeHtml(version.changelog || "Download metadata is available after purchase.")}</div>
          </div>
        `).join("")
      : '<div class="empty">No published versions yet.</div>';

    return `
      <div class="stack">
        <a class="button-link" href="#/store">← Back to catalog</a>
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="meta"><span class="badge">${escapeHtml(typeLabel)}</span></div>
              <h2>${escapeHtml(productName)}</h2>
              <div class="muted">${latestVersion ? `Current release: ${escapeHtml(latestVersion.version || "current")} • ${escapeHtml(latestVersion.platform || "all")}` : "Release details will appear here after publish."}</div>
            </div>
            <div class="price">${escapeHtml(currencyFromCents(state.selectedProduct.price_cents, state.selectedProduct.currency))}</div>
          </div>
          <div class="muted">${escapeHtml(productDescription)}</div>
          <div class="meta">
            <span class="badge">${versions.length} release${versions.length === 1 ? "" : "s"}</span>
            <span class="badge">Secure post-purchase delivery</span>
          </div>
          <div class="card__actions">
            <button class="button is-primary" data-action="order-product" data-product-id="${state.selectedProduct.id}">${getOrderActionLabel()}</button>
            <a class="button-link" href="#/support">Need install or purchase help?</a>
          </div>
        </div>
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">Versions</div>
              <h3>Available builds</h3>
            </div>
          </div>
          <div class="list">${versionsMarkup}</div>
        </div>
      </div>
    `;
  }

  function renderLicenses() {
    if (!isAuthenticated()) {
      return renderProtectedRouteCard(
        "Open your licenses",
        "Sign in to see license keys, activation limits, and pending device confirmations.",
      );
    }

    const content = state.cabinet.licenses.length
      ? state.cabinet.licenses.map((license) => `
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">${escapeHtml(license.product?.name || "License")}</div>
              <h3>${escapeHtml(license.license_key_masked || license.license_key || "License key")}</h3>
            </div>
            <div class="meta">
              <span class="badge">${escapeHtml(license.status || "unknown")}</span>
              ${license.has_pending_activation_claim ? '<span class="badge">pending device confirmation</span>' : ""}
            </div>
          </div>
          <div class="grid grid--two">
            <div class="callout">
              <div class="kicker">License key</div>
              <strong>${escapeHtml(license.license_key || "—")}</strong>
              <div class="muted">Issued ${escapeHtml(formatDate(license.issued_at))}</div>
            </div>
            <div class="callout">
              <div class="kicker">Downloads</div>
              <div class="muted">Primary build: ${escapeHtml(license.primary_download?.archive_name || "Not available")}</div>
              ${license.primary_download ? `<button class="button" data-action="download" data-product-id="${license.product?.id}" data-version-id="${license.primary_download.id}">Generate download URL</button>` : ""}
            </div>
          </div>
          ${renderLicenseSummaryGrid(license)}
          <div class="inline-actions">
            <a class="button-link" href="#${getLicenseRoute(license.id)}">Open license detail</a>
            <a class="button-link" href="#/support">Recovery help</a>
          </div>
          <div class="stack">
            <div class="kicker">Device history</div>
            ${renderActivationHistory(license, { compact: true, limit: 2, showOverview: false })}
          </div>
          ${Array.isArray(license.pending_activation_claims) && license.pending_activation_claims.length ? `
            <div class="stack">
              <div class="kicker">Confirm this device?</div>
              ${license.pending_activation_claims.map((claim) => `
                <div class="callout stack">
                  <div class="tableish">
                    <div class="tableish__row"><span>Device</span><strong>${escapeHtml(claim.device_fingerprint || "—")}</strong></div>
                    <div class="tableish__row"><span>Platform</span><strong>${escapeHtml(claim.platform || "—")}</strong></div>
                    <div class="tableish__row"><span>Risk score</span><strong>${escapeHtml(claim.risk_score ?? 0)}</strong></div>
                    <div class="tableish__row"><span>Expires</span><strong>${escapeHtml(formatDate(claim.expires_at))}</strong></div>
                  </div>
                  <div class="muted">${escapeHtml((claim.risk_reasons || []).join(", ") || "No risk reasons reported.")}</div>
                  <div class="inline-actions">
                    <button class="button is-primary" data-action="approve-claim" data-endpoint="${escapeHtml(claim.approve_endpoint)}">Approve</button>
                    <button class="button is-danger" data-action="reject-claim" data-endpoint="${escapeHtml(claim.reject_endpoint)}">Reject</button>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `).join("")
      : `<div class="card empty">${state.loading.cabinet ? "Loading licenses…" : "No licenses found yet."}</div>`;

    return `<div class="stack"><h2>Your licenses</h2>${content}</div>`;
  }

  function renderLicenseDetail() {
    if (!isAuthenticated()) {
      return renderProtectedRouteCard(
        "Open your license detail",
        "Sign in to inspect one license, manage devices, and complete recovery actions.",
      );
    }

    const licenseId = readLicenseIdFromRoute(state.route);
    const license = findCabinetLicenseById(licenseId);

    if (!license) {
      return `
        <div class="stack">
          <a class="button-link" href="#/account/licenses">← Back to licenses</a>
          <div class="card empty">${state.loading.cabinet ? "Loading license detail…" : "License not found."}</div>
        </div>
      `;
    }

    const latestOrder = getLatestOrder();
    const primaryClaim = Array.isArray(license.pending_activation_claims) ? license.pending_activation_claims[0] : null;

    return `
      <div class="stack">
        <a class="button-link" href="#/account/licenses">← Back to licenses</a>
        <div class="hero stack">
          <div class="kicker">${escapeHtml(license.product?.name || "License")}</div>
          <h2 class="hero__title">${escapeHtml(license.license_key_masked || license.license_key || "License detail")}</h2>
          <p class="hero__text">Use this recovery view to copy the key, inspect devices, revoke old installations, and review pending activation confirmations.</p>
          <div class="inline-actions">
            ${license.primary_download ? `<button class="button is-primary" data-action="download" data-product-id="${license.product?.id}" data-version-id="${license.primary_download.id}">Download latest build</button>` : ""}
            <a class="button-link" href="#/account/downloads">Open my downloads</a>
            <a class="button-link" href="#/support">Open recovery center</a>
          </div>
        </div>
        <div class="grid grid--two">
          <div class="card stack">
            <div class="kicker">License summary</div>
            <div class="tableish">
              <div class="tableish__row"><span>Status</span><strong>${escapeHtml(license.status || "unknown")}</strong></div>
              <div class="tableish__row"><span>Product</span><strong>${escapeHtml(license.product?.name || "—")}</strong></div>
              <div class="tableish__row"><span>License key</span><strong>${escapeHtml(license.license_key || "—")}</strong></div>
              <div class="tableish__row"><span>Issued</span><strong>${escapeHtml(formatDate(license.issued_at))}</strong></div>
              <div class="tableish__row"><span>Expires</span><strong>${escapeHtml(formatDate(license.expires_at))}</strong></div>
            </div>
            ${renderLicenseSummaryGrid(license)}
          </div>
          <div class="card stack">
            <div class="kicker">Recovery shortcuts</div>
            <div class="muted">Jump directly to the next self-serve action for this license.</div>
            <div class="inline-actions">
              <a class="button-link" href="#/account/downloads">All downloads</a>
              <a class="button-link" href="#/account/orders">Order history</a>
              ${latestOrder ? `<a class="button-link" href="#${getOrderRoute(latestOrder.id)}">Resume latest order</a>` : ""}
            </div>
            ${primaryClaim ? `
              <div class="callout stack">
                <div class="kicker">Pending device confirmation</div>
                <strong>${escapeHtml(primaryClaim.device_fingerprint || "Unknown device")}</strong>
                <div class="muted">Platform: ${escapeHtml(primaryClaim.platform || "—")} • Expires ${escapeHtml(formatDate(primaryClaim.expires_at))}</div>
                <div class="inline-actions">
                  <button class="button is-primary" data-action="approve-claim" data-endpoint="${escapeHtml(primaryClaim.approve_endpoint)}">Approve</button>
                  <button class="button is-danger" data-action="reject-claim" data-endpoint="${escapeHtml(primaryClaim.reject_endpoint)}">Reject</button>
                </div>
              </div>
            ` : `<div class="callout muted">No pending activation confirmations for this license.</div>`}
          </div>
        </div>
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">Device history</div>
              <h3>Installations and trust signals</h3>
            </div>
            <div class="inline-actions">
              <a class="button-link" href="#/support">Get recovery help</a>
            </div>
          </div>
          ${renderActivationHistory(license, { showOverview: true })}
        </div>
        ${Array.isArray(license.pending_activation_claims) && license.pending_activation_claims.length ? `
          <div class="card stack">
            <div class="kicker">All pending activation confirmations</div>
            ${license.pending_activation_claims.map((claim) => `
              <div class="callout stack">
                <div class="tableish">
                  <div class="tableish__row"><span>Device</span><strong>${escapeHtml(claim.device_fingerprint || "—")}</strong></div>
                  <div class="tableish__row"><span>Platform</span><strong>${escapeHtml(claim.platform || "—")}</strong></div>
                  <div class="tableish__row"><span>Risk score</span><strong>${escapeHtml(claim.risk_score ?? 0)}</strong></div>
                  <div class="tableish__row"><span>Expires</span><strong>${escapeHtml(formatDate(claim.expires_at))}</strong></div>
                </div>
                <div class="inline-actions">
                  <button class="button is-primary" data-action="approve-claim" data-endpoint="${escapeHtml(claim.approve_endpoint)}">Approve</button>
                  <button class="button is-danger" data-action="reject-claim" data-endpoint="${escapeHtml(claim.reject_endpoint)}">Reject</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderDownloads() {
    if (!isAuthenticated()) {
      return renderProtectedRouteCard(
        "Open your downloads",
        "Sign in to generate secure download URLs for your purchased builds and archives.",
      );
    }

    const content = state.cabinet.downloads.length
      ? state.cabinet.downloads.map((item) => `
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">${escapeHtml(item.product?.type || "download")}</div>
              <h3>${escapeHtml(item.product?.name || "Product")}</h3>
            </div>
            <div class="meta"><span class="badge">${escapeHtml(item.status || "unknown")}</span></div>
          </div>
          <div class="muted">Primary asset: ${escapeHtml(item.primary_download?.archive_name || item.archive_name || "Not available")}</div>
          <div class="list">
            ${(item.downloads || []).map((download) => `
              <div class="callout">
                <div class="card__header">
                  <div>
                    <strong>${escapeHtml(download.archive_name || download.version || "Build")}</strong>
                    <div class="muted">${escapeHtml(download.platform || "all")} • ${escapeHtml(download.version || "latest")}</div>
                  </div>
                  <button class="button" data-action="download" data-product-id="${item.product?.id}" data-version-id="${download.id}">Generate download URL</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("")
      : `<div class="card empty">${state.loading.cabinet ? "Loading downloads…" : "No downloadable purchases yet."}</div>`;

    return `<div class="stack"><h2>Download hub</h2>${content}</div>`;
  }

  function renderOrders() {
    if (!isAuthenticated()) {
      return renderProtectedRouteCard(
        "Open your orders",
        "Sign in to inspect payment status, receipts, and post-purchase next steps.",
      );
    }

    const content = state.cabinet.orders.length
      ? state.cabinet.orders.map((order) => `
        <div class="card stack">
          <div class="card__header">
            <div>
              <div class="kicker">${escapeHtml(order.order_reference || `Order #${order.id}`)}</div>
              <h3>${escapeHtml(order.post_purchase?.headline || "Order")}</h3>
            </div>
            <div class="meta"><span class="badge">${escapeHtml(order.status || "unknown")}</span></div>
          </div>
          <div class="muted">${escapeHtml(order.post_purchase?.message || "Payment and fulfillment events will appear here.")}</div>
          <div class="grid grid--two">
            <div class="callout">
              ${renderReceiptSummary(order)}
              <div class="tableish">
                <div class="tableish__row"><span>Created</span><strong>${escapeHtml(formatDate(order.createdAt))}</strong></div>
                <div class="tableish__row"><span>Paid at</span><strong>${escapeHtml(formatDate(order.paid_at))}</strong></div>
              </div>
            </div>
            <div class="callout">
              <div class="kicker">Receipt</div>
              <div class="list">${renderReceiptLines(order.receipt, order.currency)}</div>
            </div>
          </div>
          <div class="inline-actions">
            <a class="button-link" href="#${getOrderRoute(order.id)}">Open order detail</a>
            ${order.status === "paid" ? '<a class="button-link" href="#/account/downloads">Open my downloads</a><a class="button-link" href="#/account/licenses">Open my licenses</a>' : ''}
          </div>
        </div>
      `).join("")
      : `<div class="card empty">${state.loading.cabinet ? "Loading orders…" : "No orders yet."}</div>`;

    return `<div class="stack"><h2>Order history</h2>${content}</div>`;
  }

  function renderOrderDetail() {
    if (!isAuthenticated()) {
      return renderProtectedRouteCard(
        "Open your order status",
        "Sign in to inspect a specific order, its receipt, and the post-purchase next step.",
      );
    }

    if (!state.selectedOrder) {
      return `
        <div class="stack">
          <a class="button-link" href="#/account/orders">← Back to orders</a>
          <div class="card empty">${state.loading.orderDetail ? "Loading order details…" : "Order not found."}</div>
        </div>
      `;
    }

    const order = state.selectedOrder;
    const delivery = order.delivery_summary || {};
    const emailHint = order.post_purchase?.email_hint || null;

    return `
      <div class="stack">
        <a class="button-link" href="#/account/orders">← Back to orders</a>
        <div class="hero stack">
          <div class="kicker">${escapeHtml(order.order_reference || `Order #${order.id}`)}</div>
          <h2 class="hero__title">${escapeHtml(order.post_purchase?.headline || "Order status")}</h2>
          <p class="hero__text">${escapeHtml(order.post_purchase?.message || "Track this purchase and follow the next delivery step from here.")}</p>
          <div class="inline-actions">
            ${renderOrderCtaButton(order.post_purchase?.primary_cta, "primary")}
            ${renderOrderCtaButton(order.post_purchase?.secondary_cta, "secondary")}
          </div>
        </div>
        <div class="grid grid--two">
          <div class="card stack">
            <div class="kicker">Status snapshot</div>
            <div class="tableish">
              <div class="tableish__row"><span>Status</span><strong>${escapeHtml(order.status || "unknown")}</strong></div>
              <div class="tableish__row"><span>Created</span><strong>${escapeHtml(formatDate(order.createdAt))}</strong></div>
              <div class="tableish__row"><span>Paid at</span><strong>${escapeHtml(formatDate(order.paid_at))}</strong></div>
              <div class="tableish__row"><span>Delivery ready</span><strong>${delivery.ready_for_delivery ? "Yes" : "Not yet"}</strong></div>
            </div>
            ${renderReceiptSummary(order)}
          </div>
          <div class="card stack">
            <div class="kicker">Receipt</div>
            <div class="tableish">
              <div class="tableish__row"><span>Order reference</span><strong>${escapeHtml(order.receipt?.order_reference || order.order_reference || "—")}</strong></div>
              <div class="tableish__row"><span>Total items</span><strong>${escapeHtml(order.receipt?.total_items ?? delivery.total_items ?? 0)}</strong></div>
            </div>
            <div class="list">${renderReceiptLines(order.receipt, order.currency)}</div>
          </div>
        </div>
        <div class="grid grid--two">
          <div class="card stack">
            <div class="kicker">Delivery summary</div>
            <div class="tableish">
              <div class="tableish__row"><span>Plugin items</span><strong>${escapeHtml(delivery.plugin_count ?? 0)}</strong></div>
              <div class="tableish__row"><span>Sample packs</span><strong>${escapeHtml(delivery.sample_pack_count ?? 0)}</strong></div>
              <div class="tableish__row"><span>Licenses</span><strong>${escapeHtml(delivery.license_count ?? 0)}</strong></div>
              <div class="tableish__row"><span>Downloads</span><strong>${escapeHtml(delivery.download_count ?? 0)}</strong></div>
            </div>
          </div>
          ${order.status === "pending"
            ? renderPendingOrderCouponBox(order)
            : `<div class="card stack">
                <div class="kicker">Email & support hints</div>
                <div class="tableish">
                  <div class="tableish__row"><span>Email template</span><strong>${escapeHtml(emailHint?.template_key || "—")}</strong></div>
                  <div class="tableish__row"><span>Email subject</span><strong>${escapeHtml(emailHint?.subject || "—")}</strong></div>
                  <div class="tableish__row"><span>Expect email</span><strong>${emailHint?.should_send ? "Yes" : "No"}</strong></div>
                </div>
                <div class="inline-actions">
                  <a class="button-link" href="#/support">Open recovery center</a>
                  <button class="button" data-action="run-order-cta" data-cta-type="view_order" data-cta-href="${escapeHtml(`${API_BASE}/orders/${order.id}`)}" data-cta-label="Refresh status">Refresh status</button>
                </div>
              </div>`}
        </div>
        ${order.status === "pending" ? `
          <div class="card stack">
            <div class="kicker">Email & support hints</div>
            <div class="tableish">
              <div class="tableish__row"><span>Email template</span><strong>${escapeHtml(emailHint?.template_key || "—")}</strong></div>
              <div class="tableish__row"><span>Email subject</span><strong>${escapeHtml(emailHint?.subject || "—")}</strong></div>
              <div class="tableish__row"><span>Expect email</span><strong>${emailHint?.should_send ? "Yes" : "No"}</strong></div>
            </div>
            <div class="inline-actions">
              <a class="button-link" href="#/support">Open recovery center</a>
              <button class="button" data-action="run-order-cta" data-cta-type="view_order" data-cta-href="${escapeHtml(`${API_BASE}/orders/${order.id}`)}" data-cta-label="Refresh status">Refresh status</button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderSupport() {
    const claimCount = getPendingClaimCount();
    const activeDeviceCount = getActiveDeviceCount();
    const latestOrder = getLatestOrder();
    const recoverableLicense = getRecoverableLicense();
    const nextAction = claimCount > 0
      ? { label: "Review pending device confirmations", href: recoverableLicense ? getLicenseRoute(recoverableLicense.id) : "/account/licenses" }
      : latestOrder?.post_purchase?.primary_cta
        ? latestOrder.post_purchase.primary_cta
        : latestOrder
          ? { label: "Resume latest order", href: `${API_BASE}/orders/${latestOrder.id}`, type: "view_order" }
          : null;

    return `
      <div class="stack">
        <div class="card stack">
          <div class="kicker">Ownership recovery</div>
          <h2>Get back to your purchases, downloads, and activations fast.</h2>
          <p class="muted">Use the Samplero customer portal to reopen recent orders, recover license access, confirm new devices, and see which build is ready for your account — all from one support-ready workspace.</p>
          <div class="inline-actions">
            ${nextAction ? renderOrderCtaButton(nextAction, "primary") : '<a class="button-link is-primary" href="#/store">Explore products</a>'}
            ${!isAuthenticated() ? '<span class="badge">Sign in to unlock account recovery</span>' : ""}
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="stat__label">Products in store</div><div class="stat__value">${state.products.length}</div></div>
          <div class="stat"><div class="stat__label">Your licenses</div><div class="stat__value">${state.cabinet.licenses.length}</div></div>
          <div class="stat"><div class="stat__label">Active devices</div><div class="stat__value">${activeDeviceCount}</div></div>
          <div class="stat"><div class="stat__label">Downloads</div><div class="stat__value">${state.cabinet.downloads.length}</div></div>
          <div class="stat"><div class="stat__label">Pending claims</div><div class="stat__value">${claimCount}</div></div>
        </div>
        <div class="grid grid--two">
          <div class="card stack">
            <h3>Licenses & device recovery</h3>
            <div class="muted">Open your ownership records to copy license keys, inspect device history, revoke old machines, and approve new activation requests with confidence.</div>
            <div class="inline-actions">
              <a class="button-link" href="#/account/licenses">Open my licenses</a>
              ${recoverableLicense ? `<a class="button-link" href="#${getLicenseRoute(recoverableLicense.id)}">Open recommended recovery path</a>` : ""}
            </div>
          </div>
          <div class="card stack">
            <h3>Billing & post-purchase follow-up</h3>
            <div class="muted">Reopen order history to confirm payment status, coupon usage, post-purchase messaging, and which assets should already be unlocked for the customer.</div>
            <div class="inline-actions"><a class="button-link" href="#/account/orders">Open order history</a></div>
          </div>
        </div>
        ${latestOrder ? `
          <div class="card stack">
            <div class="card__header">
              <div>
                <div class="kicker">Recent order</div>
                <h3>${escapeHtml(latestOrder.order_reference || `Order #${latestOrder.id}`)}</h3>
              </div>
              <span class="badge">${escapeHtml(latestOrder.status || "unknown")}</span>
            </div>
            <div class="muted">${escapeHtml(latestOrder.post_purchase?.message || "Open the order to inspect its next step.")}</div>
            <div class="inline-actions">
              <a class="button-link" href="#${getOrderRoute(latestOrder.id)}">Resume latest order</a>
              ${renderOrderCtaButton(latestOrder.post_purchase?.primary_cta, "secondary")}
            </div>
          </div>
        ` : `
          <div class="card stack">
            <div class="kicker">No order history yet</div>
            <h3>Start from the storefront</h3>
            <div class="muted">Create a pending order from any product page, then use order detail and cabinet routes for recovery.</div>
            <div class="inline-actions"><a class="button-link" href="#/store">Open storefront</a></div>
          </div>
        `}
      </div>
    `;
  }

  function renderMain() {
    if (state.route === "/store") return renderStorefront();
    if (state.route.startsWith("/products/")) return renderProductDetail();
    if (readLicenseIdFromRoute(state.route)) return renderLicenseDetail();
    if (state.route === "/account/licenses") return renderLicenses();
    if (state.route === "/account/downloads") return renderDownloads();
    if (readOrderIdFromRoute(state.route)) return renderOrderDetail();
    if (state.route === "/account/orders") return renderOrders();
    if (state.route === "/support") return renderSupport();
    return renderStorefront();
  }

  function render() {
    const pendingClaimCount = getPendingClaimCount();
    const activeDeviceCount = getActiveDeviceCount();

    root.innerHTML = `
      <div class="shell stack">
        <div class="topbar topbar--premium">
          <div class="topbar__main">
            <a class="brand brand--premium" href="#/store">
              <div class="brand__eyebrow">Samplero Customer Access</div>
              <strong>My Samplero</strong>
              <span class="muted">Purchases, downloads, licenses, and recovery — in one place.</span>
            </a>
            <div class="topbar__summary">
              <span class="badge portal-footer__badge">Trusted customer workspace</span>
              <span class="muted">${isAuthenticated() ? `Signed in · ${escapeHtml(state.auth.user?.email || state.auth.user?.username || "customer")}` : "Guest preview · sign in to unlock purchases, downloads, and recovery."}</span>
              <span class="badge">Licenses ${escapeHtml(state.cabinet.licenses.length)}</span>
              <span class="badge">Devices ${escapeHtml(activeDeviceCount)}</span>
              <span class="badge">Pending ${escapeHtml(pendingClaimCount)}</span>
            </div>
          </div>
          <div class="topbar__controls">
            <nav class="nav nav--primary">${renderNav()}</nav>
            ${renderHeaderActions()}
          </div>
        </div>
        ${renderFlash()}
        <div class="layout">
          <section class="stack">${renderMain()}</section>
          <aside class="stack">
            ${renderAuthPanel()}
            <div class="callout stack">
              <div class="kicker">Why customers use it</div>
              <h3>Everything after checkout, in one place</h3>
              <div class="muted">From a brand-new purchase to a clean reinstall months later, the portal keeps orders, builds, licenses, and device approvals tied to the same account.</div>
              <div class="meta">
                <span class="badge">Instant access</span>
                <span class="badge">Secure downloads</span>
                <span class="badge">Order follow-up</span>
                <span class="badge">Device approvals</span>
              </div>
            </div>
          </aside>
        </div>
        ${renderPortalFooter()}
      </div>
    `;
  }

  root.addEventListener("submit", function (event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const kind = form.getAttribute("data-form");
    if (!kind) return;
    event.preventDefault();
    const formData = new FormData(form);
    if (kind === "login") login(formData);
    if (kind === "register") register(formData);
  });

  root.addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "focus-auth") focusAuthPanel();
    if (action === "logout") logout(true);
    if (action === "order-product") createOrder(target.getAttribute("data-product-id"));
    if (action === "download") resolveDownload(target.getAttribute("data-product-id"), target.getAttribute("data-version-id"));
    if (action === "approve-claim") handleClaimDecision(target.getAttribute("data-endpoint"), "Device approved.");
    if (action === "reject-claim") handleClaimDecision(target.getAttribute("data-endpoint"), "Device rejected.");
    if (action === "revoke-activation") revokeActivation(target.getAttribute("data-endpoint"));
    if (action === "redeem-order-coupon") redeemOrderCoupon(target.getAttribute("data-order-id"));
    if (action === "run-order-cta") runOrderCta(target.getAttribute("data-cta-type"), target.getAttribute("data-cta-href"), target.getAttribute("data-cta-label"));
  });

  root.addEventListener("input", function (event) {
    const target = event.target;
    if (!(target instanceof window.HTMLInputElement)) return;
    if (target.hasAttribute("data-store-search-input")) {
      scheduleProductSearch(target.value);
      return;
    }
    const orderId = target.getAttribute("data-order-coupon-order-id");
    if (!orderId) return;
    setOrderCouponCode(orderId, target.value);
  });

  window.addEventListener("hashchange", handleHashChange);

  async function bootstrap() {
    render();
    await loadProducts();
    if (isAuthenticated()) {
      await refreshUserProfile();
      await loadCabinet();
    }
    await handleHashChange();
  }

  bootstrap();
})();