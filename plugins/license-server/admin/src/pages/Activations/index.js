/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Licensed under the MIT License.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Typography,
  Button,
  Flex,
  SingleSelect,
  SingleSelectOption,
  LoadingIndicatorPage,
  useNotifyAT,
  useFetchClient,
} from "@strapi/design-system";
import { useIntl } from "react-intl";

const ActivationsPage = () => {
  const { formatMessage } = useIntl();
  const { notify } = useNotifyAT();
  const { get, post } = useFetchClient();

  const [activations, setActivations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [statusFilter, setStatusFilter] = useState("");

  const fetchActivations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        "pagination[page]": pagination.page,
        "pagination[pageSize]": pagination.pageSize,
        populate: "license,license.user,license.product",
      });
      if (statusFilter) {
        params.append("filters[status]", statusFilter);
      }

      const { data } = await get(`/admin/license-server/activations?${params}`);

      if (data?.data) {
        setActivations(data.data);
        if (data.meta?.pagination) {
          setPagination((prev) => ({ ...prev, ...data.meta.pagination }));
        }
      } else if (Array.isArray(data)) {
        setActivations(data);
      }
    } catch (error) {
      console.error("Failed to fetch activations:", error);
      notify({
        type: "warning",
        message: {
          id: "notification.error",
          defaultMessage: "Failed to fetch activations",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivations();
  }, [pagination.page, statusFilter]);

  const handleRevoke = async (activation) => {
    try {
      await post(`/admin/license-server/activations/${activation.id}/revoke`);
      notify({
        type: "success",
        message: {
          id: "license-server.activation.revoke.success",
          defaultMessage: "Activation revoked",
        },
      });
      fetchActivations();
    } catch (error) {
      notify({
        type: "warning",
        message: {
          id: "license-server.activation.revoke.error",
          defaultMessage: "Failed to revoke",
        },
      });
    }
  };

  const getStatusBadge = (activation) => {
    if (activation.revoked_at) {
      return <Badge variant="danger">Revoked</Badge>;
    }
    if (activation.last_checkin) {
      const lastCheck = new Date(activation.last_checkin);
      const now = new Date();
      const hoursSince = (now - lastCheck) / (1000 * 60 * 60);
      if (hoursSince > 48) {
        return <Badge variant="warning">Inactive</Badge>;
      }
    }
    return <Badge variant="success">Active</Badge>;
  };

  if (loading && activations.length === 0) {
    return (
      <Box padding={8}>
        <LoadingIndicatorPage />
      </Box>
    );
  }

  return (
    <Box padding={8}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="alpha">
          {formatMessage({
            id: "license-server.activations.title",
            defaultMessage: "Activations",
          })}
        </Typography>
        <Button onClick={fetchActivations}>
          {formatMessage({
            id: "license-server.activations.refresh",
            defaultMessage: "Refresh",
          })}
        </Button>
      </Flex>

      <Table colCount={6} rowCount={activations.length}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma">ID</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">User</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Product</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Device</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Status</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Last Check-in</Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {activations.map((activation) => (
            <Tr key={activation.id}>
              <Td>
                <Typography
                  textColor="neutral800"
                  style={{ fontFamily: "monospace", fontSize: "11px" }}
                >
                  {activation.id}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {activation.license?.user?.email || "-"}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {activation.license?.product?.name || "-"}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800" style={{ fontSize: "11px" }}>
                  {activation.device_fingerprint?.substring(0, 16)}...
                </Typography>
              </Td>
              <Td>{getStatusBadge(activation)}</Td>
              <Td>
                <Typography textColor="neutral800">
                  {activation.last_checkin
                    ? new Date(activation.last_checkin).toLocaleString()
                    : "Never"}
                </Typography>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

export default ActivationsPage;
