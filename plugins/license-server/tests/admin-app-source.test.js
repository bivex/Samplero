const fs = require("node:fs");
const path = require("node:path");

describe("license-server admin App.jsx regression contract", () => {
  const appPath = path.join(__dirname, "../admin/src/pages/App.jsx");

  const readSource = () => fs.readFileSync(appPath, "utf8");

  it("uses the plugin API namespace instead of the admin SPA fallback namespace", () => {
    const source = readSource();

    expect(source).toContain('const ADMIN_API_BASE = "/license-server";');
    expect(source).not.toContain('const ADMIN_API_BASE = "/admin/license-server";');
    expect(source).toContain('get(`${ADMIN_API_BASE}/licenses`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/activations`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/products?limit=50&offset=0`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/coupons?limit=50&offset=0');
    expect(source).toContain('get(`${ADMIN_API_BASE}/orders?status=pending&limit=1&offset=0`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/activation-claims?status=pending_confirmation&limit=1&offset=0`)');
  });

  it("loads activation claims with pagination, moderation actions, and dashboard pending counts", () => {
    const source = readSource();

    expect(source).toContain("const CLAIMS_PAGE_SIZE = 10;");
    expect(source).toContain("const CLAIM_SORT_OPTIONS = [");
    expect(source).toContain('const response = await get(`${ADMIN_API_BASE}/activation-claims?${params.toString()}`);');
    expect(source).toContain('params.set("search", search.trim());');
    expect(source).toContain('params.set("sortBy", sortBy);');
    expect(source).toContain('params.set("sortDir", sortDir);');
    expect(source).toContain('items: toList(response, "claims"),');
    expect(source).toContain('total: toTotal(response, "claims"),');
    expect(source).toContain('await post(`${ADMIN_API_BASE}/activation-claims/${claim.id}/approve`)');
    expect(source).toContain('await post(`${ADMIN_API_BASE}/activation-claims/${claim.id}/reject`, { reason: reason || undefined });');
    expect(source).toContain('<NavLink to="claims" style={linkStyle}>Claims</NavLink>');
    expect(source).toContain('<Route path="claims" element={<ClaimsPage />} />');
    expect(source).toContain('const pendingClaims = toTotal(pendingClaimsRes, "claims");');
    expect(source).toContain('["Pending claims", stats.pendingClaims]');
  });

  it("loads orders with pagination, status filters, and admin actions", () => {
    const source = readSource();

    expect(source).toContain("const ORDERS_PAGE_SIZE = 10;");
    expect(source).toContain("const ORDER_SORT_OPTIONS = [");
    expect(source).toContain('const response = await get(`${ADMIN_API_BASE}/orders?${params.toString()}`);');
    expect(source).toContain('items: toList(response, "orders"),');
    expect(source).toContain('total: toTotal(response, "orders"),');
    expect(source).toContain('placeholder="Reference, email, payment"');
    expect(source).toContain('sortBy: state.sortBy,');
    expect(source).toContain('sortDir: state.sortDir,');
    expect(source).toContain('await post(`${ADMIN_API_BASE}/orders/${order.id}/mark-paid`, {');
    expect(source).toContain('await post(`${ADMIN_API_BASE}/orders/${order.id}/refund`, { reason: reason || undefined });');
    expect(source).toContain('<NavLink to="orders" style={linkStyle}>Orders</NavLink>');
    expect(source).toContain('<Route path="orders" element={<OrdersPage />} />');
  });

  it("loads licenses from the plugin API and expects a direct list payload", () => {
    const source = readSource();

    expect(source).toContain("const LICENSES_PAGE_SIZE = 10;");
    expect(source).toContain("const LICENSE_STATUS_OPTIONS = [");
    expect(source).toContain('const response = await get(`${ADMIN_API_BASE}/licenses?${params.toString()}`);');
    expect(source).toContain('placeholder="Key, email, product"');
    expect(source).toContain('items: toList(response, "licenses"),');
    expect(source).toContain('total: toTotal(response, "licenses"),');
    expect(source).toContain('formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })');
    expect(source).toContain('empty="No licenses found." isEmpty={state.items.length === 0}');
    expect(source).toContain('>Prev<');
    expect(source).toContain('>Next<');
  });

  it("loads activations with limit/offset pagination and exposes prev/next controls", () => {
    const source = readSource();

    expect(source).toContain("const ACTIVATIONS_PAGE_SIZE = 10;");
    expect(source).toContain("const ACTIVATION_STATUS_OPTIONS = [");
    expect(source).toContain('const response = await get(`${ADMIN_API_BASE}/activations?${params.toString()}`);');
    expect(source).toContain('placeholder="Device, user, product"');
    expect(source).toContain('items: toList(response, "activations"),');
    expect(source).toContain('total: toTotal(response, "activations"),');
    expect(source).toContain('formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })');
    expect(source).toContain('>Prev<');
    expect(source).toContain('>Next<');
  });

  it("shows the empty state only when a list is actually empty", () => {
    const source = readSource();

    expect(source).toContain("const DataState = ({ loading, error, empty, isEmpty = false, children }) => {");
    expect(source).toContain("if (isEmpty && empty) return <p style={mutedTextStyle}>{empty}</p>;");
    expect(source).toContain('empty="No licenses found." isEmpty={state.items.length === 0}');
    expect(source).toContain('empty="No activations found." isEmpty={state.items.length === 0}');
    expect(source).toContain('empty="No activation claims found." isEmpty={state.items.length === 0}');
    expect(source).toContain('empty="No orders found." isEmpty={state.items.length === 0}');
    expect(source).toContain('empty="No products found." isEmpty={state.items.length === 0}');
  });

  it("uses Strapi theme tokens instead of hardcoded light-theme colors", () => {
    const source = readSource();

    expect(source).toContain("const themeColors = {");
    expect(source).toContain('surface: "var(--strapi-colors-neutral0)",');
    expect(source).toContain('surfaceRaised: "var(--strapi-colors-neutral100)",');
    expect(source).toContain('text: "var(--strapi-colors-neutral800)",');
    expect(source).toContain('textMuted: "var(--strapi-colors-neutral600)",');
    expect(source).toContain('primary: "var(--strapi-colors-primary600)",');
    expect(source).toContain('danger: "var(--strapi-colors-danger600)",');
    expect(source).not.toContain('background: "#fff"');
    expect(source).not.toContain('color: "#32324d"');
    expect(source).not.toContain('color: "#666687"');
    expect(source).not.toContain('color: "#b42318"');
  });

  it("computes pending order totals from paginated or total-shaped responses", () => {
    const source = readSource();

    expect(source).toContain("const toTotal = (response, key) => {");
    expect(source).toContain('if (typeof data?.meta?.pagination?.total === "number") return data.meta.pagination.total;');
    expect(source).toContain('if (typeof data?.total === "number") return data.total;');
    expect(source).toContain('const pendingOrders = toTotal(pendingOrdersRes, "orders");');
  });

  it("shares common search and sort query wiring across paginated admin lists", () => {
    const source = readSource();

    expect(source).toContain('const applyListQueryParams = ({ params, search, status, sortBy, sortDir, defaultSort, statusAllValue = "all" }) => {');
    expect(source).toContain('params.set("search", search.trim());');
    expect(source).toContain('params.set("status", status);');
    expect(source).toContain('params.set("sortBy", sortBy);');
    expect(source).toContain('params.set("sortDir", sortDir);');
  });

  it("syncs operational list state with URL params and exposes support deep links", () => {
    const source = readSource();

    expect(source).toContain('import { Link, Navigate, NavLink, Route, Routes, useSearchParams } from "react-router-dom";');
    expect(source).toContain('const buildAdminListHref = ({ path, search, status, sortBy, sortDir, offset = 0, defaultSort, defaultStatus = "all" }) => {');
    expect(source).toContain('const buildSupportHref = (query) => {');
    expect(source).toContain('const useListPageState = ({ pageSize, defaultSort, statusOptions, sortOptions, defaultStatus = "all" }) => {');
    expect(source).toContain('const [state, setState] = useListPageState({ pageSize: LICENSES_PAGE_SIZE, defaultSort: DEFAULT_LICENSE_SORT, statusOptions: LICENSE_STATUS_OPTIONS, sortOptions: LICENSE_SORT_OPTIONS });');
    expect(source).toContain('const [state, setState] = useListPageState({ pageSize: ACTIVATIONS_PAGE_SIZE, defaultSort: DEFAULT_ACTIVATION_SORT, statusOptions: ACTIVATION_STATUS_OPTIONS, sortOptions: ACTIVATION_SORT_OPTIONS });');
    expect(source).toContain('const [state, setState] = useListPageState({ pageSize: ORDERS_PAGE_SIZE, defaultSort: DEFAULT_ORDER_SORT, statusOptions: ORDER_STATUS_OPTIONS, sortOptions: ORDER_SORT_OPTIONS });');
    expect(source).toContain('const [state, setState] = useListPageState({ pageSize: CLAIMS_PAGE_SIZE, defaultSort: DEFAULT_CLAIM_SORT, statusOptions: CLAIM_STATUS_OPTIONS, sortOptions: CLAIM_SORT_OPTIONS, defaultStatus: "pending_confirmation" });');
    expect(source).toContain('to={buildSupportHref(state.search)}');
  });

  it("keeps inline detail panels for admin drill-downs across operational lists", () => {
    const source = readSource();

    expect(source).toContain('const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");');
    expect(source).toContain('const InlineDetailsRow = ({ colSpan, title, children }) => (');
    expect(source).toContain('const [selectedLicenseId, setSelectedLicenseId] = React.useState(null);');
    expect(source).toContain('const [selectedActivationId, setSelectedActivationId] = React.useState(null);');
    expect(source).toContain('const [selectedOrderId, setSelectedOrderId] = React.useState(null);');
    expect(source).toContain('const [selectedClaimId, setSelectedClaimId] = React.useState(null);');
    expect(source).toContain('{isSelected ? "Hide" : "View"}');
    expect(source).toContain('title={`License details • ${license.uid}`}');
    expect(source).toContain('title={`Activation details • #${activation.id}`}');
    expect(source).toContain('title={`Order details • ${order.order_reference || `order #${order.id}`}`}');
    expect(source).toContain('title={`Claim details • #${claim.id}`}');
  });

  it("supports product and plugin-version management in the admin products screen", () => {
    const source = readSource();

    expect(source).toContain("const PRODUCT_TYPE_OPTIONS = [");
    expect(source).toContain("const VERSION_PLATFORM_OPTIONS = [");
    expect(source).toContain('const [selectedProductId, setSelectedProductId] = React.useState(null);');
    expect(source).toContain('const [versionLists, setVersionLists] = React.useState({});');
    expect(source).toContain('const response = await get(`${ADMIN_API_BASE}/products/${productId}/versions`);');
    expect(source).toContain('await post(`${ADMIN_API_BASE}/products/${productId}/versions`, payload);');
    expect(source).toContain('await put(`${ADMIN_API_BASE}/products/${productId}/versions/${versionForm.versionId}`, payload);');
    expect(source).toContain('await del(`${ADMIN_API_BASE}/products/${productId}/versions/${version.id}`);');
    expect(source).toContain('subtitle="Create products, update pricing, and manage downloadable versions."');
    expect(source).toContain('{editingProductId ? "Save product" : "Create product"}');
    expect(source).toContain('{isEditingVersion ? "Save version" : "Create version"}');
    expect(source).toContain('title={`Product details • ${product.name}`}');
  });

  it("adds a coupons workspace for full-discount checkout codes", () => {
    const source = readSource();

    expect(source).toContain("const COUPON_STATUS_OPTIONS = [");
    expect(source).toContain("const EMPTY_COUPON_FORM = {");
    expect(source).toContain("const serializeCouponForm = (form) => {");
    expect(source).toContain("const CouponsPage = () => {");
    expect(source).toContain('await post(`${ADMIN_API_BASE}/coupons`, payload);');
    expect(source).toContain('await put(`${ADMIN_API_BASE}/coupons/${editingCouponId}`, payload);');
    expect(source).toContain('<NavLink to="coupons" style={linkStyle}>Coupons</NavLink>');
    expect(source).toContain('<Route path="coupons" element={<CouponsPage />} />');
    expect(source).toContain('subtitle="Create admin-issued full-discount coupons that instantly mark orders as paid."');
  });

  it("adds a support workspace with cross-entity search and audit trail summaries", () => {
    const source = readSource();

    expect(source).toContain("const SUPPORT_PAGE_SIZE = 5;");
    expect(source).toContain("const buildSupportSearchParams = ({ query, sortBy, sortDir, status }) => {");
    expect(source).toContain("const buildLicenseAuditTrail = (license) =>");
    expect(source).toContain("const buildActivationAuditTrail = (activation) =>");
    expect(source).toContain("const buildOrderAuditTrail = (order) =>");
    expect(source).toContain("const buildClaimAuditTrail = (claim) =>");
    expect(source).toContain("const AuditTrail = ({ events = [], empty = \"No audit events available.\" }) => (");
    expect(source).toContain("const SupportPage = () => {");
    expect(source).toContain('title="Support"');
    expect(source).toContain('get(`${ADMIN_API_BASE}/licenses?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "issued_at", sortDir: "desc" })}`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/activations?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "last_checkin", sortDir: "desc" })}`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/orders?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "createdAt", sortDir: "desc" })}`)');
    expect(source).toContain('get(`${ADMIN_API_BASE}/activation-claims?${buildSupportSearchParams({ query: normalizedQuery, status: "all", sortBy: "createdAt", sortDir: "desc" })}`)');
    expect(source).toContain("const buildSupportCouponPayload = (order) => {");
    expect(source).toContain('const createdCoupon = unwrap(await post(`${ADMIN_API_BASE}/coupons`, payload));');
    expect(source).toContain('Support coupon helper');
    expect(source).toContain('Customer enters this code from the pending order detail page.');
    expect(source).toContain('const [searchParams, setSearchParams] = useSearchParams();');
    expect(source).toContain('setSearchParams(new URLSearchParams({ q: normalizedQuery }), { replace: true });');
    expect(source).toContain('Unified support workspace');
    expect(source).toContain('to={buildAdminListHref({ path: "../licenses", search: license.uid, defaultSort: DEFAULT_LICENSE_SORT })}');
    expect(source).toContain('to={buildAdminListHref({ path: "../activations", search: license.uid, defaultSort: DEFAULT_ACTIVATION_SORT })}');
    expect(source).toContain('to={buildAdminListHref({ path: "../orders", search: order.order_reference || order.payment_id || order.user?.email || String(order.id), defaultSort: DEFAULT_ORDER_SORT })}');
    expect(source).toContain('to={buildAdminListHref({ path: "../claims", search: String(claim.id), status: claim.status || "all", defaultSort: DEFAULT_CLAIM_SORT, defaultStatus: "pending_confirmation" })}');
    expect(source).toContain('Search across licenses, activations, orders, and claims to build a customer overview and audit trail.');
    expect(source).toContain('<NavLink to="support" style={linkStyle}>Support</NavLink>');
    expect(source).toContain('<Route path="support" element={<SupportPage />} />');
  });
});