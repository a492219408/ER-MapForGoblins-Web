package dev.mapforgoblins.bridge;

import java.awt.Desktop;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Properties;

public final class SaveBridgeApplication {

    private SaveBridgeApplication() {
    }

    public static void main(String[] args) {
        try {
            run(args);
        } catch (Exception exception) {
            System.err.println("启动失败：" + exception.getMessage());
            System.exit(1);
        }
    }

    private static void run(String[] args) throws Exception {
        var options = parseArguments(args);
        if (options.containsKey("help")) {
            printHelp();
            return;
        }

        var store = options.containsKey("config")
                ? new BridgeConfigurationStore(Path.of(options.get("config")))
                : BridgeConfigurationStore.defaultStore();
        var values = store.load();
        applyOptions(values, options);

        var savePathValue = values.getProperty("savePath", "");
        if (savePathValue.isBlank()) {
            savePathValue = prompt("请输入存档路径（.sl2、.co2 或 .err）：");
        }
        if (savePathValue.isBlank()) {
            throw new IllegalArgumentException("没有配置存档路径");
        }

        if (options.containsKey("lan")) {
            values.setProperty("bindHost", "0.0.0.0");
            if (values.getProperty("advertisedHost", "").isBlank()) {
                values.setProperty("advertisedHost", findLanAddress());
            }
        }
        var generatedToken = PairingService.randomToken(new SecureRandom());
        var configuration = store.resolve(values, generatedToken, Path.of(savePathValue));
        store.save(configuration);

        var pairingService = new PairingService();
        try (var server = new BridgeServer(configuration, pairingService)) {
            server.start();
            printBanner(configuration, server, store.path());
            var firstLink = server.issueConnectionUrl();
            System.out.println("一次性连接链接（10 分钟内有效）：");
            System.out.println(firstLink);
            if (options.containsKey("open-browser")) {
                openBrowser(firstLink);
            }
            if (options.containsKey("no-console")) {
                System.out.println("无交互模式已启用，使用 Ctrl+C 或服务管理器停止 Bridge。");
                awaitShutdown();
            } else {
                commandLoop(server);
            }
        }
    }

    private static void commandLoop(BridgeServer server) throws IOException {
        var reader = new BufferedReader(new InputStreamReader(System.in));
        while (true) {
            System.out.print("bridge> ");
            var line = reader.readLine();
            if (line == null || "stop".equalsIgnoreCase(line.strip()) || "exit".equalsIgnoreCase(line.strip())) {
                System.out.println("存档桥接器已停止。");
                return;
            }
            switch (line.strip().toLowerCase(java.util.Locale.ROOT)) {
                case "", "status" -> System.out.println("正在监听 " + server.bridgeBaseUri());
                case "link", "pair" -> {
                    System.out.println("已使之前未使用的连接链接失效，新链接为：");
                    System.out.println(server.issueConnectionUrl());
                }
                case "help", "?" -> System.out.println("命令：status、link、stop");
                default -> System.out.println("未知命令。输入 help 查看可用命令。");
            }
        }
    }

    private static void printBanner(BridgeConfiguration configuration, BridgeServer server, Path configPath) {
        System.out.println();
        System.out.println("ER Map for Goblins · Save Bridge " + BridgeServer.BRIDGE_VERSION);
        System.out.println("存档：" + configuration.savePath().getFileName());
        System.out.println("监听：" + server.bridgeBaseUri());
        System.out.println("配置：" + configPath);
        if ("0.0.0.0".equals(configuration.bindHost()) || "::".equals(configuration.bindHost())) {
            System.out.println("安全提示：局域网模式已启用；只有持有令牌的客户端可以读取存档。");
        }
        System.out.println("输入 help 查看命令。路径和令牌不会通过业务服务器保存。");
        System.out.println();
    }

    private static LinkedHashMap<String, String> parseArguments(String[] args) {
        var result = new LinkedHashMap<String, String>();
        for (var index = 0; index < args.length; index++) {
            var argument = args[index];
            if (!argument.startsWith("--")) {
                throw new IllegalArgumentException("无法识别的参数：" + argument);
            }
            var key = argument.substring(2);
            if (key.equals("help") || key.equals("lan") || key.equals("open-browser") || key.equals("no-console")) {
                result.put(key, "true");
                continue;
            }
            if (index + 1 >= args.length) {
                throw new IllegalArgumentException("参数缺少值：" + argument);
            }
            result.put(key, args[++index]);
        }
        return result;
    }

    private static void applyOptions(Properties values, LinkedHashMap<String, String> options) {
        copy(values, options, "save", "savePath");
        copy(values, options, "web-url", "webUrl");
        copy(values, options, "bind", "bindHost");
        copy(values, options, "port", "port");
        copy(values, options, "advertise-host", "advertisedHost");
        copy(values, options, "web-root", "webRoot");
    }

    private static void copy(Properties values, LinkedHashMap<String, String> options, String option, String property) {
        if (options.containsKey(option)) {
            values.setProperty(property, options.get(option));
        }
    }

    private static String prompt(String message) throws IOException {
        System.out.print(message + " ");
        return new BufferedReader(new InputStreamReader(System.in)).readLine();
    }

    private static String findLanAddress() {
        try {
            for (var networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!networkInterface.isUp() || networkInterface.isLoopback()) continue;
                for (var address : Collections.list(networkInterface.getInetAddresses())) {
                    if (address.isSiteLocalAddress() && address.getHostAddress().indexOf(':') < 0) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (IOException ignored) {
            // The user can provide --advertise-host when automatic detection is unavailable.
        }
        return "localhost";
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
            } else {
                System.out.println("当前环境不能自动打开浏览器，请复制上面的链接。");
            }
        } catch (Exception exception) {
            System.out.println("未能自动打开浏览器，请复制上面的链接。");
        }
    }

    private static void awaitShutdown() throws InterruptedException {
        new java.util.concurrent.CountDownLatch(1).await();
    }

    private static void printHelp() {
        System.out.println("""
                ER Map for Goblins Save Bridge

                --save <path>             存档路径（.sl2、.co2 或 .err）
                --web-url <url>           网页地址，默认 http://localhost:8080
                --bind <host>             监听地址，默认 127.0.0.1
                --port <port>             监听端口，默认 51337；0 表示自动分配
                --advertise-host <host>   连接链接中使用的主机名或 IP
                --web-root <path>         可选的同源网页构建目录
                --config <path>           自定义配置文件位置
                --lan                     监听所有网卡并自动探测局域网地址
                --open-browser            启动后打开一次性连接链接
                --no-console              禁用交互命令并持续运行，适合容器或服务
                --help                    显示帮助
                """);
    }
}
