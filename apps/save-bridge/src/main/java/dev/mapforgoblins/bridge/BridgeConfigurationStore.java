package dev.mapforgoblins.bridge;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Properties;

final class BridgeConfigurationStore {

    private static final String FILE_NAME = "save-bridge.properties";
    private final Path path;

    BridgeConfigurationStore(Path path) {
        this.path = path.toAbsolutePath().normalize();
    }

    static BridgeConfigurationStore defaultStore() {
        var os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        var userHome = Path.of(System.getProperty("user.home"));
        Path directory;
        if (os.contains("win")) {
            var localAppData = System.getenv("LOCALAPPDATA");
            directory = localAppData == null || localAppData.isBlank()
                    ? userHome.resolve("AppData/Local/ERMapForGoblins")
                    : Path.of(localAppData).resolve("ERMapForGoblins");
        } else {
            var xdgConfigHome = System.getenv("XDG_CONFIG_HOME");
            directory = xdgConfigHome == null || xdgConfigHome.isBlank()
                    ? userHome.resolve(".config/er-map-for-goblins")
                    : Path.of(xdgConfigHome).resolve("er-map-for-goblins");
        }
        return new BridgeConfigurationStore(directory.resolve(FILE_NAME));
    }

    Properties load() throws IOException {
        var properties = new Properties();
        if (!Files.isRegularFile(path)) {
            return properties;
        }
        try (Reader reader = Files.newBufferedReader(path)) {
            properties.load(reader);
        }
        return properties;
    }

    void save(BridgeConfiguration configuration) throws IOException {
        Files.createDirectories(path.getParent());
        var properties = new Properties();
        properties.setProperty("savePath", configuration.savePath().toString());
        properties.setProperty("webUrl", configuration.webUrl().toString());
        properties.setProperty("bindHost", configuration.bindHost());
        properties.setProperty("port", Integer.toString(configuration.port()));
        properties.setProperty("advertisedHost", configuration.advertisedHost());
        properties.setProperty("accessToken", configuration.accessToken());
        if (configuration.webRoot() != null) {
            properties.setProperty("webRoot", configuration.webRoot().toString());
        }
        try (Writer writer = Files.newBufferedWriter(path)) {
            properties.store(writer, "ER Map for Goblins Save Bridge");
        }
        restrictPermissionsIfSupported();
    }

    BridgeConfiguration resolve(Properties arguments, String generatedToken, Path savePath) {
        var webUrl = URI.create(arguments.getProperty("webUrl", BridgeConfiguration.DEFAULT_WEB_URL.toString()));
        var bindHost = arguments.getProperty("bindHost", "127.0.0.1");
        var port = Integer.parseInt(arguments.getProperty("port", Integer.toString(BridgeConfiguration.DEFAULT_PORT)));
        var advertisedHost = arguments.getProperty("advertisedHost", "");
        var token = arguments.getProperty("accessToken", generatedToken);
        var webRootValue = arguments.getProperty("webRoot", "");
        var webRoot = webRootValue.isBlank() ? null : Path.of(webRootValue);
        return new BridgeConfiguration(savePath, webUrl, bindHost, port, advertisedHost, token, webRoot);
    }

    Path path() {
        return path;
    }

    private void restrictPermissionsIfSupported() {
        try {
            Files.setPosixFilePermissions(path, EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        } catch (UnsupportedOperationException | IOException ignored) {
            // Windows ACLs are inherited from the user's local application data directory.
        }
    }
}
