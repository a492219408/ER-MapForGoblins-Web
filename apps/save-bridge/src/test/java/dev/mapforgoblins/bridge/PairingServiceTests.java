package dev.mapforgoblins.bridge;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PairingServiceTests {

    @Test
    void pairingTokenCanOnlyBeConsumedOnce() {
        var service = new PairingService();
        var token = service.issue();

        assertTrue(service.consume(token));
        assertFalse(service.consume(token));
    }

    @Test
    void issuingNewTokenInvalidatesPreviousToken() {
        var service = new PairingService();
        var oldToken = service.issue();
        var newToken = service.issue();

        assertFalse(service.consume(oldToken));
        assertTrue(service.consume(newToken));
    }
}
