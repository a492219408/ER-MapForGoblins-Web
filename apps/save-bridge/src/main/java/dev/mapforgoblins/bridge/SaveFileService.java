package dev.mapforgoblins.bridge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;

final class SaveFileService {

    private static final long MAX_SAVE_SIZE = 128L * 1024 * 1024;
    private final Path savePath;

    SaveFileService(Path savePath) {
        this.savePath = savePath;
    }

    SaveStatus status() {
        try {
            var attributes = attributes();
            return new SaveStatus(true, savePath.getFileName().toString(), attributes.size(),
                    attributes.lastModifiedTime().toInstant(), revision(attributes), null);
        } catch (NoSuchFileException exception) {
            return new SaveStatus(false, savePath.getFileName().toString(), 0, null, null, "FILE_MISSING");
        } catch (IOException exception) {
            return new SaveStatus(false, savePath.getFileName().toString(), 0, null, null, "FILE_UNREADABLE");
        }
    }

    SaveSnapshot readStableSnapshot() throws IOException {
        IOException lastFailure = null;
        for (var attempt = 0; attempt < 3; attempt++) {
            try {
                var before = attributes();
                if (before.size() > MAX_SAVE_SIZE) {
                    throw new IOException("存档超过 128 MiB 安全限制");
                }
                var bytes = Files.readAllBytes(savePath);
                var after = attributes();
                if (before.size() == after.size()
                        && before.lastModifiedTime().equals(after.lastModifiedTime())
                        && bytes.length == after.size()) {
                    return new SaveSnapshot(bytes, revision(after), after.lastModifiedTime().toInstant());
                }
                lastFailure = new IOException("游戏正在写入存档");
            } catch (IOException exception) {
                lastFailure = exception;
            }

            try {
                Thread.sleep(75);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException("读取存档时被中断", exception);
            }
        }
        throw lastFailure == null ? new IOException("无法读取稳定的存档快照") : lastFailure;
    }

    private BasicFileAttributes attributes() throws IOException {
        var attributes = Files.readAttributes(savePath, BasicFileAttributes.class);
        if (!attributes.isRegularFile()) {
            throw new IOException("配置的存档路径不是普通文件");
        }
        return attributes;
    }

    private static String revision(BasicFileAttributes attributes) {
        return Long.toUnsignedString(attributes.lastModifiedTime().toMillis(), 36)
                + "-" + Long.toUnsignedString(attributes.size(), 36);
    }

    record SaveStatus(
            boolean ready,
            String fileName,
            long size,
            Instant lastModified,
            String revision,
            String errorCode) {
    }

    record SaveSnapshot(byte[] bytes, String revision, Instant lastModified) {
    }
}
