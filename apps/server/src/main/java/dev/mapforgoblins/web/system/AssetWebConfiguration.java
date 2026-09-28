package dev.mapforgoblins.web.system;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AssetWebConfiguration implements WebMvcConfigurer {

    private final String assetsDirectory;

    public AssetWebConfiguration(@Value("${mfg.assets.directory:}") String assetsDirectory) {
        this.assetsDirectory = assetsDirectory;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (assetsDirectory.isBlank()) {
            return;
        }

        var location = Path.of(assetsDirectory).toAbsolutePath().normalize().toUri().toString();
        if (!location.endsWith("/")) {
            location += "/";
        }
        // Stable entrypoints occur at the root, feature, and profile levels.
        // A variable keeps the filename in the resource lookup path; an exact
        // URL mapping would strip it and try to resolve the directory itself.
        registry.addResourceHandler(
                        "/assets/{name:.*\\.v[0-9]+\\.json}",
                        "/assets/{directory}/{name:.*\\.v[0-9]+\\.json}",
                        "/assets/{directory}/{profile}/{name:.*\\.v[0-9]+\\.json}")
                .addResourceLocations("classpath:/static/assets/", location)
                .setCacheControl(CacheControl.noCache());
        registry.addResourceHandler("/assets/**")
                // Vite's JS/CSS share this URL prefix with external game data.
                .addResourceLocations("classpath:/static/assets/", location)
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
