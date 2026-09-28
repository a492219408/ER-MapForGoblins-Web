package dev.mapforgoblins.web.system;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
public class SystemInfoController {

    private final String assetBaseUrl;

    public SystemInfoController(@Value("${mfg.assets.base-url:}") String assetBaseUrl) {
        this.assetBaseUrl = assetBaseUrl;
    }

    @GetMapping("/info")
    public SystemInfoResponse info() {
        var resolvedAssetBaseUrl = assetBaseUrl.isBlank() ? "/assets" : assetBaseUrl;
        return new SystemInfoResponse(
                "0.1.0-SNAPSHOT",
                resolvedAssetBaseUrl,
                "browser-worker",
                "browser-only",
                List.of("file", "file-system-handle", "save-bridge"),
                List.of("err"));
    }

    public record SystemInfoResponse(
            String version,
            String assetBaseUrl,
            String saveParsingMode,
            String clientStateMode,
            List<String> saveSources,
            List<String> profiles) {
    }
}
