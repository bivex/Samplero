/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 06:49
 * Last Updated: 2026-03-05 06:49
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { hash } from 'bcryptjs';

const ADMIN_EMAIL = 'admin@bivex.io';
const ADMIN_PASSWORD = 'Admin123!@#';
const ADMIN_FIRSTNAME = 'Admin';
const ADMIN_LASTNAME = 'Bivex';

const PRODUCT_MODEL = 'plugin::license-server.product';
const LICENSE_MODEL = 'plugin::license-server.license';
const ACTIVATION_MODEL = 'plugin::license-server.activation';

export const SAMPLE_PRODUCTS = [
  {
    name: 'Ultimate Synth Bundle',
    slug: 'ultimate-synth-bundle',
    type: 'plugin',
    description: 'A collection of premium synthesizer plugins for music production',
    price_cents: 9999,
    currency: 'USD',
    is_active: true,
  },
  {
    name: 'Ambient Soundscapes',
    slug: 'ambient-soundscapes',
    type: 'sample_pack',
    description: 'High-quality ambient samples and textures for film and game audio',
    price_cents: 4999,
    currency: 'USD',
    is_active: true,
  },
  {
    name: 'Drum Master Pro',
    slug: 'drum-master-pro',
    type: 'plugin',
    description: 'Professional drum synthesis and processing plugin',
    price_cents: 7999,
    currency: 'USD',
    is_active: true,
  },
];

export const SAMPLE_LICENSES = [
  {
    uid: 'seed-license-ultimate-active',
    productSlug: 'ultimate-synth-bundle',
    status: 'active',
    activation_limit: 3,
    issued_at: new Date('2026-01-15T09:00:00.000Z'),
    expires_at: null,
    revoked_at: null,
    revocation_reason: null,
  },
  {
    uid: 'seed-license-ambient-revoked',
    productSlug: 'ambient-soundscapes',
    status: 'revoked',
    activation_limit: 2,
    issued_at: new Date('2026-01-10T09:00:00.000Z'),
    expires_at: null,
    revoked_at: new Date('2026-02-01T09:00:00.000Z'),
    revocation_reason: 'Refunded test order',
  },
  {
    uid: 'seed-license-drum-expiring',
    productSlug: 'drum-master-pro',
    status: 'active',
    activation_limit: 1,
    issued_at: new Date('2026-02-01T09:00:00.000Z'),
    expires_at: new Date('2026-12-31T23:59:59.000Z'),
    revoked_at: null,
    revocation_reason: null,
  },
];

export const SAMPLE_ACTIVATIONS = [
  {
    licenseUid: 'seed-license-ultimate-active',
    device_fingerprint: 'seed-device-mac-studio-001',
    certificate_serial: 'SEEDCERT001',
    client_public_key: null,
    plugin_version: '1.0.0',
    platform: 'mac',
    last_checkin: new Date('2026-03-01T08:30:00.000Z'),
    revoked_at: null,
    requires_mtls: false,
    last_trust_level: 0,
  },
  {
    licenseUid: 'seed-license-drum-expiring',
    device_fingerprint: 'seed-device-mbp-002',
    certificate_serial: 'SEEDCERT002',
    client_public_key: null,
    plugin_version: '1.1.0',
    platform: 'mac',
    last_checkin: new Date('2026-03-02T08:30:00.000Z'),
    revoked_at: null,
    requires_mtls: false,
    last_trust_level: 0,
  },
];

export async function seedAdminUser(strapi: any) {
  const admins = await strapi.query('admin::user').findMany();

  if (admins.length > 0) {
    console.log('Admin user already exists, skipping seed');
    return admins[0];
  }

  console.log('Seeding admin user...');

  const hashedPassword = await hash(ADMIN_PASSWORD, 10);
  const admin = await strapi.query('admin::user').create({
    data: {
      email: ADMIN_EMAIL,
      firstname: ADMIN_FIRSTNAME,
      lastname: ADMIN_LASTNAME,
      password: hashedPassword,
      isActive: true,
    },
  });

  const roles = await strapi.query('admin::role').findMany();
  const superAdminRole = roles.find((r: any) => r.code === 'strapi-super-admin');

  if (superAdminRole) {
    await strapi.query('admin::user').update({
      where: { id: admin.id },
      data: {
        roles: [superAdminRole.id],
      },
    });
    console.log('Admin user created with Super Admin role');
  } else {
    console.log('Admin user created (no super admin role found)');
  }

  return admin;
}

export async function seedProducts(strapi: any) {
  const productQuery = strapi.db.query(PRODUCT_MODEL);
  const existingProducts = await productQuery.findMany();

  if (existingProducts.length > 0) {
    console.log('Products already exist, skipping seed');
    return existingProducts;
  }

  console.log('Seeding sample products...');

  const createdProducts = [];
  for (const product of SAMPLE_PRODUCTS) {
    createdProducts.push(await productQuery.create({ data: product }));
  }

  console.log('Sample products created successfully');
  return createdProducts;
}

export async function seedLicenses(strapi: any, products?: any[]) {
  const licenseQuery = strapi.db.query(LICENSE_MODEL);
  const existingLicenses = await licenseQuery.findMany();

  if (existingLicenses.length > 0) {
    console.log('Licenses already exist, skipping seed');
    return existingLicenses;
  }

  const availableProducts =
    products && products.length > 0
      ? products
      : await strapi.db.query(PRODUCT_MODEL).findMany();

  if (availableProducts.length === 0) {
    console.log('No products found, skipping license seed');
    return [];
  }

  console.log('Seeding sample licenses...');

  const productsBySlug = new Map<string, any>(
    availableProducts.map((product: any) => [product.slug, product]),
  );
  const createdLicenses = [];

  for (const license of SAMPLE_LICENSES) {
    const product = productsBySlug.get(license.productSlug);

    if (!product) {
      continue;
    }

    createdLicenses.push(
      await licenseQuery.create({
        data: {
          uid: license.uid,
          product: product.id,
          status: license.status,
          activation_limit: license.activation_limit,
          issued_at: license.issued_at,
          expires_at: license.expires_at,
          revoked_at: license.revoked_at,
          revocation_reason: license.revocation_reason,
        },
      }),
    );
  }

  console.log('Sample licenses created successfully');
  return createdLicenses;
}

export async function seedActivations(strapi: any, licenses?: any[]) {
  const activationQuery = strapi.db.query(ACTIVATION_MODEL);
  const existingActivations = await activationQuery.findMany();

  if (existingActivations.length > 0) {
    console.log('Activations already exist, skipping seed');
    return existingActivations;
  }

  const availableLicenses =
    licenses && licenses.length > 0
      ? licenses
      : await strapi.db.query(LICENSE_MODEL).findMany();

  if (availableLicenses.length === 0) {
    console.log('No licenses found, skipping activation seed');
    return [];
  }

  console.log('Seeding sample activations...');

  const licensesByUid = new Map<string, any>(
    availableLicenses.map((license: any) => [license.uid, license]),
  );
  const createdActivations = [];

  for (const activation of SAMPLE_ACTIVATIONS) {
    const license = licensesByUid.get(activation.licenseUid);

    if (!license) {
      continue;
    }

    createdActivations.push(
      await activationQuery.create({
        data: {
          license_id: license.id,
          device_fingerprint: activation.device_fingerprint,
          certificate_serial: activation.certificate_serial,
          client_public_key: activation.client_public_key,
          plugin_version: activation.plugin_version,
          platform: activation.platform,
          last_checkin: activation.last_checkin,
          revoked_at: activation.revoked_at,
          requires_mtls: activation.requires_mtls,
          last_trust_level: activation.last_trust_level,
        },
      }),
    );
  }

  console.log('Sample activations created successfully');
  return createdActivations;
}

export async function bootstrapSeed(strapi: any) {
  await seedAdminUser(strapi);
  const products = await seedProducts(strapi);
  const licenses = await seedLicenses(strapi, products);
  await seedActivations(strapi, licenses);
}

export default {
  async bootstrap({ strapi }) {
    try {
      await bootstrapSeed(strapi);
    } catch (error) {
      console.error('Error seeding:', error);
    }
  },
};
