/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05
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
  TextInput,
  Modal,
  ModalLayout,
  ModalHeader,
  ModalBody,
  ModalFooter,
  LoadingIndicatorPage,
  useNotifyAT,
  useFetchClient,
} from "@strapi/design-system";
import { useIntl } from "react-intl";

const LicensesPage = () => {
  const { formatMessage } = useIntl();
  const { notify } = useNotifyAT();
  const { get, post, del } = useFetchClient();

  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);

  const fetchLicenses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        "pagination[page]": pagination.page,
        "pagination[pageSize]": pagination.pageSize,
        populate: "user,product,activations",
      });
      if (statusFilter) {
        params.append("filters[status]", statusFilter);
      }

      const { data } = await get(`/admin/license-server/licenses?${params}`);

      if (data?.data) {
        setLicenses(data.data);
        if (data.meta?.pagination) {
          setPagination((prev) => ({ ...prev, ...data.meta.pagination }));
        }
      } else if (Array.isArray(data)) {
        setLicenses(data);
      }
    } catch (error) {
      console.error("Failed to fetch licenses:", error);
      notify({
        type: "warning",
        message: {
          id: "notification.error",
          defaultMessage: "Failed to fetch licenses",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, [pagination.page, statusFilter]);

  const handleRevoke = async () => {
    if (!selectedLicense) return;

    try {
      await post(`/admin/license-server/licenses/${selectedLicense.id}/revoke`);
      notify({
        type: "success",
        message: {
          id: "license-server.revoke.success",
          defaultMessage: "License revoked successfully",
        },
      });
      setShowRevokeModal(false);
      setSelectedLicense(null);
      fetchLicenses();
    } catch (error) {
      notify({
        type: "warning",
        message: {
          id: "license-server.revoke.error",
          defaultMessage: "Failed to revoke license",
        },
      });
    }
  };

  const openRevokeModal = (license) => {
    setSelectedLicense(license);
    setShowRevokeModal(true);
  };

  const getStatusBadge = (status) => {
    const colors = {
      active: "success",
      revoked: "danger",
      expired: "warning",
      suspended: "neutral",
    };
    return <Badge>{status}</Badge>;
  };

  if (loading && licenses.length === 0) {
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
            id: "license-server.licenses.title",
            defaultMessage: "Licenses",
          })}
        </Typography>
        <SingleSelect
          label={formatMessage({
            id: "license-server.licenses.status",
            defaultMessage: "Status",
          })}
          onChange={setStatusFilter}
          value={statusFilter}
        >
          <SingleSelectOption value="">
            {formatMessage({
              id: "license-server.licenses.all",
              defaultMessage: "All",
            })}
          </SingleSelectOption>
          <SingleSelectOption value="active">
            {formatMessage({
              id: "license-server.licenses.active",
              defaultMessage: "Active",
            })}
          </SingleSelectOption>
          <SingleSelectOption value="revoked">
            {formatMessage({
              id: "license-server.licenses.revoked",
              defaultMessage: "Revoked",
            })}
          </SingleSelectOption>
          <SingleSelectOption value="expired">
            {formatMessage({
              id: "license-server.licenses.expired",
              defaultMessage: "Expired",
            })}
          </SingleSelectOption>
        </SingleSelect>
      </Flex>

      <Table colCount={7} rowCount={licenses.length}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.uid",
                  defaultMessage: "License Key",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.user",
                  defaultMessage: "User",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.product",
                  defaultMessage: "Product",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.status",
                  defaultMessage: "Status",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.activations",
                  defaultMessage: "Activations",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.expires",
                  defaultMessage: "Expires",
                })}
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: "license-server.licenses.actions",
                  defaultMessage: "Actions",
                })}
              </Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {licenses.map((license) => (
            <Tr key={license.id}>
              <Td>
                <Typography
                  textColor="neutral800"
                  style={{ fontFamily: "monospace", fontSize: "12px" }}
                >
                  {license.uid?.substring(0, 18)}...
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {license.user?.email || license.user?.username || "-"}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {license.product?.name || "-"}
                </Typography>
              </Td>
              <Td>{getStatusBadge(license.status)}</Td>
              <Td>
                <Typography textColor="neutral800">
                  {license.activations?.length || 0} /{" "}
                  {license.activation_limit || 3}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {license.expires_at
                    ? new Date(license.expires_at).toLocaleDateString()
                    : "Never"}
                </Typography>
              </Td>
              <Td>
                <Flex gap={2}>
                  {license.status === "active" && (
                    <Button
                      variant="danger-secondary"
                      size="S"
                      onClick={() => openRevokeModal(license)}
                    >
                      {formatMessage({
                        id: "license-server.licenses.revoke",
                        defaultMessage: "Revoke",
                      })}
                    </Button>
                  )}
                </Flex>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Modal open={showRevokeModal} onClose={() => setShowRevokeModal(false)}>
        <ModalLayout onClose={() => setShowRevokeModal(false)}>
          <ModalHeader>
            <Typography fontWeight="bold" textColor="neutral800">
              {formatMessage({
                id: "license-server.revoke.title",
                defaultMessage: "Revoke License",
              })}
            </Typography>
          </ModalHeader>
          <ModalBody>
            <Box>
              <Typography>
                {formatMessage({
                  id: "license-server.revoke.confirm",
                  defaultMessage:
                    "Are you sure you want to revoke this license? This action cannot be undone and all activations will be deactivated.",
                })}
              </Typography>
              {selectedLicense && (
                <Box marginTop={4} padding={4} background="neutral100">
                  <Typography>
                    <strong>License:</strong>{" "}
                    {selectedLicense.uid?.substring(0, 18)}...
                  </Typography>
                </Box>
              )}
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="tertiary"
              onClick={() => setShowRevokeModal(false)}
            >
              {formatMessage({
                id: "license-server.revoke.cancel",
                defaultMessage: "Cancel",
              })}
            </Button>
            <Button variant="danger" onClick={handleRevoke}>
              {formatMessage({
                id: "license-server.revoke.confirm",
                defaultMessage: "Revoke",
              })}
            </Button>
          </ModalFooter>
        </ModalLayout>
      </Modal>
    </Box>
  );
};

export default LicensesPage;
