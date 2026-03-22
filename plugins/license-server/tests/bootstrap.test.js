const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('license-server bootstrap', () => {
  it('updates authenticated role with license-server customer permissions', async () => {
    const updateRole = jest.fn().mockResolvedValue(undefined);
    const roleService = {
      find: jest.fn().mockResolvedValue([{ id: 1, name: 'Authenticated', type: 'authenticated', description: 'Default' }]),
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        permissions: {
          'plugin::users-permissions': {
            controllers: {
              auth: { logout: { enabled: true }, changePassword: { enabled: true } },
              user: { me: { enabled: true } },
            },
          },
          'plugin::license-server': {
            controllers: {
              license: { find: { enabled: false }, findOne: { enabled: false } },
              activation: { revokeMine: { enabled: false } },
              'activation-claim': {
                listMine: { enabled: false },
                approve: { enabled: false },
                reject: { enabled: false },
              },
              product: { getDownloadUrl: { enabled: false }, getMyDownloads: { enabled: false } },
              order: {
                create: { enabled: false },
                find: { enabled: false },
                findOne: { enabled: false },
                redeemCoupon: { enabled: false },
                getItems: { enabled: false },
              },
            },
          },
        },
      }),
      updateRole,
    };

    const strapi = {
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      plugin: jest.fn(() => ({ service: jest.fn() })),
      service: jest.fn((uid) => {
        if (uid === 'plugin::users-permissions.role') return roleService;
        if (uid === 'plugin::users-permissions.users-permissions') return { getActions: jest.fn(() => ({})) };
        throw new Error(`Unexpected service ${uid}`);
      }),
      db: {
        query: jest.fn(() => ({
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 2, name: 'Support', type: 'support', description: 'Support' })
            .mockResolvedValueOnce({ id: 3, name: 'Admin', type: 'admin', description: 'Admin' }),
        })),
      },
    };

    const bootstrap = freshRequire('../server/bootstrap');
    bootstrap({ strapi });
    await flush();

    expect(updateRole).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'Authenticated',
        permissions: expect.objectContaining({
          'plugin::license-server': expect.objectContaining({
            controllers: expect.objectContaining({
              activation: expect.objectContaining({
                revokeMine: expect.objectContaining({ enabled: true }),
              }),
              'activation-claim': expect.objectContaining({
                listMine: expect.objectContaining({ enabled: true }),
                approve: expect.objectContaining({ enabled: true }),
                reject: expect.objectContaining({ enabled: true }),
              }),
              order: expect.objectContaining({
                create: expect.objectContaining({ enabled: true }),
                find: expect.objectContaining({ enabled: true }),
                findOne: expect.objectContaining({ enabled: true }),
                redeemCoupon: expect.objectContaining({ enabled: true }),
                getItems: expect.objectContaining({ enabled: true }),
              }),
              product: expect.objectContaining({
                getDownloadUrl: expect.objectContaining({ enabled: true }),
                getMyDownloads: expect.objectContaining({ enabled: true }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(strapi.log.warn).not.toHaveBeenCalled();
    expect(strapi.log.error).not.toHaveBeenCalled();
  });

  it('indexes products in Meilisearch when configured on bootstrap', async () => {
    const syncCredentials = jest.fn().mockResolvedValue(undefined);
    const getCredentials = jest
      .fn()
      .mockResolvedValue({ host: 'http://127.0.0.1:7700', apiKey: 'private-key' });
    const getIndexedContentTypes = jest.fn().mockResolvedValue([]);
    const addContentTypeInMeiliSearch = jest.fn().mockResolvedValue([1]);

    const strapi = {
      config: { get: jest.fn(() => false) },
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      plugin: jest.fn((name) => {
        if (name === 'users-permissions') return null;
        if (name === 'meilisearch') {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === 'store') {
                return { syncCredentials, getCredentials, getIndexedContentTypes };
              }

              if (serviceName === 'meilisearch') {
                return { addContentTypeInMeiliSearch };
              }

              return null;
            }),
          };
        }

        return null;
      }),
    };

    const bootstrap = freshRequire('../server/bootstrap');
    bootstrap({ strapi });
    await flush();

    expect(syncCredentials).toHaveBeenCalled();
    expect(getIndexedContentTypes).toHaveBeenCalled();
    expect(addContentTypeInMeiliSearch).toHaveBeenCalledWith({
      contentType: 'plugin::license-server.product',
    });
    expect(strapi.log.error).not.toHaveBeenCalled();
  });
});

