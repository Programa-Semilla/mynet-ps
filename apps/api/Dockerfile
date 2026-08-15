# The API as a container.
#
# Debian rather than Alpine on purpose: Argon2id is a native module, and the published prebuilt
# binaries are glibc. On musl it falls back to compiling from source, which needs a toolchain in
# the image and turns a fast build into a slow one for no benefit.
#
# ─────────────────────────────────────────────────────────────────────────────────────────
# **T075 (006) — this header used to say "for Fly.io", and Fly is gone.**
#
# Constitution v3.0.0 moved the product onto two Azure VMs running a Compose stack of Caddy, this
# image and a loopback-only PostgreSQL container (research D9). **The image itself is reused
# unchanged**, and that is worth stating rather than leaving as an absence: nothing in it was ever
# Fly-specific — it is a generic Node runtime that reads its port, database URL and secrets from
# the environment. Only the comment was.
#
# It is built and run by `deploy/vm/docker-compose.yml`, which supplies every value below.
#
# **Still unvalidated by a real deployment.** The environments do not exist yet: a domain and an
# Azure subscription are owner decisions the specification records as open (tasks T004, T006), and
# Caddy cannot obtain a certificate without a resolving A record (FR-479). Treat the runtime stage
# as reviewed-but-untried until T080 has been performed.
# ─────────────────────────────────────────────────────────────────────────────────────────

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# The whole workspace, because `pnpm install --frozen-lockfile` needs every manifest the
# lockfile describes. `--frozen-lockfile` is also what makes FR-002 true here: if a manifest and
# the committed lockfile disagree, the image fails to build rather than resolving something else.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mynet/api build
# Prunes to production dependencies and flattens the workspace symlinks into a self-contained
# directory, so the runtime stage carries no dev dependencies and no build toolchain.
#
# ─────────────────────────────────────────────────────────────────────────────────────────
# **`--legacy` WAS REMOVED HERE BECAUSE IT DOES NOT EXIST IN THE PINNED pnpm** (010, first
# real deploy).
#
# The root `package.json` pins `packageManager: pnpm@9.15.9` and `corepack enable` above honours
# it, so the image gets pnpm 9. `pnpm deploy --legacy` is a **pnpm 10** flag — it opts back into
# the v9 behaviour after v10 changed `deploy` to require `inject-workspace-packages`. On v9 it is
# simply an unknown option and the build fails at this line.
#
# It failed on the first attempt ever made to build this image. The header above says why that is
# not surprising and is worth reading rather than deleting: nothing had ever been deployed, so
# this stage had never once been executed. A flag written against a version of the tool the image
# does not use is invisible to review, to lint, and to every test in the repository.
#
# If the pin ever moves to pnpm 10, this line needs `--legacy` back **or** the workspace needs
# `inject-workspace-packages=true` — and the image build is the only thing that will tell you.
# ─────────────────────────────────────────────────────────────────────────────────────────
RUN pnpm --filter @mynet/api deploy --prod /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
# Migrations ship with the image so a deployment can apply them against its own database.
COPY --from=build /app/apps/api/migrations ./migrations

# Never root. A container that does not need write access to its own filesystem should not have it.
USER node

EXPOSE 3000
# The platform sets API_PORT, DATABASE_URL, and the auth secrets. None are baked in — FR-041
# keeps secrets out of the repository and out of any image built from it.
CMD ["node", "dist/server.js"]
