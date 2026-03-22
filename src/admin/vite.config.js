const path = require('node:path');
const { mergeConfig } = require('vite');

module.exports = (config) => {
  return mergeConfig(config, {
    resolve: {
      alias: {
        'sanitize-html': path.resolve(__dirname, 'shims/sanitize-html.mjs'),
        '@strapi/plugin-users-permissions/strapi-admin': path.resolve(
          __dirname,
          'vendors/users-permissions/admin/index.mjs',
        ),
        '@strapi/plugin-users-permissions/dist/admin/index.js': path.resolve(
          __dirname,
          'vendors/users-permissions/admin/index.mjs',
        ),
      },
    },
  });
};