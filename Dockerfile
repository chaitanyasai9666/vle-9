# Hardened image (Step 5 best practices)
# Minimal, supported base image (Node 24 LTS on Alpine)
FROM node:24-alpine
# Patch OS packages; drop npm/yarn/corepack - not needed at runtime and the main CVE source
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn* \
 && adduser -D -H -s /sbin/nologin appuser
WORKDIR /app
# App files owned by root and read-only for the runtime user
COPY --chown=root:root app/ .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Run as non-root user
USER appuser
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
