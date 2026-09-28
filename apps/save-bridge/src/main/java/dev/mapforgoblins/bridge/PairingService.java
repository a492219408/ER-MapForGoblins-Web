package dev.mapforgoblins.bridge;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

final class PairingService {

    private static final Duration VALIDITY = Duration.ofMinutes(10);
    private final SecureRandom random;
    private final Clock clock;
    private final AtomicReference<PairingGrant> currentGrant = new AtomicReference<>();

    PairingService() {
        this(new SecureRandom(), Clock.systemUTC());
    }

    PairingService(SecureRandom random, Clock clock) {
        this.random = random;
        this.clock = clock;
    }

    String issue() {
        var token = randomToken(random);
        currentGrant.set(new PairingGrant(hash(token), clock.instant().plus(VALIDITY)));
        return token;
    }

    boolean consume(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return false;
        }
        var grant = currentGrant.get();
        if (grant == null || clock.instant().isAfter(grant.expiresAt())) {
            currentGrant.compareAndSet(grant, null);
            return false;
        }
        if (!MessageDigest.isEqual(grant.tokenHash(), hash(candidate))) {
            return false;
        }
        return currentGrant.compareAndSet(grant, null);
    }

    static String randomToken(SecureRandom random) {
        var bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] hash(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JDK 缺少 SHA-256", exception);
        }
    }

    private record PairingGrant(byte[] tokenHash, Instant expiresAt) {
    }
}
