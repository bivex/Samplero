/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 06:40
 * Last Updated: 2026-03-05 06:40
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

module.exports = {
  async getSignedDownloadUrl(filePathOrUrl, expiresIn = 3600) {
    const provider = strapi.plugin("upload").provider;

    if (!provider.getSignedUrl) {
      throw new Error("Current upload provider does not support signed URLs");
    }

    const url = filePathOrUrl.startsWith("http")
      ? filePathOrUrl
      : filePathOrUrl;

    const signedUrl = await provider.getSignedUrl(url, {
      expiresIn,
    });

    return {
      url: signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  },

  async getDownloadUrlWithMetadata(
    filePathOrUrl,
    metadata = {},
    expiresIn = 3600,
  ) {
    const provider = strapi.plugin("upload").provider;

    if (!provider.getSignedUrl) {
      throw new Error("Current upload provider does not support signed URLs");
    }

    const url = filePathOrUrl.startsWith("http")
      ? filePathOrUrl
      : filePathOrUrl;

    const signedUrl = await provider.getSignedUrl(url, {
      expiresIn,
      ...metadata,
    });

    return {
      url: signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata,
    };
  },

  isS3Provider() {
    const provider = strapi.plugin("upload").provider;
    return provider && provider.getSignedUrl !== undefined;
  },
};
