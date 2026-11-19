# Storybook 視覚品質レビュー・チェックリスト — v0.11.0 RC

capture 実施SHA: `05551c30` / RC候補SHA: `bbbe77cc`
`05551c30..bbbe77cc` の差分は検証スクリプト・docs・package.json scripts のみで `src/` `rust/` に変更なし（`docs/verification/release-candidate-0-11-0.md` §1）。capture 証拠は RC候補の製品コードに対して有効。

capture report: `storybook-capture-report-05551c308c8581fe7b3c7ec87f6d040c6c063de1` (CI artifact)
429/429 story `ok`、render-failed/capture-error/missing = 0。console error は ErrorBoundary/Fallback の意図的 fixture のみ。

**capture 成功 ≠ 視覚品質合格**。以下の tier 順に gallery (`index.html`) で目視確認する。

## A — 操作状態（hover/focus/selected/drag/empty/error/loading/disabled） (70 stories)

| story | title |
|---|---|
| `background-layereditor--disabled` | Background/LayerEditor / Disabled |
| `background-layerlistpanel--empty` | Background/LayerListPanel / Empty |
| `debug-console-panel--empty` | Debug/Console/Panel / Empty |
| `debug-console-panel--errors-only` | Debug/Console/Panel / Errors Only |
| `directorybrowser-browserheader--go-up-disabled` | DirectoryBrowser/BrowserHeader / Go Up Disabled |
| `directorybrowser-browserpathfield--empty` | DirectoryBrowser/BrowserPathField / Empty |
| `directorybrowser-browsersearchfield--focused` | DirectoryBrowser/BrowserSearchField / Focused |
| `directorybrowser-browsertoolbar--go-up-disabled` | DirectoryBrowser/BrowserToolbar / Go Up Disabled |
| `directorybrowser-catalogpreseticontile--hover` | DirectoryBrowser/CatalogPresetIconTile / Hover |
| `directorybrowser-directorybrowser--active-and-selected` | DirectoryBrowser/DirectoryBrowser / Active And Selected |
| `directorybrowser-directorybrowser--selected-only` | DirectoryBrowser/DirectoryBrowser / Selected Only |
| `directorybrowser-directorybrowsericoncard--hover-selected` | DirectoryBrowser/DirectoryBrowserIconCard / Hover Selected |
| `directorybrowser-directorybrowsericoncard--hover-unselected` | DirectoryBrowser/DirectoryBrowserIconCard / Hover Unselected |
| `directorybrowser-directorybrowsericoncard--selected` | DirectoryBrowser/DirectoryBrowserIconCard / Selected |
| `directorybrowser-directorybrowseronboarding--empty` | DirectoryBrowser/DirectoryBrowserOnboarding / Empty |
| `directorybrowser-directorybrowseronboarding--loading` | DirectoryBrowser/DirectoryBrowserOnboarding / Loading |
| `directorybrowser-directorybrowserselectedsummary--empty` | DirectoryBrowser/DirectoryBrowserSelectedSummary / Empty |
| `directorybrowser-directorybrowserviewmodetoggle--icons-selected` | DirectoryBrowser/DirectoryBrowserViewModeToggle / Icons Selected |
| `directorybrowser-directorybrowserviewmodetoggle--list-selected` | DirectoryBrowser/DirectoryBrowserViewModeToggle / List Selected |
| `directorybrowser-thumbnailtile--loading` | DirectoryBrowser/ThumbnailTile / Loading |
| `fontviewer-statusline--empty` | FontViewer/StatusLine / Empty |
| `fontviewer-statusline--loading` | FontViewer/StatusLine / Loading |
| `info-compsections--many-selected` | Info/CompSections / Many Selected |
| `info-presetinfo--empty` | Info/PresetInfo / Empty |
| `info-presetinfo--healthy-empty` | Info/PresetInfo / Healthy state (empty, Issue #87) |
| `notification-center--detail-loading` | Notification/Center / Detail Loading |
| `onboarding-completioninput--empty` | Onboarding/CompletionInput / Empty |
| `preset-catalogadd-pathdialogfooteractions--disabled` | Preset/CatalogAdd/PathDialogFooterActions / Disabled |
| `preset-catalogadd-pathdialognamefield--empty` | Preset/CatalogAdd/PathDialogNameField / Empty |
| `preset-catalogbrowser-presetsdialogheader--error-state` | Preset/CatalogBrowser/PresetsDialogHeader / Error State |
| `preset-catalogbrowser-presetsdialogheader--loading` | Preset/CatalogBrowser/PresetsDialogHeader / Loading |
| `preset-group-containercatalogtile--empty` | Preset/Group/ContainerCatalogTile / Empty |
| `preset-markdown-editorlines--empty` | Preset/Markdown/EditorLines / Empty |
| `preset-markdown-placeholderoverlay--empty` | Preset/Markdown/PlaceholderOverlay / Empty |
| `preset-workspace-glyphcachedimage--empty-path` | Preset/Workspace/GlyphCachedImage / Empty Path |
| `preset-workspace-gridcatalogtile--empty` | Preset/Workspace/GridCatalogTile / Empty |
| `quickactions-actionlist--empty-results` | QuickActions/ActionList / Empty Results |
| `quickactions-actionlist--open` | QuickActions/ActionList / Open |
| `quickactions-palettedropdown--empty` | QuickActions/PaletteDropdown / Empty |
| `quickactions-rowcomponents--selected` | QuickActions/RowComponents / Selected |
| `setting-tokeneditor--empty-description` | Setting/TokenEditor / Empty Description |
| `shared-controls-button--disabled` | Shared/Controls/Button / Disabled |
| `shared-controls-button--focused` | Shared/Controls/Button / Focused |
| `shared-controls-button--hovered` | Shared/Controls/Button / Hovered |
| `shared-controls-iconbutton--disabled` | Shared/Controls/IconButton / Disabled |
| `shared-controls-segmentedcontrol--active-selected` | Shared/Controls/SegmentedControl / Active Selected |
| `shared-controls-segmentedcontrol--hovered-segment` | Shared/Controls/SegmentedControl / Hovered Segment |
| `shared-controls-segmentedcontrol--selected-on-click` | Shared/Controls/SegmentedControl / Selected On Click |
| `shared-feedback-filedropzone--disabled` | Shared/Feedback/FileDropZone / Disabled |
| `shared-feedback-filedropzone--drag-over` | Shared/Feedback/FileDropZone / Drag Over |
| `shared-fields-colorfield--focused` | Shared/Fields/ColorField / Focused |
| `shared-fields-colorswatch--disabled` | Shared/Fields/ColorSwatch / Disabled |
| `shared-fields-input--focused` | Shared/Fields/Input / Focused |
| `shared-fields-input--with-error` | Shared/Fields/Input / With Error |
| `shared-fields-listselect--disabled` | Shared/Fields/ListSelect / Disabled |
| `shared-fields-listselect--open-and-select` | Shared/Fields/ListSelect / Open And Select |
| `shared-fields-numberfield--disabled` | Shared/Fields/NumberField / Disabled |
| `shared-fields-numberfield--focused` | Shared/Fields/NumberField / Focused |
| `shared-fields-pathfield--disabled` | Shared/Fields/PathField / Disabled |
| `shared-fields-pathfield--focused` | Shared/Fields/PathField / Focused |
| `shared-fields-regexeditor--disabled` | Shared/Fields/RegexEditor / Disabled |
| `shared-fields-searchfield--disabled` | Shared/Fields/SearchField / Disabled |
| `shared-fields-searchfield--focus-visible` | Shared/Fields/SearchField / Focus Visible |
| `shared-fields-textarea--disabled` | Shared/Fields/Textarea / Disabled |
| `shared-fields-textarea--focused` | Shared/Fields/Textarea / Focused |
| `widgetcore-align--drag-align-right` | WidgetCore/Align / Drag Align Right |
| `widgetcore-align--hover-target` | WidgetCore/Align / Hover Target |
| `widgetcore-anchorpoint--drag-to-top-left` | WidgetCore/AnchorPoint / Drag To Top Left |
| `widgetcore-easing--mouse-only-drag` | WidgetCore/Easing / Mouse Only Drag |
| `widgetcore-easing--space-pan-drag` | WidgetCore/Easing / Space Pan Drag |

## B — 主要領域（Workspace/Preset/DirectoryBrowser/Setting/QuickActions） (206 stories)

| story | title |
|---|---|
| `directorybrowser-browserbrowsemodeselect--anchors` | DirectoryBrowser/BrowserBrowseModeSelect / Anchors |
| `directorybrowser-browserbrowsemodeselect--catalog` | DirectoryBrowser/BrowserBrowseModeSelect / Catalog |
| `directorybrowser-browserbrowsemodeselect--default` | DirectoryBrowser/BrowserBrowseModeSelect / Default |
| `directorybrowser-browserfilterpanel--anchors-mode` | DirectoryBrowser/BrowserFilterPanel / Anchors Mode |
| `directorybrowser-browserfilterpanel--catalog-mode` | DirectoryBrowser/BrowserFilterPanel / Catalog Mode |
| `directorybrowser-browserfilterpanel--catalog-with-hidden-types` | DirectoryBrowser/BrowserFilterPanel / Catalog With Hidden Types |
| `directorybrowser-browserfilterpanel--default` | DirectoryBrowser/BrowserFilterPanel / Default |
| `directorybrowser-browserfilterpanel--media-only` | DirectoryBrowser/BrowserFilterPanel / Media Only |
| `directorybrowser-browserfilterpanel--recursive-on` | DirectoryBrowser/BrowserFilterPanel / Recursive On |
| `directorybrowser-browserfilterpanel--some-extensions-hidden` | DirectoryBrowser/BrowserFilterPanel / Some Extensions Hidden |
| `directorybrowser-browserfilterpanel--some-file-types-hidden` | DirectoryBrowser/BrowserFilterPanel / Some File Types Hidden |
| `directorybrowser-browserheader--anchors-mode` | DirectoryBrowser/BrowserHeader / Anchors Mode |
| `directorybrowser-browserheader--catalog-mode` | DirectoryBrowser/BrowserHeader / Catalog Mode |
| `directorybrowser-browserheader--default` | DirectoryBrowser/BrowserHeader / Default |
| `directorybrowser-browserheader--filters-expanded` | DirectoryBrowser/BrowserHeader / Filters Expanded |
| `directorybrowser-browserheader--icon-view` | DirectoryBrowser/BrowserHeader / Icon View |
| `directorybrowser-browserheader--with-search-query` | DirectoryBrowser/BrowserHeader / With Search Query |
| `directorybrowser-browserpathfield--default` | DirectoryBrowser/BrowserPathField / Default |
| `directorybrowser-browserpathfield--long-path` | DirectoryBrowser/BrowserPathField / Long Path |
| `directorybrowser-browserpathfield--windows-path` | DirectoryBrowser/BrowserPathField / Windows Path |
| `directorybrowser-browserpathfield--with-browse` | DirectoryBrowser/BrowserPathField / With Browse |
| `directorybrowser-browsersearchfield--custom-placeholder` | DirectoryBrowser/BrowserSearchField / Custom Placeholder |
| `directorybrowser-browsersearchfield--default` | DirectoryBrowser/BrowserSearchField / Default |
| `directorybrowser-browsersearchfield--with-trailing` | DirectoryBrowser/BrowserSearchField / With Trailing |
| `directorybrowser-browsersearchfield--with-value` | DirectoryBrowser/BrowserSearchField / With Value |
| `directorybrowser-browsertoolbar--default` | DirectoryBrowser/BrowserToolbar / Default |
| `directorybrowser-browsertoolbar--filters-expanded` | DirectoryBrowser/BrowserToolbar / Filters Expanded |
| `directorybrowser-browsertoolbar--icon-view` | DirectoryBrowser/BrowserToolbar / Icon View |
| `directorybrowser-browsertoolbar--icons-with-filters` | DirectoryBrowser/BrowserToolbar / Icons With Filters |
| `directorybrowser-catalogpreseticontile--default` | DirectoryBrowser/CatalogPresetIconTile / Default |
| `directorybrowser-catalogpreseticontile--long-title` | DirectoryBrowser/CatalogPresetIconTile / Long Title |
| `directorybrowser-catalogpreseticontile--script-preset` | DirectoryBrowser/CatalogPresetIconTile / Script Preset |
| `directorybrowser-catalogpreseticontile--wide` | DirectoryBrowser/CatalogPresetIconTile / Wide |
| `directorybrowser-catalogpresetlistrow--default` | DirectoryBrowser/CatalogPresetListRow / Default |
| `directorybrowser-catalogpresetlistrow--long-title` | DirectoryBrowser/CatalogPresetListRow / Long Title |
| `directorybrowser-catalogpresetlistrow--plugin-preset` | DirectoryBrowser/CatalogPresetListRow / Plugin Preset |
| `directorybrowser-catalogpresetlistrow--script-preset` | DirectoryBrowser/CatalogPresetListRow / Script Preset |
| `directorybrowser-collapsiblegroupheader--closed` | DirectoryBrowser/CollapsibleGroupHeader / Closed |
| `directorybrowser-collapsiblegroupheader--default` | DirectoryBrowser/CollapsibleGroupHeader / Default |
| `directorybrowser-collapsiblegroupheader--many-items` | DirectoryBrowser/CollapsibleGroupHeader / Many Items |
| `directorybrowser-collapsiblegroupheader--with-toggle-handler` | DirectoryBrowser/CollapsibleGroupHeader / With Toggle Handler |
| `directorybrowser-collapsiblegroupheader--zero-count` | DirectoryBrowser/CollapsibleGroupHeader / Zero Count |
| `directorybrowser-directorybrowser--active-only` | DirectoryBrowser/DirectoryBrowser / Active Only |
| `directorybrowser-directorybrowser--icons-view` | DirectoryBrowser/DirectoryBrowser / Icons View |
| `directorybrowser-directorybrowser--list-view` | DirectoryBrowser/DirectoryBrowser / List View |
| `directorybrowser-directorybrowser--long-file-names` | DirectoryBrowser/DirectoryBrowser / Long File Names |
| `directorybrowser-directorybrowserfooter--counts` | DirectoryBrowser/DirectoryBrowserFooter / Counts |
| `directorybrowser-directorybrowserfooter--default` | DirectoryBrowser/DirectoryBrowserFooter / Default |
| `directorybrowser-directorybrowserfooter--icon-view` | DirectoryBrowser/DirectoryBrowserFooter / Icon View |
| `directorybrowser-directorybrowserfooter--no-summary` | DirectoryBrowser/DirectoryBrowserFooter / No Summary |
| `directorybrowser-directorybrowsericoncard--default` | DirectoryBrowser/DirectoryBrowserIconCard / Default |
| `directorybrowser-directorybrowsericoncard--folder` | DirectoryBrowser/DirectoryBrowserIconCard / Folder |
| `directorybrowser-directorybrowsericoncard--image-with-preview` | DirectoryBrowser/DirectoryBrowserIconCard / Image With Preview |
| `directorybrowser-directorybrowsericoncard--no-checkbox` | DirectoryBrowser/DirectoryBrowserIconCard / No Checkbox |
| `directorybrowser-directorybrowseronboarding--default` | DirectoryBrowser/DirectoryBrowserOnboarding / Default |
| `directorybrowser-directorybrowseronboarding--no-up` | DirectoryBrowser/DirectoryBrowserOnboarding / No Up |
| `directorybrowser-directorybrowserselectedsummary--counts-only` | DirectoryBrowser/DirectoryBrowserSelectedSummary / Counts Only |
| `directorybrowser-directorybrowserselectedsummary--mixed` | DirectoryBrowser/DirectoryBrowserSelectedSummary / Mixed |
| `directorybrowser-directorybrowserselectedsummary--text-label` | DirectoryBrowser/DirectoryBrowserSelectedSummary / Text Label |
| `directorybrowser-entryglyph--default` | DirectoryBrowser/EntryGlyph / Default |
| `directorybrowser-entryglyph--folder` | DirectoryBrowser/EntryGlyph / Folder |
| `directorybrowser-entryglyph--large` | DirectoryBrowser/EntryGlyph / Large |
| `directorybrowser-entryglyph--parent-up` | DirectoryBrowser/EntryGlyph / Parent Up |
| `directorybrowser-entryglyph--script` | DirectoryBrowser/EntryGlyph / Script |
| `directorybrowser-entryglyph--unknown` | DirectoryBrowser/EntryGlyph / Unknown |
| `directorybrowser-entryglyph--video` | DirectoryBrowser/EntryGlyph / Video |
| `directorybrowser-entryicon--default` | DirectoryBrowser/EntryIcon / Default |
| `directorybrowser-entryicon--folder` | DirectoryBrowser/EntryIcon / Folder |
| `directorybrowser-entryicon--image-preview` | DirectoryBrowser/EntryIcon / Image Preview |
| `directorybrowser-entryicon--media-card-image` | DirectoryBrowser/EntryIcon / Media Card Image |
| `directorybrowser-entryicon--preset-icon-text` | DirectoryBrowser/EntryIcon / Preset Icon Text |
| `directorybrowser-entryicon--sibling-match` | DirectoryBrowser/EntryIcon / Sibling Match |
| `directorybrowser-entrythumb--default` | DirectoryBrowser/EntryThumb / Default |
| `directorybrowser-entrythumb--folder` | DirectoryBrowser/EntryThumb / Folder |
| `directorybrowser-entrythumb--parent-up` | DirectoryBrowser/EntryThumb / Parent Up |
| `directorybrowser-entrythumb--small-glyph` | DirectoryBrowser/EntryThumb / Small Glyph |
| `directorybrowser-entrythumb--video` | DirectoryBrowser/EntryThumb / Video |
| `directorybrowser-filtertogglebutton--default` | DirectoryBrowser/FilterToggleButton / Default |
| `directorybrowser-filtertogglebutton--long-label` | DirectoryBrowser/FilterToggleButton / Long Label |
| `directorybrowser-filtertogglebutton--pressed` | DirectoryBrowser/FilterToggleButton / Pressed |
| `directorybrowser-filtertogglebutton--toggle-on-click` | DirectoryBrowser/FilterToggleButton / Toggle On Click |
| `directorybrowser-filtertogglebutton--with-callback` | DirectoryBrowser/FilterToggleButton / With Callback |
| `directorybrowser-thumbnailtile--default` | DirectoryBrowser/ThumbnailTile / Default |
| `directorybrowser-thumbnailtile--offscreen-intersection` | DirectoryBrowser/ThumbnailTile / Offscreen Intersection |
| `directorybrowser-thumbnailtile--wide-aspect` | DirectoryBrowser/ThumbnailTile / Wide Aspect |
| `preset-catalogadd-archivedetailssection--default` | Preset/CatalogAdd/ArchiveDetailsSection / Default |
| `preset-catalogadd-archivedetailssection--with-content` | Preset/CatalogAdd/ArchiveDetailsSection / With Content |
| `preset-catalogadd-foldertabs--default` | Preset/CatalogAdd/FolderTabs / Default |
| `preset-catalogadd-foldertabs--other` | Preset/CatalogAdd/FolderTabs / Other |
| `preset-catalogadd-foldertabs--plugins` | Preset/CatalogAdd/FolderTabs / Plugins |
| `preset-catalogadd-foldertabs--scripts` | Preset/CatalogAdd/FolderTabs / Scripts |
| `preset-catalogadd-pathdialogfooteractions--busy` | Preset/CatalogAdd/PathDialogFooterActions / Busy |
| `preset-catalogadd-pathdialogfooteractions--default` | Preset/CatalogAdd/PathDialogFooterActions / Default |
| `preset-catalogadd-pathdialogiconsection--default` | Preset/CatalogAdd/PathDialogIconSection / Default |
| `preset-catalogadd-pathdialogiconsection--emoji` | Preset/CatalogAdd/PathDialogIconSection / Emoji |
| `preset-catalogadd-pathdialogiconsection--image` | Preset/CatalogAdd/PathDialogIconSection / Image |
| `preset-catalogadd-pathdialognamefield--default` | Preset/CatalogAdd/PathDialogNameField / Default |
| `preset-catalogadd-pathdialogpathfieldrow--default` | Preset/CatalogAdd/PathDialogPathFieldRow / Default |
| `preset-catalogadd-pathdialogpathfieldrow--with-value` | Preset/CatalogAdd/PathDialogPathFieldRow / With Value |
| `preset-catalogbrowser-presetsdialogheader--default` | Preset/CatalogBrowser/PresetsDialogHeader / Default |
| `preset-catalogbrowser-presetsdialogheader--filtered` | Preset/CatalogBrowser/PresetsDialogHeader / Filtered |
| `preset-catalogbrowser-presetsdialogheader--streaming` | Preset/CatalogBrowser/PresetsDialogHeader / Streaming |
| `preset-catalogbrowser-viewmodetoggle--icon-view` | Preset/CatalogBrowser/ViewModeToggle / Icon View |
| `preset-catalogbrowser-viewmodetoggle--list-view` | Preset/CatalogBrowser/ViewModeToggle / List View |
| `preset-components-iconeditor--default` | Preset/Components/IconEditor / Default |
| `preset-components-iconeditor--emoji` | Preset/Components/IconEditor / Emoji |
| `preset-components-iconeditor--image` | Preset/Components/IconEditor / Image |
| `preset-components-iconeditor--narrow-container` | Preset/Components/IconEditor / Narrow Container |
| `preset-components-iconeditor--unframed` | Preset/Components/IconEditor / Unframed |
| `preset-components-iconeditor--wide-container` | Preset/Components/IconEditor / Wide Container |
| `preset-components-iconeditor--with-preset-preview` | Preset/Components/IconEditor / With Preset Preview |
| `preset-group-conditionrulecard--default` | Preset/Group/ConditionRuleCard / Default |
| `preset-group-conditionrulecard--path-filter` | Preset/Group/ConditionRuleCard / Path Filter |
| `preset-group-conditionrulecard--preset-filter` | Preset/Group/ConditionRuleCard / Preset Filter |
| `preset-group-conditionrulecard--preset-type-filter` | Preset/Group/ConditionRuleCard / Preset Type Filter |
| `preset-group-containercatalogtile--default` | Preset/Group/ContainerCatalogTile / Default |
| `preset-group-containercatalogtile--many` | Preset/Group/ContainerCatalogTile / Many |
| `preset-group-containercatalogtile--overflow` | Preset/Group/ContainerCatalogTile / Overflow |
| `preset-group-folderscandepthselector--direct` | Preset/Group/FolderScanDepthSelector / Direct |
| `preset-group-folderscandepthselector--recursive` | Preset/Group/FolderScanDepthSelector / Recursive |
| `preset-markdown-editorlines--default` | Preset/Markdown/EditorLines / Default |
| `preset-markdown-editorlines--long-body` | Preset/Markdown/EditorLines / Long Body |
| `preset-markdown-placeholderoverlay--default` | Preset/Markdown/PlaceholderOverlay / Default |
| `preset-markdown-placeholderoverlay--long-hint` | Preset/Markdown/PlaceholderOverlay / Long Hint |
| `preset-toolshell-dialogdetailssection--default` | Preset/ToolShell/DialogDetailsSection / Default |
| `preset-toolshell-dialogdetailssection--with-description` | Preset/ToolShell/DialogDetailsSection / With Description |
| `preset-toolshell-dialogdetailssection--with-image` | Preset/ToolShell/DialogDetailsSection / With Image |
| `preset-toolshell-dialogfields--busy` | Preset/ToolShell/DialogFields / Busy |
| `preset-toolshell-dialogfields--default` | Preset/ToolShell/DialogFields / Default |
| `preset-toolshell-dialogfooter--default` | Preset/ToolShell/DialogFooter / Default |
| `preset-toolshell-dialogfooter--saving` | Preset/ToolShell/DialogFooter / Saving |
| `preset-toolshell-dialogform--default` | Preset/ToolShell/DialogForm / Default |
| `preset-toolshell-dialogiconsection--canvas` | Preset/ToolShell/DialogIconSection / Canvas |
| `preset-toolshell-dialogiconsection--default` | Preset/ToolShell/DialogIconSection / Default |
| `preset-toolshell-dialogiconsection--emoji` | Preset/ToolShell/DialogIconSection / Emoji |
| `preset-toolshell-dialogiconsection--image` | Preset/ToolShell/DialogIconSection / Image |
| `preset-workspace-canvaseasingicon--default` | Preset/Workspace/CanvasEasingIcon / Default |
| `preset-workspace-canvaseasingicon--ease-in` | Preset/Workspace/CanvasEasingIcon / Ease In |
| `preset-workspace-canvaseasingicon--ease-in-out` | Preset/Workspace/CanvasEasingIcon / Ease In Out |
| `preset-workspace-canvaseasingicon--linear` | Preset/Workspace/CanvasEasingIcon / Linear |
| `preset-workspace-canvaseasingicon--multi-segment` | Preset/Workspace/CanvasEasingIcon / Multi Segment |
| `preset-workspace-glyph--canvas` | Preset/Workspace/Glyph / Canvas |
| `preset-workspace-glyph--default` | Preset/Workspace/Glyph / Default |
| `preset-workspace-glyph--emoji` | Preset/Workspace/Glyph / Emoji |
| `preset-workspace-glyph--image-path` | Preset/Workspace/Glyph / Image Path |
| `preset-workspace-glyph--long-text` | Preset/Workspace/Glyph / Long Text |
| `preset-workspace-glyph--missing` | Preset/Workspace/Glyph / Missing |
| `preset-workspace-glyphcachedimage--default` | Preset/Workspace/GlyphCachedImage / Default |
| `preset-workspace-glyphcachedimage--local-path` | Preset/Workspace/GlyphCachedImage / Local Path |
| `preset-workspace-gridcatalogtile--default` | Preset/Workspace/GridCatalogTile / Default |
| `preset-workspace-tile--default` | Preset/Workspace/Tile / Default |
| `preset-workspace-tile--long-label` | Preset/Workspace/Tile / Long Label |
| `preset-workspace-tile--missing` | Preset/Workspace/Tile / Missing |
| `quickactions-actionlist--closed` | QuickActions/ActionList / Closed |
| `quickactions-actionlist--with-query` | QuickActions/ActionList / With Query |
| `quickactions-palettedropdown--closed` | QuickActions/PaletteDropdown / Closed |
| `quickactions-palettedropdown--default` | QuickActions/PaletteDropdown / Default |
| `quickactions-palettesearch--custom-placeholder` | QuickActions/PaletteSearch / Custom Placeholder |
| `quickactions-palettesearch--default` | QuickActions/PaletteSearch / Default |
| `quickactions-palettesearch--with-query` | QuickActions/PaletteSearch / With Query |
| `quickactions-rowcomponents--effect` | QuickActions/RowComponents / Effect |
| `quickactions-rowcomponents--preset` | QuickActions/RowComponents / Preset |
| `quickactions-rowcomponents--root-file` | QuickActions/RowComponents / Root File |
| `setting-colortokeneditor--default` | Setting/ColorTokenEditor / Default |
| `setting-colortokeneditor--neutral` | Setting/ColorTokenEditor / Neutral |
| `setting-colortokeneditor--no-description` | Setting/ColorTokenEditor / No Description |
| `setting-inputssection--alignment-off` | Setting/InputsSection / Alignment Off |
| `setting-inputssection--anchor-off` | Setting/InputsSection / Anchor Off |
| `setting-inputssection--both-off` | Setting/InputsSection / Both Off |
| `setting-inputssection--default` | Setting/InputsSection / Default |
| `setting-numbertokeneditor--default` | Setting/NumberTokenEditor / Default |
| `setting-numbertokeneditor--no-description` | Setting/NumberTokenEditor / No Description |
| `setting-numbertokeneditor--percent` | Setting/NumberTokenEditor / Percent |
| `setting-settingsdialog--data-component-preview` | Setting/SettingsDialog / Data Component Preview |
| `setting-settingsdialog--data-design-tokens` | Setting/SettingsDialog / Data Design Tokens |
| `setting-settingsdialog--data-inputs` | Setting/SettingsDialog / Data Inputs |
| `setting-settingsdialog--data-paths` | Setting/SettingsDialog / Data Paths |
| `setting-settingsdialog--display-appearance` | Setting/SettingsDialog / Display Appearance |
| `setting-settingsdialog--display-background` | Setting/SettingsDialog / Display Background |
| `setting-settingsdialog--display-grid` | Setting/SettingsDialog / Display Grid |
| `setting-settingsdialog--display-language` | Setting/SettingsDialog / Display Language |
| `setting-settingsdialog--hash-routed` | Setting/SettingsDialog / Hash Routed |
| `setting-settingsdialog--low-resolution` | Setting/SettingsDialog / Low Resolution |
| `setting-settingsdialog--section-switch` | Setting/SettingsDialog / Section Switch |
| `setting-settingsdialog--workspace-backup` | Setting/SettingsDialog / Workspace Backup |
| `setting-settingsdialog--workspace-feedback` | Setting/SettingsDialog / Workspace Feedback |
| `setting-settingsgrid--default` | Setting/SettingsGrid / Default |
| `setting-settingsgrid--three-columns` | Setting/SettingsGrid / Three Columns |
| `setting-settingsgrid--two-equal-columns` | Setting/SettingsGrid / Two Equal Columns |
| `setting-tokeneditor--default` | Setting/TokenEditor / Default |
| `setting-tokeneditor--long-value` | Setting/TokenEditor / Long Value |
| `setting-updatesection--checking` | Setting/UpdateSection / Checking |
| `setting-updatesection--install-failure` | Setting/UpdateSection / Install Failure |
| `setting-updatesection--installing` | Setting/UpdateSection / Installing |
| `setting-updatesection--layout-baseline` | Setting/UpdateSection / Layout Baseline |
| `setting-updatesection--not-checked` | Setting/UpdateSection / Not Checked |
| `setting-updatesection--unavailable` | Setting/UpdateSection / Unavailable |
| `setting-updatesection--up-to-date` | Setting/UpdateSection / Up To Date |
| `setting-updatesection--update-available` | Setting/UpdateSection / Update Available |
| `setting-workspacegridpreview--default` | Setting/WorkspaceGridPreview / Default |
| `workspace-gridcatalogtilecontext--custom-renderer` | Workspace/GridCatalogTileContext / Custom Renderer |
| `workspace-gridcatalogtilecontext--fallback-renderer` | Workspace/GridCatalogTileContext / Fallback Renderer |
| `workspace-widgetgridicons--align-icons` | Workspace/WidgetGridIcons / Align Icons |
| `workspace-widgetgridicons--default` | Workspace/WidgetGridIcons / Default |
| `workspace-widgetgridicons--large` | Workspace/WidgetGridIcons / Large |
| `workspace-widgetgridicons--targets` | Workspace/WidgetGridIcons / Targets |

## C — その他 (153 stories)

| story | title |
|---|---|
| `background-backgroundpreview--default` | Background/BackgroundPreview / Default |
| `background-backgroundpreview--dotted` | Background/BackgroundPreview / Dotted |
| `background-backgroundpreview--solid-blue` | Background/BackgroundPreview / Solid Blue |
| `background-fields--default` | Background/Fields / Default |
| `background-fields--no-labels` | Background/Fields / No Labels |
| `background-fields--transparent-color` | Background/Fields / Transparent Color |
| `background-imagelayereditor--auto-fit` | Background/ImageLayerEditor / Auto Fit |
| `background-imagelayereditor--default` | Background/ImageLayerEditor / Default |
| `background-imagelayereditor--repeated` | Background/ImageLayerEditor / Repeated |
| `background-layereditor--color` | Background/LayerEditor / Color |
| `background-layereditor--image` | Background/LayerEditor / Image |
| `background-layereditor--pattern` | Background/LayerEditor / Pattern |
| `background-layerlistpanel--default` | Background/LayerListPanel / Default |
| `background-layerlistpanel--no-selection` | Background/LayerListPanel / No Selection |
| `background-patternlayereditor--default` | Background/PatternLayerEditor / Default |
| `background-patternlayereditor--grid` | Background/PatternLayerEditor / Grid |
| `background-patternlayereditor--low-opacity` | Background/PatternLayerEditor / Low Opacity |
| `cep-dialogshell--default` | CEP/DialogShell / Default |
| `cep-dialogshell--with-after-body` | CEP/DialogShell / With After Body |
| `cep-dialogshell--with-footer` | CEP/DialogShell / With Footer |
| `cep-dialogshell--with-modifier` | CEP/DialogShell / With Modifier |
| `debug-console-debugdialogroot--cep-mode` | Debug/Console/DebugDialogRoot / Cep Mode |
| `debug-console-debugdialogroot--default` | Debug/Console/DebugDialogRoot / Default |
| `debug-console-panel--autoscroll-off` | Debug/Console/Panel / Autoscroll Off |
| `debug-console-panel--default` | Debug/Console/Panel / Default |
| `dialog-shell-content--default` | Dialog/Shell/Content / Default |
| `dialog-shell-content--minimal` | Dialog/Shell/Content / Minimal |
| `dialog-shell-content--scrollable` | Dialog/Shell/Content / Scrollable |
| `dialog-shell-footer--cancel-and-primary` | Dialog/Shell/Footer / Cancel And Primary |
| `dialog-shell-footer--secondary-cancel-primary` | Dialog/Shell/Footer / Secondary Cancel Primary |
| `dialog-shell-footer--single-action` | Dialog/Shell/Footer / Single Action |
| `dialog-shell-header--default` | Dialog/Shell/Header / Default |
| `dialog-shell-header--long-title` | Dialog/Shell/Header / Long Title |
| `dialog-shell-header--no-meta` | Dialog/Shell/Header / No Meta |
| `dialog-shell-header--with-meta` | Dialog/Shell/Header / With Meta |
| `dialog-shell-layout--computed-style-shell` | Dialog/Shell/Layout / Computed Style Shell |
| `dialog-shell-layout--computed-style-shell-with-footer` | Dialog/Shell/Layout / Computed Style Shell With Footer |
| `dialog-shell-layout--default` | Dialog/Shell/Layout / Default |
| `dialog-shell-layout--with-footer` | Dialog/Shell/Layout / With Footer |
| `dialog-shell-layout--with-meta` | Dialog/Shell/Layout / With Meta |
| `dialog-shell-layout--with-modifier` | Dialog/Shell/Layout / With Modifier |
| `fontviewer-banners--all-banners` | FontViewer/Banners / All Banners |
| `fontviewer-banners--default` | FontViewer/Banners / Default |
| `fontviewer-samplerow--cjk` | FontViewer/SampleRow / Cjk |
| `fontviewer-samplerow--custom` | FontViewer/SampleRow / Custom |
| `fontviewer-samplerow--default` | FontViewer/SampleRow / Default |
| `fontviewer-statusline--default` | FontViewer/StatusLine / Default |
| `fontviewer-statusline--local-api` | FontViewer/StatusLine / Local Api |
| `info-compsections--default` | Info/CompSections / Default |
| `info-compsections--drop-frame` | Info/CompSections / Drop Frame |
| `info-compsections--no-background` | Info/CompSections / No Background |
| `info-presetinfo--bug-trigger-single` | Info/PresetInfo / Bug-trigger state (single, Issue #87) |
| `info-presetinfo--default` | Info/PresetInfo / Default |
| `info-presetinfo--multi` | Info/PresetInfo / Multi |
| `management-tutorial-widgethelpoverlay--default` | Management/Tutorial/WidgetHelpOverlay / Default |
| `management-tutorial-widgethelpoverlay--without-tutorial` | Management/Tutorial/WidgetHelpOverlay / Without Tutorial |
| `notification-center--default` | Notification/Center / Default |
| `notification-center--detail-view` | Notification/Center / Detail View |
| `notification-center--long-list` | Notification/Center / Long List |
| `notification-center--with-items` | Notification/Center / With Items |
| `notification-container--default` | Notification/Container / Default |
| `notification-container--long-list` | Notification/Container / Long List |
| `notification-container--non-dismissible` | Notification/Container / Non Dismissible |
| `notification-container--with-items` | Notification/Container / With Items |
| `onboarding-animation--default` | Onboarding/Animation / Default |
| `onboarding-animation--workspace` | Onboarding/Animation / Workspace |
| `onboarding-completioninput--all-files-with-scan` | Onboarding/CompletionInput / All Files With Scan |
| `onboarding-completioninput--default` | Onboarding/CompletionInput / Default |
| `onboarding-completioninput--folder-selection` | Onboarding/CompletionInput / Folder Selection |
| `onboarding-setuprequired--default` | Onboarding/SetupRequired / Default |
| `onboarding-setuprequired--tall-viewport` | Onboarding/SetupRequired / Tall Viewport |
| `onboarding-view--default` | Onboarding/View / Default |
| `onboarding-view--fullscreen` | Onboarding/View / Fullscreen |
| `onboarding-view--production-size` | Onboarding/View / Production Size |
| `quality-layoutcontract--clipped-overflow` | Quality/LayoutContract / Clipped Overflow |
| `quality-layoutcontract--healthy-card` | Quality/LayoutContract / Healthy Card |
| `quality-layoutcontract--interactive-states` | Quality/LayoutContract / Interactive States |
| `quality-layoutcontract--overlapping-controls` | Quality/LayoutContract / Overlapping Controls |
| `quality-layoutcontract--viewport-escape` | Quality/LayoutContract / Viewport Escape |
| `sanity-decoratorchain--default` | Sanity/DecoratorChain / Default |
| `shared-controls-button--all-sizes` | Shared/Controls/Button / All Sizes |
| `shared-controls-button--all-variants` | Shared/Controls/Button / All Variants |
| `shared-controls-button--default` | Shared/Controls/Button / Default |
| `shared-controls-button--long-label` | Shared/Controls/Button / Long Label |
| `shared-controls-iconbutton--all-sizes` | Shared/Controls/IconButton / All Sizes |
| `shared-controls-iconbutton--default` | Shared/Controls/IconButton / Default |
| `shared-controls-iconbutton--variants-and-sizes` | Shared/Controls/IconButton / Variants And Sizes |
| `shared-controls-segmentedcontrol--custom-colors` | Shared/Controls/SegmentedControl / Custom Colors |
| `shared-controls-segmentedcontrol--custom-labels` | Shared/Controls/SegmentedControl / Custom Labels |
| `shared-controls-segmentedcontrol--default` | Shared/Controls/SegmentedControl / Default |
| `shared-feedback-errorboundary--default` | Shared/Feedback/ErrorBoundary / Default |
| `shared-feedback-errorboundary--fallback` | Shared/Feedback/ErrorBoundary / Fallback |
| `shared-feedback-filedropzone--default` | Shared/Feedback/FileDropZone / Default |
| `shared-feedback-loadingspinner--custom-label` | Shared/Feedback/LoadingSpinner / Custom Label |
| `shared-feedback-loadingspinner--default` | Shared/Feedback/LoadingSpinner / Default |
| `shared-feedback-loadingspinner--sizes` | Shared/Feedback/LoadingSpinner / Sizes |
| `shared-fields-colorfield--default` | Shared/Fields/ColorField / Default |
| `shared-fields-colorfield--with-long-path` | Shared/Fields/ColorField / With Long Path |
| `shared-fields-colorfield--without-label` | Shared/Fields/ColorField / Without Label |
| `shared-fields-colorswatch--default` | Shared/Fields/ColorSwatch / Default |
| `shared-fields-colorswatch--interactive` | Shared/Fields/ColorSwatch / Interactive |
| `shared-fields-input--default` | Shared/Fields/Input / Default |
| `shared-fields-input--large-size` | Shared/Fields/Input / Large Size |
| `shared-fields-input--number-input` | Shared/Fields/Input / Number Input |
| `shared-fields-listselect--default` | Shared/Fields/ListSelect / Default |
| `shared-fields-listselect--small-size` | Shared/Fields/ListSelect / Small Size |
| `shared-fields-listselect--with-state` | Shared/Fields/ListSelect / With State |
| `shared-fields-numberfield--default` | Shared/Fields/NumberField / Default |
| `shared-fields-numberfield--interactive` | Shared/Fields/NumberField / Interactive |
| `shared-fields-numberfield--with-bounded-range` | Shared/Fields/NumberField / With Bounded Range |
| `shared-fields-pathfield--default` | Shared/Fields/PathField / Default |
| `shared-fields-pathfield--interactive` | Shared/Fields/PathField / Interactive |
| `shared-fields-pathfield--without-browse` | Shared/Fields/PathField / Without Browse |
| `shared-fields-rangefield--default` | Shared/Fields/RangeField / Default |
| `shared-fields-rangefield--fine-step` | Shared/Fields/RangeField / Fine Step |
| `shared-fields-rangefield--interactive` | Shared/Fields/RangeField / Interactive |
| `shared-fields-rangefield--keyboard-adjust` | Shared/Fields/RangeField / Keyboard Adjust |
| `shared-fields-rangefield--no-label` | Shared/Fields/RangeField / No Label |
| `shared-fields-regexeditor--default` | Shared/Fields/RegexEditor / Default |
| `shared-fields-regexeditor--interactive` | Shared/Fields/RegexEditor / Interactive |
| `shared-fields-regexeditor--invalid-pattern` | Shared/Fields/RegexEditor / Invalid Pattern |
| `shared-fields-regexeditor--plain-source-only` | Shared/Fields/RegexEditor / Plain Source Only |
| `shared-fields-searchfield--controlled` | Shared/Fields/SearchField / Controlled |
| `shared-fields-searchfield--default` | Shared/Fields/SearchField / Default |
| `shared-fields-searchfield--with-clear` | Shared/Fields/SearchField / With Clear |
| `shared-fields-searchfield--with-inline-trailing` | Shared/Fields/SearchField / With Inline Trailing |
| `shared-fields-textarea--controlled` | Shared/Fields/Textarea / Controlled |
| `shared-fields-textarea--default` | Shared/Fields/Textarea / Default |
| `shared-fields-textarea--large-size` | Shared/Fields/Textarea / Large Size |
| `shared-icons-icon--default` | Shared/Icons/Icon / Default |
| `shared-icons-icon--size-12` | Shared/Icons/Icon / Size 12 |
| `shared-icons-icon--size-24` | Shared/Icons/Icon / Size 24 |
| `shared-interaction-anchoredpopover--inside-overflow-hidden` | Shared/Interaction/AnchoredPopover / Inside Overflow Hidden |
| `shared-layout-scrollarea--default` | Shared/Layout/ScrollArea / Default |
| `shared-layout-scrollarea--no-gutter` | Shared/Layout/ScrollArea / No Gutter |
| `shared-shell-dialogbody--default` | Shared/Shell/DialogBody / Default |
| `shared-shell-dialogbody--overflow` | Shared/Shell/DialogBody / Overflow |
| `widgetcore-align--compact` | WidgetCore/Align / Compact |
| `widgetcore-align--default` | WidgetCore/Align / Default |
| `widgetcore-align--select-time-target` | WidgetCore/Align / Select Time Target |
| `widgetcore-anchorpoint--default` | WidgetCore/AnchorPoint / Default |
| `widgetcore-anchorpoint--gesture-preview` | WidgetCore/AnchorPoint / Gesture Preview |
| `widgetcore-anchorpoint--large` | WidgetCore/AnchorPoint / Large |
| `widgetcore-easing--compact` | WidgetCore/Easing / Compact |
| `widgetcore-easing--default` | WidgetCore/Easing / Default |
| `widgetcore-easing--loop-mode` | WidgetCore/Easing / Loop Mode |
| `widgetcore-layoutlock--locked` | WidgetCore/LayoutLock / Locked |
| `widgetcore-layoutlock--unlocked` | WidgetCore/LayoutLock / Unlocked |
| `widgetcore-menu--default` | WidgetCore/Menu / Default |
| `widgetcore-menu--layout-locked` | WidgetCore/Menu / Layout Locked |
| `widgetcore-menu--multi-selection` | WidgetCore/Menu / Multi Selection |
| `widgetcore-menu--nested` | WidgetCore/Menu / Nested |
| `widgetcore-menu--top-level` | WidgetCore/Menu / Top Level |

## 視覚回帰方式の判断（#166 記録）

現時点では pixel diff / reg-suit を導入しない。理由: (1) 429 story のベースライン確立と閾値調整は専用 ticket の規模、(2) RC では capture+metadata+interaction play test が既に機械的ゲートとして機能、(3) CEF/フォント差による環境依存フレークの管理コストが単独開発に見合わない。導入する場合は別 Issue/ADR でベースライン取得手順・閾値・フレーク対策を先に定義する。
