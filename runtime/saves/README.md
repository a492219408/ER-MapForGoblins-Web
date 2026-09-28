# Local Bridge save mount

This directory is an optional local mount for Save Bridge containers. Only this README is tracked; actual saves and sidecar files remain private.

Compose mounts the chosen host directory read-only at `/saves`. Set `BRIDGE_SAVE_DIRECTORY` and `BRIDGE_SAVE_PATH` appropriately. Native Bridge can read a user-selected path directly and does not require copying a save here.
