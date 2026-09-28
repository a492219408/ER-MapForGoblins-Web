package dev.mapforgoblins.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AssetServingTests {

    @TempDir
    static Path assets;

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void assetDirectory(DynamicPropertyRegistry registry) {
        registry.add("mfg.assets.directory", () -> assets.toString());
    }

    @BeforeAll
    static void fixtures() throws IOException {
        for (var file : new String[] {
                "dataset-index.v1.json", "dataset-manifest.v1.json",
                "items/item-manifest.v1.json", "datasets/vanilla/dataset-manifest.v1.json",
                "datasets/vanilla/marker-catalog.v1.0123456789abcdef.json"}) {
            var target = assets.resolve(file);
            Files.createDirectories(target.getParent());
            Files.writeString(target, "{\"schemaVersion\":1}");
        }
        Files.writeString(assets.resolve("deployment-smoke-a1b2c3d4.js"), "external override");
    }

    @ParameterizedTest
    @ValueSource(strings = {"deployment-smoke-a1b2c3d4.js", "deployment-smoke-a1b2c3d4.css"})
    void bundledFrontendRemainsAvailableWithAnExternalAssetDirectory(String filename) throws Exception {
        var response = request(filename);
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("bundled-frontend-fixture"));
        assertTrue(response.headers().firstValue("Content-Type").orElse("")
                .contains(filename.endsWith(".js") ? "javascript" : "css"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"dataset-index.v1.json", "dataset-manifest.v1.json",
            "items/item-manifest.v1.json", "datasets/vanilla/dataset-manifest.v1.json"})
    void mutableEntrypointsResolveAndRequireRevalidation(String filename) throws Exception {
        var response = request(filename);
        assertEquals(200, response.statusCode());
        assertEquals("{\"schemaVersion\":1}", response.body());
        assertEquals("no-cache", response.headers().firstValue("Cache-Control").orElse(""));
    }

    @Test
    void contentAddressedCatalogRetainsImmutableCaching() throws Exception {
        var response = request("datasets/vanilla/marker-catalog.v1.0123456789abcdef.json");
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("immutable"));
    }

    @Test
    void missingAssetReturnsNotFoundInsteadOfTheHtmlShell() throws Exception {
        assertEquals(404, request("missing-script.js").statusCode());
    }

    private HttpResponse<String> request(String relative) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/assets/" + relative))
                    .timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
