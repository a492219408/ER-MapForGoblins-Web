FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS web-build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @mfg/web build

FROM maven:3.9.11-eclipse-temurin-25@sha256:407c4423cec0cf2981055bc2c6c0dc211d9605b6669279b95997f2d1c7e91e2c AS server-build
WORKDIR /workspace
COPY pom.xml pom.xml
COPY apps/server/pom.xml apps/server/pom.xml
COPY apps/save-bridge/pom.xml apps/save-bridge/pom.xml
COPY apps/server/src apps/server/src
COPY --from=web-build /workspace/apps/web/dist apps/server/src/main/resources/static
RUN mvn -B -pl apps/server -am package -DskipTests

FROM eclipse-temurin:25-jre@sha256:8da0490fa9a3c26867012019565948eef0ee69438f5c75ac28146967bae984b5
WORKDIR /opt/mfg
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home mfg
COPY --from=server-build /workspace/apps/server/target/server-0.1.0-SNAPSHOT.jar app.jar
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY third_party/licenses ./third_party/licenses
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/opt/mfg/app.jar"]
