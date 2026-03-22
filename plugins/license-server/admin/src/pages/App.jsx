import React from "react";
import { Link, Navigate, NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import { useFetchClient, useNotification } from "@strapi/strapi/admin";

const ADMIN_API_BASE = "/license-server";
const themeColors = {
  surface: "var(--strapi-colors-neutral0)",
  surfaceRaised: "var(--strapi-colors-neutral100)",
  border: "var(--strapi-colors-neutral150)",
  borderStrong: "var(--strapi-colors-neutral200)",
  text: "var(--strapi-colors-neutral800)",
  textMuted: "var(--strapi-colors-neutral600)",
  primary: "var(--strapi-colors-primary600)",
  danger: "var(--strapi-colors-danger600)",
  dangerSoft: "var(--strapi-colors-danger100)",
  dangerBorder: "var(--strapi-colors-danger200)",
  inverseText: "var(--strapi-colors-buttonNeutral0, #ffffff)",
};
const pageStyle = { padding: 24, display: "grid", gap: 16 };
const cardGridStyle = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" };
const cardStyle = { border: `1px solid ${themeColors.border}`, borderRadius: 12, padding: 16, background: themeColors.surface };
const navStyle = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 };
const listFooterStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const linkStyle = ({ isActive }) => ({ padding: "8px 12px", borderRadius: 8, textDecoration: "none", color: isActive ? themeColors.inverseText : themeColors.text, background: isActive ? themeColors.primary : themeColors.surfaceRaised, border: `1px solid ${isActive ? themeColors.primary : themeColors.border}`, fontWeight: 600 });
const tableStyle = { width: "100%", borderCollapse: "collapse", background: themeColors.surface, border: `1px solid ${themeColors.border}`, borderRadius: 12, overflow: "hidden" };
const cellStyle = { borderBottom: `1px solid ${themeColors.borderStrong}`, padding: "12px 10px", textAlign: "left", color: themeColors.text };
const mutedTextStyle = { color: themeColors.textMuted, fontSize: 14 };
const buttonStyle = { padding: "6px 10px", borderRadius: 8, border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text, cursor: "pointer" };
const buttonLinkStyle = { ...buttonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" };
const disabledButtonStyle = { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" };
const dangerButtonStyle = { ...buttonStyle, borderColor: themeColors.dangerBorder, background: themeColors.dangerSoft, color: themeColors.danger };
const selectStyle = { ...buttonStyle, minWidth: 160 };
const inputStyle = { ...buttonStyle, minWidth: 220 };
const LICENSES_PAGE_SIZE = 10;
const ACTIVATIONS_PAGE_SIZE = 10;
const ORDERS_PAGE_SIZE = 10;
const CLAIMS_PAGE_SIZE = 10;
const SUPPORT_PAGE_SIZE = 5;
const SORT_DIRECTION_OPTIONS = [
  { value: "asc", label: "Asc" },
  { value: "desc", label: "Desc" },
];
const DEFAULT_LICENSE_SORT = { by: "id", dir: "asc" };
const DEFAULT_ACTIVATION_SORT = { by: "id", dir: "asc" };
const DEFAULT_ORDER_SORT = { by: "createdAt", dir: "desc" };
const DEFAULT_CLAIM_SORT = { by: "createdAt", dir: "desc" };
const LICENSE_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
];
const ACTIVATION_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
];
const LICENSE_SORT_OPTIONS = [
  { value: "id", label: "ID" },
  { value: "user", label: "User" },
  { value: "product", label: "Product" },
  { value: "status", label: "Status" },
  { value: "activations", label: "Activations" },
  { value: "issued_at", label: "Issued at" },
];
const ACTIVATION_SORT_OPTIONS = [
  { value: "id", label: "ID" },
  { value: "device", label: "Device" },
  { value: "user", label: "User" },
  { value: "product", label: "Product" },
  { value: "status", label: "Status" },
  { value: "last_checkin", label: "Last check-in" },
];
const ORDER_SORT_OPTIONS = [
  { value: "createdAt", label: "Created" },
  { value: "customer", label: "Customer" },
  { value: "status", label: "Status" },
  { value: "total_amount_cents", label: "Amount" },
  { value: "reference", label: "Reference" },
];
const CLAIM_SORT_OPTIONS = [
  { value: "createdAt", label: "Created" },
  { value: "owner", label: "Owner" },
  { value: "license", label: "License" },
  { value: "risk_score", label: "Risk" },
  { value: "status", label: "Status" },
  { value: "expires_at", label: "Expires" },
];
const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
];
const PRODUCT_TYPE_OPTIONS = [
  { value: "plugin", label: "Plugin" },
  { value: "sample_pack", label: "Sample pack" },
];
const PRODUCT_CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
];
const VERSION_PLATFORM_OPTIONS = [
  { value: "all", label: "All platforms" },
  { value: "win", label: "Windows" },
  { value: "mac", label: "macOS" },
  { value: "linux", label: "Linux" },
];
const CLAIM_STATUS_OPTIONS = [
  { value: "pending_confirmation", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "all", label: "All statuses" },
];
const COUPON_STATUS_OPTIONS = [
  { value: "all", label: "All coupons" },
  { value: "redeemable", label: "Redeemable" },
  { value: "inactive", label: "Inactive" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Exhausted" },
];
const EMPTY_PRODUCT_FORM = {
  name: "",
  type: "plugin",
  description: "",
  price_cents: "",
  currency: "USD",
  is_active: true,
};
const EMPTY_COUPON_FORM = {
  code: "",
  is_active: true,
  max_redemptions: "",
  starts_at: "",
  expires_at: "",
  notes: "",
};
const EMPTY_VERSION_FORM = {
  version: "",
  platform: "all",
  build_hash: "",
  min_license_protocol_version: "1",
  file_size_bytes: "",
  download_url: "",
  changelog: "",
  is_latest: false,
};

const unwrap = (response) => response?.data ?? response ?? {};
const toList = (response, key) => {
  const data = unwrap(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
};

const toTotal = (response, key) => {
  const data = unwrap(response);
  if (typeof data?.meta?.pagination?.total === "number") return data.meta.pagination.total;
  if (typeof data?.total === "number") return data.total;
  return toList(response, key).length;
};

const formatPaginationSummary = ({ offset = 0, limit = 0, total = 0, count = 0 }) => {
  if (!total || !count) return "Showing 0 results";
  const start = offset + 1;
  const end = Math.min(offset + count, total);
  return `Showing ${start}-${end} of ${total}`;
};

const formatMoney = (amountCents, currency = "USD") => {
  if (typeof amountCents !== "number") return "-";
  return `$${(amountCents / 100).toFixed(2)} ${currency}`;
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");
const getDateTimestamp = (value) => {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};
const getDisplayText = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) || "-";
const buildAuditTimeline = (events) =>
  (events || [])
    .filter((event) => event?.at)
    .sort((left, right) => getDateTimestamp(right.at) - getDateTimestamp(left.at));
const buildSupportSearchParams = ({ query, sortBy, sortDir, status }) => {
  const params = new URLSearchParams({
    limit: String(SUPPORT_PAGE_SIZE),
    offset: "0",
  });

  if (query?.trim()) {
    params.set("search", query.trim());
  }

  if (status && status !== "all") {
    params.set("status", status);
  }

  if (sortBy) {
    params.set("sortBy", sortBy);
  }

  if (sortDir) {
    params.set("sortDir", sortDir);
  }

  return params.toString();
};
const buildLicenseAuditTrail = (license) =>
  buildAuditTimeline([
    {
      label: "Issued",
      at: license.issued_at || license.createdAt,
      description: `${license.product?.name || "Product"} • ${getDisplayText(license.user?.email, license.user?.username)}`,
    },
    license.revoked_at
      ? {
          label: "Revoked",
          at: license.revoked_at,
          description: "License access revoked",
        }
      : null,
    license.expires_at
      ? {
          label: "Expires",
          at: license.expires_at,
          description: "Scheduled expiration",
        }
      : null,
  ]);
const buildActivationAuditTrail = (activation) =>
  buildAuditTimeline([
    {
      label: "Activated",
      at: activation.activated_at || activation.createdAt,
      description: getDisplayText(activation.device_fingerprint, activation.certificate_serial),
    },
    activation.last_checkin
      ? {
          label: "Last check-in",
          at: activation.last_checkin,
          description: [activation.platform, activation.plugin_version].filter(Boolean).join(" • ") || "Heartbeat received",
        }
      : null,
    activation.revoked_at
      ? {
          label: "Revoked",
          at: activation.revoked_at,
          description: "Device activation revoked",
        }
      : null,
  ]);
const buildOrderAuditTrail = (order) =>
  buildAuditTimeline([
    {
      label: "Created",
      at: order.createdAt,
      description: `${formatMoney(order.total_amount_cents, order.currency)} • ${order.order_reference || `order #${order.id}`}`,
    },
    order.status === "paid" && order.updatedAt
      ? {
          label: "Marked paid",
          at: order.updatedAt,
          description: order.payment_id || "Payment captured / confirmed",
        }
      : null,
    order.status === "refunded" && order.updatedAt
      ? {
          label: "Refunded",
          at: order.updatedAt,
          description: order.refund_reason || "Refund issued",
        }
      : null,
    order.status === "failed" && order.updatedAt
      ? {
          label: "Failed",
          at: order.updatedAt,
          description: "Order marked failed",
        }
      : null,
  ]);
const buildClaimAuditTrail = (claim) =>
  buildAuditTimeline([
    {
      label: "Created",
      at: claim.created_at || claim.createdAt,
      description: getDisplayText(claim.device_fingerprint, claim.machine_id, claim.license?.uid),
    },
    claim.approved_at
      ? {
          label: "Approved",
          at: claim.approved_at,
          description: claim.approved_by_user?.email || (claim.approved_by ? `By user #${claim.approved_by}` : "Claim approved"),
        }
      : null,
    claim.rejected_at
      ? {
          label: "Rejected",
          at: claim.rejected_at,
          description: claim.rejection_reason || "Claim rejected",
        }
      : null,
    claim.expires_at
      ? {
          label: "Expires",
          at: claim.expires_at,
          description: claim.status === "pending_confirmation" ? "Pending owner/admin review" : "Claim expiry recorded",
        }
      : null,
  ]);
const resolveSupportIdentity = ({ licenses = [], activations = [], orders = [], claims = [] }) =>
  getDisplayText(
    licenses[0]?.user?.email,
    licenses[0]?.user?.username,
    activations[0]?.license?.user?.email,
    activations[0]?.license?.user?.username,
    orders[0]?.user?.email,
    orders[0]?.user?.username,
    claims[0]?.owner_user?.email,
    claims[0]?.license?.user?.email,
  );
const toQueryString = (params) => {
  const query = params.toString();
  return query ? `?${query}` : "";
};
const parsePositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
};
const normalizeAllowedOption = (value, options, fallback) => (options.includes(value) ? value : fallback);
const createListPageInitialState = ({ searchParams, pageSize, defaultSort, defaultStatus = "all", statusOptions, sortOptions }) => ({
  loading: true,
  error: "",
  items: [],
  total: 0,
  limit: pageSize,
  offset: parsePositiveInt(searchParams.get("offset"), 0),
  search: searchParams.get("search") || "",
  status: normalizeAllowedOption(searchParams.get("status"), statusOptions.map((option) => option.value), defaultStatus),
  sortBy: normalizeAllowedOption(searchParams.get("sortBy"), sortOptions.map((option) => option.value), defaultSort.by),
  sortDir: normalizeAllowedOption(searchParams.get("sortDir"), SORT_DIRECTION_OPTIONS.map((option) => option.value), defaultSort.dir),
});
const buildListLocationSearchParams = ({ search, status, sortBy, sortDir, offset = 0, defaultSort, defaultStatus = "all" }) => {
  const params = new URLSearchParams();

  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (status !== defaultStatus) {
    params.set("status", status);
  }

  if (sortBy !== defaultSort.by || sortDir !== defaultSort.dir) {
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
  }

  if (offset > 0) {
    params.set("offset", String(offset));
  }

  return params;
};
const buildAdminListHref = ({ path, search, status, sortBy, sortDir, offset = 0, defaultSort, defaultStatus = "all" }) => {
  const params = buildListLocationSearchParams({
    search,
    status: status ?? defaultStatus,
    sortBy: sortBy ?? defaultSort.by,
    sortDir: sortDir ?? defaultSort.dir,
    offset,
    defaultSort,
    defaultStatus,
  });
  return `${path}${toQueryString(params)}`;
};
const buildSupportHref = (query) => {
  const params = new URLSearchParams();

  if (query?.trim()) {
    params.set("q", query.trim());
  }

  return `../support${toQueryString(params)}`;
};
const formatSupportMatchSummary = ({ items = [], total = 0 }) => {
  if (!total) return "0 matched";
  if (total > items.length) return `Showing ${items.length} of ${total}`;
  return `${total} matched`;
};
const useListPageState = ({ pageSize, defaultSort, statusOptions, sortOptions, defaultStatus = "all" }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = React.useState(() => createListPageInitialState({
    searchParams,
    pageSize,
    defaultSort,
    defaultStatus,
    statusOptions,
    sortOptions,
  }));
  const currentParams = searchParams.toString();

  React.useEffect(() => {
    const nextParams = buildListLocationSearchParams({
      search: state.search,
      status: state.status,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      offset: state.offset,
      defaultSort,
      defaultStatus,
    });

    if (nextParams.toString() !== currentParams) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [currentParams, defaultSort, defaultStatus, setSearchParams, state.offset, state.search, state.sortBy, state.sortDir, state.status]);

  return [state, setState];
};
const toInputValue = (value) => (value === undefined || value === null ? "" : String(value));
const parseOptionalInt = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const serializeProductForm = (form) => ({
  name: form.name.trim(),
  type: form.type,
  description: form.description.trim() || undefined,
  price_cents: parseOptionalInt(form.price_cents) ?? 0,
  currency: form.currency,
  is_active: Boolean(form.is_active),
});
const serializeVersionForm = (form) => {
  const payload = {
    version: form.version.trim(),
    platform: form.platform,
    is_latest: Boolean(form.is_latest),
  };

  if (form.build_hash.trim()) payload.build_hash = form.build_hash.trim();
  if (form.download_url.trim()) payload.download_url = form.download_url.trim();
  if (form.changelog.trim()) payload.changelog = form.changelog.trim();

  const minProtocol = parseOptionalInt(form.min_license_protocol_version);
  if (minProtocol !== undefined) payload.min_license_protocol_version = minProtocol;

  const fileSize = parseOptionalInt(form.file_size_bytes);
  if (fileSize !== undefined) payload.file_size_bytes = fileSize;

  return payload;
};
const serializeCouponForm = (form) => {
  const payload = {
    code: form.code.trim(),
    is_active: Boolean(form.is_active),
    covers_full_amount: true,
  };

  const maxRedemptions = parseOptionalInt(form.max_redemptions);
  if (maxRedemptions !== undefined) payload.max_redemptions = maxRedemptions;
  if (form.starts_at.trim()) payload.starts_at = form.starts_at.trim();
  if (form.expires_at.trim()) payload.expires_at = form.expires_at.trim();
  if (form.notes.trim()) payload.notes = form.notes.trim();

  return payload;
};
const buildSupportCouponCode = (order) => `SUP-${String(order?.id || "ORDER")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const buildSupportCouponPayload = (order) => {
  const customerLabel = getDisplayText(order?.user?.email, order?.user?.username, `user #${order?.user?.id || "unknown"}`);
  return {
    code: buildSupportCouponCode(order),
    is_active: true,
    covers_full_amount: true,
    max_redemptions: 1,
    notes: `Support recovery coupon for ${order?.order_reference || `order #${order?.id}`} (${customerLabel})`,
  };
};

const applyListQueryParams = ({ params, search, status, sortBy, sortDir, defaultSort, statusAllValue = "all" }) => {
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (status && status !== statusAllValue) {
    params.set("status", status);
  }

  if (sortBy !== defaultSort.by || sortDir !== defaultSort.dir) {
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
  }
};

const PageShell = ({ title, subtitle, actions, children }) => (
  <div style={pageStyle}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28 }}>{title}</h1>
        {subtitle ? <p style={{ ...mutedTextStyle, marginTop: 6 }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
    </div>
    {children}
  </div>
);

const DataState = ({ loading, error, empty, isEmpty = false, children }) => {
  if (loading) return <p style={mutedTextStyle}>Loading…</p>;
  if (error) return <p style={{ ...mutedTextStyle, color: themeColors.danger }}>{error}</p>;
  if (isEmpty && empty) return <p style={mutedTextStyle}>{empty}</p>;
  return children;
};

const detailPanelStyle = {
  background: themeColors.surfaceRaised,
  border: `1px solid ${themeColors.border}`,
  borderRadius: 12,
  padding: 16,
  display: "grid",
  gap: 12,
};

const formSectionStyle = {
  ...cardStyle,
  display: "grid",
  gap: 16,
};

const formGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const textareaStyle = {
  ...buttonStyle,
  minWidth: 220,
  minHeight: 96,
  resize: "vertical",
};

const checkboxLabelStyle = {
  ...mutedTextStyle,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const supportSectionStyle = {
  display: "grid",
  gap: 16,
};

const supportHeroStyle = {
  ...cardStyle,
  display: "grid",
  gap: 12,
  background: themeColors.surfaceRaised,
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const sectionMetaStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  border: `1px solid ${themeColors.border}`,
  background: themeColors.surfaceRaised,
  color: themeColors.textMuted,
  fontSize: 12,
  fontWeight: 600,
};

const supportActionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const supportCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const auditListStyle = {
  display: "grid",
  gap: 8,
};

const auditItemStyle = {
  borderTop: `1px solid ${themeColors.border}`,
  paddingTop: 8,
  display: "grid",
  gap: 4,
};

const detailGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const DetailItem = ({ label, value }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <span style={mutedTextStyle}>{label}</span>
    <div>{value ?? "-"}</div>
  </div>
);

const InlineDetailsRow = ({ colSpan, title, children }) => (
  <tr>
    <td style={cellStyle} colSpan={colSpan}>
      <div style={detailPanelStyle}>
        <strong>{title}</strong>
        {children}
      </div>
    </td>
  </tr>
);

const AuditTrail = ({ events = [], empty = "No audit events available." }) => (
  <div style={auditListStyle}>
    <span style={mutedTextStyle}>Audit trail</span>
    {events.length ? (
      events.map((event) => (
        <div key={`${event.label}-${event.at}`} style={auditItemStyle}>
          <strong>{event.label}</strong>
          <span style={mutedTextStyle}>{formatDateTime(event.at)}</span>
          {event.description ? <span style={mutedTextStyle}>{event.description}</span> : null}
        </div>
      ))
    ) : (
      <span style={mutedTextStyle}>{empty}</span>
    )}
  </div>
);

const usePluginApi = () => {
  const fetchClient = useFetchClient();
  const notification = useNotification();
  const fetchClientRef = React.useRef(fetchClient);
  const notificationRef = React.useRef(notification);

  React.useEffect(() => {
    fetchClientRef.current = fetchClient;
    notificationRef.current = notification;
  }, [fetchClient, notification]);

  const get = React.useCallback((...args) => fetchClientRef.current.get(...args), []);
  const post = React.useCallback((...args) => fetchClientRef.current.post(...args), []);
  const put = React.useCallback((...args) => fetchClientRef.current.put(...args), []);
  const del = React.useCallback((...args) => fetchClientRef.current.del(...args), []);
  const notify = React.useCallback((type, message) => {
    notificationRef.current?.toggleNotification?.({ type, message });
  }, []);

  return { get, post, put, del, notify };
};

const DashboardPage = () => {
  const { get, notify } = usePluginApi();
  const [state, setState] = React.useState({ loading: true, error: "", stats: null });

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const [licensesRes, activationsRes, productsRes, pendingOrdersRes, pendingClaimsRes] = await Promise.all([
        get(`${ADMIN_API_BASE}/licenses`),
        get(`${ADMIN_API_BASE}/activations`),
        get(`${ADMIN_API_BASE}/products?limit=5&offset=0`),
        get(`${ADMIN_API_BASE}/orders?status=pending&limit=1&offset=0`),
        get(`${ADMIN_API_BASE}/activation-claims?status=pending_confirmation&limit=1&offset=0`),
      ]);

      const licenses = toList(licensesRes);
      const activations = toList(activationsRes);
      const products = toList(productsRes, "products");
      const pendingOrders = toTotal(pendingOrdersRes, "orders");
      const pendingClaims = toTotal(pendingClaimsRes, "claims");

      setState({
        loading: false,
        error: "",
        stats: {
          totalLicenses: licenses.length,
          activeLicenses: licenses.filter((item) => item.status === "active").length,
          revokedLicenses: licenses.filter((item) => item.status === "revoked").length,
          totalActivations: activations.length,
          activeProducts: products.filter((item) => item.is_active).length,
          pendingOrders,
          pendingClaims,
        },
      });
    } catch (error) {
      const message = error?.message || "Failed to load dashboard";
      setState({ loading: false, error: message, stats: null });
      notify("warning", message);
    }
  }, [get, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const stats = state.stats || {};

  return (
    <PageShell title="Dashboard" subtitle="Overview of licenses, activations, claims, products, and pending orders." actions={<button style={buttonStyle} onClick={load}>Refresh</button>}>
      <DataState loading={state.loading} error={state.error}>
        <div style={cardGridStyle}>
          {[["Total licenses", stats.totalLicenses], ["Active licenses", stats.activeLicenses], ["Revoked licenses", stats.revokedLicenses], ["Activations", stats.totalActivations], ["Pending claims", stats.pendingClaims], ["Active products", stats.activeProducts], ["Pending orders", stats.pendingOrders]].map(([label, value]) => (
            <div key={label} style={cardStyle}>
              <div style={mutedTextStyle}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{value ?? 0}</div>
            </div>
          ))}
        </div>
      </DataState>
    </PageShell>
  );
};

const SupportPage = () => {
  const { get, post, notify } = usePluginApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = React.useState(initialQuery);
  const [state, setState] = React.useState({ loading: false, error: "", submittedQuery: "", results: null });
  const [supportCouponState, setSupportCouponState] = React.useState({ creatingOrderId: null, issuedByOrderId: {} });
  const initialQueryRef = React.useRef(initialQuery);

  const runSearch = React.useCallback(async (rawQuery = query) => {
    const normalizedQuery = rawQuery.trim();

    if (!normalizedQuery) {
      setSearchParams(new URLSearchParams(), { replace: true });
      setState({ loading: false, error: "", submittedQuery: "", results: null });
      return;
    }

    setSearchParams(new URLSearchParams({ q: normalizedQuery }), { replace: true });

    try {
      setState((prev) => ({ ...prev, loading: true, error: "", submittedQuery: normalizedQuery }));

      const [licensesRes, activationsRes, ordersRes, claimsRes] = await Promise.all([
        get(`${ADMIN_API_BASE}/licenses?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "issued_at", sortDir: "desc" })}`),
        get(`${ADMIN_API_BASE}/activations?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "last_checkin", sortDir: "desc" })}`),
        get(`${ADMIN_API_BASE}/orders?${buildSupportSearchParams({ query: normalizedQuery, sortBy: "createdAt", sortDir: "desc" })}`),
        get(`${ADMIN_API_BASE}/activation-claims?${buildSupportSearchParams({ query: normalizedQuery, status: "all", sortBy: "createdAt", sortDir: "desc" })}`),
      ]);

      const results = {
        licenses: toList(licensesRes, "licenses"),
        licenseTotal: toTotal(licensesRes, "licenses"),
        activations: toList(activationsRes, "activations"),
        activationTotal: toTotal(activationsRes, "activations"),
        orders: toList(ordersRes, "orders"),
        orderTotal: toTotal(ordersRes, "orders"),
        claims: toList(claimsRes, "claims"),
        claimTotal: toTotal(claimsRes, "claims"),
      };

      setState({
        loading: false,
        error: "",
        submittedQuery: normalizedQuery,
        results: {
          ...results,
          primaryIdentity: resolveSupportIdentity(results),
        },
      });
    } catch (error) {
      const message = error?.message || "Failed to load support search";
      setState((prev) => ({ ...prev, loading: false, error: message, results: null }));
      notify("warning", message);
    }
  }, [get, notify, query, setSearchParams]);

  React.useEffect(() => {
    if (!initialQueryRef.current.trim()) return;
    runSearch(initialQueryRef.current);
    initialQueryRef.current = "";
  }, [runSearch]);

  const handleSubmit = (event) => {
    event.preventDefault();
    runSearch(query);
  };

  const clearSearch = () => {
    setQuery("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setState({ loading: false, error: "", submittedQuery: "", results: null });
    setSupportCouponState({ creatingOrderId: null, issuedByOrderId: {} });
  };

  const issueSupportCoupon = async (order) => {
    try {
      setSupportCouponState((prev) => ({ ...prev, creatingOrderId: order.id }));
      const payload = buildSupportCouponPayload(order);
      const createdCoupon = unwrap(await post(`${ADMIN_API_BASE}/coupons`, payload));
      const resolvedCoupon = {
        id: createdCoupon?.id,
        code: createdCoupon?.code || payload.code,
        notes: createdCoupon?.notes || payload.notes,
      };

      setSupportCouponState((prev) => ({
        creatingOrderId: null,
        issuedByOrderId: {
          ...prev.issuedByOrderId,
          [String(order.id)]: resolvedCoupon,
        },
      }));
      notify("success", `Support coupon ${resolvedCoupon.code} created for ${order.order_reference || `order #${order.id}`}`);
    } catch (error) {
      setSupportCouponState((prev) => ({ ...prev, creatingOrderId: null }));
      notify("warning", error?.message || "Failed to create support coupon");
    }
  };

  const results = state.results;
  const totalMatches = (results?.licenseTotal || 0) + (results?.activationTotal || 0) + (results?.orderTotal || 0) + (results?.claimTotal || 0);
  const sectionLinks = state.submittedQuery ? {
    licenses: buildAdminListHref({ path: "../licenses", search: state.submittedQuery, defaultSort: DEFAULT_LICENSE_SORT }),
    activations: buildAdminListHref({ path: "../activations", search: state.submittedQuery, defaultSort: DEFAULT_ACTIVATION_SORT }),
    orders: buildAdminListHref({ path: "../orders", search: state.submittedQuery, defaultSort: DEFAULT_ORDER_SORT }),
    claims: buildAdminListHref({ path: "../claims", search: state.submittedQuery, status: "all", defaultSort: DEFAULT_CLAIM_SORT, defaultStatus: "pending_confirmation" }),
  } : null;

  const actions = (
    <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }} onSubmit={handleSubmit}>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Support search</span>
        <input style={inputStyle} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email, license key, order ref, or device" />
        <span style={{ ...mutedTextStyle, fontSize: 12 }}>Press Enter to search across all operational pages.</span>
      </label>
      <button style={state.loading ? disabledButtonStyle : buttonStyle} type="submit" disabled={state.loading}>{state.loading ? "Searching…" : "Search"}</button>
      <button style={buttonStyle} type="button" onClick={clearSearch}>Clear</button>
    </form>
  );

  const renderSupportCouponHelper = (order) => {
    const issuedCoupon = supportCouponState.issuedByOrderId[String(order.id)];
    const isCreatingCoupon = supportCouponState.creatingOrderId === order.id;

    if (order.status !== "pending") {
      return null;
    }

    return (
      <div style={{ ...formSectionStyle, background: themeColors.surfaceRaised }}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong>Support coupon helper</strong>
            <span style={mutedTextStyle}>Generate a one-time full-discount coupon so the customer can redeem it from the pending order page.</span>
          </div>
          <button style={isCreatingCoupon ? disabledButtonStyle : buttonStyle} onClick={() => issueSupportCoupon(order)} disabled={isCreatingCoupon}>{isCreatingCoupon ? "Creating…" : issuedCoupon ? "Create replacement coupon" : "Create one-time coupon"}</button>
        </div>
        {issuedCoupon ? (
          <div style={detailGridStyle}>
            <DetailItem label="Coupon code" value={<code>{issuedCoupon.code}</code>} />
            <DetailItem label="Redemptions" value="1 total" />
            <DetailItem label="Use" value="Customer enters this code from the pending order detail page." />
            <DetailItem label="Notes" value={issuedCoupon.notes || "Support recovery coupon"} />
          </div>
        ) : (
          <div style={mutedTextStyle}>No support coupon created for this order in the current session.</div>
        )}
      </div>
    );
  };

  return (
    <PageShell title="Support" subtitle="Search across licenses, activations, orders, and claims to build a customer overview and audit trail." actions={actions}>
      <div style={supportHeroStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong>Unified support workspace</strong>
            <span style={mutedTextStyle}>Use one identifier to jump between customer support, license operations, device history, payment events, and claim moderation.</span>
          </div>
          <div style={sectionMetaStyle}>
            <span style={badgeStyle}>Licenses</span>
            <span style={badgeStyle}>Activations</span>
            <span style={badgeStyle}>Orders</span>
            <span style={badgeStyle}>Claims</span>
          </div>
        </div>
        {state.submittedQuery ? <span style={mutedTextStyle}>Showing up to {SUPPORT_PAGE_SIZE} recent matches per workspace for <strong>{state.submittedQuery}</strong>.</span> : <span style={mutedTextStyle}>Tip: search by email, license key, payment id, order reference, or device fingerprint.</span>}
      </div>

      {!state.submittedQuery ? (
        <div style={formSectionStyle}>
          <strong>Start with one identifier</strong>
          <div style={mutedTextStyle}>Search by customer email, license key, order reference, payment id, or device fingerprint to gather the full operational context.</div>
          <div style={detailGridStyle}>
            <DetailItem label="Licenses" value="Issued / revoked state and activation counts" />
            <DetailItem label="Activations" value="Device fingerprints, heartbeat activity, and revocations" />
            <DetailItem label="Orders" value="Payment status, order items, and refunds" />
            <DetailItem label="Claims" value="Pending confirmations, approvals, and rejection history" />
          </div>
        </div>
      ) : (
        <DataState loading={state.loading} error={state.error} empty={`No support matches found for "${state.submittedQuery}".`} isEmpty={Boolean(results) && totalMatches === 0}>
          <div style={cardGridStyle}>
            {[["Search term", state.submittedQuery], ["Primary contact", results?.primaryIdentity || state.submittedQuery], ["Matched records", totalMatches], ["Matched licenses", results?.licenseTotal || 0], ["Matched activations", results?.activationTotal || 0], ["Matched orders", results?.orderTotal || 0], ["Matched claims", results?.claimTotal || 0]].map(([label, value]) => (
              <div key={label} style={cardStyle}>
                <div style={mutedTextStyle}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={supportSectionStyle}>
            <div style={formSectionStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>Licenses</strong>
                  <span style={mutedTextStyle}>Issued keys and entitlement status.</span>
                </div>
                <div style={sectionMetaStyle}>
                  <span style={badgeStyle}>{formatSupportMatchSummary({ items: results?.licenses || [], total: results?.licenseTotal || 0 })}</span>
                  <Link style={buttonLinkStyle} to={sectionLinks.licenses}>Open full list</Link>
                </div>
              </div>
              {results?.licenses?.length ? results.licenses.map((license) => (
                <div key={license.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                  <div style={supportCardHeaderStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong><code>{license.uid}</code></strong>
                      <span style={mutedTextStyle}>{getDisplayText(license.user?.email, license.user?.username)} • {license.product?.name || "-"}</span>
                    </div>
                    <div style={supportActionRowStyle}>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../licenses", search: license.uid, defaultSort: DEFAULT_LICENSE_SORT })}>Open in Licenses</Link>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../activations", search: license.uid, defaultSort: DEFAULT_ACTIVATION_SORT })}>Related activations</Link>
                    </div>
                  </div>
                  <div style={detailGridStyle}>
                    <DetailItem label="Owner" value={getDisplayText(license.user?.email, license.user?.username)} />
                    <DetailItem label="Product" value={license.product?.name || "-"} />
                    <DetailItem label="Status" value={license.status || "-"} />
                    <DetailItem label="Issued" value={formatDateTime(license.issued_at || license.createdAt)} />
                  </div>
                  <AuditTrail events={buildLicenseAuditTrail(license)} empty="No license audit events yet." />
                </div>
              )) : <span style={mutedTextStyle}>No matching licenses.</span>}
            </div>

            <div style={formSectionStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>Activations</strong>
                  <span style={mutedTextStyle}>Device history and latest heartbeat activity.</span>
                </div>
                <div style={sectionMetaStyle}>
                  <span style={badgeStyle}>{formatSupportMatchSummary({ items: results?.activations || [], total: results?.activationTotal || 0 })}</span>
                  <Link style={buttonLinkStyle} to={sectionLinks.activations}>Open full list</Link>
                </div>
              </div>
              {results?.activations?.length ? results.activations.map((activation) => (
                <div key={activation.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                  <div style={supportCardHeaderStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong>Activation #{activation.id}</strong>
                      <span style={mutedTextStyle}>{getDisplayText(activation.license?.user?.email, activation.license?.user?.username)} • {activation.license?.product?.name || "-"}</span>
                    </div>
                    <div style={supportActionRowStyle}>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../activations", search: activation.device_fingerprint || activation.license?.uid || String(activation.id), defaultSort: DEFAULT_ACTIVATION_SORT })}>Open in Activations</Link>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../licenses", search: activation.license?.uid || activation.license?.user?.email || String(activation.id), defaultSort: DEFAULT_LICENSE_SORT })}>Open license</Link>
                    </div>
                  </div>
                  <div style={detailGridStyle}>
                    <DetailItem label="Owner" value={getDisplayText(activation.license?.user?.email, activation.license?.user?.username)} />
                    <DetailItem label="Product" value={activation.license?.product?.name || "-"} />
                    <DetailItem label="Device" value={activation.device_fingerprint ? <code>{activation.device_fingerprint}</code> : "-"} />
                    <DetailItem label="Last check-in" value={formatDateTime(activation.last_checkin)} />
                  </div>
                  <AuditTrail events={buildActivationAuditTrail(activation)} empty="No activation audit events yet." />
                </div>
              )) : <span style={mutedTextStyle}>No matching activations.</span>}
            </div>

            <div style={formSectionStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>Orders</strong>
                  <span style={mutedTextStyle}>Payment flow, fulfillment, and refund status.</span>
                </div>
                <div style={sectionMetaStyle}>
                  <span style={badgeStyle}>{formatSupportMatchSummary({ items: results?.orders || [], total: results?.orderTotal || 0 })}</span>
                  <Link style={buttonLinkStyle} to={sectionLinks.orders}>Open full list</Link>
                </div>
              </div>
              {results?.orders?.length ? results.orders.map((order) => (
                <div key={order.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                  <div style={supportCardHeaderStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong><code>{order.order_reference || `order #${order.id}`}</code></strong>
                      <span style={mutedTextStyle}>{getDisplayText(order.user?.email, order.user?.username)} • {order.status || "-"}</span>
                    </div>
                    <div style={supportActionRowStyle}>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../orders", search: order.order_reference || order.payment_id || order.user?.email || String(order.id), defaultSort: DEFAULT_ORDER_SORT })}>Open in Orders</Link>
                    </div>
                  </div>
                  <div style={detailGridStyle}>
                    <DetailItem label="Customer" value={getDisplayText(order.user?.email, order.user?.username)} />
                    <DetailItem label="Status" value={order.status || "-"} />
                    <DetailItem label="Amount" value={formatMoney(order.total_amount_cents, order.currency)} />
                    <DetailItem label="Created" value={formatDateTime(order.createdAt)} />
                  </div>
                  {renderSupportCouponHelper(order)}
                  <AuditTrail events={buildOrderAuditTrail(order)} empty="No order audit events yet." />
                </div>
              )) : <span style={mutedTextStyle}>No matching orders.</span>}
            </div>

            <div style={formSectionStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>Activation claims</strong>
                  <span style={mutedTextStyle}>Moderation queue for first-activation challenges.</span>
                </div>
                <div style={sectionMetaStyle}>
                  <span style={badgeStyle}>{formatSupportMatchSummary({ items: results?.claims || [], total: results?.claimTotal || 0 })}</span>
                  <Link style={buttonLinkStyle} to={sectionLinks.claims}>Open full list</Link>
                </div>
              </div>
              {results?.claims?.length ? results.claims.map((claim) => (
                <div key={claim.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                  <div style={supportCardHeaderStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong>Claim #{claim.id}</strong>
                      <span style={mutedTextStyle}>{getDisplayText(claim.owner_user?.email, claim.license?.user?.email)} • {claim.license?.uid || `license #${claim.license_id}`}</span>
                    </div>
                    <div style={supportActionRowStyle}>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../claims", search: String(claim.id), status: claim.status || "all", defaultSort: DEFAULT_CLAIM_SORT, defaultStatus: "pending_confirmation" })}>Open in Claims</Link>
                      <Link style={buttonLinkStyle} to={buildAdminListHref({ path: "../licenses", search: claim.license?.uid || claim.owner_user?.email || String(claim.id), defaultSort: DEFAULT_LICENSE_SORT })}>Open license</Link>
                    </div>
                  </div>
                  <div style={detailGridStyle}>
                    <DetailItem label="Owner" value={getDisplayText(claim.owner_user?.email, claim.license?.user?.email)} />
                    <DetailItem label="License" value={claim.license?.uid || `license #${claim.license_id}`} />
                    <DetailItem label="Status" value={claim.status || "-"} />
                    <DetailItem label="Risk" value={claim.risk_score ?? 0} />
                  </div>
                  <AuditTrail events={buildClaimAuditTrail(claim)} empty="No claim audit events yet." />
                </div>
              )) : <span style={mutedTextStyle}>No matching activation claims.</span>}
            </div>
          </div>
        </DataState>
      )}
    </PageShell>
  );
};

const LicensesPage = () => {
  const { get, post, notify } = usePluginApi();
  const [state, setState] = useListPageState({ pageSize: LICENSES_PAGE_SIZE, defaultSort: DEFAULT_LICENSE_SORT, statusOptions: LICENSE_STATUS_OPTIONS, sortOptions: LICENSE_SORT_OPTIONS });
  const [selectedLicenseId, setSelectedLicenseId] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
      });
      applyListQueryParams({
        params,
        search: state.search,
        status: state.status,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        defaultSort: DEFAULT_LICENSE_SORT,
      });
      const response = await get(`${ADMIN_API_BASE}/licenses?${params.toString()}`);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        items: toList(response, "licenses"),
        total: toTotal(response, "licenses"),
      }));
    } catch (error) {
      const message = error?.message || "Failed to load licenses";
      setState((prev) => ({ ...prev, loading: false, error: message, items: [], total: 0 }));
      notify("warning", message);
    }
  }, [get, notify, state.limit, state.offset, state.search, state.sortBy, state.sortDir, state.status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (event) => {
    const nextSearch = event.target.value;
    setState((prev) => ({ ...prev, search: nextSearch, offset: 0 }));
  };

  const handleStatusChange = (event) => {
    const nextStatus = event.target.value;
    setState((prev) => ({ ...prev, status: nextStatus, offset: 0 }));
  };

  const handleSortByChange = (event) => {
    const nextSortBy = event.target.value;
    setState((prev) => ({ ...prev, sortBy: nextSortBy, offset: 0 }));
  };

  const handleSortDirectionChange = (event) => {
    const nextSortDir = event.target.value;
    setState((prev) => ({ ...prev, sortDir: nextSortDir, offset: 0 }));
  };

  const revoke = async (license) => {
    if (!window.confirm(`Revoke license ${license.uid}?`)) return;
    try {
      await post(`${ADMIN_API_BASE}/licenses/${license.id}/revoke`);
      notify("success", "License revoked");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to revoke license");
    }
  };

  const hasPrevPage = state.offset > 0;
  const hasNextPage = state.offset + state.items.length < state.total;

  const goToPreviousPage = () => {
    if (!hasPrevPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  const goToNextPage = () => {
    if (!hasNextPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const toggleDetails = (licenseId) => {
    setSelectedLicenseId((prev) => (prev === licenseId ? null : licenseId));
  };

  const pageActions = (
    <>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Search</span>
        <input style={inputStyle} value={state.search} onChange={handleSearchChange} placeholder="Key, email, product" />
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Status</span>
        <select style={selectStyle} value={state.status} onChange={handleStatusChange}>
          {LICENSE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Sort</span>
        <select style={selectStyle} value={state.sortBy} onChange={handleSortByChange}>
          {LICENSE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Direction</span>
        <select style={selectStyle} value={state.sortDir} onChange={handleSortDirectionChange}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {state.search.trim() ? <Link style={buttonLinkStyle} to={buildSupportHref(state.search)}>Open in Support</Link> : null}
      <button style={buttonStyle} onClick={load}>Refresh</button>
    </>
  );

  return (
    <PageShell title="Licenses" subtitle="Manage issued licenses." actions={pageActions}>
      <DataState loading={state.loading} error={state.error} empty="No licenses found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}><thead><tr><th style={cellStyle}>Key</th><th style={cellStyle}>User</th><th style={cellStyle}>Product</th><th style={cellStyle}>Status</th><th style={cellStyle}>Activations</th><th style={cellStyle}>Actions</th></tr></thead><tbody>{state.items.map((license) => {
          const isSelected = selectedLicenseId === license.id;
          return (
            <React.Fragment key={license.id}>
              <tr><td style={cellStyle}><code>{license.uid}</code></td><td style={cellStyle}>{license.user?.email || license.user?.username || "-"}</td><td style={cellStyle}>{license.product?.name || "-"}</td><td style={cellStyle}>{license.status || "-"}</td><td style={cellStyle}>{license.activations?.length || 0}</td><td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => toggleDetails(license.id)}>{isSelected ? "Hide" : "View"}</button>{license.status === "active" ? <button style={dangerButtonStyle} onClick={() => revoke(license)}>Revoke</button> : null}</div></td></tr>
              {isSelected ? <InlineDetailsRow colSpan={6} title={`License details • ${license.uid}`}><div style={detailGridStyle}><DetailItem label="Owner" value={license.user?.email || license.user?.username || "-"} /><DetailItem label="Product" value={license.product?.name || "-"} /><DetailItem label="Status" value={license.status || "-"} /><DetailItem label="Issued" value={formatDateTime(license.issued_at || license.createdAt)} /><DetailItem label="Revoked" value={formatDateTime(license.revoked_at)} /><DetailItem label="Activation count" value={license.activations?.length || 0} /></div><div style={{ display: "grid", gap: 6 }}><span style={mutedTextStyle}>Activation details</span>{license.activations?.length ? license.activations.map((activation) => <div key={activation.id} style={mutedTextStyle}>#{activation.id} • {activation.device_fingerprint || "Unknown device"} • {activation.revoked_at ? "revoked" : "active"}</div>) : <span style={mutedTextStyle}>No activations yet.</span>}</div></InlineDetailsRow> : null}
            </React.Fragment>
          );
        })}</tbody></table>
        <div style={listFooterStyle}>
          <span style={mutedTextStyle}>{formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={hasPrevPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToPreviousPage} disabled={!hasPrevPage || state.loading}>Prev</button>
            <button style={hasNextPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToNextPage} disabled={!hasNextPage || state.loading}>Next</button>
          </div>
        </div>
      </DataState>
    </PageShell>
  );
};

const ActivationsPage = () => {
  const { get, post, notify } = usePluginApi();
  const [state, setState] = useListPageState({ pageSize: ACTIVATIONS_PAGE_SIZE, defaultSort: DEFAULT_ACTIVATION_SORT, statusOptions: ACTIVATION_STATUS_OPTIONS, sortOptions: ACTIVATION_SORT_OPTIONS });
  const [selectedActivationId, setSelectedActivationId] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
      });
      applyListQueryParams({
        params,
        search: state.search,
        status: state.status,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        defaultSort: DEFAULT_ACTIVATION_SORT,
      });
      const response = await get(`${ADMIN_API_BASE}/activations?${params.toString()}`);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        items: toList(response, "activations"),
        total: toTotal(response, "activations"),
      }));
    } catch (error) {
      const message = error?.message || "Failed to load activations";
      setState((prev) => ({ ...prev, loading: false, error: message, items: [], total: 0 }));
      notify("warning", message);
    }
  }, [get, notify, state.limit, state.offset, state.search, state.sortBy, state.sortDir, state.status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (event) => {
    const nextSearch = event.target.value;
    setState((prev) => ({ ...prev, search: nextSearch, offset: 0 }));
  };

  const handleStatusChange = (event) => {
    const nextStatus = event.target.value;
    setState((prev) => ({ ...prev, status: nextStatus, offset: 0 }));
  };

  const handleSortByChange = (event) => {
    const nextSortBy = event.target.value;
    setState((prev) => ({ ...prev, sortBy: nextSortBy, offset: 0 }));
  };

  const handleSortDirectionChange = (event) => {
    const nextSortDir = event.target.value;
    setState((prev) => ({ ...prev, sortDir: nextSortDir, offset: 0 }));
  };

  const revoke = async (activation) => {
    if (!window.confirm(`Revoke activation ${activation.id}?`)) return;
    try {
      await post(`${ADMIN_API_BASE}/activations/${activation.id}/revoke`);
      notify("success", "Activation revoked");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to revoke activation");
    }
  };

  const hasPrevPage = state.offset > 0;
  const hasNextPage = state.offset + state.items.length < state.total;

  const goToPreviousPage = () => {
    if (!hasPrevPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  const goToNextPage = () => {
    if (!hasNextPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const toggleDetails = (activationId) => {
    setSelectedActivationId((prev) => (prev === activationId ? null : activationId));
  };

  const pageActions = (
    <>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Search</span>
        <input style={inputStyle} value={state.search} onChange={handleSearchChange} placeholder="Device, user, product" />
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Status</span>
        <select style={selectStyle} value={state.status} onChange={handleStatusChange}>
          {ACTIVATION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Sort</span>
        <select style={selectStyle} value={state.sortBy} onChange={handleSortByChange}>
          {ACTIVATION_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Direction</span>
        <select style={selectStyle} value={state.sortDir} onChange={handleSortDirectionChange}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {state.search.trim() ? <Link style={buttonLinkStyle} to={buildSupportHref(state.search)}>Open in Support</Link> : null}
      <button style={buttonStyle} onClick={load}>Refresh</button>
    </>
  );

  return (
    <PageShell title="Activations" subtitle="Inspect device activations and their current state." actions={pageActions}>
      <DataState loading={state.loading} error={state.error} empty="No activations found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}><thead><tr><th style={cellStyle}>ID</th><th style={cellStyle}>User</th><th style={cellStyle}>Product</th><th style={cellStyle}>Device</th><th style={cellStyle}>Last check-in</th><th style={cellStyle}>Actions</th></tr></thead><tbody>{state.items.map((activation) => {
          const isSelected = selectedActivationId === activation.id;
          return (
            <React.Fragment key={activation.id}>
              <tr><td style={cellStyle}>{activation.id}</td><td style={cellStyle}>{activation.license?.user?.email || "-"}</td><td style={cellStyle}>{activation.license?.product?.name || "-"}</td><td style={cellStyle}><code>{activation.device_fingerprint || "-"}</code></td><td style={cellStyle}>{activation.last_checkin ? new Date(activation.last_checkin).toLocaleString() : "Never"}</td><td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => toggleDetails(activation.id)}>{isSelected ? "Hide" : "View"}</button>{activation.revoked_at ? <span>Revoked</span> : <button style={dangerButtonStyle} onClick={() => revoke(activation)}>Revoke</button>}</div></td></tr>
              {isSelected ? <InlineDetailsRow colSpan={6} title={`Activation details • #${activation.id}`}><div style={detailGridStyle}><DetailItem label="Device" value={activation.device_fingerprint ? <code>{activation.device_fingerprint}</code> : "-"} /><DetailItem label="Certificate" value={activation.certificate_serial || "-"} /><DetailItem label="License" value={activation.license?.uid || "-"} /><DetailItem label="Owner" value={activation.license?.user?.email || "-"} /><DetailItem label="Product" value={activation.license?.product?.name || "-"} /><DetailItem label="Last check-in" value={formatDateTime(activation.last_checkin)} /><DetailItem label="Activated" value={formatDateTime(activation.activated_at || activation.createdAt)} /><DetailItem label="Revoked" value={formatDateTime(activation.revoked_at)} /></div></InlineDetailsRow> : null}
            </React.Fragment>
          );
        })}</tbody></table>
        <div style={listFooterStyle}>
          <span style={mutedTextStyle}>{formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={hasPrevPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToPreviousPage} disabled={!hasPrevPage || state.loading}>Prev</button>
            <button style={hasNextPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToNextPage} disabled={!hasNextPage || state.loading}>Next</button>
          </div>
        </div>
      </DataState>
    </PageShell>
  );
};

const ProductsPage = () => {
  const { get, post, put, del, notify } = usePluginApi();
  const [state, setState] = React.useState({ loading: true, error: "", items: [] });
  const [selectedProductId, setSelectedProductId] = React.useState(null);
  const [editingProductId, setEditingProductId] = React.useState(null);
  const [productForm, setProductForm] = React.useState(EMPTY_PRODUCT_FORM);
  const [versionLists, setVersionLists] = React.useState({});
  const [versionForm, setVersionForm] = React.useState({ productId: null, versionId: null, values: EMPTY_VERSION_FORM });

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const response = await get(`${ADMIN_API_BASE}/products?limit=50&offset=0`);
      const items = toList(response, "products");
      setState({ loading: false, error: "", items });
      setSelectedProductId((prev) => (items.some((item) => item.id === prev) ? prev : null));
      setEditingProductId((prev) => (items.some((item) => item.id === prev) ? prev : null));
    } catch (error) {
      const message = error?.message || "Failed to load products";
      setState({ loading: false, error: message, items: [] });
      notify("warning", message);
    }
  }, [get, notify]);

  const loadVersions = React.useCallback(async (productId) => {
    try {
      setVersionLists((prev) => ({
        ...prev,
        [productId]: { loading: true, error: "", items: prev[productId]?.items || [] },
      }));
      const response = await get(`${ADMIN_API_BASE}/products/${productId}/versions`);
      setVersionLists((prev) => ({
        ...prev,
        [productId]: { loading: false, error: "", items: toList(response) },
      }));
    } catch (error) {
      const message = error?.message || "Failed to load versions";
      setVersionLists((prev) => ({
        ...prev,
        [productId]: { loading: false, error: message, items: prev[productId]?.items || [] },
      }));
      notify("warning", message);
    }
  }, [get, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const resetProductEditor = () => {
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
  };

  const handleProductFieldChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVersionFieldChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setVersionForm((prev) => ({ ...prev, values: { ...prev.values, [field]: value } }));
  };

  const submitProduct = async () => {
    if (!productForm.name.trim()) {
      notify("warning", "Product name is required");
      return;
    }

    try {
      const payload = serializeProductForm(productForm);
      if (editingProductId) {
        await put(`${ADMIN_API_BASE}/products/${editingProductId}`, payload);
        notify("success", "Product updated");
      } else {
        await post(`${ADMIN_API_BASE}/products`, payload);
        notify("success", "Product created");
      }
      resetProductEditor();
      await load();
    } catch (error) {
      notify("warning", error?.message || "Failed to save product");
    }
  };

  const editProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || "",
      type: product.type || "plugin",
      description: product.description || "",
      price_cents: toInputValue(product.price_cents),
      currency: product.currency || "USD",
      is_active: product.is_active !== false,
    });
  };

  const removeProduct = async (product) => {
    if (!window.confirm(`Delete product ${product.name}?`)) return;

    try {
      await del(`${ADMIN_API_BASE}/products/${product.id}`);
      notify("success", "Product deleted");
      if (selectedProductId === product.id) {
        setSelectedProductId(null);
        setVersionForm({ productId: null, versionId: null, values: EMPTY_VERSION_FORM });
      }
      if (editingProductId === product.id) {
        resetProductEditor();
      }
      await load();
    } catch (error) {
      notify("warning", error?.message || "Failed to delete product");
    }
  };

  const toggleDetails = (productId) => {
    const nextSelectedProductId = selectedProductId === productId ? null : productId;
    setSelectedProductId(nextSelectedProductId);

    if (nextSelectedProductId) {
      setVersionForm((prev) => (prev.productId === productId ? prev : { productId, versionId: null, values: EMPTY_VERSION_FORM }));
      loadVersions(productId);
      return;
    }

    setVersionForm({ productId: null, versionId: null, values: EMPTY_VERSION_FORM });
  };

  const startNewVersion = (productId) => {
    setVersionForm({ productId, versionId: null, values: EMPTY_VERSION_FORM });
  };

  const editVersion = (productId, version) => {
    setVersionForm({
      productId,
      versionId: version.id,
      values: {
        version: version.version || "",
        platform: version.platform || "all",
        build_hash: version.build_hash || "",
        min_license_protocol_version: toInputValue(version.min_license_protocol_version ?? 1),
        file_size_bytes: toInputValue(version.file_size_bytes),
        download_url: version.download_url || "",
        changelog: version.changelog || "",
        is_latest: Boolean(version.is_latest),
      },
    });
  };

  const saveVersion = async (productId) => {
    const currentForm = versionForm.productId === productId ? versionForm.values : EMPTY_VERSION_FORM;
    if (!currentForm.version.trim()) {
      notify("warning", "Version number is required");
      return;
    }

    try {
      const payload = serializeVersionForm(currentForm);
      if (versionForm.productId === productId && versionForm.versionId) {
        await put(`${ADMIN_API_BASE}/products/${productId}/versions/${versionForm.versionId}`, payload);
        notify("success", "Version updated");
      } else {
        await post(`${ADMIN_API_BASE}/products/${productId}/versions`, payload);
        notify("success", "Version created");
      }
      await loadVersions(productId);
      setVersionForm({ productId, versionId: null, values: EMPTY_VERSION_FORM });
    } catch (error) {
      notify("warning", error?.message || "Failed to save version");
    }
  };

  const removeVersion = async (productId, version) => {
    if (!window.confirm(`Delete version ${version.version} (${version.platform})?`)) return;

    try {
      await del(`${ADMIN_API_BASE}/products/${productId}/versions/${version.id}`);
      notify("success", "Version deleted");
      await loadVersions(productId);
      if (versionForm.versionId === version.id) {
        setVersionForm({ productId, versionId: null, values: EMPTY_VERSION_FORM });
      }
    } catch (error) {
      notify("warning", error?.message || "Failed to delete version");
    }
  };

  return (
    <PageShell title="Products" subtitle="Create products, update pricing, and manage downloadable versions." actions={<button style={buttonStyle} onClick={load}>Refresh</button>}>
      <div style={formSectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>{editingProductId ? `Edit product #${editingProductId}` : "Create product"}</strong>
            <div style={mutedTextStyle}>{editingProductId ? "Update metadata and pricing before publishing new builds." : "Add a new sellable product without leaving the plugin admin."}</div>
          </div>
          {editingProductId ? <button style={buttonStyle} onClick={resetProductEditor}>Cancel edit</button> : null}
        </div>
        <div style={formGridStyle}>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
            <span>Name</span>
            <input style={inputStyle} value={productForm.name} onChange={handleProductFieldChange("name")} placeholder="Samplero Deluxe" />
          </label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
            <span>Type</span>
            <select style={selectStyle} value={productForm.type} onChange={handleProductFieldChange("type")}>
              {PRODUCT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
            <span>Price (cents)</span>
            <input style={inputStyle} value={productForm.price_cents} onChange={handleProductFieldChange("price_cents")} placeholder="9900" />
          </label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
            <span>Currency</span>
            <select style={selectStyle} value={productForm.currency} onChange={handleProductFieldChange("currency")}>
              {PRODUCT_CURRENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
          <span>Description</span>
          <textarea style={textareaStyle} value={productForm.description} onChange={handleProductFieldChange("description")} placeholder="Short admin-facing description or release notes context." />
        </label>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={productForm.is_active} onChange={handleProductFieldChange("is_active")} />
          Active and available for new licenses/orders
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={buttonStyle} onClick={submitProduct}>{editingProductId ? "Save product" : "Create product"}</button>
          <button style={buttonStyle} onClick={resetProductEditor}>Reset</button>
        </div>
      </div>
      <DataState loading={state.loading} error={state.error} empty="No products found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}><thead><tr><th style={cellStyle}>Name</th><th style={cellStyle}>Type</th><th style={cellStyle}>Price</th><th style={cellStyle}>Status</th><th style={cellStyle}>Actions</th></tr></thead><tbody>{state.items.map((product) => {
          const isSelected = selectedProductId === product.id;
          const versionState = versionLists[product.id] || { loading: false, error: "", items: [] };
          const currentVersionForm = versionForm.productId === product.id ? versionForm.values : EMPTY_VERSION_FORM;
          const isEditingVersion = versionForm.productId === product.id && versionForm.versionId !== null;

          return (
            <React.Fragment key={product.id}>
              <tr><td style={cellStyle}>{product.name}</td><td style={cellStyle}>{product.type || "-"}</td><td style={cellStyle}>{typeof product.price_cents === "number" ? `$${(product.price_cents / 100).toFixed(2)} ${product.currency || "USD"}` : "Free"}</td><td style={cellStyle}>{product.is_active ? "Active" : "Inactive"}</td><td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => toggleDetails(product.id)}>{isSelected ? "Hide" : "View"}</button><button style={buttonStyle} onClick={() => editProduct(product)}>Edit</button><button style={dangerButtonStyle} onClick={() => removeProduct(product)}>Delete</button></div></td></tr>
              {isSelected ? <InlineDetailsRow colSpan={5} title={`Product details • ${product.name}`}><div style={detailGridStyle}><DetailItem label="Name" value={product.name} /><DetailItem label="Slug" value={product.slug || "-"} /><DetailItem label="Type" value={product.type || "-"} /><DetailItem label="Price" value={formatMoney(product.price_cents, product.currency)} /><DetailItem label="Status" value={product.is_active ? "Active" : "Inactive"} /><DetailItem label="Created" value={formatDateTime(product.createdAt)} /></div><div style={{ ...formSectionStyle, background: themeColors.surfaceRaised }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><strong>{isEditingVersion ? `Edit version #${versionForm.versionId}` : "Add version"}</strong><div style={mutedTextStyle}>Maintain downloadable builds and mark the latest release per platform.</div></div><button style={buttonStyle} onClick={() => startNewVersion(product.id)}>New version</button></div><div style={formGridStyle}><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Version</span><input style={inputStyle} value={currentVersionForm.version} onChange={handleVersionFieldChange("version")} placeholder="1.2.0" /></label><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Platform</span><select style={selectStyle} value={currentVersionForm.platform} onChange={handleVersionFieldChange("platform")}>{VERSION_PLATFORM_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select></label><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Build hash</span><input style={inputStyle} value={currentVersionForm.build_hash} onChange={handleVersionFieldChange("build_hash")} placeholder="git-sha or CI build id" /></label><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Min protocol</span><input style={inputStyle} value={currentVersionForm.min_license_protocol_version} onChange={handleVersionFieldChange("min_license_protocol_version")} placeholder="1" /></label><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>File size (bytes)</span><input style={inputStyle} value={currentVersionForm.file_size_bytes} onChange={handleVersionFieldChange("file_size_bytes")} placeholder="104857600" /></label><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Download URL</span><input style={inputStyle} value={currentVersionForm.download_url} onChange={handleVersionFieldChange("download_url")} placeholder="https://..." /></label></div><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Changelog</span><textarea style={textareaStyle} value={currentVersionForm.changelog} onChange={handleVersionFieldChange("changelog")} placeholder="What changed in this release?" /></label><label style={checkboxLabelStyle}><input type="checkbox" checked={currentVersionForm.is_latest} onChange={handleVersionFieldChange("is_latest")} />Mark as latest for this platform</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => saveVersion(product.id)}>{isEditingVersion ? "Save version" : "Create version"}</button><button style={buttonStyle} onClick={() => startNewVersion(product.id)}>Reset version form</button></div></div><div style={{ display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><strong>Versions</strong><button style={buttonStyle} onClick={() => loadVersions(product.id)}>Reload versions</button></div>{versionState.loading ? <span style={mutedTextStyle}>Loading versions…</span> : null}{versionState.error ? <span style={{ ...mutedTextStyle, color: themeColors.danger }}>{versionState.error}</span> : null}{!versionState.loading && !versionState.error && !versionState.items?.length ? <span style={mutedTextStyle}>No versions added yet.</span> : null}{versionState.items?.map((version) => <div key={version.id} style={{ ...cardStyle, padding: 12, display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><strong>{version.version} • {version.platform}</strong><span style={mutedTextStyle}>{version.is_latest ? "Latest" : "Historical"}</span></div><div style={detailGridStyle}><DetailItem label="Build hash" value={version.build_hash || "-"} /><DetailItem label="Min protocol" value={version.min_license_protocol_version ?? "-"} /><DetailItem label="File size" value={version.file_size_bytes ?? "-"} /><DetailItem label="Created" value={formatDateTime(version.createdAt)} /></div><div style={mutedTextStyle}>{version.download_url || "No download URL configured."}</div>{version.changelog ? <div style={mutedTextStyle}>{version.changelog}</div> : null}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => editVersion(product.id, version)}>Edit</button><button style={dangerButtonStyle} onClick={() => removeVersion(product.id, version)}>Delete</button></div></div>)}</div></InlineDetailsRow> : null}
            </React.Fragment>
          );
        })}</tbody></table>
      </DataState>
    </PageShell>
  );
};

const CouponsPage = () => {
  const { get, post, put, notify } = usePluginApi();
  const [state, setState] = React.useState({ loading: true, error: "", items: [], status: "all" });
  const [editingCouponId, setEditingCouponId] = React.useState(null);
  const [couponForm, setCouponForm] = React.useState(EMPTY_COUPON_FORM);

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const response = await get(`${ADMIN_API_BASE}/coupons?limit=50&offset=0${state.status !== "all" ? `&status=${encodeURIComponent(state.status)}` : ""}`);
      setState((prev) => ({ ...prev, loading: false, error: "", items: toList(response, "coupons") }));
    } catch (error) {
      const message = error?.message || "Failed to load coupons";
      setState((prev) => ({ ...prev, loading: false, error: message, items: [] }));
      notify("warning", message);
    }
  }, [get, notify, state.status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const resetEditor = () => {
    setEditingCouponId(null);
    setCouponForm(EMPTY_COUPON_FORM);
  };

  const handleFieldChange = (field) => (event) => {
    const value = field === "is_active" ? event.target.checked : event.target.value;
    setCouponForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitCoupon = async () => {
    try {
      const payload = serializeCouponForm(couponForm);
      if (editingCouponId) {
        await put(`${ADMIN_API_BASE}/coupons/${editingCouponId}`, payload);
        notify("success", "Coupon updated");
      } else {
        await post(`${ADMIN_API_BASE}/coupons`, payload);
        notify("success", "Coupon created");
      }
      resetEditor();
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to save coupon");
    }
  };

  const editCoupon = (coupon) => {
    setEditingCouponId(coupon.id);
    setCouponForm({
      code: coupon.code || "",
      is_active: coupon.is_active !== false,
      max_redemptions: toInputValue(coupon.max_redemptions),
      starts_at: coupon.starts_at || "",
      expires_at: coupon.expires_at || "",
      notes: coupon.notes || "",
    });
  };

  const toggleCouponActive = async (coupon) => {
    try {
      await put(`${ADMIN_API_BASE}/coupons/${coupon.id}`, { is_active: !coupon.is_active });
      notify("success", coupon.is_active ? "Coupon deactivated" : "Coupon activated");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to update coupon");
    }
  };

  return (
    <PageShell title="Coupons" subtitle="Create admin-issued full-discount coupons that instantly mark orders as paid." actions={<><label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Status</span><select style={selectStyle} value={state.status} onChange={(event) => setState((prev) => ({ ...prev, status: event.target.value }))}>{COUPON_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button style={buttonStyle} onClick={load}>Refresh</button></>}>
      <div style={formSectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>{editingCouponId ? `Edit coupon #${editingCouponId}` : "Create coupon"}</strong>
            <div style={mutedTextStyle}>These coupons cover 100% of the order total and use the same fulfillment path as a paid order.</div>
          </div>
          {editingCouponId ? <button style={buttonStyle} onClick={resetEditor}>Cancel edit</button> : null}
        </div>
        <div style={formGridStyle}>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Code</span><input style={inputStyle} value={couponForm.code} onChange={handleFieldChange("code")} placeholder="FULLFREE2026" /></label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Max redemptions</span><input style={inputStyle} value={couponForm.max_redemptions} onChange={handleFieldChange("max_redemptions")} placeholder="Leave blank for unlimited" /></label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Starts at (ISO)</span><input style={inputStyle} value={couponForm.starts_at} onChange={handleFieldChange("starts_at")} placeholder="2026-03-10T00:00:00.000Z" /></label>
          <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Expires at (ISO)</span><input style={inputStyle} value={couponForm.expires_at} onChange={handleFieldChange("expires_at")} placeholder="2026-04-10T00:00:00.000Z" /></label>
        </div>
        <label style={checkboxLabelStyle}><input type="checkbox" checked={couponForm.is_active} onChange={handleFieldChange("is_active")} />Coupon is active and redeemable when other constraints pass</label>
        <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}><span>Notes</span><textarea style={textareaStyle} value={couponForm.notes} onChange={handleFieldChange("notes")} placeholder="Campaign notes, partner name, or internal approval context" /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={buttonStyle} onClick={submitCoupon}>{editingCouponId ? "Save coupon" : "Create coupon"}</button>
          <span style={mutedTextStyle}>Full-discount only</span>
        </div>
      </div>
      <DataState loading={state.loading} error={state.error} empty="No coupons found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}>
          <thead><tr><th style={cellStyle}>Code</th><th style={cellStyle}>Status</th><th style={cellStyle}>Redemptions</th><th style={cellStyle}>Window</th><th style={cellStyle}>Actions</th></tr></thead>
          <tbody>{state.items.map((coupon) => (
            <tr key={coupon.id}>
              <td style={cellStyle}><strong>{coupon.code}</strong><div style={mutedTextStyle}>{coupon.notes || "Full-discount coupon"}</div></td>
              <td style={cellStyle}>{coupon.status_label || "-"}</td>
              <td style={cellStyle}>{coupon.redemption_count || 0}{coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : " / unlimited"}</td>
              <td style={cellStyle}><div>{coupon.starts_at ? formatDateTime(coupon.starts_at) : "Starts immediately"}</div><div style={mutedTextStyle}>{coupon.expires_at ? `Expires ${formatDateTime(coupon.expires_at)}` : "No expiry"}</div></td>
              <td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => editCoupon(coupon)}>Edit</button><button style={coupon.is_active ? dangerButtonStyle : buttonStyle} onClick={() => toggleCouponActive(coupon)}>{coupon.is_active ? "Deactivate" : "Activate"}</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </DataState>
    </PageShell>
  );
};

const OrdersPage = () => {
  const { get, post, notify } = usePluginApi();
  const [state, setState] = useListPageState({ pageSize: ORDERS_PAGE_SIZE, defaultSort: DEFAULT_ORDER_SORT, statusOptions: ORDER_STATUS_OPTIONS, sortOptions: ORDER_SORT_OPTIONS });
  const [selectedOrderId, setSelectedOrderId] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
      });
      applyListQueryParams({
        params,
        search: state.search,
        status: state.status,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        defaultSort: DEFAULT_ORDER_SORT,
      });

      const response = await get(`${ADMIN_API_BASE}/orders?${params.toString()}`);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        items: toList(response, "orders"),
        total: toTotal(response, "orders"),
      }));
    } catch (error) {
      const message = error?.message || "Failed to load orders";
      setState((prev) => ({ ...prev, loading: false, error: message, items: [], total: 0 }));
      notify("warning", message);
    }
  }, [get, notify, state.limit, state.offset, state.search, state.sortBy, state.sortDir, state.status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (event) => {
    const nextSearch = event.target.value;
    setState((prev) => ({ ...prev, search: nextSearch, offset: 0 }));
  };

  const handleStatusChange = (event) => {
    const nextStatus = event.target.value;
    setState((prev) => ({ ...prev, status: nextStatus, offset: 0 }));
  };

  const handleSortByChange = (event) => {
    const nextSortBy = event.target.value;
    setState((prev) => ({ ...prev, sortBy: nextSortBy, offset: 0 }));
  };

  const handleSortDirectionChange = (event) => {
    const nextSortDir = event.target.value;
    setState((prev) => ({ ...prev, sortDir: nextSortDir, offset: 0 }));
  };

  const markPaid = async (order) => {
    const paymentId = window.prompt(`Payment ID for ${order.order_reference || `order #${order.id}`} (optional)`, order.payment_id || "");
    if (paymentId === null) return;

    try {
      await post(`${ADMIN_API_BASE}/orders/${order.id}/mark-paid`, {
        payment_id: paymentId || undefined,
      });
      notify("success", "Order marked as paid");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to mark order as paid");
    }
  };

  const refund = async (order) => {
    const reason = window.prompt(`Refund reason for ${order.order_reference || `order #${order.id}`}`, order.refund_reason || "");
    if (reason === null) return;

    try {
      await post(`${ADMIN_API_BASE}/orders/${order.id}/refund`, { reason: reason || undefined });
      notify("success", "Order refunded");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to refund order");
    }
  };

  const hasPrevPage = state.offset > 0;
  const hasNextPage = state.offset + state.items.length < state.total;

  const goToPreviousPage = () => {
    if (!hasPrevPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  const goToNextPage = () => {
    if (!hasNextPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const toggleDetails = (orderId) => {
    setSelectedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const pageActions = (
    <>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Search</span>
        <input style={inputStyle} value={state.search} onChange={handleSearchChange} placeholder="Reference, email, payment" />
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Status</span>
        <select style={selectStyle} value={state.status} onChange={handleStatusChange}>
          {ORDER_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Sort</span>
        <select style={selectStyle} value={state.sortBy} onChange={handleSortByChange}>
          {ORDER_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Direction</span>
        <select style={selectStyle} value={state.sortDir} onChange={handleSortDirectionChange}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {state.search.trim() ? <Link style={buttonLinkStyle} to={buildSupportHref(state.search)}>Open in Support</Link> : null}
      <button style={buttonStyle} onClick={load}>Refresh</button>
    </>
  );

  return (
    <PageShell title="Orders" subtitle="Review checkout status and manually finalize or refund purchases." actions={pageActions}>
      <DataState loading={state.loading} error={state.error} empty="No orders found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}><thead><tr><th style={cellStyle}>Reference</th><th style={cellStyle}>Customer</th><th style={cellStyle}>Status</th><th style={cellStyle}>Amount</th><th style={cellStyle}>Items</th><th style={cellStyle}>Created</th><th style={cellStyle}>Actions</th></tr></thead><tbody>{state.items.map((order) => {
          const isSelected = selectedOrderId === order.id;
          return (
            <React.Fragment key={order.id}>
              <tr><td style={cellStyle}><code>{order.order_reference || `LS-${String(order.id).padStart(6, "0")}`}</code></td><td style={cellStyle}>{order.user?.email || order.user?.username || "-"}</td><td style={cellStyle}>{order.status || "-"}</td><td style={cellStyle}>{formatMoney(order.total_amount_cents, order.currency)}</td><td style={cellStyle}>{order.receipt?.total_items || order.items?.length || 0}</td><td style={cellStyle}>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}</td><td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => toggleDetails(order.id)}>{isSelected ? "Hide" : "View"}</button>{order.status === "pending" ? <button style={buttonStyle} onClick={() => markPaid(order)}>Mark paid</button> : null}{order.status === "paid" ? <button style={dangerButtonStyle} onClick={() => refund(order)}>Refund</button> : null}{!["pending", "paid"].includes(order.status) ? "-" : null}</div></td></tr>
              {isSelected ? <InlineDetailsRow colSpan={7} title={`Order details • ${order.order_reference || `order #${order.id}`}`}><div style={detailGridStyle}><DetailItem label="Customer" value={order.user?.email || order.user?.username || "-"} /><DetailItem label="Amount" value={formatMoney(order.total_amount_cents, order.currency)} /><DetailItem label="Status" value={order.status || "-"} /><DetailItem label="Payment ID" value={order.payment_id || "-"} /><DetailItem label="Created" value={formatDateTime(order.createdAt)} /><DetailItem label="Refund reason" value={order.refund_reason || "-"} /></div><div style={{ display: "grid", gap: 6 }}><span style={mutedTextStyle}>Ordered items</span>{order.items?.length ? order.items.map((item, index) => <div key={`${order.id}-${item.id || index}`} style={mutedTextStyle}>{item.product?.name || `Item #${index + 1}`} {item.license?.uid ? `• ${item.license.uid}` : ""}</div>) : <span style={mutedTextStyle}>No item details available.</span>}</div></InlineDetailsRow> : null}
            </React.Fragment>
          );
        })}</tbody></table>
        <div style={listFooterStyle}>
          <span style={mutedTextStyle}>{formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={hasPrevPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToPreviousPage} disabled={!hasPrevPage || state.loading}>Prev</button>
            <button style={hasNextPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToNextPage} disabled={!hasNextPage || state.loading}>Next</button>
          </div>
        </div>
      </DataState>
    </PageShell>
  );
};

const ClaimsPage = () => {
  const { get, post, notify } = usePluginApi();
  const [state, setState] = useListPageState({ pageSize: CLAIMS_PAGE_SIZE, defaultSort: DEFAULT_CLAIM_SORT, statusOptions: CLAIM_STATUS_OPTIONS, sortOptions: CLAIM_SORT_OPTIONS, defaultStatus: "pending_confirmation" });
  const [selectedClaimId, setSelectedClaimId] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
      });
      applyListQueryParams({
        params,
        search: state.search,
        status: state.status,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        defaultSort: DEFAULT_CLAIM_SORT,
      });

      const response = await get(`${ADMIN_API_BASE}/activation-claims?${params.toString()}`);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        items: toList(response, "claims"),
        total: toTotal(response, "claims"),
      }));
    } catch (error) {
      const message = error?.message || "Failed to load activation claims";
      setState((prev) => ({ ...prev, loading: false, error: message, items: [], total: 0 }));
      notify("warning", message);
    }
  }, [get, notify, state.limit, state.offset, state.search, state.sortBy, state.sortDir, state.status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (event) => {
    const nextSearch = event.target.value;
    setState((prev) => ({ ...prev, search: nextSearch, offset: 0 }));
  };

  const handleStatusChange = (event) => {
    const nextStatus = event.target.value;
    setState((prev) => ({ ...prev, status: nextStatus, offset: 0 }));
  };

  const handleSortByChange = (event) => {
    const nextSortBy = event.target.value;
    setState((prev) => ({ ...prev, sortBy: nextSortBy, offset: 0 }));
  };

  const handleSortDirectionChange = (event) => {
    const nextSortDir = event.target.value;
    setState((prev) => ({ ...prev, sortDir: nextSortDir, offset: 0 }));
  };

  const approve = async (claim) => {
    try {
      await post(`${ADMIN_API_BASE}/activation-claims/${claim.id}/approve`);
      notify("success", "Activation claim approved");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to approve claim");
    }
  };

  const reject = async (claim) => {
    const reason = window.prompt(`Rejection reason for claim #${claim.id}`, claim.rejection_reason || "");
    if (reason === null) return;

    try {
      await post(`${ADMIN_API_BASE}/activation-claims/${claim.id}/reject`, { reason: reason || undefined });
      notify("success", "Activation claim rejected");
      load();
    } catch (error) {
      notify("warning", error?.message || "Failed to reject claim");
    }
  };

  const hasPrevPage = state.offset > 0;
  const hasNextPage = state.offset + state.items.length < state.total;

  const goToPreviousPage = () => {
    if (!hasPrevPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  const goToNextPage = () => {
    if (!hasNextPage || state.loading) return;
    setState((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const toggleDetails = (claimId) => {
    setSelectedClaimId((prev) => (prev === claimId ? null : claimId));
  };

  const pageActions = (
    <>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Search</span>
        <input style={inputStyle} value={state.search} onChange={handleSearchChange} placeholder="Claim, license, owner, device" />
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Status</span>
        <select style={selectStyle} value={state.status} onChange={handleStatusChange}>
          {CLAIM_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Sort</span>
        <select style={selectStyle} value={state.sortBy} onChange={handleSortByChange}>
          {CLAIM_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={{ ...mutedTextStyle, display: "grid", gap: 4 }}>
        <span>Direction</span>
        <select style={selectStyle} value={state.sortDir} onChange={handleSortDirectionChange}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {state.search.trim() ? <Link style={buttonLinkStyle} to={buildSupportHref(state.search)}>Open in Support</Link> : null}
      <button style={buttonStyle} onClick={load}>Refresh</button>
    </>
  );

  return (
    <PageShell title="Activation Claims" subtitle="Review first-activation confirmation requests and moderate risky devices." actions={pageActions}>
      <DataState loading={state.loading} error={state.error} empty="No activation claims found." isEmpty={state.items.length === 0}>
        <table style={tableStyle}><thead><tr><th style={cellStyle}>Claim</th><th style={cellStyle}>License</th><th style={cellStyle}>Owner</th><th style={cellStyle}>Device</th><th style={cellStyle}>Risk</th><th style={cellStyle}>Expires</th><th style={cellStyle}>Actions</th></tr></thead><tbody>{state.items.map((claim) => {
          const isSelected = selectedClaimId === claim.id;
          return (
            <React.Fragment key={claim.id}>
              <tr><td style={cellStyle}><strong>#{claim.id}</strong><div style={mutedTextStyle}>{claim.status}</div></td><td style={cellStyle}><div><code>{claim.license?.uid || `license #${claim.license_id}`}</code></div><div style={mutedTextStyle}>{claim.license?.product?.name || "-"}</div></td><td style={cellStyle}>{claim.owner_user?.email || claim.license?.user?.email || `user #${claim.owner_user_id}` || "-"}</td><td style={cellStyle}><div>{claim.device_fingerprint || "-"}</div><div style={mutedTextStyle}>{[claim.platform, claim.plugin_version].filter(Boolean).join(" • ") || claim.machine_id || "-"}</div></td><td style={cellStyle}><div>{claim.risk_score ?? 0}</div><div style={mutedTextStyle}>{claim.risk_reasons?.join(", ") || "-"}</div></td><td style={cellStyle}>{claim.expires_at ? new Date(claim.expires_at).toLocaleString() : "-"}</td><td style={cellStyle}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={buttonStyle} onClick={() => toggleDetails(claim.id)}>{isSelected ? "Hide" : "View"}</button>{claim.status === "pending_confirmation" ? <button style={buttonStyle} onClick={() => approve(claim)}>Approve</button> : null}{claim.status === "pending_confirmation" ? <button style={dangerButtonStyle} onClick={() => reject(claim)}>Reject</button> : null}{claim.status !== "pending_confirmation" ? "-" : null}</div></td></tr>
              {isSelected ? <InlineDetailsRow colSpan={7} title={`Claim details • #${claim.id}`}><div style={detailGridStyle}><DetailItem label="Owner" value={claim.owner_user?.email || claim.license?.user?.email || "-"} /><DetailItem label="License" value={claim.license?.uid || `license #${claim.license_id}`} /><DetailItem label="Product" value={claim.license?.product?.name || "-"} /><DetailItem label="Risk score" value={claim.risk_score ?? 0} /><DetailItem label="Device" value={claim.device_fingerprint || "-"} /><DetailItem label="Machine" value={claim.machine_id || "-"} /><DetailItem label="Platform" value={claim.platform || "-"} /><DetailItem label="Request IP" value={claim.request_ip || "-"} /><DetailItem label="Expires" value={formatDateTime(claim.expires_at)} /><DetailItem label="Approved by" value={claim.approved_by_user?.email || claim.approved_by || "-"} /><DetailItem label="Approved at" value={formatDateTime(claim.approved_at)} /><DetailItem label="Rejected at" value={formatDateTime(claim.rejected_at)} /></div><div style={{ display: "grid", gap: 6 }}><span style={mutedTextStyle}>Risk reasons</span>{claim.risk_reasons?.length ? claim.risk_reasons.map((reason) => <div key={reason} style={mutedTextStyle}>{reason}</div>) : <span style={mutedTextStyle}>No risk reasons attached.</span>}</div>{claim.rejection_reason ? <DetailItem label="Rejection reason" value={claim.rejection_reason} /> : null}</InlineDetailsRow> : null}
            </React.Fragment>
          );
        })}</tbody></table>
        <div style={listFooterStyle}>
          <span style={mutedTextStyle}>{formatPaginationSummary({ offset: state.offset, limit: state.limit, total: state.total, count: state.items.length })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={hasPrevPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToPreviousPage} disabled={!hasPrevPage || state.loading}>Prev</button>
            <button style={hasNextPage && !state.loading ? buttonStyle : disabledButtonStyle} onClick={goToNextPage} disabled={!hasNextPage || state.loading}>Next</button>
          </div>
        </div>
      </DataState>
    </PageShell>
  );
};

const App = () => (
  <div style={{ padding: 24, color: themeColors.text }}>
    <nav style={navStyle}>
      <NavLink to="dashboard" style={linkStyle}>Dashboard</NavLink>
      <NavLink to="support" style={linkStyle}>Support</NavLink>
      <NavLink to="licenses" style={linkStyle}>Licenses</NavLink>
      <NavLink to="activations" style={linkStyle}>Activations</NavLink>
      <NavLink to="claims" style={linkStyle}>Claims</NavLink>
      <NavLink to="orders" style={linkStyle}>Orders</NavLink>
      <NavLink to="products" style={linkStyle}>Products</NavLink>
      <NavLink to="coupons" style={linkStyle}>Coupons</NavLink>
    </nav>
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="support" element={<SupportPage />} />
      <Route path="licenses" element={<LicensesPage />} />
      <Route path="activations" element={<ActivationsPage />} />
      <Route path="claims" element={<ClaimsPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="coupons" element={<CouponsPage />} />
    </Routes>
  </div>
);

export default App;