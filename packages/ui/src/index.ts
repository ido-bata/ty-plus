// Components barrel
//
// Every public component of the shared design system is re-exported here.
// Feature code must import from this barrel (`@ty-plus/ui`) rather than a
// deep module path, so the package surface stays a single, reviewable list.
//
// `check-ui-primitive-usage` enforces both halves of that rule: the barrel
// must expose every public component, and feature code must not reach past
// it. `util/keyboard` and `util/cx` are exported too because they are part
// of the shared vocabulary (IME-safe commit, class merging), not internals.

export { Button } from "./controls/Button";
export { IconButton } from "./controls/IconButton";
export { SegmentedControl } from "./controls/SegmentedControl";
export type { ViewMode, ViewModeToggleProps } from "./controls/ViewModeToggle";
export { ViewModeToggle } from "./controls/ViewModeToggle";

export { Badge } from "./feedback/Badge";
export { LoadingSpinner } from "./feedback/LoadingSpinner";
export { Notice } from "./feedback/Notice";

export { Checkbox } from "./fields/Checkbox";
export { ColorField } from "./fields/ColorField";
export { ColorSwatch } from "./fields/ColorSwatch";
export { Input } from "./fields/Input";
export { ListSelect } from "./fields/ListSelect";
export { NumberField } from "./fields/NumberField";
export { PathField } from "./fields/PathField";
export { RangeField } from "./fields/RangeField";
export { RegexEditor } from "./fields/RegexEditor";
export { SearchField } from "./fields/SearchField";
export { Textarea } from "./fields/Textarea";
export { Icon } from "./Icon";
export * as Icons from "./icons";
export {
	ArrowDownToLine,
	Cloud,
	Layers,
	Library,
	MessageSquare,
	Redo2,
	Save,
	Settings,
	Terminal,
	Trash2,
	Undo2,
} from "./icons";
export type { AnchoredPopoverProps } from "./interaction/AnchoredPopover";
export { AnchoredPopover } from "./interaction/AnchoredPopover";
export type {
	AnchorGestureConfig,
	AnchorGestureRecognizeFn,
	AnchorGestureState,
	GestureDirection,
	GesturePoint,
} from "./interaction/use-anchor-gesture";
export {
	gestureDirection,
	useAnchorGesture,
} from "./interaction/use-anchor-gesture";
export { MediaFrame } from "./layout/MediaFrame";
export { ScrollArea } from "./layout/ScrollArea";
export { Surface } from "./layout/Surface";
export { DialogBody } from "./shell/DialogBody";
export {
	segmentedButtonActiveClass,
	segmentedButtonClass,
	segmentedButtonInactiveClass,
	segmentedButtonQuietClass,
	segmentedColumnButtonClass,
	segmentedStripClass,
} from "./styles/segmented";
export type { StatusBannerTone } from "./styles/surfaces";
export {
	borderedListClass,
	browserEmptyClass,
	centeredIconClass,
	dialogContentClass,
	dialogFooterClass,
	emptyStateClass,
	fillSurfaceClass,
	iconActionButtonClass,
	infoRowClass,
	monoPreviewBoxClass,
	statusBannerBaseClass,
	statusBannerClass,
	stepBadgeClass,
	stepCardClass,
	tileInnerClass,
	tileRingClass,
	widgetSurfaceClass,
} from "./styles/surfaces";
export {
	cardTitleClass,
	clampedTextClass,
	countLabelClass,
	fieldDescriptionClass,
	fieldLabelClass,
	heading1Class,
	heading3Class,
	listItemTitleClass,
	monoMetaClass,
	mutedBodyTextClass,
	rowLabelClass,
	rowMetaClass,
	rowTitleClass,
	sectionLabelClass,
	sectionTitleClass,
	srOnlyClass,
	stepDescriptionClass,
} from "./styles/typography";

export { cx } from "./util/cx";
export { isIMEComposing } from "./util/keyboard";
