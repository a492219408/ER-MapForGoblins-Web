# Local save inspection tools

These development scripts read local saves without modifying or uploading them. They can print character, inventory, and other personal save details: keep their output private.

```sh
node tools/save-analysis/inspect-character-fixtures.mjs "/path/to/authorized-fixtures" 0
node tools/save-analysis/compare-character-fixtures.mjs "/path/to/authorized-fixtures" 0 "<baseline-name>" "<changed-name>"
node tools/save-analysis/inspect-item-occurrences.mjs "/path/to/authorized-fixtures" "<baseline-name>" "<changed-name>" 1720
```

Slot indexes start at zero. Where a name is requested, use a filename stem from the supplied directory; check the script's argument handling for the supported suffixes. The comparison helper also has historical baseline-naming defaults, so explicit names are preferable for new fixtures.

Real saves and diagnostic output are not distributed as fixtures. The public test suite skips optional local comparisons when those inputs are absent.
