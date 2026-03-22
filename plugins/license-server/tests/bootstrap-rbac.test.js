/**
 * Copyright (c) 2026 Bivex
 * Tests for RBAC roles setup
 */

const ROLE_TYPES = {
  CUSTOMER: "customer",
  SUPPORT: "support",
  ADMIN: "admin",
};

const PERMISSIONS = {
  [ROLE_TYPES.CUSTOMER]: [
    "api::license-server.license.find",
    "api::license-server.license.findOne",
    "api::license-server.license.activate",
    "api::license-server.license.validate",
    "api::license-server.license.deactivate",
    "api::license-server.license.heartbeat",
    "api::license-server.product.find",
    "api::license-server.product.findBySlug",
    "api::license-server.order.find",
    "api::license-server.order.findOne",
  ],
  [ROLE_TYPES.SUPPORT]: [
    "api::license-server.license.find",
    "api::license-server.license.findOne",
    "api::license-server.license.revoke",
    "api::license-server.activation.find",
    "api::license-server.activation.findOne",
    "api::license-server.activation.revoke",
    "api::license-server.product.find",
    "api::license-server.product.findBySlug",
    "api::license-server.order.find",
    "api::license-server.order.findOne",
  ],
  [ROLE_TYPES.ADMIN]: [
    "api::license-server.license.find",
    "api::license-server.license.findOne",
    "api::license-server.license.create",
    "api::license-server.license.update",
    "api::license-server.license.revoke",
    "api::license-server.activation.find",
    "api::license-server.activation.findOne",
    "api::license-server.activation.revoke",
    "api::license-server.product.find",
    "api::license-server.product.findBySlug",
    "api::license-server.product.create",
    "api::license-server.product.update",
    "api::license-server.product.delete",
    "api::license-server.order.find",
    "api::license-server.order.findOne",
    "api::license-server.order.create",
    "api::license-server.client-certificate.find",
    "api::license-server.client-certificate.findOne",
    "api::license-server.client-certificate.revoke",
  ],
};

describe("RBAC Roles", () => {
  let mockStrapi;
  let mockRoleService;
  let mockPermissionService;

  beforeEach(() => {
    mockRoleService = {
      find: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockResolvedValue({ id: 1, type: "customer", name: "Customer" }),
    };

    mockPermissionService = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };

    mockStrapi = {
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      plugin: jest.fn((name) => {
        if (name === "users-permissions") {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === "role") {
                return mockRoleService;
              }
              if (serviceName === "permission") {
                return mockPermissionService;
              }
              return null;
            }),
          };
        }
        return null;
      }),
    };

    global.strapi = mockStrapi;
  });

  describe("ROLE_TYPES", () => {
    it("should have all required role types", () => {
      expect(ROLE_TYPES.CUSTOMER).toBe("customer");
      expect(ROLE_TYPES.SUPPORT).toBe("support");
      expect(ROLE_TYPES.ADMIN).toBe("admin");
    });
  });

  describe("PERMISSIONS", () => {
    it("should have customer permissions", () => {
      const customerPerms = PERMISSIONS[ROLE_TYPES.CUSTOMER];

      expect(customerPerms).toContain("api::license-server.license.find");
      expect(customerPerms).toContain("api::license-server.license.activate");
      expect(customerPerms).toContain("api::license-server.product.find");
    });

    it("should have support permissions", () => {
      const supportPerms = PERMISSIONS[ROLE_TYPES.SUPPORT];

      expect(supportPerms).toContain("api::license-server.license.revoke");
      expect(supportPerms).toContain("api::license-server.activation.find");
    });

    it("should have admin permissions", () => {
      const adminPerms = PERMISSIONS[ROLE_TYPES.ADMIN];

      expect(adminPerms).toContain("api::license-server.license.create");
      expect(adminPerms).toContain("api::license-server.license.update");
      expect(adminPerms).toContain("api::license-server.product.delete");
    });

    it("should have valid permission format (api.controller.action)", () => {
      const allPermissions = [
        ...PERMISSIONS[ROLE_TYPES.CUSTOMER],
        ...PERMISSIONS[ROLE_TYPES.SUPPORT],
        ...PERMISSIONS[ROLE_TYPES.ADMIN],
      ];

      const permissionRegex = /^api::[\w-]+\.[\w-]+\.[\w-]+$/;

      allPermissions.forEach((perm) => {
        expect(perm).toMatch(permissionRegex);
      });
    });

    it("should not have duplicate permissions in same role", () => {
      Object.values(PERMISSIONS).forEach((perms) => {
        const unique = new Set(perms);
        expect(unique.size).toBe(perms.length);
      });
    });
  });

  describe("role hierarchy", () => {
    it("admin should have more permissions than customer", () => {
      expect(PERMISSIONS[ROLE_TYPES.ADMIN].length).toBeGreaterThan(
        PERMISSIONS[ROLE_TYPES.CUSTOMER].length,
      );
    });

    it("admin should have more permissions than support", () => {
      expect(PERMISSIONS[ROLE_TYPES.ADMIN].length).toBeGreaterThan(
        PERMISSIONS[ROLE_TYPES.SUPPORT].length,
      );
    });

    it("support should have revoke permissions", () => {
      expect(PERMISSIONS[ROLE_TYPES.SUPPORT]).toContain(
        "api::license-server.license.revoke",
      );
    });

    it("admin should have create and delete permissions", () => {
      expect(PERMISSIONS[ROLE_TYPES.ADMIN]).toContain(
        "api::license-server.license.create",
      );
      expect(PERMISSIONS[ROLE_TYPES.ADMIN]).toContain(
        "api::license-server.product.delete",
      );
    });
  });
});
