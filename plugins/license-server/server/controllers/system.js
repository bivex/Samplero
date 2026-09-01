/**
 * Copyright (c) 2026 Bivex
 *
 * System Observability Controller (Liveness, Readiness, Prometheus Metrics)
 */

"use strict";

const LICENSE_MODEL = "plugin::license-server.license";
const ACTIVATION_MODEL = "plugin::license-server.activation";
const CLAIM_MODEL = "plugin::license-server.firstActivationClaim";
const ORDER_MODEL = "plugin::license-server.order";

const formatPrometheusMetric = (name, type, help, samples) => {
  let output = `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n`;
  for (const sample of samples) {
    const labels = sample.labels
      ? "{" +
        Object.entries(sample.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",") +
        "}"
      : "";
    output += `${name}${labels} ${sample.value}\n`;
  }
  return output;
};

module.exports = {
  async healthz(ctx) {
    ctx.body = {
      status: "ok",
      service: "strapi-license-server",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
    };
  },

  async readyz(ctx) {
    const checks = {
      database: "unknown",
      redis: "skipped",
      cert_signer: "skipped",
    };

    let isHealthy = true;

    // 1. Database check
    try {
      if (strapi.db && strapi.db.connection) {
        await strapi.db.connection.raw("SELECT 1");
        checks.database = "healthy";
      } else if (strapi.db) {
        await strapi.db.query(LICENSE_MODEL).findOne({ select: ["id"] });
        checks.database = "healthy";
      }
    } catch (err) {
      checks.database = `unhealthy: ${err.message}`;
      isHealthy = false;
    }

    // 2. Redis check
    const pluginConfig = strapi.config.get("plugin::license-server") || {};
    const redisEnabled = strapi.config.get("plugin.redis.enabled") || false;
    if (redisEnabled) {
      try {
        const redisClient = strapi.redis?.default || strapi.plugin("redis")?.service("redis")?.getClient?.();
        if (redisClient) {
          await redisClient.ping();
          checks.redis = "healthy";
        } else {
          checks.redis = "unhealthy: client unavailable";
          isHealthy = false;
        }
      } catch (err) {
        checks.redis = `unhealthy: ${err.message}`;
        isHealthy = false;
      }
    }

    // 3. Cert-Signer check (if remote mode)
    if (pluginConfig.signerMode === "remote" && pluginConfig.signerUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${pluginConfig.signerUrl.replace(/\/$/, "")}/healthz`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          checks.cert_signer = "healthy";
        } else {
          checks.cert_signer = `degraded: HTTP ${res.status}`;
          isHealthy = false;
        }
      } catch (err) {
        checks.cert_signer = `unhealthy: ${err.message}`;
        isHealthy = false;
      }
    }

    ctx.status = isHealthy ? 200 : 503;
    ctx.body = {
      status: isHealthy ? "ready" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
    };
  },

  async metrics(ctx) {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      let metricsText = "";

      metricsText += formatPrometheusMetric(
        "process_uptime_seconds",
        "gauge",
        "Total uptime in seconds",
        [{ value: uptime }]
      );

      metricsText += formatPrometheusMetric(
        "process_heap_bytes",
        "gauge",
        "Process memory heap used in bytes",
        [
          { labels: { type: "used" }, value: memoryUsage.heapUsed },
          { labels: { type: "total" }, value: memoryUsage.heapTotal },
          { labels: { type: "rss" }, value: memoryUsage.rss },
        ]
      );

      // Collect license domain metrics
      if (strapi.db) {
        try {
          const licenses = await strapi.db.query(LICENSE_MODEL).findMany({
            select: ["status"],
          });
          const licenseCounts = { active: 0, revoked: 0, expired: 0, pending: 0 };
          for (const l of licenses) {
            licenseCounts[l.status] = (licenseCounts[l.status] || 0) + 1;
          }

          metricsText += formatPrometheusMetric(
            "license_server_licenses_total",
            "gauge",
            "Total licenses by status",
            Object.entries(licenseCounts).map(([status, value]) => ({
              labels: { status },
              value,
            }))
          );

          const activations = await strapi.db.query(ACTIVATION_MODEL).findMany({
            select: ["platform", "revoked_at"],
          });
          const activationCounts = { mac: 0, windows: 0, linux: 0, other: 0 };
          let revokedActivations = 0;
          for (const a of activations) {
            if (a.revoked_at) {
              revokedActivations++;
            } else {
              const p = a.platform || "other";
              activationCounts[p] = (activationCounts[p] || 0) + 1;
            }
          }

          metricsText += formatPrometheusMetric(
            "license_server_activations_active_total",
            "gauge",
            "Total active activations by platform",
            Object.entries(activationCounts).map(([platform, value]) => ({
              labels: { platform },
              value,
            }))
          );

          metricsText += formatPrometheusMetric(
            "license_server_activations_revoked_total",
            "gauge",
            "Total revoked activations",
            [{ value: revokedActivations }]
          );
        } catch (_) {}
      }

      ctx.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      ctx.body = metricsText;
    } catch (err) {
      ctx.status = 500;
      ctx.body = `# Error generating metrics: ${err.message}\n`;
    }
  },
};
