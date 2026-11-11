#!/bin/bash
# Fast test runner - executes files in small batches with bun

set -e

COVERAGE=${COVERAGE:-0}
BUN="bun test"
[ "$COVERAGE" = "1" ] && BUN="bun test --coverage"

PATTERNS=(
  "src/management/catalog/json-files.test.ts"
  "src/management/storage/file.test.ts"
  "src/management/storage/json-file-store.test.ts"
  "src/management/storage/cache-store.test.ts"
  "src/management/storage/file-operations.test.ts"
  "src/management/storage/read/scoped-directory.test.ts"
  "src/management/storage/index-cache/quick-actions-runtime.test.ts"
  "src/management/online/notification/notifications.test.ts"
  "src/management/online/catalog/gateway.test.ts"
  "src/management/online/connectivity/env.test.ts"
  "src/management/setting/models/settings.test.ts"
  "src/management/setting/models/workspace-ui-settings.test.ts"
  "src/management/setting/onboarding/initialization.test.ts"
  "src/management/setting/onboarding/locator-host-folder.test.ts"
  "src/management/setting/persistence/path-copy-safety.test.ts"
  "src/management/setting/persistence/merge-settings-paths.test.ts"
  "src/management/setting/persistence/relocate-support-root.test.ts"
  "src/management/setting/persistence/ty-plus-managed-root.test.ts"
  "src/management/setting/persistence/paths-change-flow.test.ts"
  "src/management/setting/dialog/settings-context-menu-build.test.ts"
  "src/management/ae/cep/entry/id.test.ts"
  "src/management/ae/jsx/host-bundle.test.ts"
  "src/management/ae/cep/host-executor.test.ts"
  "src/management/ae/cep/runtime.test.ts"
  "src/management/workspace/layout/types.test.ts"
  "src/management/workspace/undo/history.test.ts"
  "src/management/workspace/placement/column-band-pack.test.ts"
  "src/management/workspace/placement/gateway.test.ts"
  "src/management/workspace/surface/opener-panel-id.test.ts"
  "src/management/preset/icon-data.test.ts"
  "src/management/preset/tool-shell/context-menu.test.ts"
  "src/management/preset/onboarding-directory.test.ts"
  "src/management/preset/onboarding-import.test.ts"
  "src/management/preset/execution/pipeline.test.ts"
  "src/management/preset/sibling-thumbnail.test.ts"
  "src/management/preset/add-dialog-pool.test.ts"
  "src/function/preset/animation/operation.test.ts"
  "src/function/preset/code/operation.test.ts"
  "src/function/preset/layer-comp/operation.test.ts"
  "src/function/preset/__e2e__/execute.test.ts"
  "src/function/onboarding/completion-input.test.ts"
  "src/management/preset/__e2e__/edit.test.ts"
  "src/management/preset/__e2e__/update.test.ts"
  "src/management/widget/record/types.test.ts"
  "src/management/widget/persistence/records-file.test.ts"
  "src/function/widget/utility/font-viewer/local-fonts.test.ts"
  "src/function/widget/utility/directory-browser/build-catalog.test.ts"
  "src/management/debug/console/message-store.test.ts"
  "src/management/debug/console/interceptor.test.ts"
  "src/management/debug/console/ui/dialog-root.test.ts"
  "src/management/dialog/dialogs/context-menu.test.ts"
  "src/management/dialog/modeless/boot.test.ts"
  "src/management/dialog/modeless/surface-id.test.ts"
  "src/management/storage/file-browser-service.test.ts"
  "src/management/storage/index-cache/quick-actions.test.ts"
  "src/management/i18n/preference/storage.test.ts"
  "tools/check/import-boundary.test.ts"
  "tools/check/health/sensors/ids.test.ts"
  "tools/package/sign-zxp.test.ts"
)

TOTAL_PASS=0
TOTAL_FAIL=0
START=$(date +%s)

echo "Running ${#PATTERNS[@]} test files..."

for pattern in "${PATTERNS[@]}"; do
  if [ -f "$pattern" ]; then
    echo -n "."
    result=$(timeout 10 $BUN "$pattern" --no-coverage 2>&1) || true
    if echo "$result" | grep -q "fail"; then
      TOTAL_FAIL=$((TOTAL_FAIL + 1))
      echo ""
      echo "FAIL: $pattern"
    fi
  fi
done

END=$(date +%s)
echo ""
echo "Done in $((END - START))s. Failed files: $TOTAL_FAIL"

[ "$TOTAL_FAIL" -eq 0 ]