package dev.mapforgoblins.bridge;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BridgeServerTests {

    Path temporaryDirectory;

    @BeforeEach
    void createTemporaryDirectory() throws Exception {
        var testRoot = Path.of("target", "test-work").toAbsolutePath().normalize();
        Files.createDirectories(testRoot);
        temporaryDirectory = Files.createTempDirectory(testRoot, "save-bridge-");
    }

    @AfterEach
    void removeTemporaryDirectory() throws Exception {
        if (temporaryDirectory == null || !Files.exists(temporaryDirectory)) {
            return;
        }
        try (var paths = Files.walk(temporaryDirectory)) {
            for (var path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @Test
    void pairsOnceAndServesOnlyAuthenticatedSaveRequests() throws Exception {
        var saveBytes = new byte[]{1, 3, 3, 7};
        var savePath = temporaryDirectory.resolve("ER0000.sl2");
        Files.write(savePath, saveBytes);
        var accessToken = "access-token-that-is-at-least-thirty-two-characters";
        var configuration = new BridgeConfiguration(
                savePath,
                URI.create("http://localhost:8080"),
                "127.0.0.1",
                0,
                "127.0.0.1",
                accessToken,
                null);
        var pairing = new PairingService();

        try (var bridge = new BridgeServer(configuration, pairing);
             var client = HttpClient.newHttpClient()) {
            bridge.start();
            var baseUri = bridge.bridgeBaseUri();

            var health = client.send(HttpRequest.newBuilder(baseUri.resolve("/v1/health")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(200, health.statusCode());
            assertTrue(health.body().contains("\"protocolVersion\":1"));

            var unauthenticated = client.send(HttpRequest.newBuilder(baseUri.resolve("/v1/status")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(401, unauthenticated.statusCode());

            var pairToken = pairing.issue();
            var pairRequest = HttpRequest.newBuilder(baseUri.resolve("/v1/pair"))
                    .header("Origin", "http://localhost:8080")
                    .header("Authorization", "Pair " + pairToken)
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            var pairResponse = client.send(pairRequest, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, pairResponse.statusCode());
            assertTrue(pairResponse.body().contains(accessToken));

            var replayResponse = client.send(pairRequest, HttpResponse.BodyHandlers.ofString());
            assertEquals(401, replayResponse.statusCode());

            var saveRequest = HttpRequest.newBuilder(baseUri.resolve("/v1/save"))
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .build();
            var saveResponse = client.send(saveRequest, HttpResponse.BodyHandlers.ofByteArray());
            assertEquals(200, saveResponse.statusCode());
            assertArrayEquals(saveBytes, saveResponse.body());
        }
    }

    @Test
    void rejectsUnconfiguredWebOrigin() throws Exception {
        var savePath = temporaryDirectory.resolve("character.err");
        Files.write(savePath, new byte[]{9});
        var configuration = new BridgeConfiguration(
                savePath, URI.create("https://map.example"), "127.0.0.1", 0, "127.0.0.1",
                "access-token-that-is-at-least-thirty-two-characters", null);

        try (var bridge = new BridgeServer(configuration, new PairingService());
             var client = HttpClient.newHttpClient()) {
            bridge.start();
            var request = HttpRequest.newBuilder(bridge.bridgeBaseUri().resolve("/v1/health"))
                    .header("Origin", "https://evil.example")
                    .GET()
                    .build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(403, response.statusCode());
        }
    }

    @Test
    void servesTheWebRootAndReportsMissingResourcesAsNotFound() throws Exception {
        var webRoot = temporaryDirectory.resolve("web");
        Files.createDirectories(webRoot.resolve("game-assets"));
        Files.writeString(webRoot.resolve("index.html"), "<!doctype html><title>Test</title>");
        Files.writeString(webRoot.resolve("game-assets/dataset-index.v1.json"), "{\"schemaVersion\":1}");
        var configuration = new BridgeConfiguration(
                temporaryDirectory.resolve("synthetic.sl2"), URI.create("http://localhost:8080"),
                "127.0.0.1", 0, "127.0.0.1",
                "access-token-that-is-at-least-thirty-two-characters", webRoot);
        try (var bridge = new BridgeServer(configuration, new PairingService());
             var client = HttpClient.newHttpClient()) {
            bridge.start();
            for (var path : new String[]{"/", "/game-assets/dataset-index.v1.json"}) {
                var response = client.send(HttpRequest.newBuilder(bridge.bridgeBaseUri().resolve(path)).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                assertEquals(200, response.statusCode());
                assertTrue(response.headers().firstValue("Content-Type").orElse("")
                        .contains(path.endsWith(".json") ? "application/json" : "text/html"));
            }
            for (var path : new String[]{"/missing.js", "/game-assets/missing.v1.json", "/%2e%2e/outside.txt"}) {
                assertEquals(404, client.send(HttpRequest.newBuilder(bridge.bridgeBaseUri().resolve(path)).GET().build(),
                        HttpResponse.BodyHandlers.discarding()).statusCode());
            }
        }
    }

    @Test
    void rateLimitsRepeatedPairingFailures() throws Exception {
        var savePath = temporaryDirectory.resolve("rate-limit.sl2");
        Files.write(savePath, new byte[]{7});
        var configuration = new BridgeConfiguration(
                savePath, URI.create("http://localhost:8080"), "127.0.0.1", 0, "127.0.0.1",
                "access-token-that-is-at-least-thirty-two-characters", null);

        try (var bridge = new BridgeServer(configuration, new PairingService());
             var client = HttpClient.newHttpClient()) {
            bridge.start();
            var request = HttpRequest.newBuilder(bridge.bridgeBaseUri().resolve("/v1/pair"))
                    .header("Origin", "http://localhost:8080")
                    .header("Authorization", "Pair invalid-pairing-token-with-enough-length")
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            for (var attempt = 0; attempt < 5; attempt++) {
                assertEquals(401, client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode());
            }
            assertEquals(429, client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode());
        }
    }
}
