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
        registry.addResourceHandler("/assets/dataset-manifest.v1.json")
                .addResourceLocations(location)
                .setCacheControl(CacheControl.noCache());
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(location)
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
