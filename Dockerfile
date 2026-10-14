FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node index.html package.json ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node server ./server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=4173 NODE_ENV=production DATABASE_PATH=/app/data/chogcourt.sqlite
EXPOSE 4173
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
