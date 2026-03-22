/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Licensed under the MIT License.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Flex,
  Typography,
  Card,
  CardContent,
  LoadingIndicatorPage,
  useNotifyAT,
  useFetchClient,
} from "@strapi/design-system";
import { useIntl } from "react-intl";
import { Key, CheckCircle, XCircle, Clock } from "@strapi/icons";

const StatCard = ({ icon, title, value, color }) => (
  <Card>
    <CardContent>
      <Flex alignItems="center" gap={4}>
        <Box background={color} padding={3} borderRadius="8px">
          {icon}
        </Box>
        <Box>
          <Typography variant="delta" textColor="neutral600">
            {title}
          </Typography>
          <Typography variant="beta" fontWeight="bold">
            {value}
          </Typography>
        </Box>
      </Flex>
    </CardContent>
  </Card>
);

const DashboardPage = () => {
  const { formatMessage } = useIntl();
  const { notify } = useNotifyAT();
  const { get } = useFetchClient();

  const [stats, setStats] = useState({
    totalLicenses: 0,
    activeLicenses: 0,
    revokedLicenses: 0,
    totalActivations: 0,
    activeActivations: 0,
    pendingOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);

      const [licensesRes, activationsRes, ordersRes] = await Promise.all([
        get("/admin/license-server/licenses?pagination[pageSize]=1"),
        get("/admin/license-server/activations?pagination[pageSize]=1"),
        get(
          "/admin/license-server/orders?filters[status]=pending&pagination[pageSize]=1",
        ),
      ]);

      const licensesMeta = licensesRes.data?.meta?.pagination;
      const activationsMeta = activationsRes.data?.meta?.pagination;
      const ordersMeta = ordersRes.data?.meta?.pagination;

      const [activeRes, revokedRes, activeActivationsRes] = await Promise.all([
        get(
          "/admin/license-server/licenses?filters[status]=active&pagination[pageSize]=1",
        ),
        get(
          "/admin/license-server/licenses?filters[status]=revoked&pagination[pageSize]=1",
        ),
        get("/admin/license-server/activations?pagination[pageSize]=1"),
      ]);

      setStats({
        totalLicenses: licensesMeta?.total || 0,
        activeLicenses: activeRes.data?.meta?.pagination?.total || 0,
        revokedLicenses: revokedRes.data?.meta?.pagination?.total || 0,
        totalActivations: activationsMeta?.total || 0,
        activeActivations:
          activeActivationsRes.data?.meta?.pagination?.total || 0,
        pendingOrders: ordersMeta?.total || 0,
      });
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Box padding={8}>
        <LoadingIndicatorPage />
      </Box>
    );
  }

  return (
    <Box padding={8}>
      <Typography variant="alpha" marginBottom={6}>
        {formatMessage({
          id: "license-server.dashboard.title",
          defaultMessage: "License Server Dashboard",
        })}
      </Typography>

      <Grid gap={4} gridCols={2}>
        <StatCard
          icon={<Key width="24" height="24" color="#4945FF" />}
          title={formatMessage({
            id: "license-server.dashboard.total",
            defaultMessage: "Total Licenses",
          })}
          value={stats.totalLicenses}
          color="#F0F0FF"
        />
        <StatCard
          icon={<CheckCircle width="24" height="24" color="#02B07A" />}
          title={formatMessage({
            id: "license-server.dashboard.active",
            defaultMessage: "Active Licenses",
          })}
          value={stats.activeLicenses}
          color="#E6F8F0"
        />
        <StatCard
          icon={<XCircle width="24" height="24" color="#D02B48" />}
          title={formatMessage({
            id: "license-server.dashboard.revoked",
            defaultMessage: "Revoked Licenses",
          })}
          value={stats.revokedLicenses}
          color="#FCE8EC"
        />
        <StatCard
          icon={<Clock width="24" height="24" color="#8B80F9" />}
          title={formatMessage({
            id: "license-server.dashboard.activations",
            defaultMessage: "Total Activations",
          })}
          value={stats.totalActivations}
          color="#F4F0FF"
        />
      </Grid>

      <Box marginTop={8}>
        <Card>
          <CardContent>
            <Typography variant="beta" fontWeight="bold" marginBottom={2}>
              {formatMessage({
                id: "license-server.dashboard.recent",
                defaultMessage: "Quick Stats",
              })}
            </Typography>
            <Typography textColor="neutral600">
              • {stats.pendingOrders} pending orders
            </Typography>
            <Typography textColor="neutral600">
              • {stats.activeActivations} active device activations
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default DashboardPage;
