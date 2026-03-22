const fs = require("node:fs");
const path = require("node:path");

const readRootFile = (relativePath) =>
  fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");

describe("customer portal source contract", () => {
  it("documents the chosen static customer-ui architecture", () => {
    const source = readRootFile("docs/customer-ui-architecture.md");

    expect(source).toContain("static customer portal");
    expect(source).toContain("public/customer/");
    expect(source).toContain("#/account/licenses");
    expect(source).toContain("#/account/licenses/:id");
    expect(source).toContain("#/account/orders/:id");
    expect(source).toContain("POST /api/license-server/orders");
    expect(source).toContain("POST /api/license-server/me/orders/:id/redeem-coupon");
  });

  it("ships a customer portal wired to auth, cabinet, orders, and downloads", () => {
    const indexSource = readRootFile("public/customer/index.html");
    const appSource = readRootFile("public/customer/app.js");
    const stylesSource = readRootFile("public/customer/styles.css");

    expect(indexSource).toContain("Samplero Customer Portal");
    expect(indexSource).toContain('./vendor/toastify.css');
    expect(indexSource).toContain('./vendor/toastify.js');
    expect(appSource).toContain('const API_BASE = "/api/license-server";');
    expect(appSource).toContain('const AUTH_LOCAL_ENDPOINT = "/api/auth/local";');
    expect(appSource).toContain('const AUTH_REGISTER_ENDPOINT = "/api/auth/local/register";');
    expect(appSource).toContain('request(`${API_BASE}/me/licenses`, { auth: true })');
    expect(appSource).toContain('request(`${API_BASE}/me/downloads`, { auth: true })');
    expect(appSource).toContain('request(`${API_BASE}/me/orders`, { auth: true })');
    expect(appSource).toContain('request(`${API_BASE}/orders`, {');
    expect(appSource).toContain('request(`${API_BASE}/me/orders/${encodeURIComponent(orderId)}/redeem-coupon`, {');
    expect(appSource).toContain('pending_activation_claims');
    expect(appSource).toContain('activations_count');
    expect(appSource).toContain('active_activations_count');
    expect(appSource).toContain('revoke-activation');
    expect(appSource).toContain('revokeActivation(');
    expect(appSource).toContain('redeemOrderCoupon(');
    expect(appSource).toContain('redirectAfterAuth');
    expect(appSource).toContain('renderLicenseDetail()');
    expect(appSource).toContain('renderPendingOrderCouponBox(');
    expect(appSource).toContain('renderReceiptSummary(');
    expect(appSource).toContain('getLicenseRoute(');
    expect(appSource).toContain('readLicenseIdFromRoute(');
    expect(appSource).toContain('renderOrderDetail()');
    expect(appSource).toContain('runOrderCta(');
    expect(appSource).toContain('delivery_summary');
    expect(appSource).toContain('renderReceiptLines(');
    expect(appSource).toContain('resolveDownload(');
    expect(appSource).toContain('handleClaimDecision(');
    expect(appSource).toContain('focusAuthPanel()');
    expect(appSource).toContain('getProductDisplayName(');
    expect(appSource).toContain('getProductMarketingDescription(');
    expect(appSource).toContain('getOrderActionLabel()');
    expect(appSource).toContain('data-action="focus-auth"');
    expect(appSource).toContain('autocomplete="username"');
    expect(appSource).toContain('autocomplete="current-password"');
    expect(appSource).toContain('autocomplete="new-password"');
    expect(appSource).toContain('Samplero customer access');
    expect(appSource).toContain('Trusted customer workspace');
    expect(appSource).toContain('window.Toastify');
    expect(stylesSource).toContain('.input, .field input, .field select');
    expect(stylesSource).toContain(':focus-visible');
  });
});