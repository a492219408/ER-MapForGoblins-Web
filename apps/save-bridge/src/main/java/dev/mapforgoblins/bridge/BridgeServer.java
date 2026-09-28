package dev.mapforgoblins.bridge;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;

final class BridgeServer implements AutoCloseable {

    static final int PROTOCOL_VERSION = 1;
    static final String BRIDGE_VERSION = "0.1.0";
    private static final Set<String> ALLOWED_PREFLIGHT_METHODS = Set.of("GET", "HEAD", "POST");

    private final BridgeConfiguration configuration;
    private final PairingService pairingService;
    private final SaveFileService saveFileService;
    private final PairingAttemptLimiter pairingAttemptLimiter = new PairingAttemptLimiter();
    private final HttpServer server;
    private final ExecutorService executor;

    BridgeServer(BridgeConfiguration configuration, PairingService pairingService) throws IOException {
        this.configuration = configuration;
        this.pairingService = pairingService;
        saveFileService = new SaveFileService(configuration.savePath());
        server = HttpServer.create(new InetSocketAddress(configuration.bindHost(), configuration.port()), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        server.createContext("/v1/health", this::handleHealth);
        server.createContext("/v1/pair", this::handlePair);
        server.createContext("/v1/status", this::handleStatus);
        server.createContext("/v1/save", this::handleSave);
        server.createContext("/", this::handleWeb);
    }

    void start() {
        server.start();
    }

    int port() {
        return server.getAddress().getPort();
    }

    String issueConnectionUrl() {
        var pairToken = pairingService.issue();
        var bridge = bridgeBaseUri();
        var webBase = configuration.webRoot() == null
                ? configuration.webUrl().toString().split("#", 2)[0]
                : bridgeBaseUri() + "/";
        return webBase + "#/connect?bridge=" + encode(bridge.toString()) + "&pair=" + encode(pairToken);
    }

    URI bridgeBaseUri() {
        var host = configuration.advertisedHost();
        if (host.isBlank()) {
            host = switch (configuration.bindHost()) {
                case "0.0.0.0", "::" -> "localhost";
                default -> configuration.bindHost();
            };
        }
        if (host.contains(":") && !host.startsWith("[")) {
            host = "[" + host + "]";
        }
        return URI.create("http://" + host + ":" + port());
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (!prepare(exchange, Set.of("GET"), false)) {
            return;
        }
        var status = saveFileService.status();
        sendJson(exchange, 200, Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "bridgeVersion", BRIDGE_VERSION,
                "ready", status.ready(),
                "pairing", "ONE_TIME_LINK",
                "sameOriginWeb", configuration.webRoot() != null));
    }

    private void handlePair(HttpExchange exchange) throws IOException {
        if (!prepare(exchange, Set.of("POST"), false)) {
            return;
        }
        var remoteAddress = exchange.getRemoteAddress().getAddress().getHostAddress();
        if (!pairingAttemptLimiter.allow(remoteAddress)) {
            sendError(exchange, 429, "PAIRING_RATE_LIMITED", "配对尝试过多，请稍后再试");
            return;
        }
        var authorization = exchange.getRequestHeaders().getFirst("Authorization");
        var candidate = authorization != null && authorization.startsWith("Pair ")
                ? authorization.substring("Pair ".length())
                : null;
        if (!pairingService.consume(candidate)) {
            pairingAttemptLimiter.failed(remoteAddress);
            sendError(exchange, 401, "PAIRING_REJECTED", "配对链接无效、已使用或已过期");
            return;
        }
        pairingAttemptLimiter.succeeded(remoteAddress);
        sendJson(exchange, 200, Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "accessToken", configuration.accessToken()));
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        if (!prepare(exchange, Set.of("GET"), true)) {
            return;
        }
        var status = saveFileService.status();
        var response = new java.util.LinkedHashMap<String, Object>();
        response.put("protocolVersion", PROTOCOL_VERSION);
        response.put("ready", status.ready());
        response.put("fileName", status.fileName());
        response.put("size", status.size());
        response.put("lastModified", status.lastModified() == null ? null : status.lastModified().toString());
        response.put("revision", status.revision());
        response.put("errorCode", status.errorCode());
        sendJson(exchange, 200, response);
    }

    private void handleSave(HttpExchange exchange) throws IOException {
        if (!prepare(exchange, Set.of("GET", "HEAD"), true)) {
            return;
        }
        try {
            var snapshot = saveFileService.readStableSnapshot();
            var etag = "\"" + snapshot.revision() + "\"";
            if (etag.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
                exchange.getResponseHeaders().set("ETag", etag);
                exchange.sendResponseHeaders(304, -1);
                exchange.close();
                return;
            }
            var headers = exchange.getResponseHeaders();
            applySecurityHeaders(headers);
            headers.set("Content-Type", "application/octet-stream");
            headers.set("Cache-Control", "no-store");
            headers.set("ETag", etag);
            headers.set("Last-Modified", DateTimeFormatter.RFC_1123_DATE_TIME.format(
                    snapshot.lastModified().atZone(java.time.ZoneOffset.UTC)));
            if ("HEAD".equals(exchange.getRequestMethod())) {
                headers.set("Content-Length", Integer.toString(snapshot.bytes().length));
                exchange.sendResponseHeaders(200, -1);
            } else {
                exchange.sendResponseHeaders(200, snapshot.bytes().length);
                exchange.getResponseBody().write(snapshot.bytes());
            }
        } catch (java.nio.file.NoSuchFileException exception) {
            sendError(exchange, 404, "FILE_MISSING", "存档文件不存在");
        } catch (IOException exception) {
            sendError(exchange, 409, "FILE_UNSTABLE", "存档正在写入或暂时无法读取");
        } finally {
            exchange.close();
        }
    }

    private void handleWeb(HttpExchange exchange) throws IOException {
        if (!Set.of("GET", "HEAD").contains(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", "GET, HEAD");
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }
        var root = configuration.webRoot();
        if (root == null || !Files.isDirectory(root)) {
            var html = """
                    <!doctype html><html lang="zh-CN"><meta charset="utf-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1">
                    <title>Map for Goblins Save Bridge</title>
                    <style>body{margin:0;background:#0b0e0c;color:#efe8d8;font:16px/1.65 system-ui;padding:8vw}main{max-width:680px;margin:auto;padding:32px;border:1px solid #66552f;border-radius:14px;background:#111512}code{color:#d6b76d}</style>
                    <main><h1>存档桥接器已运行</h1><p>当前安装包没有内置网页。请使用终端中生成的一次性连接链接，或使用 <code>--web-root</code> 指向已构建的网页目录。</p><p>此页面不会显示存档路径，也不提供目录浏览。</p></main></html>
                    """.getBytes(StandardCharsets.UTF_8);
            sendBytes(exchange, 200, "text/html; charset=utf-8", html);
            return;
        }

        var requestPath = exchange.getRequestURI().getPath();
        var relative = requestPath.equals("/") ? "index.html" : requestPath.substring(1);
        var candidate = root.resolve(relative).normalize();
        if (!candidate.startsWith(root) || !Files.isRegularFile(candidate)) {
            sendError(exchange, 404, "WEB_NOT_FOUND", "网页文件不存在");
            return;
        }
        sendBytes(exchange, 200, contentType(candidate), Files.readAllBytes(candidate));
    }

    private boolean prepare(HttpExchange exchange, Set<String> methods, boolean requiresAccessToken) throws IOException {
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            handlePreflight(exchange);
            return false;
        }
        if (!methods.contains(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", String.join(", ", methods));
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
            return false;
        }
        if (!applyCors(exchange)) {
            sendError(exchange, 403, "ORIGIN_REJECTED", "网页来源不在允许列表中");
            return false;
        }
        if (requiresAccessToken && !hasValidAccessToken(exchange)) {
            sendError(exchange, 401, "AUTH_REQUIRED", "需要有效的存档桥接器访问令牌");
            return false;
        }
        return true;
    }

    private void handlePreflight(HttpExchange exchange) throws IOException {
        if (!applyCors(exchange)) {
            sendError(exchange, 403, "ORIGIN_REJECTED", "网页来源不在允许列表中");
            return;
        }
        var requestedMethod = exchange.getRequestHeaders().getFirst("Access-Control-Request-Method");
        if (requestedMethod == null || !ALLOWED_PREFLIGHT_METHODS.contains(requestedMethod.toUpperCase(Locale.ROOT))) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "预检请求的方法不受支持");
            return;
        }
        var headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match");
        headers.set("Access-Control-Allow-Private-Network", "true");
        headers.set("Access-Control-Max-Age", "600");
        applySecurityHeaders(headers);
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
    }

    private boolean applyCors(HttpExchange exchange) {
        var origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null) {
            return true;
        }
        var ownOrigin = "http://" + exchange.getRequestHeaders().getFirst("Host");
        if (!(origin.equalsIgnoreCase(configuration.allowedWebOrigin()) || origin.equalsIgnoreCase(ownOrigin))) {
            return false;
        }
        var headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
        return true;
    }

    private boolean hasValidAccessToken(HttpExchange exchange) {
        var authorization = exchange.getRequestHeaders().getFirst("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return false;
        }
        return MessageDigest.isEqual(
                configuration.accessToken().getBytes(StandardCharsets.UTF_8),
                authorization.substring("Bearer ".length()).getBytes(StandardCharsets.UTF_8));
    }

    private void sendJson(HttpExchange exchange, int status, Map<String, ?> values) throws IOException {
        sendBytes(exchange, status, "application/json; charset=utf-8", Json.encode(values).getBytes(StandardCharsets.UTF_8));
    }

    private void sendError(HttpExchange exchange, int status, String code, String message) throws IOException {
        sendJson(exchange, status, Map.of("code", code, "message", message));
    }

    private void sendBytes(HttpExchange exchange, int status, String contentType, byte[] body) throws IOException {
        var headers = exchange.getResponseHeaders();
        applySecurityHeaders(headers);
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "no-store");
        if ("HEAD".equals(exchange.getRequestMethod())) {
            headers.set("Content-Length", Integer.toString(body.length));
            exchange.sendResponseHeaders(status, -1);
        } else {
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
        }
        exchange.close();
    }

    private static void applySecurityHeaders(Headers headers) {
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Referrer-Policy", "no-referrer");
        headers.set("X-Frame-Options", "DENY");
        headers.set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    }

    private static String contentType(Path path) {
        var name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".json")) return "application/json; charset=utf-8";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Override
    public void close() {
        server.stop(1);
        executor.close();
    }

    private static final class Json {
        private Json() {
        }

        static String encode(Map<String, ?> values) {
            var result = new StringBuilder("{");
            var first = true;
            for (var entry : values.entrySet()) {
                if (!first) result.append(',');
                first = false;
                result.append(quote(entry.getKey())).append(':').append(value(entry.getValue()));
            }
            return result.append('}').toString();
        }

        private static String value(Object value) {
            if (value == null) return "null";
            if (value instanceof Number || value instanceof Boolean) return value.toString();
            return quote(value.toString());
        }

        private static String quote(String value) {
            var result = new StringBuilder("\"");
            for (var character : value.toCharArray()) {
                switch (character) {
                    case '\"' -> result.append("\\\"");
                    case '\\' -> result.append("\\\\");
                    case '\n' -> result.append("\\n");
                    case '\r' -> result.append("\\r");
                    case '\t' -> result.append("\\t");
                    default -> {
                        if (character < 0x20) result.append(String.format("\\u%04x", (int) character));
                        else result.append(character);
                    }
                }
            }
            return result.append('\"').toString();
        }
    }

    private static final class PairingAttemptLimiter {
        private static final long WINDOW_MILLIS = 60_000;
        private static final int MAX_FAILURES = 5;
        private final ConcurrentHashMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

        boolean allow(String address) {
            var window = attempts.get(address);
            return window == null || window.expired() || window.failures() < MAX_FAILURES;
        }

        void failed(String address) {
            attempts.compute(address, (ignored, current) -> current == null || current.expired()
                    ? new AttemptWindow(System.currentTimeMillis(), 1)
                    : new AttemptWindow(current.startedAt(), current.failures() + 1));
            if (attempts.size() > 256) {
                attempts.entrySet().removeIf(entry -> entry.getValue().expired());
            }
        }

        void succeeded(String address) {
            attempts.remove(address);
        }

        private record AttemptWindow(long startedAt, int failures) {
            boolean expired() {
                return System.currentTimeMillis() - startedAt >= WINDOW_MILLIS;
            }
        }
    }
}
