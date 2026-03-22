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
  LoadingIndicatorPage,
  useNotifyAT,
  useFetchClient,
} from "@strapi/design-system";
import { useIntl } from "react-intl";

const ProductsPage = () => {
  const { formatMessage } = useIntl();
  const { notify } = useNotifyAT();
  const { get, del } = useFetchClient();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data } = await get(
        "/admin/license-server/products?populate=versions",
      );

      if (data?.data) {
        setProducts(data.data);
      } else if (Array.isArray(data)) {
        setProducts(data);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
      notify({
        type: "warning",
        message: {
          id: "notification.error",
          defaultMessage: "Failed to fetch products",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (product) => {
    if (!confirm(`Delete product "${product.name}"?`)) return;

    try {
      await del(`/admin/license-server/products/${product.id}`);
      notify({
        type: "success",
        message: {
          id: "license-server.product.delete.success",
          defaultMessage: "Product deleted",
        },
      });
      fetchProducts();
    } catch (error) {
      notify({
        type: "warning",
        message: {
          id: "license-server.product.delete.error",
          defaultMessage: "Failed to delete",
        },
      });
    }
  };

  if (loading && products.length === 0) {
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
            id: "license-server.products.title",
            defaultMessage: "Products",
          })}
        </Typography>
        <Button onClick={fetchProducts}>
          {formatMessage({
            id: "license-server.products.refresh",
            defaultMessage: "Refresh",
          })}
        </Button>
      </Flex>

      <Table colCount={5} rowCount={products.length}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma">Name</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Type</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Price</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Versions</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Status</Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {products.map((product) => (
            <Tr key={product.id}>
              <Td>
                <Typography textColor="neutral800" fontWeight="bold">
                  {product.name}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">{product.type}</Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {product.price_cents
                    ? `$${(product.price_cents / 100).toFixed(2)} ${product.currency || "USD"}`
                    : "Free"}
                </Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {product.versions?.length || 0}
                </Typography>
              </Td>
              <Td>
                {product.is_active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="neutral">Inactive</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

export default ProductsPage;
