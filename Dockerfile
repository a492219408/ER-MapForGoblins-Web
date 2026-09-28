FROM node:24-bookworm-slim AS web-build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @mfg/web build

FROM maven:3.9.11-eclipse-temurin-25 AS server-build
WORKDIR /workspace
COPY pom.xml pom.xml
COPY apps/server/pom.xml apps/server/pom.xml
COPY apps/save-bridge/pom.xml apps/save-bridge/pom.xml
COPY apps/server/src apps/server/src
COPY --from=web-build /workspace/apps/web/dist apps/server/src/main/resources/static
RUN mvn -B -pl apps/server -am package -DskipTests

FROM eclipse-temurin:25-jre
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
