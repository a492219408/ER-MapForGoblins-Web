package dev.mapforgoblins.bridge;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class BridgeConfigurationTests {
    private static final String TOKEN = "access-token-that-is-at-least-thirty-two-characters";

    @Test
    void acceptsModEngineCustomSaveSuffix() {
        assertDoesNotThrow(() -> configuration("character.co2"));
        assertDoesNotThrow(() -> configuration("CHARACTER.CO2"));
    }

    @Test
    void rejectsUnrelatedFileSuffixes() {
        assertThrows(IllegalArgumentException.class, () -> configuration("character.co2.bak"));
    }

    private static BridgeConfiguration configuration(String fileName) {
        return new BridgeConfiguration(
                Path.of(fileName),
                URI.create("http://localhost:8080"),
                "127.0.0.1",
                BridgeConfiguration.DEFAULT_PORT,
                "127.0.0.1",
                TOKEN,
                null);
    }
}
