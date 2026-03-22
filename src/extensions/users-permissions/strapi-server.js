'use strict';

const jwt = require('./server/services/jwt');
const rateLimit = require('./server/middlewares/rateLimit');

module.exports = (plugin) => {
  plugin.services.jwt = jwt;
  plugin.middlewares.rateLimit = rateLimit;
  return plugin;
};

