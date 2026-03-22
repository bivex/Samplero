/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:33
 * Last Updated: 2026-03-22 02:33
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { describe, expect, it } from 'bun:test';
import {
  SAMPLE_ACTIVATIONS,
  SAMPLE_LICENSES,
  SAMPLE_PRODUCTS,
  bootstrapSeed,
  seedActivations,
  seedLicenses,
  seedProducts,
} from '../src/index';

function createMockStrapi(overrides: any = {}) {
  const withIds = (records: any[]) =>
    records.map((record, index) => ({ id: record.id ?? index + 1, ...record }));

  const state = {
    admins: overrides.admins ?? [{ id: 1, email: 'admin@bivex.io' }],
    adminRoles: overrides.adminRoles ?? [{ id: 7, code: 'strapi-super-admin' }],
    products: withIds(overrides.products ?? []),
    licenses: withIds(overrides.licenses ?? []),
    activations: withIds(overrides.activations ?? []),
  };

  return {
    state,
    strapi: {
      query(model: string) {
        if (model === 'admin::user') {
          return {
            findMany: async () => state.admins,
            create: async ({ data }: any) => {
              const admin = { id: state.admins.length + 1, ...data };
              state.admins.push(admin);
              return admin;
            },
            update: async ({ where, data }: any) => ({ id: where.id, ...data }),
          };
        }

        if (model === 'admin::role') {
          return { findMany: async () => state.adminRoles };
        }

        throw new Error(`Unsupported query model: ${model}`);
      },
      db: {
        query(model: string) {
          if (model === 'plugin::license-server.product') {
            return {
              findMany: async () => state.products,
              create: async ({ data }: any) => {
                const record = { id: state.products.length + 1, ...data };
                state.products.push(record);
                return record;
              },
            };
          }

          if (model === 'plugin::license-server.license') {
            return {
              findMany: async () => state.licenses,
              create: async ({ data }: any) => {
                const record = { id: state.licenses.length + 1, ...data };
                state.licenses.push(record);
                return record;
              },
            };
          }

          if (model === 'plugin::license-server.activation') {
            return {
              findMany: async () => state.activations,
              create: async ({ data }: any) => {
                const record = { id: state.activations.length + 1, ...data };
                state.activations.push(record);
                return record;
              },
            };
          }

          throw new Error(`Unsupported db model: ${model}`);
        },
      },
    },
  };
}

describe('bootstrap seed helpers', () => {
  it('seeds sample products when the collection is empty', async () => {
    const { strapi, state } = createMockStrapi({ products: [] });

    const products = await seedProducts(strapi);

    expect(products).toHaveLength(SAMPLE_PRODUCTS.length);
    expect(state.products.map((product: any) => product.slug)).toEqual(
      SAMPLE_PRODUCTS.map((product) => product.slug),
    );
  });

  it('seeds sample licenses linked to products when the collection is empty', async () => {
    const { strapi, state } = createMockStrapi({ products: SAMPLE_PRODUCTS });

    const licenses = await seedLicenses(strapi, state.products);

    expect(licenses).toHaveLength(SAMPLE_LICENSES.length);
    expect(state.licenses.map((license: any) => license.uid)).toEqual(
      SAMPLE_LICENSES.map((license) => license.uid),
    );
    expect(state.licenses.every((license: any) => typeof license.product === 'number')).toBe(true);
  });

  it('seeds sample activations linked to licenses when the collection is empty', async () => {
    const { strapi, state } = createMockStrapi({ products: SAMPLE_PRODUCTS });
    await seedLicenses(strapi, state.products);

    const activations = await seedActivations(strapi, state.licenses);

    expect(activations).toHaveLength(SAMPLE_ACTIVATIONS.length);
    expect(state.activations.map((activation: any) => activation.certificate_serial)).toEqual(
      SAMPLE_ACTIVATIONS.map((activation) => activation.certificate_serial),
    );
    expect(state.activations.every((activation: any) => typeof activation.license_id === 'number')).toBe(true);
  });

  it('skips duplicate seeding for products, licenses, and activations', async () => {
    const existingProduct = { id: 1, slug: 'existing-product' };
    const existingLicense = { id: 1, uid: 'existing-license', product: 1 };
    const existingActivation = { id: 1, license_id: 1, certificate_serial: 'EXISTINGCERT' };
    const { strapi } = createMockStrapi({
      products: [existingProduct],
      licenses: [existingLicense],
      activations: [existingActivation],
    });

    expect(await seedProducts(strapi)).toEqual([existingProduct]);
    expect(await seedLicenses(strapi)).toEqual([existingLicense]);
    expect(await seedActivations(strapi)).toEqual([existingActivation]);
  });

  it('bootstraps products, licenses, and activations together', async () => {
    const { strapi, state } = createMockStrapi({
      admins: [{ id: 1, email: 'existing-admin@bivex.io' }],
      products: [],
      licenses: [],
      activations: [],
    });

    await bootstrapSeed(strapi);

    expect(state.products).toHaveLength(SAMPLE_PRODUCTS.length);
    expect(state.licenses).toHaveLength(SAMPLE_LICENSES.length);
    expect(state.activations).toHaveLength(SAMPLE_ACTIVATIONS.length);
  });
});