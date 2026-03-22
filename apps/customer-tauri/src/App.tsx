/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-06 11:51
 * Last Updated: 2026-03-22 02:35
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

type ActionKind = "status" | "activate" | "validate" | "deactivate";
type RequestActionKind = ActionKind | "heartbeat" | "bootstrap";
type InspectorTab = "overview" | "request" | "response";

type FormState = {
  baseUrl: string;
  apiPrefix: string;
  licenseKey: string;
  deviceFingerprint: string;
  pluginVersion: string;
  platform: "win" | "mac" | "linux";
  activationId: string;
};

type DeviceCryptoStatus = {
  deviceFingerprint: string;
  algorithm: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  csrBase64: string;
  storagePath: string;
};

type CertificateBundle = {
  certificatePem: string;
  caCertificatePem: string | null;
  serial: string;
  mtlsEndpoint: string | null;
};

type NativeHttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type NativeHttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

type TransportState = {
  mtlsEndpoint: string;
  certificateSerial: string;
  installedAt: string;
  source: "" | "activate" | "bootstrap";
  hasCaCertificate: boolean;
};

type JourneyStep = {
  label: string;
  detail: string;
  state: "done" | "current" | "upcoming";
};

type ValidateTransportMode = "none" | "basic" | "signed" | "mtls";

type RequestPlan = {
  action: RequestActionKind;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: Record<string, unknown>;
};

type RequestLog = RequestPlan & {
  id: string;
  at: string;
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  error?: string;
};

type PersistResultOptions = {
  focus?: boolean;
};

type ActivationWorkerStatus = "idle" | "watching" | "confirmed";
type BackgroundValidationStatus = "idle" | "watching";

type StabilityTone = "ok" | "warn" | "bad" | "neutral";

type StabilitySummary = {
  tone: StabilityTone;
  label: string;
  detail: string;
};

const FORM_STORAGE_KEY = "samplero.customer.validator.v3.form";
const HISTORY_STORAGE_KEY = "samplero.customer.validator.v3.history";
const TRANSPORT_STORAGE_KEY = "samplero.customer.validator.v3.transport";
const DEMO_LICENSE = "seed-license-ultimate-active";
const HISTORY_LIMIT = 20;

const ACTION_META: Record<ActionKind, { label: string; path: string; note: string }> = {
  status: { label: "Check status", path: "GET /status", note: "Quick connectivity and freshness smoke check." },
  activate: { label: "Activate", path: "POST /activate", note: "Requests an activation and automatically attaches a native CSR." },
  validate: { label: "Validate", path: "GET /validate", note: "Validates a device/license pair, reads server stability signals, and auto-recovers with signed heartbeat when needed." },
  deactivate: { label: "Deactivate", path: "POST /deactivate", note: "Removes the current device activation from the backend." },
};

const detectPlatform = (): FormState["platform"] => {
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
};

const createNonce = () => crypto.randomUUID();
const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const prettyJson = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
const formatDuration = (durationMs: number) => `${durationMs} ms`;
const formatTimestamp = (iso: string) => new Date(iso).toLocaleString();
const formatRelativeTimestamp = (iso: string) => {
  if (!iso) return "—";
  const millis = Date.parse(iso);
  if (Number.isNaN(millis)) return iso;

  const diffSeconds = Math.round((millis - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const units = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ] as const;

  for (const [unitSeconds, label] of units) {
    if (absSeconds >= unitSeconds) {
      const amount = Math.round(absSeconds / unitSeconds);
      return diffSeconds >= 0
        ? `in ${amount} ${label}${amount === 1 ? "" : "s"}`
        : `${amount} ${label}${amount === 1 ? "" : "s"} ago`;
    }
  }

  return diffSeconds >= 0 ? "in under a minute" : "under a minute ago";
};
const normalizeBase = (form: FormState) => `${form.baseUrl.replace(/\/$/, "")}${form.apiPrefix.startsWith("/") ? form.apiPrefix : `/${form.apiPrefix}`}`;
const normalizeDeviceFingerprint = (value: string) => value.trim() || "samplero-tauri-device";

const buildCustomerPortalUrl = (baseUrl: string, route = "/account/licenses") => {
  try {
    const origin = new URL(baseUrl.trim() || "http://127.0.0.1:1337").origin;
    return `${origin}/customer/index.html#${route.startsWith("/") ? route : `/${route}`}`;
  } catch {
    return "";
  }
};

const createDefaultForm = (): FormState => ({
  baseUrl: "http://127.0.0.1:1337",
  apiPrefix: "/api/license-server/license",
  licenseKey: "",
  deviceFingerprint: `tauri-smoke-${Math.random().toString(36).slice(2, 10)}`,
  pluginVersion: "1.0.0-demo",
  platform: detectPlatform(),
  activationId: "",
});

const readStoredForm = (): FormState => {
  const defaults = createDefaultForm();
  try {
    const raw = window.localStorage.getItem(FORM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return defaults;

    const record = parsed as Record<string, unknown>;
    return {
      baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : defaults.baseUrl,
      apiPrefix: typeof record.apiPrefix === "string" ? record.apiPrefix : defaults.apiPrefix,
      licenseKey: typeof record.licenseKey === "string" ? record.licenseKey : defaults.licenseKey,
      deviceFingerprint: typeof record.deviceFingerprint === "string" ? record.deviceFingerprint : defaults.deviceFingerprint,
      pluginVersion: typeof record.pluginVersion === "string" ? record.pluginVersion : defaults.pluginVersion,
      platform: record.platform === "win" || record.platform === "mac" || record.platform === "linux" ? record.platform : defaults.platform,
      activationId: typeof record.activationId === "string" ? record.activationId : defaults.activationId,
    };
  } catch {
    return defaults;
  }
};

const readStoredHistory = (): RequestLog[] => {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredTransportState = (): TransportState => {
  try {
    const raw = window.localStorage.getItem(TRANSPORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      mtlsEndpoint: typeof parsed?.mtlsEndpoint === "string" ? parsed.mtlsEndpoint : "",
      certificateSerial: typeof parsed?.certificateSerial === "string" ? parsed.certificateSerial : "",
      installedAt: typeof parsed?.installedAt === "string" ? parsed.installedAt : "",
      source: parsed?.source === "activate" || parsed?.source === "bootstrap" ? parsed.source : "",
      hasCaCertificate: parsed?.hasCaCertificate === true,
    };
  } catch {
    return {
      mtlsEndpoint: "",
      certificateSerial: "",
      installedAt: "",
      source: "",
      hasCaCertificate: false,
    };
  }
};

const collectHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const buildBaseRequestPlan = (form: FormState, action: ActionKind): RequestPlan => {
  const endpointBase = normalizeBase(form);
  const requestHeaders: Record<string, string> = { Accept: "application/json" };
  let method = "GET";
  let url = endpointBase;
  let requestBody: Record<string, unknown> | undefined;

  if (action === "status") {
    requestHeaders["x-request-nonce"] = createNonce();
    url = `${endpointBase}/status?license_key=${encodeURIComponent(form.licenseKey.trim())}`;
  }

  if (action === "activate") {
    method = "POST";
    url = `${endpointBase}/activate`;
    requestHeaders["Content-Type"] = "application/json";
    requestBody = {
      license_key: form.licenseKey.trim(),
      device_fingerprint: form.deviceFingerprint.trim(),
      machine_id: form.deviceFingerprint.trim(),
      plugin_version: form.pluginVersion.trim(),
      platform: form.platform,
    };
  }

  if (action === "validate") {
    requestHeaders["x-request-nonce"] = createNonce();
    requestHeaders["x-request-timestamp"] = new Date().toISOString();
    const query = form.activationId.trim()
      ? `activation_id=${encodeURIComponent(form.activationId.trim())}`
      : `license_key=${encodeURIComponent(form.licenseKey.trim())}&device_fingerprint=${encodeURIComponent(form.deviceFingerprint.trim())}`;
    url = `${endpointBase}/validate?${query}`;
  }

  if (action === "deactivate") {
    method = "POST";
    url = `${endpointBase}/deactivate`;
    requestHeaders["Content-Type"] = "application/json";
    requestBody = {
      license_key: form.licenseKey.trim(),
      device_fingerprint: form.deviceFingerprint.trim(),
    };
  }

  return { action, method, url, requestHeaders, requestBody };
};

const buildValidateSignaturePayload = (form: FormState, requestHeaders: Record<string, string>) => {
  const freshnessFields = {
    request_nonce: requestHeaders["x-request-nonce"],
    request_timestamp: requestHeaders["x-request-timestamp"],
  };

  return form.activationId.trim()
    ? {
        activation_id: form.activationId.trim(),
        ...freshnessFields,
      }
    : {
        license_key: form.licenseKey.trim(),
        device_fingerprint: form.deviceFingerprint.trim(),
        ...freshnessFields,
      };
};

const buildHeartbeatRequestPlan = (form: FormState): RequestPlan => {
  const endpointBase = normalizeBase(form);
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-request-nonce": createNonce(),
    "x-request-timestamp": new Date().toISOString(),
  };

  const requestBody = form.activationId.trim()
    ? {
        activation_id: form.activationId.trim(),
        heartbeat_nonce: createNonce(),
      }
    : {
        license_key: form.licenseKey.trim(),
        device_fingerprint: form.deviceFingerprint.trim(),
        heartbeat_nonce: createNonce(),
      };

  return {
    action: "heartbeat",
    method: "POST",
    url: `${endpointBase}/heartbeat`,
    requestHeaders,
    requestBody,
  };
};

const buildBootstrapRequestPlan = (form: FormState): RequestPlan => {
  const endpointBase = normalizeBase(form);
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-request-nonce": createNonce(),
    "x-request-timestamp": new Date().toISOString(),
  };
  const requestBody = form.activationId.trim()
    ? { activation_id: form.activationId.trim() }
    : {
        license_key: form.licenseKey.trim(),
        device_fingerprint: form.deviceFingerprint.trim(),
      };

  return {
    action: "bootstrap",
    method: "POST",
    url: `${endpointBase}/bootstrap`,
    requestHeaders,
    requestBody,
  };
};

const buildHeartbeatSignaturePayload = (requestBody: Record<string, unknown>, requestHeaders: Record<string, string>) => ({
  ...requestBody,
  request_nonce: requestHeaders["x-request-nonce"],
  request_timestamp: requestHeaders["x-request-timestamp"],
});

const loadDeviceCrypto = async (deviceFingerprint: string) => invoke<DeviceCryptoStatus>("ensure_device_crypto", {
  deviceFingerprint: normalizeDeviceFingerprint(deviceFingerprint),
});

const signRequestPayload = async (payload: Record<string, unknown>) => invoke<string>("sign_payload", { payload });

const applyMtlsEndpointToPlan = (plan: RequestPlan, mtlsEndpoint: string): RequestPlan => {
  if (!mtlsEndpoint || (plan.action !== "validate" && plan.action !== "heartbeat")) {
    return plan;
  }

  try {
    const current = new URL(plan.url);
    return {
      ...plan,
      url: new URL(`${current.pathname}${current.search}`, mtlsEndpoint).toString(),
    };
  } catch {
    return plan;
  }
};

const readCertificateBundle = (body: unknown): CertificateBundle | null => {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.certificate !== "string" || !record.certificate.trim()) return null;
  const serial = typeof record.serial === "string"
    ? record.serial
    : typeof record.serial === "number"
      ? String(record.serial)
      : "";
  if (!serial) return null;

  return {
    certificatePem: record.certificate,
    caCertificatePem: typeof record.ca_certificate === "string" ? record.ca_certificate : null,
    serial,
    mtlsEndpoint: typeof record.mtls_endpoint === "string" ? record.mtls_endpoint : null,
  };
};

const extractActivationId = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.activation_id === "string") return record.activation_id;
  if (typeof record.activation_id === "number") return String(record.activation_id);
  if (record.activation && typeof record.activation === "object") {
    const nested = record.activation as Record<string, unknown>;
    if (typeof nested.id === "string" || typeof nested.id === "number") return String(nested.id);
    if (typeof nested.activation_id === "string") return nested.activation_id;
    if (typeof nested.activation_id === "number") return String(nested.activation_id);
  }
  return "";
};

const buildCurlCommand = (log: RequestLog) => {
  const lines = [`curl -i -X ${log.method} ${shellQuote(log.url)}`];
  Object.entries(log.requestHeaders).forEach(([key, value]) => {
    lines.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
  });
  if (log.requestBody) {
    lines.push(`  --data ${shellQuote(JSON.stringify(log.requestBody))}`);
  }
  return [
    ...lines.slice(0, 1),
    ...lines.slice(1).map((line) => `\\
${line}`),
  ].join(" ");
};

const buildAllRequestsExport = (history: RequestLog[]) => prettyJson({
  exportedAt: new Date().toISOString(),
  total: history.length,
  requests: history.map((entry) => ({
    id: entry.id,
    action: entry.action,
    method: entry.method,
    url: entry.url,
    at: entry.at,
    ok: entry.ok,
    status: entry.status,
    statusText: entry.statusText,
    durationMs: entry.durationMs,
    request: {
      headers: entry.requestHeaders,
      body: entry.requestBody ?? null,
    },
    response: {
      headers: entry.responseHeaders,
      body: entry.responseBody,
    },
    error: entry.error ?? null,
  })),
});

const buildAllCurlBundle = (history: RequestLog[]) => history.map((entry, index) => [
  `### ${index + 1}. ${entry.action.toUpperCase()} · ${entry.status || "network"} ${entry.statusText}`,
  `# at: ${entry.at}`,
  `# duration: ${entry.durationMs} ms`,
  buildCurlCommand(entry),
].join("\n")).join("\n\n");

const buildSmartHints = (log: RequestLog | null) => {
  if (!log) return [];
  const bodyText = prettyJson(log.responseBody).toLowerCase();
  const hints: string[] = [];

  if (!log.ok && log.status === 0) hints.push("Network failure: проверь, что Strapi/Nginx реально поднят и base URL доступен из Tauri webview.");
  if (log.status === 401 && bodyText.includes("signature")) hints.push("Похоже, сервер ждёт proof-of-possession подпись. Теперь app подписывает validate автоматически — если ошибка осталась, проверь approve activation и сохранённый public key из CSR.");
  if ((log.status === 400 || log.status === 401) && (bodyText.includes("freshness") || bodyText.includes("timestamp") || bodyText.includes("nonce"))) hints.push("Провал freshness-проверки: смотри вкладку Request и проверь nonce/timestamp, clock skew и что клиент не переиспользует старый nonce.");
  if (log.status === 409 && bodyText.includes("nonce already used")) hints.push("Сервер поймал replay по nonce. Это уже не generic policy fail: нужен новый nonce и повтор запроса, а если nonce и так новый — ищи повторную отправку на клиенте.");
  if (log.status === 503 && bodyText.includes("freshness store unavailable")) hints.push("Freshness store недоступен. Backend теперь честно сигналит это как 503 — проверь Redis/nonce store или dev fallback конфиг.");
  if (log.status === 401 && bodyText.includes("mtls")) hints.push("Эта среда требует mTLS. App теперь сам пытается получить cert через signed bootstrap и повторяет validate — если не помогло, открой bootstrap log и проверь owner approval / cert issuance.");
  if (log.status === 403) hints.push("Forbidden обычно указывает на policy/RBAC/ownership блокировку — смотри URL, body и текущую среду.");
  if (bodyText.includes("activation_not_found")) hints.push("Для deactivate/validate ещё нет реальной activation. Если activate вернул pending_confirmation, сначала нужно одобрение в customer account.");
  if (bodyText.includes("activation not found") && log.url.includes("activation_id=")) hints.push("Похоже, в форме остался stale activation_id. App теперь автоочищает его после такого 404 — просто нажми validate ещё раз.");
  if (bodyText.includes("device_already_activated")) hints.push("Этот device уже активирован. Это не поломка: повторный activate ожидаемо вернёт 400, а рабочий следующий шаг — validate или deactivate.");
  if (bodyText.includes("pending_confirmation")) hints.push("Первый activate может легитимно вернуться как pending_confirmation до одобрения владельцем лицензии.");
  if (bodyText.includes("first_activation_pending_confirmation")) hints.push("Backend вернул FIRST_ACTIVATION_PENDING_CONFIRMATION: это тот же pending first-activation flow, а не обычная поломка activate.");
  if (log.action === "validate" && log.status === 409 && bodyText.includes("awaiting_approval")) hints.push("Validate нашёл не ошибку, а pending first-activation claim: жди approve в customer portal, после чего worker/ручной validate должны перейти в valid=true.");
  if (log.action === "bootstrap" && bodyText.includes("pending_certificate")) hints.push("Bootstrap нашёл activation, но server ещё не отдал cert bundle. Обычно это значит: approve уже пошёл, но cert ещё не выпущен или не сохранён.");
  if (log.action === "bootstrap" && log.ok && bodyText.includes('"certificate"')) hints.push("Bootstrap успешно установил локальный client certificate. Следующий validate уже должен пойти по mTLS.");
  if (bodyText.includes("heartbeat_required")) hints.push("Сервер считает активацию нестабильной по heartbeat. Smart validate теперь может сам отправить signed heartbeat и повторно перепроверить статус.");
  if (log.ok && bodyText.includes('"valid": true')) hints.push("Сервер подтвердил license/device как valid=true.");
  if (log.action === "activate" && extractActivationId(log.responseBody)) hints.push(`Activation ID автоматически извлечён: ${extractActivationId(log.responseBody)}`);
  return hints;
};

const readResponseStatus = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const status = record.status;
  return typeof status === "string" ? status : "";
};

const readResponseAction = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const action = (body as Record<string, unknown>).action;
  return typeof action === "string" ? action : "";
};

const readResponseErrorMessage = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : "";
};

const readResponseClaimId = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const claimId = (body as Record<string, unknown>).claim_id;
  return typeof claimId === "string" || typeof claimId === "number" ? String(claimId) : "";
};

const readResponseExpiresAt = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const expiresAt = (body as Record<string, unknown>).expires_at;
  return typeof expiresAt === "string" ? expiresAt : "";
};

const readActivationFlowState = (body: unknown): "pending_confirmation" | "approved" | "" => {
  const status = readResponseStatus(body).toLowerCase();
  if (status === "pending_confirmation" || status === "approved") {
    return status as "pending_confirmation" | "approved";
  }

  const errorMessage = readResponseErrorMessage(body).toUpperCase();
  if (errorMessage === "FIRST_ACTIVATION_PENDING_CONFIRMATION") {
    return "pending_confirmation";
  }

  return "";
};

const readBooleanField = (body: unknown, field: string): boolean | null => {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "boolean" ? value : null;
};

const readNumberField = (body: unknown, field: string): number | null => {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
};

const readValidateTransportMode = (body: unknown): ValidateTransportMode => {
  const trustLevel = readNumberField(body, "trust_level") ?? 0;
  if (trustLevel >= 4) return "mtls";
  if (trustLevel >= 3) return "signed";
  if (trustLevel >= 1) return "basic";
  return "none";
};

const isValidResponse = (body: unknown): boolean => {
  if (!body || typeof body !== "object") return false;
  return (body as Record<string, unknown>).valid === true;
};

const isSameLicenseValidateRequest = (log: RequestLog | null, form: FormState): boolean => {
  if (!log || log.action !== "validate") return false;

  return (
    log.url.includes(`license_key=${encodeURIComponent(form.licenseKey.trim())}`) &&
    log.url.includes(`device_fingerprint=${encodeURIComponent(form.deviceFingerprint.trim())}`)
  );
};

const isSameLicenseStatusRequest = (log: RequestLog | null, form: FormState): boolean => {
  if (!log || log.action !== "status") return false;

  return log.url.includes(`license_key=${encodeURIComponent(form.licenseKey.trim())}`);
};

const isLogNewer = (left: RequestLog | null, right: RequestLog | null): boolean => {
  if (!left) return false;
  if (!right) return true;
  return Date.parse(left.at) > Date.parse(right.at);
};

const buildStabilitySummary = (validateLog: RequestLog | null, statusLog: RequestLog | null, form: FormState): StabilitySummary | null => {
  if (!validateLog || validateLog.action !== "validate" || !isSameLicenseValidateRequest(validateLog, form)) {
    return null;
  }

  const responseBody = validateLog.responseBody;
  const valid = isValidResponse(responseBody);
  const licenseStatus = readResponseStatus(responseBody) || "unknown";
  const action = readResponseAction(responseBody);
  const heartbeatValid = readBooleanField(responseBody, "heartbeat_valid");
  const downgradeDetected = readBooleanField(responseBody, "downgrade_detected") === true;
  const trustLevel = readNumberField(responseBody, "trust_level");
  const gracePeriodRemaining = readNumberField(responseBody, "grace_period_remaining");
  const activationCount = statusLog && isSameLicenseStatusRequest(statusLog, form)
    ? readNumberField(statusLog.responseBody, "activations_count")
    : null;

  if (licenseStatus === "pending_confirmation" || action === "awaiting_approval") {
    return {
      tone: "warn",
      label: "Awaiting owner approval",
      detail: "Server sees a pending first-activation claim for this device. Approve it in the customer portal, then validate again.",
    };
  }

  if (action === "heartbeat_required") {
    return {
      tone: "warn",
      label: "Needs heartbeat recovery",
      detail: gracePeriodRemaining && gracePeriodRemaining > 0
        ? `Server reports overdue heartbeat, but recovery is still possible for ~${gracePeriodRemaining}s.`
        : "Server reports grace period exhaustion: the client must refresh activation with heartbeat.",
    };
  }

  if (!valid) {
    return {
      tone: "bad",
      label: `License is not stable (${licenseStatus})`,
      detail: readResponseErrorMessage(responseBody) || "Server did not confirm the license/device as valid.",
    };
  }

  if (downgradeDetected) {
    return {
      tone: "bad",
      label: "Security downgrade detected",
      detail: "Server accepted the request but detected a trust downgrade. Investigate transport/security mode before shipping.",
    };
  }

  if (heartbeatValid === false) {
    return {
      tone: "warn",
      label: "License is valid but degraded",
      detail: `Server still accepts the activation, but heartbeat is stale${gracePeriodRemaining !== null ? ` (${gracePeriodRemaining}s grace remaining)` : ""}.`,
    };
  }

  if ((trustLevel ?? 0) < 3) {
    return {
      tone: "warn",
      label: "License is active with reduced trust",
      detail: `Server says the activation is valid, but trust level is only ${trustLevel ?? 0}.`,
    };
  }

  return {
    tone: "ok",
    label: "License is stable",
    detail: `Server confirms active status, healthy heartbeat, trust level ${trustLevel ?? 0}${activationCount !== null ? `, activations in use: ${activationCount}` : ""}.`,
  };
};

const buildCertificateState = (params: {
  transportState: TransportState;
  waitingForApproval: boolean;
  latestActivateStatus: "pending_confirmation" | "approved" | "";
  latestBootstrapLog: RequestLog | null;
  latestValidateConfirmsCurrentDevice: boolean;
  latestValidateTransportMode: ValidateTransportMode;
}) => {
  const {
    transportState,
    waitingForApproval,
    latestActivateStatus,
    latestBootstrapLog,
    latestValidateConfirmsCurrentDevice,
    latestValidateTransportMode,
  } = params;
  const bootstrapStatus = readResponseStatus(latestBootstrapLog?.responseBody);
  const bootstrapError = readResponseErrorMessage(latestBootstrapLog?.responseBody);

  if (transportState.certificateSerial && latestValidateTransportMode === "mtls" && latestValidateConfirmsCurrentDevice) {
    return {
      tone: "ok" as StabilityTone,
      label: "mTLS active",
      detail: "Client certificate installed locally and the latest validate confirmed the current device.",
    };
  }

  if (transportState.certificateSerial) {
    return {
      tone: "warn" as StabilityTone,
      label: "Certificate installed",
      detail: "Local certificate material is ready. Run validate to confirm the server now sees the device over mTLS.",
    };
  }

  if (latestValidateTransportMode === "signed" && latestValidateConfirmsCurrentDevice) {
    return {
      tone: "ok" as StabilityTone,
      label: "Signed validate active",
      detail: "The current device validates successfully with proof-of-possession signatures. No local client certificate is installed right now.",
    };
  }

  if (waitingForApproval) {
    return {
      tone: "neutral" as StabilityTone,
      label: "Waiting for owner approval",
      detail: "The device keypair is ready, but the certificate cannot be installed until the license owner approves the first activation.",
    };
  }

  if (bootstrapStatus === "pending_certificate") {
    return {
      tone: "warn" as StabilityTone,
      label: "Certificate sync pending",
      detail: "The server knows about the activation, but the certificate bundle was not available yet. Retry validate once issuance finishes.",
    };
  }

  if (latestBootstrapLog && !latestBootstrapLog.ok) {
    return {
      tone: "bad" as StabilityTone,
      label: "Bootstrap failed",
      detail: bootstrapError || "The bootstrap request did not install a certificate. Inspect the bootstrap log for the exact server response.",
    };
  }

  if (latestActivateStatus === "approved") {
    return {
      tone: "warn" as StabilityTone,
      label: "Activation approved",
      detail: "The activation exists, but no local certificate bundle is stored yet. The next validate should try bootstrap automatically.",
    };
  }

  return {
    tone: "neutral" as StabilityTone,
    label: "No certificate installed",
    detail: "No client certificate is currently stored for this license/device pair.",
  };
};

const buildApprovalJourney = (params: {
  deviceCryptoReady: boolean;
  latestActivateIsCurrent: boolean;
  waitingForApproval: boolean;
  latestActivateStatus: "pending_confirmation" | "approved" | "";
  transportState: TransportState;
  latestValidateConfirmsCurrentDevice: boolean;
  latestValidateTransportMode: ValidateTransportMode;
  alreadyActivated: boolean;
}) => {
  const {
    deviceCryptoReady,
    latestActivateIsCurrent,
    waitingForApproval,
    latestActivateStatus,
    transportState,
    latestValidateConfirmsCurrentDevice,
    latestValidateTransportMode,
    alreadyActivated,
  } = params;
  const activationDecisionDone = waitingForApproval
    ? false
    : latestActivateStatus === "approved" || latestValidateConfirmsCurrentDevice || alreadyActivated;
  const certificateOptionalInCurrentMode = latestValidateTransportMode === "signed" && !transportState.certificateSerial;
  const finalValidationLabel = latestValidateTransportMode === "mtls"
    ? "mTLS validate healthy"
    : latestValidateTransportMode === "signed"
      ? "Signed validate healthy"
      : "Validate healthy";
  const finalValidationDetail = latestValidateTransportMode === "mtls"
    ? "Latest validate confirmed the current device using the locally stored mTLS certificate."
    : latestValidateTransportMode === "signed"
      ? "Latest validate confirmed the current device with signed proof-of-possession; no local client certificate is required in this environment."
      : "Validate should succeed once activation is ready and any required certificate/bootstrap work is complete.";

  const steps: JourneyStep[] = [
    {
      label: "Device key + CSR ready",
      detail: deviceCryptoReady
        ? "Native RSA keypair is present and activate can attach a CSR automatically."
        : "Generate or refresh device crypto before trying activation.",
      state: deviceCryptoReady ? "done" : "current",
    },
    {
      label: "Activation requested",
      detail: latestActivateIsCurrent
        ? "The app already asked the server to activate this license/device pair."
        : "Run Activate to create or refresh the activation request.",
      state: latestActivateIsCurrent ? "done" : deviceCryptoReady ? "current" : "upcoming",
    },
    {
      label: "Approval / activation decision",
      detail: waitingForApproval
        ? "A human approval is still required in the customer portal."
        : latestValidateConfirmsCurrentDevice
          ? "The server already accepts this device, so no approval is currently blocking validation."
        : latestActivateStatus === "approved"
          ? "Server-side activation is approved and ready for certificate install."
          : "Once approved (or auto-approved), the server can issue the client certificate when this environment requires one.",
      state: waitingForApproval ? "current" : activationDecisionDone ? "done" : latestActivateIsCurrent ? "current" : "upcoming",
    },
    {
      label: certificateOptionalInCurrentMode ? "Certificate installed locally (optional here)" : "Certificate installed locally",
      detail: transportState.certificateSerial
        ? `Serial ${transportState.certificateSerial} is stored locally${transportState.source ? ` via ${transportState.source}` : ""}.`
        : certificateOptionalInCurrentMode
          ? "Current validation is already healthy via signed requests, so a local client certificate is optional in this environment."
        : "The app will save the cert immediately from activate or via the signed bootstrap step after approval.",
      state: transportState.certificateSerial || certificateOptionalInCurrentMode ? "done" : latestActivateStatus === "approved" ? "current" : "upcoming",
    },
    {
      label: finalValidationLabel,
      detail: latestValidateConfirmsCurrentDevice
        ? finalValidationDetail
        : "Validate should succeed after activation settles and keep heartbeat fresh in the background.",
      state: latestValidateConfirmsCurrentDevice ? "done" : transportState.certificateSerial ? "current" : "upcoming",
    },
  ];

  return steps;
};

async function requestJson(plan: RequestPlan) {
  const requestBodyText = plan.requestBody ? JSON.stringify(plan.requestBody) : undefined;
  const response = plan.action === "validate" || plan.action === "heartbeat"
    ? await invoke<NativeHttpResponse>("send_native_http_request", {
        request: {
          method: plan.method,
          url: plan.url,
          headers: plan.requestHeaders,
          body: requestBodyText,
        } satisfies NativeHttpRequest,
      }).then((nativeResponse) => new Response(nativeResponse.body, {
        status: nativeResponse.status,
        statusText: nativeResponse.statusText,
        headers: nativeResponse.headers,
      }))
    : await fetch(plan.url, {
        method: plan.method,
        headers: plan.requestHeaders,
        body: requestBodyText,
      });
  const text = await response.text();
  let responseBody: unknown = text;
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = text;
  }
  return { response, responseBody };
}

function App() {
  const [form, setForm] = useState<FormState>(() => readStoredForm());
  const [activeAction, setActiveAction] = useState<ActionKind | "">("");
  const [history, setHistory] = useState<RequestLog[]>(() => readStoredHistory());
  const [transportState, setTransportState] = useState<TransportState>(() => readStoredTransportState());
  const [selectedLogId, setSelectedLogId] = useState<string>(() => readStoredHistory()[0]?.id || "");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [portalFeedback, setPortalFeedback] = useState("");
  const [deviceCrypto, setDeviceCrypto] = useState<DeviceCryptoStatus | null>(null);
  const [deviceCryptoBusy, setDeviceCryptoBusy] = useState(false);
  const [deviceCryptoError, setDeviceCryptoError] = useState("");
  const [activationWorkerStatus, setActivationWorkerStatus] = useState<ActivationWorkerStatus>("idle");
  const [activationWorkerNote, setActivationWorkerNote] = useState("");
  const [backgroundValidationStatus, setBackgroundValidationStatus] = useState<BackgroundValidationStatus>("idle");
  const [backgroundValidationNote, setBackgroundValidationNote] = useState("");
  const activationPollInFlight = useRef(false);
  const backgroundValidationInFlight = useRef(false);
  const activationScopeRef = useRef(`${form.licenseKey.trim()}::${normalizeDeviceFingerprint(form.deviceFingerprint)}`);

  const endpointBase = useMemo(() => normalizeBase(form), [form]);
  const latest = history[0] || null;
  const selectedLog = history.find((entry) => entry.id === selectedLogId) || latest;
  const latestStatusLog = history.find((entry) => entry.action === "status") || null;
  const latestActivateLog = history.find((entry) => entry.action === "activate") || null;
  const latestBootstrapLog = history.find((entry) => entry.action === "bootstrap") || null;
  const latestValidateLog = history.find((entry) => entry.action === "validate") || null;
  const latestDeactivateLog = history.find((entry) => entry.action === "deactivate" && entry.ok) || null;
  const latestActivateStatus = readActivationFlowState(latestActivateLog?.responseBody);
  const latestValidateFlowState = readActivationFlowState(latestValidateLog?.responseBody);
  const latestActivateError = readResponseErrorMessage(latestActivateLog?.responseBody).toUpperCase();
  const smartHints = buildSmartHints(selectedLog);
  const customerApprovalUrl = buildCustomerPortalUrl(form.baseUrl, "/account/licenses");
  const latestActivateIsCurrent = isLogNewer(latestActivateLog, latestDeactivateLog);
  const latestValidateIsCurrent = isLogNewer(latestValidateLog, latestDeactivateLog);
  const latestValidateMatchesCurrentDevice = latestValidateIsCurrent && isSameLicenseValidateRequest(latestValidateLog, form);
  const pendingFromValidate = latestValidateMatchesCurrentDevice && latestValidateFlowState === "pending_confirmation";
  const pendingClaimSourceLog = pendingFromValidate ? latestValidateLog : latestActivateLog;
  const pendingClaimId = readResponseClaimId(pendingClaimSourceLog?.responseBody);
  const pendingClaimExpiresAt = readResponseExpiresAt(pendingClaimSourceLog?.responseBody);
  const alreadyActivated = latestActivateIsCurrent && latestActivateError === "DEVICE_ALREADY_ACTIVATED";
  const latestValidateConfirmsCurrentDevice = latestValidateIsCurrent && isSameLicenseValidateRequest(latestValidateLog, form) && isValidResponse(latestValidateLog?.responseBody);
  const latestValidateTransportMode = latestValidateConfirmsCurrentDevice ? readValidateTransportMode(latestValidateLog?.responseBody) : "none";
  const activationAutoConfirmed = latestValidateConfirmsCurrentDevice;
  const activationDecisionResolved = activationAutoConfirmed || alreadyActivated || Boolean(transportState.certificateSerial) || latestActivateStatus === "approved";
  const waitingForApproval = ((latestActivateIsCurrent && latestActivateStatus === "pending_confirmation") || pendingFromValidate) && !activationDecisionResolved;
  const deactivateBlockedByPendingClaim = waitingForApproval;
  const activateSeemsRedundant = alreadyActivated || activationAutoConfirmed;
  const stabilitySummary = buildStabilitySummary(latestValidateIsCurrent ? latestValidateLog : null, latestStatusLog, form);
  const backgroundValidationEnabled = Boolean(form.licenseKey.trim()) && !waitingForApproval && (activationAutoConfirmed || alreadyActivated || Boolean(form.activationId.trim()));
  const activationStateLabel = waitingForApproval
    ? "Pending confirmation"
    : latestValidateTransportMode === "mtls"
      ? "Validate healthy · mTLS"
    : latestValidateTransportMode === "signed"
      ? "Validate healthy · signed"
    : activateSeemsRedundant
      ? "Device already active"
    : form.activationId.trim()
      ? `Activation ready · ${form.activationId.trim()}`
      : "No activation id yet";
  const certificateState = buildCertificateState({
    transportState,
    waitingForApproval,
    latestActivateStatus,
    latestBootstrapLog,
    latestValidateConfirmsCurrentDevice,
    latestValidateTransportMode,
  });
  const approvalJourney = buildApprovalJourney({
    deviceCryptoReady: Boolean(deviceCrypto),
    latestActivateIsCurrent,
    waitingForApproval,
    latestActivateStatus,
    transportState,
    latestValidateConfirmsCurrentDevice,
    latestValidateTransportMode,
    alreadyActivated,
  });

  useEffect(() => {
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    window.localStorage.setItem(TRANSPORT_STORAGE_KEY, JSON.stringify(transportState));
  }, [transportState]);

  const clearActivationMaterial = async () => {
    await invoke("clear_activation_material");
    setTransportState({
      mtlsEndpoint: "",
      certificateSerial: "",
      installedAt: "",
      source: "",
      hasCaCertificate: false,
    });
  };

  const persistActivationMaterial = async (body: unknown, source: TransportState["source"]): Promise<CertificateBundle | null> => {
    const bundle = readCertificateBundle(body);
    if (!bundle) return null;

    await invoke("store_activation_material", {
      payload: {
        certificatePem: bundle.certificatePem,
        caCertificatePem: bundle.caCertificatePem ?? undefined,
      },
    });
    setTransportState({
      mtlsEndpoint: bundle.mtlsEndpoint || "",
      certificateSerial: bundle.serial,
      installedAt: new Date().toISOString(),
      source,
      hasCaCertificate: Boolean(bundle.caCertificatePem),
    });
    return bundle;
  };

  useEffect(() => {
    const currentScope = `${form.licenseKey.trim()}::${normalizeDeviceFingerprint(form.deviceFingerprint)}`;
    if (activationScopeRef.current === currentScope) return;
    activationScopeRef.current = currentScope;
    void clearActivationMaterial();
  }, [form.deviceFingerprint, form.licenseKey]);

  useEffect(() => {
    let cancelled = false;
    setDeviceCryptoBusy(true);

    loadDeviceCrypto(form.deviceFingerprint)
      .then((status) => {
        if (cancelled) return;
        setDeviceCrypto(status);
        setDeviceCryptoError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setDeviceCrypto(null);
        setDeviceCryptoError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setDeviceCryptoBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.deviceFingerprint]);

  useEffect(() => {
    if (!waitingForApproval || !form.licenseKey.trim()) {
      activationPollInFlight.current = false;
      if (latestValidateConfirmsCurrentDevice) {
        setActivationWorkerStatus("confirmed");
        setActivationWorkerNote("Activation detected automatically.");
      } else {
        setActivationWorkerStatus("idle");
        setActivationWorkerNote("");
      }
      return;
    }

    const worker = new Worker(new URL("./workers/activation-poll.worker.ts", import.meta.url), { type: "module" });
    let disposed = false;

    setActivationWorkerStatus("watching");
    setActivationWorkerNote("Waiting for approval and re-validating every 4s.");

    worker.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== "poll" || disposed || activationPollInFlight.current || activeAction) return;

      activationPollInFlight.current = true;
      void (async () => {
        try {
          const { response, responseBody } = await executeValidateFlow({ focus: false });
          if (disposed) return;

          if (response.ok && isValidResponse(responseBody)) {
            setActivationWorkerStatus("confirmed");
            setActivationWorkerNote("Approval detected — UI refreshed automatically.");
            worker.postMessage({ type: "stop" });
            worker.terminate();
            return;
          }

          setActivationWorkerStatus("watching");
          setActivationWorkerNote(`Still waiting for approval · last check ${new Date().toLocaleTimeString()}`);
        } catch {
          if (!disposed) {
            setActivationWorkerStatus("watching");
            setActivationWorkerNote("Auto-refresh retrying after a temporary network hiccup.");
          }
        } finally {
          activationPollInFlight.current = false;
        }
      })();
    };

    worker.postMessage({ type: "start", intervalMs: 4000 });

    return () => {
      disposed = true;
      activationPollInFlight.current = false;
      worker.postMessage({ type: "stop" });
      worker.terminate();
    };
  }, [activeAction, activationAutoConfirmed, form.apiPrefix, form.baseUrl, form.deviceFingerprint, form.licenseKey, form.platform, form.pluginVersion, waitingForApproval]);

  useEffect(() => {
    if (!backgroundValidationEnabled) {
      backgroundValidationInFlight.current = false;
      setBackgroundValidationStatus("idle");
      setBackgroundValidationNote("");
      return;
    }

    const worker = new Worker(new URL("./workers/activation-poll.worker.ts", import.meta.url), { type: "module" });
    let disposed = false;

    setBackgroundValidationStatus("watching");
    setBackgroundValidationNote("Background validate is running every 60 seconds.");

    worker.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (
        event.data?.type !== "poll" ||
        disposed ||
        activeAction ||
        activationPollInFlight.current ||
        backgroundValidationInFlight.current
      ) {
        return;
      }

      backgroundValidationInFlight.current = true;
      void (async () => {
        try {
          const result = await executeValidateFlow({ focus: false });
          if (disposed) return;

          const responseAction = readResponseAction(result.responseBody);
          if (result.response.ok && isValidResponse(result.responseBody) && responseAction !== "heartbeat_required") {
            setBackgroundValidationNote(`Background validate is healthy · last check ${new Date().toLocaleTimeString()}`);
          } else {
            setBackgroundValidationNote(`Background validate noticed server instability · last check ${new Date().toLocaleTimeString()}`);
          }
        } catch {
          if (!disposed) {
            setBackgroundValidationNote("Background validate hit a temporary network error and will retry in 60s.");
          }
        } finally {
          backgroundValidationInFlight.current = false;
        }
      })();
    };

    worker.postMessage({ type: "start", intervalMs: 60000, immediate: false });

    return () => {
      disposed = true;
      backgroundValidationInFlight.current = false;
      worker.postMessage({ type: "stop" });
      worker.terminate();
    };
  }, [activeAction, backgroundValidationEnabled, form.apiPrefix, form.baseUrl, form.deviceFingerprint, form.licenseKey, form.platform, form.pluginVersion]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      activationId: key === "licenseKey" || key === "deviceFingerprint"
        ? ""
        : current.activationId,
    }));
  };

  const persistResult = (entry: RequestLog, options: PersistResultOptions = {}) => {
    setHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT));
    if (options.focus !== false) {
      setSelectedLogId(entry.id);
      setInspectorTab("overview");
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await window.navigator.clipboard.writeText(value);
      setCopyFeedback(`${label} copied`);
      window.setTimeout(() => setCopyFeedback(""), 1400);
    } catch {
      setCopyFeedback("Clipboard denied");
      window.setTimeout(() => setCopyFeedback(""), 1400);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    setSelectedLogId("");
    setInspectorTab("overview");
  };

  const openApprovalPage = async () => {
    if (!customerApprovalUrl) {
      setPortalFeedback("Customer portal URL is invalid");
      window.setTimeout(() => setPortalFeedback(""), 1800);
      return;
    }

    try {
      await openUrl(customerApprovalUrl);
      setPortalFeedback("Approval page opened in browser");
    } catch {
      window.open(customerApprovalUrl, "_blank", "noopener,noreferrer");
      setPortalFeedback("Approval page opened with browser fallback");
    }

    window.setTimeout(() => setPortalFeedback(""), 1800);
  };

  const ensureDeviceCrypto = async () => {
    setDeviceCryptoBusy(true);
    try {
      const status = await loadDeviceCrypto(form.deviceFingerprint);
      setDeviceCrypto(status);
      setDeviceCryptoError("");
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeviceCrypto(null);
      setDeviceCryptoError(message);
      throw new Error(message);
    } finally {
      setDeviceCryptoBusy(false);
    }
  };

  const prepareRequestPlan = async (action: RequestActionKind) => {
    if (action === "heartbeat" || action === "bootstrap") {
      await ensureDeviceCrypto();
      const signedPlan = action === "heartbeat"
        ? buildHeartbeatRequestPlan(form)
        : buildBootstrapRequestPlan(form);
      signedPlan.requestHeaders["x-payload-signature"] = await signRequestPayload(
        buildHeartbeatSignaturePayload(signedPlan.requestBody || {}, signedPlan.requestHeaders),
      );
      return signedPlan;
    }

    const plan = buildBaseRequestPlan(form, action);

    if (action === "activate") {
      const cryptoStatus = await ensureDeviceCrypto();
      plan.requestBody = {
        ...(plan.requestBody || {}),
        csr: cryptoStatus.csrBase64,
      };
    }

    if (action === "validate") {
      await ensureDeviceCrypto();
      plan.requestHeaders["x-request-signature"] = await signRequestPayload(buildValidateSignaturePayload(form, plan.requestHeaders));
    }

    return plan;
  };

  const shouldAutoStabilize = (body: unknown) => readResponseAction(body) === "heartbeat_required";
  const isMtlsAuthRequired = (response: Response, body: unknown) => response.status === 403 && readResponseErrorMessage(body).toLowerCase().includes("mtls");

  const executeValidateFlow = async (options: PersistResultOptions = {}) => {
    const startedAt = performance.now();
    let failedPlan: RequestPlan | null = buildBaseRequestPlan(form, "validate");
    let activeMtlsEndpoint = transportState.mtlsEndpoint;

    const plan = applyMtlsEndpointToPlan(await prepareRequestPlan("validate"), activeMtlsEndpoint);
    failedPlan = plan;
    const { response, responseBody } = await requestJson(plan);
    persistResult({
      ...plan,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      responseHeaders: collectHeaders(response.headers),
      responseBody,
    }, options);

    let finalResponse = response;
    let finalResponseBody = responseBody;

    if (!response.ok && isMtlsAuthRequired(response, responseBody)) {
      const bootstrapPlan = await prepareRequestPlan("bootstrap");
      failedPlan = bootstrapPlan;
      const bootstrapStartedAt = performance.now();
      const bootstrapResult = await requestJson(bootstrapPlan);
      persistResult({
        ...bootstrapPlan,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ok: bootstrapResult.response.ok,
        status: bootstrapResult.response.status,
        statusText: bootstrapResult.response.statusText,
        durationMs: Math.round(performance.now() - bootstrapStartedAt),
        responseHeaders: collectHeaders(bootstrapResult.response.headers),
        responseBody: bootstrapResult.responseBody,
      }, { focus: false });

      finalResponse = bootstrapResult.response;
      finalResponseBody = bootstrapResult.responseBody;

      if (bootstrapResult.response.ok) {
        const bundle = await persistActivationMaterial(bootstrapResult.responseBody, "bootstrap");
        activeMtlsEndpoint = bundle?.mtlsEndpoint || activeMtlsEndpoint;

        const retryValidatePlan = applyMtlsEndpointToPlan(await prepareRequestPlan("validate"), activeMtlsEndpoint);
        failedPlan = retryValidatePlan;
        const retryValidateStartedAt = performance.now();
        const retryValidateResult = await requestJson(retryValidatePlan);
        persistResult({
          ...retryValidatePlan,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          ok: retryValidateResult.response.ok,
          status: retryValidateResult.response.status,
          statusText: retryValidateResult.response.statusText,
          durationMs: Math.round(performance.now() - retryValidateStartedAt),
          responseHeaders: collectHeaders(retryValidateResult.response.headers),
          responseBody: retryValidateResult.responseBody,
        }, options);
        finalResponse = retryValidateResult.response;
        finalResponseBody = retryValidateResult.responseBody;
      }
    }

    if (finalResponse.ok && shouldAutoStabilize(finalResponseBody)) {
      const heartbeatPlan = applyMtlsEndpointToPlan(await prepareRequestPlan("heartbeat"), activeMtlsEndpoint);
      failedPlan = heartbeatPlan;
      const heartbeatStartedAt = performance.now();
      const heartbeatResult = await requestJson(heartbeatPlan);
      persistResult({
        ...heartbeatPlan,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ok: heartbeatResult.response.ok,
        status: heartbeatResult.response.status,
        statusText: heartbeatResult.response.statusText,
        durationMs: Math.round(performance.now() - heartbeatStartedAt),
        responseHeaders: collectHeaders(heartbeatResult.response.headers),
        responseBody: heartbeatResult.responseBody,
      }, { focus: false });

      if (heartbeatResult.response.ok) {
        const finalValidatePlan = applyMtlsEndpointToPlan(await prepareRequestPlan("validate"), activeMtlsEndpoint);
        failedPlan = finalValidatePlan;
        const finalValidateStartedAt = performance.now();
        const finalValidateResult = await requestJson(finalValidatePlan);
        persistResult({
          ...finalValidatePlan,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          ok: finalValidateResult.response.ok,
          status: finalValidateResult.response.status,
          statusText: finalValidateResult.response.statusText,
          durationMs: Math.round(performance.now() - finalValidateStartedAt),
          responseHeaders: collectHeaders(finalValidateResult.response.headers),
          responseBody: finalValidateResult.responseBody,
        }, options);
        finalResponse = finalValidateResult.response;
        finalResponseBody = finalValidateResult.responseBody;
      }
    }

    if (
      finalResponse.status === 404 &&
      form.activationId.trim() &&
      readResponseErrorMessage(finalResponseBody).toLowerCase() === "activation not found"
    ) {
      setForm((current) => ({ ...current, activationId: "" }));
      await clearActivationMaterial();
    }

    if (finalResponse.status === 403 && readResponseErrorMessage(finalResponseBody).toLowerCase() === "activation revoked") {
      await clearActivationMaterial();
    }

    return { response: finalResponse, responseBody: finalResponseBody, failedPlan };
  };

  const runAction = async (action: ActionKind) => {
    if (!form.licenseKey.trim()) {
      persistResult({
        ...buildBaseRequestPlan(form, action),
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ok: false,
        status: 0,
        statusText: "LOCAL_VALIDATION",
        durationMs: 0,
        responseHeaders: {},
        responseBody: { error: "license_key is required" },
        error: "Enter a license key first.",
      });
      return;
    }

    const startedAt = performance.now();
    setActiveAction(action);
    let failedPlan: RequestPlan | null = buildBaseRequestPlan(form, action);

    try {
      if (action === "validate") {
        const result = await executeValidateFlow({ focus: true });
        failedPlan = result.failedPlan;
        return;
      }

      const plan = await prepareRequestPlan(action);
      failedPlan = plan;
      const { response, responseBody } = await requestJson(plan);
      const entry: RequestLog = {
        ...plan,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - startedAt),
        responseHeaders: collectHeaders(response.headers),
        responseBody,
      };
      persistResult(entry);

      if (action === "activate") {
        await persistActivationMaterial(responseBody, "activate");
        const activationId = extractActivationId(responseBody);
        setForm((current) => ({ ...current, activationId }));
        const flowState = readActivationFlowState(responseBody);
        setActivationWorkerStatus(flowState === "pending_confirmation" ? "watching" : "idle");
        setActivationWorkerNote(flowState === "pending_confirmation" ? "Waiting for approval and re-validating every 4s." : "");
      }

      if (action === "deactivate" && response.ok) {
        await clearActivationMaterial();
        setForm((current) => ({ ...current, activationId: "" }));
        setActivationWorkerStatus("idle");
        setActivationWorkerNote("");
      }
    } catch (error) {
      const fallbackPlan = failedPlan || buildBaseRequestPlan(form, action);
      persistResult({
        ...fallbackPlan,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ok: false,
        status: 0,
        statusText: "NETWORK_ERROR",
        durationMs: Math.round(performance.now() - startedAt),
        responseHeaders: {},
        responseBody: { error: error instanceof Error ? error.message : String(error) },
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActiveAction("");
    }
  };

  return (
    <main className="app-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Desktop validator + request inspector</p>
          <h1>Samplero Customer Validator</h1>
          <p className="muted">Теперь это не просто форма, а полноценный инспектор: видно, что именно ушло в API, какие headers и body были отправлены, что вернул сервер и сколько занял запрос.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Endpoint base</span><strong>{endpointBase}</strong></div>
          <div className="stat-card"><span>Last result</span><strong className={latest?.ok ? "status-ok" : latest ? "status-bad" : "status-neutral"}>{latest ? `${latest.status || "network"} · ${latest.action}` : "idle"}</strong></div>
          <div className="stat-card"><span>Saved logs</span><strong>{history.length}</strong></div>
        </div>
        <div className="hero-actions">
          <button onClick={() => setForm((current) => ({ ...current, licenseKey: DEMO_LICENSE }))}>Use demo seed</button>
          <button className="button-muted" onClick={() => setForm(createDefaultForm())}>Reset form</button>
          <button className="button-muted" onClick={clearHistory}>Clear logs</button>
        </div>
      </section>

      <section className="grid-two">
        <div className="card stack-gap">
          <div className="section-head"><h2>Connection</h2><span className="pill">Ready</span></div>
          <label><span>Base URL</span><input value={form.baseUrl} onChange={(event) => setField("baseUrl", event.currentTarget.value)} placeholder="http://127.0.0.1:1337" /></label>
          <label><span>API prefix</span><input value={form.apiPrefix} onChange={(event) => setField("apiPrefix", event.currentTarget.value)} placeholder="/api/license-server/license" /></label>
          <div className="endpoint-preview">Resolved base <code>{endpointBase}</code></div>
          <p className="hint">`status` автоматически шлёт `x-request-nonce`; `validate` подписывает canonical payload нативным RSA keypair и при strict mTLS сам пытается bootstrap-ить cert, если сервер уже требует client certificate.</p>
        </div>

        <div className="card stack-gap">
          <div className="section-head"><h2>License input</h2><span className="pill pill-soft">Persisted locally</span></div>
          <label><span>License key</span><input value={form.licenseKey} onChange={(event) => setField("licenseKey", event.currentTarget.value)} placeholder="seed-license-ultimate-active" /></label>
          <label><span>Device fingerprint</span><input value={form.deviceFingerprint} onChange={(event) => setField("deviceFingerprint", event.currentTarget.value)} placeholder="tauri-smoke-device" /></label>
          <div className="field-row">
            <label><span>Plugin version</span><input value={form.pluginVersion} onChange={(event) => setField("pluginVersion", event.currentTarget.value)} placeholder="1.0.0-demo" /></label>
            <label>
              <span>Platform</span>
              <select value={form.platform} onChange={(event) => setField("platform", event.currentTarget.value as FormState["platform"])}>
                <option value="mac">mac</option>
                <option value="win">win</option>
                <option value="linux">linux</option>
              </select>
            </label>
          </div>
          <label><span>Activation ID (optional for validate)</span><input value={form.activationId} onChange={(event) => setField("activationId", event.currentTarget.value)} placeholder="Auto-filled after activate when backend returns it" /></label>
          <div className="hint-card stack-gap">
            <div className="section-head">
              <strong>Device crypto</strong>
              <span className={`pill ${deviceCryptoError ? "pill-soft" : ""}`}>{deviceCryptoError ? "Error" : deviceCryptoBusy ? "Refreshing" : "Ready"}</span>
            </div>
            <div className="meta-grid meta-grid-wide">
              <div><span>Algorithm</span><strong>{deviceCrypto?.algorithm || "RSA-SHA256"}</strong></div>
              <div><span>Fingerprint</span><strong>{deviceCrypto?.publicKeyFingerprint.slice(0, 18) || "pending"}</strong></div>
              <div><span>CSR mode</span><strong>Auto-attached</strong></div>
            </div>
            <p className="hint">`activate` автоматически прикладывает CSR из нативного keypair. После owner approval app либо получает cert сразу из activate, либо доставляет его через signed bootstrap и переводит `validate`/`heartbeat` на mTLS transport.</p>
            <div className="inline-actions">
              <button className="button-muted" onClick={() => copyText("Public key", deviceCrypto?.publicKeyPem || "")} disabled={!deviceCrypto?.publicKeyPem}>Copy public key</button>
              <button className="button-muted" onClick={() => copyText("CSR", deviceCrypto?.csrBase64 || "")} disabled={!deviceCrypto?.csrBase64}>Copy CSR (base64)</button>
              <button className="button-muted" onClick={() => ensureDeviceCrypto().catch(() => undefined)} disabled={deviceCryptoBusy}>Refresh crypto</button>
            </div>
            <div className="endpoint-preview">Key storage <code>{deviceCrypto?.storagePath || "initializing"}</code></div>
            {deviceCryptoError ? <div className="status-bad">{deviceCryptoError}</div> : null}
          </div>
        </div>
      </section>

      <section className="grid-two">
        <div className="card stack-gap">
          <div className="section-head">
            <h2>Certificate &amp; mTLS</h2>
            <span className={certificateState.tone === "ok" ? "status-ok" : certificateState.tone === "bad" ? "status-bad" : "status-neutral"}>{certificateState.label}</span>
          </div>
          <p className="hint">{certificateState.detail}</p>
          <div className="meta-grid meta-grid-wide">
            <div><span>Certificate serial</span><strong>{transportState.certificateSerial || "not installed"}</strong></div>
            <div><span>Installed</span><strong>{transportState.installedAt ? `${formatTimestamp(transportState.installedAt)} · ${formatRelativeTimestamp(transportState.installedAt)}` : "—"}</strong></div>
            <div><span>Source</span><strong>{transportState.source === "activate" ? "activate response" : transportState.source === "bootstrap" ? "bootstrap sync" : "not installed"}</strong></div>
            <div><span>mTLS endpoint</span><strong>{transportState.mtlsEndpoint || endpointBase}</strong></div>
            <div><span>CA bundle</span><strong>{transportState.hasCaCertificate ? "stored" : "not stored"}</strong></div>
            <div><span>Last bootstrap</span><strong>{latestBootstrapLog ? `${formatTimestamp(latestBootstrapLog.at)} · ${readResponseStatus(latestBootstrapLog.responseBody) || latestBootstrapLog.status}` : "not used yet"}</strong></div>
          </div>
          <div className="inline-actions">
            {transportState.certificateSerial ? <button className="button-muted" onClick={() => copyText("Certificate serial", transportState.certificateSerial)}>Copy serial</button> : null}
            {transportState.mtlsEndpoint ? <button className="button-muted" onClick={() => copyText("mTLS endpoint", transportState.mtlsEndpoint)}>Copy mTLS endpoint</button> : null}
            {waitingForApproval ? <button onClick={openApprovalPage}>Open approval page</button> : null}
          </div>
        </div>

        <div className="card stack-gap">
          <div className="section-head">
            <h2>Approval / bootstrap flow</h2>
            <span className="pill pill-soft">{waitingForApproval ? "Awaiting owner" : latestValidateTransportMode === "mtls" ? "mTLS healthy" : latestValidateTransportMode === "signed" ? "Signed healthy" : latestValidateConfirmsCurrentDevice ? "Healthy" : "Guided"}</span>
          </div>
          <p className="hint">Вместо ручного чеклиста app показывает, на каком шаге застрял flow: activation request, owner approval, cert install или финальный validate (signed либо over mTLS).</p>
          <div className="stack-gap">
            {approvalJourney.map((step) => (
              <div key={step.label} className="hint-card stack-gap">
                <div className="section-head">
                  <strong>{step.label}</strong>
                  <span className={step.state === "done" ? "status-ok" : step.state === "current" ? "status-neutral" : "muted"}>{step.state === "done" ? "Done" : step.state === "current" ? "Current" : "Later"}</span>
                </div>
                <p className="hint">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card stack-gap">
        <div className="section-head"><h2>Action runner</h2><span className="pill pill-soft">{activeAction ? `Running ${ACTION_META[activeAction].label}` : "Idle"}</span></div>
        <div className="stat-card">
          <span>Activation state</span>
          <strong className={deactivateBlockedByPendingClaim ? "status-neutral" : "status-ok"}>{activationStateLabel}</strong>
        </div>
        <div className="button-row">
          {(Object.keys(ACTION_META) as ActionKind[]).map((action) => (
            <button
              key={action}
              className={action === "deactivate" ? "button-danger" : ""}
              disabled={Boolean(activeAction) || (action === "deactivate" && deactivateBlockedByPendingClaim) || (action === "activate" && (activateSeemsRedundant || waitingForApproval))}
              onClick={() => runAction(action)}
              title={action === "deactivate" && deactivateBlockedByPendingClaim
                ? "First activation is still pending confirmation, so there is no activation to revoke yet."
                : action === "activate" && waitingForApproval
                  ? "Approval is still pending. The worker will auto-refresh the UI once activation completes."
                  : action === "activate" && activateSeemsRedundant
                    ? "This device is already active. Use Validate to check it or Deactivate to revoke it."
                  : undefined}
            >
              {activeAction === action ? `${ACTION_META[action].label}…` : ACTION_META[action].label}
            </button>
          ))}
        </div>
        {activateSeemsRedundant ? (
          <div className="hint-card">
            <strong>Device already active</strong>
            <p className="hint">Повторный <code>activate</code> для этого fingerprint закономерно даёт <code>DEVICE_ALREADY_ACTIVATED</code>. Это нормальный guard backend, а не поломка.</p>
            <p className="hint">Для текущего устройства используй <code>validate</code>, а если хочешь освободить слот — <code>deactivate</code>.</p>
          </div>
        ) : null}
        {activationWorkerStatus !== "idle" ? (
          <div className="hint-card">
            <strong>{activationWorkerStatus === "confirmed" ? "Auto-refresh worker confirmed activation" : "Auto-refresh worker is watching approval"}</strong>
            <p className="hint">{activationWorkerNote || "Background validation worker is active."}</p>
          </div>
        ) : null}
        {backgroundValidationStatus === "watching" ? (
          <div className="hint-card">
            <strong>Background validate worker</strong>
            <p className="hint">{backgroundValidationNote || "Signed validate runs every 60 seconds in the background."}</p>
          </div>
        ) : null}
        {stabilitySummary ? (
          <div className="hint-card stack-gap">
            <div className="section-head">
              <strong>Server stability verdict</strong>
              <span className={stabilitySummary.tone === "ok" ? "status-ok" : stabilitySummary.tone === "bad" ? "status-bad" : "status-neutral"}>{stabilitySummary.label}</span>
            </div>
            <p className="hint">{stabilitySummary.detail}</p>
            <p className="hint">`Validate` теперь ориентируется на серверные сигналы `heartbeat_valid`, `grace_period_remaining`, `trust_level` и при необходимости сам делает signed heartbeat recovery.</p>
          </div>
        ) : null}
        {deactivateBlockedByPendingClaim ? (
          <div className="hint-card">
            <strong>Approval required in customer portal</strong>
            <p className="hint">Deactivate временно заблокирован: последний `activate` ещё в pending first-activation flow, значит backend пока не создал activation record.</p>
            <p className="hint">{pendingClaimId ? `Claim #${pendingClaimId}` : "Pending claim created"}{pendingClaimExpiresAt ? ` · expires ${formatTimestamp(pendingClaimExpiresAt)}` : ""}</p>
            <div className="inline-actions">
              <button onClick={openApprovalPage}>Open approval page</button>
              <button className="button-muted" onClick={() => copyText("Approval URL", customerApprovalUrl)} disabled={!customerApprovalUrl}>Copy approval link</button>
              {portalFeedback ? <span className="pill pill-soft">{portalFeedback}</span> : null}
            </div>
            <div className="endpoint-preview">Customer portal <code>{customerApprovalUrl || "invalid URL"}</code></div>
          </div>
        ) : null}
        <div className="endpoint-grid">
          {(Object.keys(ACTION_META) as ActionKind[]).map((action) => (
            <div key={action} className="endpoint-card">
              <div className="endpoint-top"><strong>{ACTION_META[action].label}</strong><code>{ACTION_META[action].path}</code></div>
              <p className="muted">{ACTION_META[action].note}</p>
            </div>
          ))}
        </div>
        <p className="hint">История запросов сохраняется локально, так что можно перезапустить Tauri и всё ещё видеть, что именно приходило и уходило.</p>
      </section>

      <section className="inspector-layout">
        <aside className="card stack-gap inspector-sidebar">
          <div className="section-head"><h2>Request history</h2><span className="pill pill-soft">{history.length}</span></div>
          {history.length ? (
            <ul className="history-list">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button className={`history-item ${selectedLog?.id === entry.id ? "history-item-active" : ""}`} onClick={() => setSelectedLogId(entry.id)}>
                    <div className="history-item-top"><strong>{entry.action}</strong><span className={entry.ok ? "status-ok" : "status-bad"}>{entry.status || "network"}</span></div>
                    <div className="history-item-meta"><span>{entry.method}</span><span>{formatDuration(entry.durationMs)}</span></div>
                    <code>{entry.url}</code>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Пока ничего не отправляли.</p>}
        </aside>

        <div className="card stack-gap inspector-main">
          <div className="section-head">
            <h2>Inspector</h2>
            <div className="inline-actions">
              {copyFeedback ? <span className="pill pill-soft">{copyFeedback}</span> : null}
              {history.length ? <button className="button-muted" onClick={() => copyText("All requests", buildAllRequestsExport(history))}>Copy all requests</button> : null}
              {history.length ? <button className="button-muted" onClick={() => copyText("cURL bundle", buildAllCurlBundle(history))}>Copy all as cURL bundle</button> : null}
              {selectedLog ? <button className="button-muted" onClick={() => copyText("cURL", buildCurlCommand(selectedLog))}>Copy cURL</button> : null}
              {selectedLog ? <button className="button-muted" onClick={() => copyText("Response JSON", prettyJson(selectedLog.responseBody))}>Copy response</button> : null}
            </div>
          </div>

          {selectedLog ? (
            <>
              <div className="meta-grid meta-grid-wide">
                <div><span>Action</span><strong>{selectedLog.action}</strong></div>
                <div><span>HTTP</span><strong>{selectedLog.method}</strong></div>
                <div><span>Status</span><strong className={selectedLog.ok ? "status-ok" : "status-bad"}>{selectedLog.status || "network"} {selectedLog.statusText}</strong></div>
                <div><span>Duration</span><strong>{formatDuration(selectedLog.durationMs)}</strong></div>
                <div><span>Time</span><strong>{formatTimestamp(selectedLog.at)}</strong></div>
                <div><span>URL</span><strong>{selectedLog.url}</strong></div>
              </div>

              {smartHints.length ? <div className="hint-list">{smartHints.map((hint) => <div key={hint} className="hint-card">{hint}</div>)}</div> : null}

              <div className="tab-row">
                {(["overview", "request", "response"] as InspectorTab[]).map((tab) => (
                  <button key={tab} className={`tab-button ${inspectorTab === tab ? "tab-button-active" : "button-muted"}`} onClick={() => setInspectorTab(tab)}>{tab}</button>
                ))}
              </div>

              {inspectorTab === "overview" ? (
                <div className="inspector-panels">
                  <div className="panel-block">
                    <div className="panel-head"><strong>Request snapshot</strong><button className="button-muted" onClick={() => copyText("Request JSON", prettyJson({ headers: selectedLog.requestHeaders, body: selectedLog.requestBody }))}>Copy</button></div>
                    <pre>{prettyJson({ method: selectedLog.method, url: selectedLog.url, headers: selectedLog.requestHeaders, body: selectedLog.requestBody ?? null })}</pre>
                  </div>
                  <div className="panel-block">
                    <div className="panel-head"><strong>Response snapshot</strong><button className="button-muted" onClick={() => copyText("Response JSON", prettyJson(selectedLog.responseBody))}>Copy</button></div>
                    <pre>{prettyJson(selectedLog.responseBody)}</pre>
                  </div>
                </div>
              ) : null}

              {inspectorTab === "request" ? (
                <div className="stack-gap">
                  <div className="panel-block">
                    <div className="panel-head"><strong>cURL replay</strong><button className="button-muted" onClick={() => copyText("cURL", buildCurlCommand(selectedLog))}>Copy</button></div>
                    <pre>{buildCurlCommand(selectedLog)}</pre>
                  </div>
                  <div className="panel-block"><strong>Request headers</strong><pre>{prettyJson(selectedLog.requestHeaders)}</pre></div>
                  <div className="panel-block"><strong>Request body</strong><pre>{prettyJson(selectedLog.requestBody ?? null)}</pre></div>
                </div>
              ) : null}

              {inspectorTab === "response" ? (
                <div className="stack-gap">
                  <div className="panel-block"><strong>Response headers</strong><pre>{prettyJson(selectedLog.responseHeaders)}</pre></div>
                  <div className="panel-block"><strong>Response body</strong><pre>{prettyJson(selectedLog.responseBody)}</pre></div>
                </div>
              ) : null}
            </>
          ) : <p className="muted">Выбери запрос слева или сначала выполни любой action.</p>}
        </div>
      </section>
    </main>
  );
}

export default App;