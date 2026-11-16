import { ArrowLeft, Check, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	type CepMenuPayload,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import type { NotificationSummary } from "@/management/online/contract";
import { fetchNotificationFeed } from "@/management/online/notification/feed";
import {
	loadNotificationsStore,
	saveNotificationsStore,
} from "@/management/online/notification/notifications";
import { tryGetDataServices } from "@/management/workspace/services";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

// ── Style constants ──────────────────────────────────────────────────────────

const codeClass = css({
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.panel",
	paddingInline: "1",
	paddingBlock: "0.5",
	fontSize: "xs",
	fontFamily: "mono",
});

const linkClass = css({
	color: "text.accent",
	textDecoration: "underline",
	_hover: { opacity: 0.8 },
});

const paragraphEmptyClass = css({ height: "2" });
const paragraphClass = css({
	fontSize: "sm",
	lineHeight: "relaxed",
	color: "text.primary",
});
const heading1Class = css({
	fontSize: "lg",
	fontWeight: "semibold",
	color: "text.primary",
});
const heading2Class = css({
	fontSize: "base",
	fontWeight: "semibold",
	color: "text.primary",
});
const heading3Class = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
});
const listDiscItemClass = css({
	marginLeft: "4",
	listStyle: "disc",
	fontSize: "sm",
	color: "text.primary",
});
const listDecimalItemClass = css({
	marginLeft: "4",
	listStyle: "decimal",
	fontSize: "sm",
	color: "text.primary",
});
const dividerClass = css({
	borderColor: "border.strong",
	marginBlock: "3",
});
const calloutClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.panel",
	padding: "3",
});
const calloutIconClass = css({ fontSize: "lg" });
const calloutBodyClass = css({
	flex: "1",
	fontSize: "sm",
	color: "text.primary",
});
const quoteClass = css({
	borderLeftWidth: "2px",
	borderLeftStyle: "solid",
	borderLeftColor: "border.strong",
	paddingLeft: "3",
	fontStyle: "italic",
	color: "text.muted",
});
const quoteTextClass = css({ fontSize: "sm" });
const imageWrapClass = css({
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	overflow: "hidden",
	backgroundColor: "surface.panel",
});
const imageClass = css({
	maxWidth: "full",
	height: "auto",
	objectFit: "contain",
});
const detailsClass = css({
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.panel",
});
const detailsSummaryClass = css({
	cursor: "pointer",
	paddingInline: "3",
	paddingBlock: "2",
	fontSize: "sm",
	color: "text.primary",
	_hover: { backgroundColor: "surface.overlay" },
});
const detailsBodyClass = css({
	paddingInline: "3",
	paddingBlock: "0",
	paddingBottom: "2",
	fontSize: "sm",
	color: "text.muted",
});

const blockListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

const noContentClass = css({
	fontSize: "sm",
	color: "text.muted",
});

const listItemButtonBaseClass = css({
	width: "full",
	textAlign: "left",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	padding: "3",
	cursor: "pointer",
	transitionProperty: "colors",
});
const listItemButtonUnreadClass = css({
	borderColor: "border.strong",
	backgroundColor: "surface.widget",
	_hover: { backgroundColor: "surface.overlay" },
});
const listItemButtonReadClass = css({
	borderColor: "border.strong",
	backgroundColor: "surface.panel",
	_hover: { backgroundColor: "surface.overlay" },
});
const listItemHeaderClass = css({
	display: "flex",
	alignItems: "flex-start",
	justifyContent: "space-between",
	gap: "3",
});
const listItemColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
	flex: "1",
	minWidth: 0,
});
const listItemTitleRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "0",
});
const listItemTitleClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	color: "text.primary",
	truncate: true,
});
const listItemFixtureBadgeClass = css({
	marginLeft: "2",
	borderRadius: "shell-sm",
	backgroundColor: "surface.warning/20",
	paddingInline: "2",
	paddingBlock: "0.5",
	fontSize: "xs",
});
const listItemSummaryClass = css({
	fontSize: "xs",
	color: "text.muted",
});
const listItemDateClass = css({
	fontSize: "2xs",
	color: "text.muted",
});
const unreadDotClass = css({
	flexShrink: 0,
	width: "2",
	height: "2",
	marginTop: "1",
	borderRadius: "full",
	backgroundColor: "text.accent",
});

function listItemButtonClass(unread: boolean): string {
	return cx(
		listItemButtonBaseClass,
		unread ? listItemButtonUnreadClass : listItemButtonReadClass,
	);
}

const detailContainerClass = css({
	display: "flex",
	height: "full",
	width: "full",
	flexDirection: "column",
	backgroundColor: "surface.dialog",
});
const detailHeaderClass = css({
	flexShrink: 0,
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "3",
	paddingBlock: "2",
	paddingInline: "4",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.strong",
});
const detailHeaderLeftClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	minWidth: 0,
});
const detailHeaderRightClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1",
	flexShrink: 0,
});
const borderedIconBtnClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
});
const detailTitleClass = css({
	truncate: true,
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
	minWidth: 0,
	maxWidth: "50vw",
});
const metaBarClass = css({
	flexShrink: 0,
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "1.5",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.panel",
});
const metaBarTextClass = css({
	fontSize: "xs",
	color: "text.muted",
});
const metaBarSeparatorClass = css({
	color: "text.muted",
});
const detailBodyClass = css({
	flex: "1",
	minHeight: 0,
	overflowY: "auto",
	paddingInline: "4",
	paddingBlock: "3",
});
const detailSummaryClass = css({
	marginBottom: "3",
	fontSize: "sm",
	color: "text.muted",
	lineHeight: "relaxed",
});
const loadingStateClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingBlock: "8",
	justifyContent: "center",
});
const spinningIconClass = css({
	animation: "spin",
	color: "text.muted",
});
const mutedTextClass = css({
	fontSize: "sm",
	color: "text.muted",
});
const opacity60Class = css({ opacity: 0.6 });

const listContainerClass = css({
	display: "flex",
	height: "full",
	width: "full",
	flexDirection: "column",
	backgroundColor: "surface.dialog",
});
const listHeaderClass = css({
	flexShrink: 0,
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "3",
	paddingBlock: "2",
	paddingInline: "4",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.strong",
});
const listHeaderTitleClass = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
});
const listHeaderActionsClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1",
	flexShrink: 0,
});
const listBodyClass = css({
	flex: "1",
	minHeight: 0,
	overflowY: "auto",
	paddingInline: "4",
	paddingBlock: "3",
});
const emptyStateClass = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	paddingBlock: "12",
	gap: "2",
});
const emptyStateIconClass = css({
	color: "text.muted",
});
const notificationListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
	listStyle: "none",
	margin: "0",
	padding: "0",
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const sep = (): { label: string } => ({ label: "---" });

const loadLocalStore = async () => {
	return loadNotificationsStore(window);
};

const saveLocalStore = async (store: {
	items: NotificationSummary[];
	readAtById: Record<string, string>;
}) => {
	await saveNotificationsStore(window, store);
};

// ── Gateway helpers ──────────────────────────────────────────────────────────

const _loadNotifications = async (
	gateway: NotificationsGateway,
): Promise<
	{ ok: true; remote: NotificationSummary[] } | { ok: false; error: unknown }
> => {
	try {
		if (!gateway.listNotifications) {
			return { ok: false, error: new Error("listNotifications unavailable") };
		}
		const remote = await gateway.listNotifications();
		return { ok: true, remote };
	} catch (e) {
		return { ok: false, error: e };
	}
};

const _loadBlocks = async (
	gateway: NotificationsGateway | undefined,
	notificationId: string,
): Promise<
	{ ok: true; blocks: NotificationBlock[] } | { ok: false; error: unknown }
> => {
	try {
		if (!gateway?.getNotificationBlocks) {
			return {
				ok: false,
				error: new Error("getNotificationBlocks unavailable"),
			};
		}
		const blocks = await gateway.getNotificationBlocks(notificationId);
		return { ok: true, blocks: blocks as NotificationBlock[] };
	} catch (e) {
		return { ok: false, error: e };
	}
};

interface NotificationsGateway {
	listNotifications?: () => Promise<NotificationSummary[]>;
	getNotificationBlocks?: (notificationId: string) => Promise<unknown[]>;
}

// ── Block types ───────────────────────────────────────────────────────────────

type NotificationBlock = {
	id: string;
	type: string;
	[key: string]: unknown;
};

type RichText = {
	plain_text: string;
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		code?: boolean;
		underline?: boolean;
		strikethrough?: boolean;
	};
	href?: string | null;
};

// ── Rich text rendering ───────────────────────────────────────────────────────

function renderRichText(richText: RichText[]): React.ReactNode {
	if (!richText || richText.length === 0) return null;
	return richText.map((rt, _i) => {
		let text: React.ReactNode = rt.plain_text;
		if (rt.annotations?.bold) text = <strong>{text}</strong>;
		if (rt.annotations?.italic) text = <em>{text}</em>;
		if (rt.annotations?.code) {
			text = <code className={codeClass}>{text}</code>;
		}
		if (rt.annotations?.underline) text = <u>{text}</u>;
		if (rt.annotations?.strikethrough) text = <s>{text}</s>;
		if (rt.href) {
			text = (
				<a
					href={rt.href}
					target="_blank"
					rel="noopener noreferrer"
					className={linkClass}
				>
					{text}
				</a>
			);
		}
		return <span key={rt.plain_text}>{text}</span>;
	});
}

// ── Block rendering ───────────────────────────────────────────────────────────

function renderBlock(block: NotificationBlock): React.ReactNode {
	switch (block.type) {
		case "paragraph": {
			const rt =
				(block.paragraph as { rich_text?: RichText[] })?.rich_text ?? [];
			if (rt.length === 0) return <p className={paragraphEmptyClass} />;
			return <p className={paragraphClass}>{renderRichText(rt)}</p>;
		}
		case "heading_1": {
			const rt =
				(block.heading_1 as { rich_text?: RichText[] })?.rich_text ?? [];
			return <h1 className={heading1Class}>{renderRichText(rt)}</h1>;
		}
		case "heading_2": {
			const rt =
				(block.heading_2 as { rich_text?: RichText[] })?.rich_text ?? [];
			return <h2 className={heading2Class}>{renderRichText(rt)}</h2>;
		}
		case "heading_3": {
			const rt =
				(block.heading_3 as { rich_text?: RichText[] })?.rich_text ?? [];
			return <h3 className={heading3Class}>{renderRichText(rt)}</h3>;
		}
		case "bulleted_list_item": {
			const rt =
				(block.bulleted_list_item as { rich_text?: RichText[] })?.rich_text ??
				[];
			return <li className={listDiscItemClass}>{renderRichText(rt)}</li>;
		}
		case "numbered_list_item": {
			const rt =
				(block.numbered_list_item as { rich_text?: RichText[] })?.rich_text ??
				[];
			return <li className={listDecimalItemClass}>{renderRichText(rt)}</li>;
		}
		case "divider": {
			return <hr className={dividerClass} />;
		}
		case "callout": {
			const rt = (block.callout as { rich_text?: RichText[] })?.rich_text ?? [];
			const icon = (block.callout as { icon?: { emoji?: string } })?.icon
				?.emoji;
			return (
				<div className={calloutClass}>
					{icon && <span className={calloutIconClass}>{icon}</span>}
					<span className={calloutBodyClass}>{renderRichText(rt)}</span>
				</div>
			);
		}
		case "quote": {
			const rt = (block.quote as { rich_text?: RichText[] })?.rich_text ?? [];
			return (
				<blockquote className={quoteClass}>
					<span className={quoteTextClass}>{renderRichText(rt)}</span>
				</blockquote>
			);
		}
		case "image": {
			const img = block.image as {
				type?: string;
				external?: { url?: string };
				file?: { url?: string };
			};
			const src = img?.external?.url ?? img?.file?.url;
			if (!src) return null;
			return (
				<div className={imageWrapClass}>
					<img src={src} alt="" className={imageClass} loading="lazy" />
				</div>
			);
		}
		case "toggle": {
			const rt = (block.toggle as { rich_text?: RichText[] })?.rich_text ?? [];
			return (
				<details className={detailsClass}>
					<summary className={detailsSummaryClass}>
						{renderRichText(rt)}
					</summary>
					<div className={detailsBodyClass}>Toggle content</div>
				</details>
			);
		}
		default:
			return null;
	}
}

function BlockList({ blocks }: { blocks: NotificationBlock[] }) {
	if (blocks.length === 0) {
		return <p className={noContentClass}>No content</p>;
	}
	return (
		<div className={blockListClass}>
			{blocks.map((block) => (
				<div key={block.id}>{renderBlock(block)}</div>
			))}
		</div>
	);
}

// ── Notification sub-components ───────────────────────────────────────────────

function NotificationListItem(props: {
	item: NotificationSummary;
	readAtById: Record<string, string>;
	onOpen: (item: NotificationSummary) => void;
	isFixture?: boolean;
}): JSX.Element {
	const { item, readAtById, onOpen, isFixture } = props;
	const unread = !readAtById[item.notificationId];
	const { t } = useTranslation("online");
	return (
		<li key={item.notificationId}>
			<button
				type="button"
				className={listItemButtonClass(unread)}
				data-notification-id={item.notificationId}
				onClick={() => void onOpen(item)}
				style={isFixture ? { opacity: 0.7 } : undefined}
			>
				<div className={listItemHeaderClass}>
					<div className={listItemColumnClass}>
						<div className={listItemTitleRowClass}>
							<span className={listItemTitleClass}>{item.name}</span>
							{isFixture && (
								<span className={listItemFixtureBadgeClass}>
									{t("notification.fixtureBadge")}
								</span>
							)}
						</div>
						{item.summary && (
							<span className={listItemSummaryClass}>{item.summary}</span>
						)}
						<span className={listItemDateClass}>
							{item.publishedAt
								? new Date(item.publishedAt).toLocaleString()
								: ""}
						</span>
					</div>
					{unread && <span className={unreadDotClass} />}
				</div>
			</button>
		</li>
	);
}

function NotificationDetailView(props: {
	selected: NotificationSummary;
	readAtById: Record<string, string>;
	blocks: NotificationBlock[];
	blocksLoading: boolean;
	onClose: () => void;
	onToggleRead: (id: string) => void;
	onRefresh: () => void;
}): JSX.Element {
	const {
		selected,
		readAtById,
		blocks,
		blocksLoading,
		onClose,
		onToggleRead,
		onRefresh,
	} = props;
	const isRead = Boolean(readAtById[selected.notificationId]);
	return (
		<div className={detailContainerClass} data-surface-id="dialog-messages">
			{/* Header */}
			<header className={detailHeaderClass}>
				<div className={detailHeaderLeftClass}>
					<IconButton
						variant="ghost"
						size="sm"
						onClick={onClose}
						aria-label="Back to list"
						className={borderedIconBtnClass}
					>
						<Icon icon={ArrowLeft} size={14} />
					</IconButton>
					<h1 className={detailTitleClass}>{selected.name}</h1>
				</div>
				<div className={detailHeaderRightClass}>
					<IconButton
						variant="ghost"
						size="sm"
						onClick={() => onToggleRead(selected.notificationId)}
						aria-label={isRead ? "Mark unread" : "Mark read"}
						className={cx(borderedIconBtnClass, isRead && opacity60Class)}
					>
						<Icon icon={Check} size={14} />
					</IconButton>
					<IconButton
						variant="ghost"
						size="sm"
						onClick={() => void onRefresh()}
						aria-label="Refresh"
						className={borderedIconBtnClass}
					>
						<Icon icon={RefreshCw} size={14} />
					</IconButton>
				</div>
			</header>

			{/* Meta bar */}
			<div className={metaBarClass}>
				<span className={metaBarTextClass}>
					{selected.category ?? "general"}
				</span>
				{selected.publishedAt && (
					<>
						<span className={metaBarSeparatorClass}>·</span>
						<span className={metaBarTextClass}>
							{new Date(selected.publishedAt).toLocaleString()}
						</span>
					</>
				)}
			</div>

			{/* Summary + content */}
			<div className={detailBodyClass}>
				{selected.summary && (
					<p className={detailSummaryClass}>{selected.summary}</p>
				)}
				{blocksLoading ? (
					<div className={loadingStateClass}>
						<Icon icon={LoaderCircle} size={16} className={spinningIconClass} />
						<span className={mutedTextClass}>Loading…</span>
					</div>
				) : (
					<BlockList blocks={blocks} />
				)}
			</div>
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationCenter(): JSX.Element {
	const [items, setItems] = useState<NotificationSummary[]>([]);
	const [readAtById, setReadAtById] = useState<Record<string, string>>({});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [blocks, setBlocks] = useState<NotificationBlock[]>([]);
	const [blocksLoading, setBlocksLoading] = useState(false);
	const [initialized, setInitialized] = useState(false);

	// Load from cache on mount
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const store = await loadLocalStore();
			if (cancelled) return;
			setItems(store.items);
			setReadAtById(store.readAtById);
			setInitialized(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const selected = useMemo(
		() => items.find((item) => item.notificationId === selectedId) ?? null,
		[items, selectedId],
	);

	const syncRemote = useCallback(async () => {
		// R0 remote source: the static notification feed (Issue #8). The cloud
		// gateway's listNotifications, when present, still wins — the feed is
		// the backend-free fallback, not a second server.
		setLoading(true);
		try {
			// Issue #69: `getDataServices()` throws `GatewayBootRequiredError`
			// when the cloud gateway never booted (R0 offline default). The
			// gateway is optional here — the static feed is the fallback —
			// so use the non-throwing variant and skip straight to the feed.
			const gateway = tryGetDataServices()?.gateway;
			if (gateway?.listNotifications) {
				const result = await _loadNotifications(gateway);
				if (result.ok) {
					setItems(result.remote);
					await saveLocalStore({ items: result.remote, readAtById });
					return;
				}
			}
			const feedItems = await fetchNotificationFeed();
			if (feedItems !== null) {
				setItems(feedItems);
				await saveLocalStore({ items: feedItems, readAtById });
			}
		} finally {
			setLoading(false);
		}
	}, [readAtById]);

	const syncRemoteRef = useRef(syncRemote);

	useEffect(() => {
		syncRemoteRef.current = syncRemote;
	}, [syncRemote]);

	useEffect(() => {
		if (!initialized) return;
		if (items.length === 0) {
			void syncRemoteRef.current();
		}
	}, [initialized, items.length]);

	const toggleRead = useCallback(
		(notificationId: string) => {
			void (async () => {
				const next = { ...readAtById };
				if (next[notificationId]) {
					delete next[notificationId];
				} else {
					next[notificationId] = new Date().toISOString();
				}
				setReadAtById(next);
				await saveLocalStore({ items, readAtById: next });
			})();
		},
		[items, readAtById],
	);

	const openDetail = useCallback(
		async (item: NotificationSummary) => {
			setSelectedId(item.notificationId);
			const next = { ...readAtById };
			if (!next[item.notificationId]) {
				next[item.notificationId] = new Date().toISOString();
				setReadAtById(next);
				await saveLocalStore({ items, readAtById: next });
			}

			const gateway = tryGetDataServices()?.gateway;
			setBlocksLoading(true);
			setBlocks([]);
			const result = await _loadBlocks(gateway, item.notificationId);
			setBlocksLoading(false);
			if (result.ok) {
				setBlocks(result.blocks);
			}
		},
		[items, readAtById],
	);

	const closeDetail = useCallback(() => {
		setSelectedId(null);
		setBlocks([]);
	}, []);

	const closeDetailRef = useRef(closeDetail);
	const openDetailRef = useRef(openDetail);
	const toggleReadRef = useRef(toggleRead);

	useEffect(() => {
		closeDetailRef.current = closeDetail;
	}, [closeDetail]);

	useEffect(() => {
		openDetailRef.current = openDetail;
	}, [openDetail]);

	useEffect(() => {
		toggleReadRef.current = toggleRead;
	}, [toggleRead]);

	// ── Context menu ───────────────────────────────────────────────────────────

	useEffect(() => {
		const surfaceId = "dialog-messages";

		const cleanup = registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload(event: MouseEvent): CepMenuPayload | null {
				const target = event.target as Element | null;
				if (!target) return null;

				// Guard: only handle right-clicks within this surface
				if (!target.closest?.(`[data-surface-id="${surfaceId}"]`)) {
					return null;
				}

				// Card right-click from list view
				const card = target.closest?.("[data-notification-id]");
				if (card) {
					const id = card.getAttribute("data-notification-id")?.trim();
					const item = id ? items.find((it) => it.notificationId === id) : null;
					if (!item) return null;
					const isRead = Boolean(readAtById[item.notificationId]);
					return {
						menu: [
							{ id: `ctx.open.${id}`, label: "Open" },
							sep(),
							{
								id: `ctx.toggle.${id}`,
								label: isRead ? "Mark as Unread" : "Mark as Read",
								checkable: true,
								checked: isRead,
							},
							sep(),
							{ id: "ctx.refresh", label: "Refresh" },
							{ id: "ctx.close", label: "Close" },
						],
					};
				}

				// Detail view header
				if (selected) {
					const isRead = Boolean(readAtById[selected.notificationId]);
					return {
						menu: [
							{ id: "ctx.refresh", label: "Refresh" },
							sep(),
							{
								id: `ctx.toggle.${selected.notificationId}`,
								label: isRead ? "Mark as Unread" : "Mark as Read",
								checkable: true,
								checked: isRead,
							},
							sep(),
							{ id: "ctx.back", label: "Back to List" },
							{ id: "ctx.close", label: "Close" },
						],
					};
				}

				// List view fallback
				return {
					menu: [
						{ id: "ctx.refresh", label: "Refresh" },
						sep(),
						{ id: "ctx.close", label: "Close" },
					],
				};
			},
			onMenuSelect(menuId: string) {
				if (menuId === "ctx.refresh") {
					void syncRemoteRef.current();
				} else if (menuId === "ctx.close") {
					window.close();
				} else if (menuId === "ctx.back") {
					closeDetailRef.current();
				} else if (menuId.startsWith("ctx.open.")) {
					const id = menuId.slice("ctx.open.".length);
					const item = items.find((it) => it.notificationId === id);
					if (item) void openDetailRef.current(item);
				} else if (menuId.startsWith("ctx.toggle.")) {
					const id = menuId.slice("ctx.toggle.".length);
					toggleReadRef.current(id);
				}
			},
		});

		return cleanup;
	}, [selected, readAtById, items]);

	// ── Detail view ────────────────────────────────────────────────────────────

	if (selected) {
		return (
			<NotificationDetailView
				selected={selected}
				readAtById={readAtById}
				blocks={blocks}
				blocksLoading={blocksLoading}
				onClose={closeDetail}
				onToggleRead={toggleRead}
				onRefresh={() => syncRemoteRef.current()}
			/>
		);
	}

	// ── List view ──────────────────────────────────────────────────────────────

	return (
		<div className={listContainerClass} data-surface-id="dialog-messages">
			{/* Header */}
			<header className={listHeaderClass}>
				<h1 className={listHeaderTitleClass}>Notifications</h1>
				<div className={listHeaderActionsClass}>
					<IconButton
						variant="ghost"
						size="sm"
						onClick={() => void syncRemote()}
						aria-label="Refresh"
						disabled={loading}
					>
						<Icon
							icon={RefreshCw}
							size={14}
							className={cx(loading && spinningIconClass)}
						/>
					</IconButton>
				</div>
			</header>

			{/* List */}
			<div className={listBodyClass}>
				{loading && items.length === 0 ? (
					<div className={emptyStateClass}>
						<Icon icon={LoaderCircle} size={20} className={spinningIconClass} />
						<span className={mutedTextClass}>Loading…</span>
					</div>
				) : items.length === 0 ? (
					<div className={emptyStateClass}>
						<Icon icon={Mail} size={24} className={emptyStateIconClass} />
						<span className={mutedTextClass}>No notifications</span>
					</div>
				) : (
					<ul className={notificationListClass}>
						{items.map((item) => (
							<NotificationListItem
								key={item.notificationId}
								item={item}
								readAtById={readAtById}
								onOpen={openDetail}
								isFixture={tryGetDataServices()?.gateway.isFixture === true}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
