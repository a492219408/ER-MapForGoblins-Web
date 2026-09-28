package dev.mapforgoblins.bridge;

import java.net.URI;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Objects;

public record BridgeConfiguration(
        Path savePath,
        URI webUrl,
        String bindHost,
        int port,
        String advertisedHost,
        String accessToken,
        Path webRoot) {

    public static final int DEFAULT_PORT = 51337;
    public static final URI DEFAULT_WEB_URL = URI.create("http://localhost:8080");

    public BridgeConfiguration {
        savePath = Objects.requireNonNull(savePath, "savePath").toAbsolutePath().normalize();
        webUrl = Objects.requireNonNull(webUrl, "webUrl");
        bindHost = requireText(bindHost, "bindHost");
        advertisedHost = advertisedHost == null ? "" : advertisedHost.strip();
        accessToken = requireText(accessToken, "accessToken");
        webRoot = webRoot == null ? null : webRoot.toAbsolutePath().normalize();

        var scheme = webUrl.getScheme();
        if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException("Web 地址必须使用 http 或 https");
        }
        if (webUrl.getHost() == null) {
            throw new IllegalArgumentException("Web 地址必须包含主机名");
        }
        if (port < 0 || port > 65535) {
            throw new IllegalArgumentException("端口必须在 0 到 65535 之间");
        }
        if (accessToken.length() < 32) {
            throw new IllegalArgumentException("访问令牌长度不足");
        }

        var fileName = savePath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!(fileName.endsWith(".sl2") || fileName.endsWith(".co2") || fileName.endsWith(".err"))) {
            throw new IllegalArgumentException("只允许配置 .sl2、.co2 或 .err 存档");
        }
    }

    public String allowedWebOrigin() {
        var defaultPort = "https".equalsIgnoreCase(webUrl.getScheme()) ? 443 : 80;
        var portPart = webUrl.getPort() < 0 || webUrl.getPort() == defaultPort ? "" : ":" + webUrl.getPort();
        return webUrl.getScheme().toLowerCase(Locale.ROOT) + "://" + webUrl.getHost().toLowerCase(Locale.ROOT) + portPart;
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
        return value.strip();
    }
}
