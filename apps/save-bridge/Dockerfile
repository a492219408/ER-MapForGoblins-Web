FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS web-build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
ARG VITE_MFG_ASSET_BASE_URL=/game-assets
ENV VITE_MFG_ASSET_BASE_URL=${VITE_MFG_ASSET_BASE_URL}
RUN pnpm --filter @mfg/web build

FROM maven:3.9.11-eclipse-temurin-25@sha256:407c4423cec0cf2981055bc2c6c0dc211d9605b6669279b95997f2d1c7e91e2c AS bridge-build
WORKDIR /workspace
COPY pom.xml pom.xml
COPY apps/server/pom.xml apps/server/pom.xml
COPY apps/save-bridge/pom.xml apps/save-bridge/pom.xml
COPY apps/save-bridge/src apps/save-bridge/src
RUN mvn -B -pl apps/save-bridge -am package -DskipTests

FROM eclipse-temurin:25-jre@sha256:8da0490fa9a3c26867012019565948eef0ee69438f5c75ac28146967bae984b5
WORKDIR /opt/mfg
RUN useradd --system --uid 10001 --create-home mfg \
    && mkdir -p /home/mfg/.config /opt/mfg/web /saves \
    && chown -R 10001:10001 /home/mfg /opt/mfg /saves
COPY --from=bridge-build /workspace/apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar bridge.jar
COPY --from=web-build /workspace/apps/web/dist web
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY third_party/licenses ./third_party/licenses
USER 10001
EXPOSE 51337
ENTRYPOINT ["java", "-jar", "/opt/mfg/bridge.jar"]
