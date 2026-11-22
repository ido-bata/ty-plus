import { Link, useRouterState } from "@tanstack/react-router";
import { Button, cx, IconButton } from "@ty-plus/ui";
import { useEffect, useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { NAV_LINKS, SITE } from "../lib/site";
import { container } from "../styles/layout";
import { SiteMark } from "./SiteMark";

const MENU_ID = "site-menu";

const header = css({
	position: "sticky",
	top: 0,
	zIndex: 40,
	borderBottomWidth: "hairline",
	borderBottomStyle: "solid",
	borderBottomColor: "border.subtle",
	backgroundColor:
		"color-mix(in srgb, var(--ty-surface-panel) 85%, transparent)",
	backdropFilter: "blur(12px)",
	// Measurement pass: render the menu inline, unstyled, for one frame.
	"&.is-measuring, &.is-measuring *": { transition: "none" },
	"&.is-measuring [data-site-menu]": {
		position: "static",
		display: "flex",
		flexDirection: "row",
		inlineSize: "auto",
		maxInlineSize: "none",
		blockSize: "auto",
		maxBlockSize: "none",
		overflow: "visible",
		margin: 0,
		padding: 0,
		borderWidth: 0,
		borderStyle: "none",
		backgroundColor: "transparent",
		boxShadow: "none",
	},
	"&.is-measuring [data-menu-button], &.is-measuring [data-header-cta]": {
		display: "none",
	},
	// Wide layout: inline navigation, hide the collapsed trigger.
	"&.is-wide [data-menu-button]": { display: "none" },
	"&:not(.is-wide) [data-header-cta]": { display: "none" },
	"&.is-wide [data-site-menu]": {
		position: "static",
		display: "flex",
		flexDirection: "row",
		alignItems: "center",
		gap: "0.25rem",
		inlineSize: "auto",
		maxInlineSize: "none",
		blockSize: "auto",
		maxBlockSize: "none",
		overflow: "visible",
		margin: 0,
		padding: 0,
		borderWidth: 0,
		borderStyle: "none",
		backgroundColor: "transparent",
		boxShadow: "none",
	},
	"&.is-wide [data-site-menu]::backdrop": { display: "none" },
});

const headerInner = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "1rem",
	height: "4rem",
});

const logo = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "0.5rem",
	paddingBlock: "0.375rem",
	marginBlock: "-0.375rem",
	fontWeight: "semibold",
	fontSize: "text-body",
	color: "text.primary",
	textDecoration: "none",
	letterSpacing: "tight",
});

const nav = css({
	display: "flex",
	alignItems: "center",
	gap: "0.25rem",
});

const menuListBase = css({
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.125rem",
});

const menuLink = css({
	display: "flex",
	alignItems: "center",
	padding: "0.5rem 0.75rem",
	borderRadius: "shell-sm",
	fontSize: "sm",
	fontWeight: "medium",
	color: "text.muted",
	textDecoration: "none",
	_hover: { color: "text.primary", backgroundColor: "interactive.hover" },
	'&[aria-current="page"]': {
		color: "text.primary",
		backgroundColor: "interactive.hover",
	},
});

// Collapsed popover: fixed under the header, anchored top-right.
const menuPopover = css({
	position: "fixed",
	insetBlockStart: "4.5rem",
	insetInlineEnd: "1.25rem",
	inlineSize: "min(80dvw, 20rem)",
	maxInlineSize: "calc(100dvw - 2.5rem)",
	blockSize: "fit-content",
	maxBlockSize: "calc(100dvh - 6rem)",
	overflow: "auto",
	padding: "0.5rem",
	borderRadius: "surface-card",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.dialog",
	boxShadow: "control-panel",
	// Author display would beat the UA [popover]:not(:popover-open) rule.
	"&:not(:popover-open)": { display: "none" },
});

/**
 * Responsive site navigation.
 *
 * Follows modern-web-guidance `navbar`: one semantic <nav> at every size.
 * The collapsed layout is a native popover anchored to the menu button;
 * the wide layout is an inline list. Layout is decided by measuring whether
 * the inline row actually fits — no hard-coded breakpoint.
 */
export function SiteHeader() {
	const headerRef = useRef<HTMLElement | null>(null);
	const innerRef = useRef<HTMLDivElement | null>(null);
	const menuRef = useRef<HTMLUListElement | null>(null);
	const reopenRef = useRef(false);
	const [isWide, setIsWide] = useState(false);
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	// Sync popover presentation with the measured layout. Removing the
	// attribute closes an open popover; re-adding it does not reopen, so a
	// menu that was open before widening is reopened after narrowing.
	useEffect(() => {
		const menu = menuRef.current;
		if (!menu || isWide) return;
		if (reopenRef.current) {
			reopenRef.current = false;
			menu.showPopover?.();
		}
	}, [isWide]);

	useEffect(() => {
		const header = headerRef.current;
		const inner = innerRef.current;
		const menu = menuRef.current;
		if (!header || !inner || !menu) return;

		let raf = 0;

		const measure = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				// An open popover lives in the top layer, so it never
				// contributes to the header's scrollWidth. Hide it for one
				// frame so the inline row can be measured naturally, then
				// restore the open state before paint.
				const wasOpen = menu.matches(":popover-open");
				if (wasOpen) menu.hidePopover();

				// Render the row inline (button hidden, menu in flow) for one
				// frame to measure the natural width, then decide.
				header.classList.add("is-measuring");
				const fits = inner.scrollWidth <= inner.clientWidth;
				header.classList.remove("is-measuring");

				if (wasOpen) menu.showPopover();

				// Widening while the popover is open: remember to reopen it
				// when the layout narrows again. Kept outside the state
				// updater so the updater stays pure.
				if (fits && wasOpen) {
					reopenRef.current = true;
				}
				setIsWide(fits);
			});
		};

		const observer = new ResizeObserver(measure);
		observer.observe(header);
		observer.observe(menu);
		// Re-measure once web fonts finish loading.
		document.fonts?.ready.then(measure).catch(() => {});
		measure();

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
		};
	}, []);

	return (
		<header
			ref={headerRef}
			className={cx(header, isWide ? "is-wide" : "is-collapsed")}
		>
			<div
				ref={innerRef}
				className={cx(container({ size: "content" }), headerInner)}
			>
				<Link to="/" className={logo}>
					<SiteMark
						className={css({ inlineSize: "1.25rem", blockSize: "1.25rem" })}
					/>
					<span>{SITE.name}</span>
				</Link>

				<nav className={nav} aria-label="Primary">
					<IconButton
						data-menu-button
						aria-label="Menu"
						aria-controls={MENU_ID}
						popoverTarget={MENU_ID}
						popoverTargetAction="toggle"
					>
						<svg
							viewBox="0 0 16 16"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							className={css({ inlineSize: "1rem", blockSize: "1rem" })}
						>
							<path d="M2 4.5h12M2 8h12M2 11.5h12" />
						</svg>
					</IconButton>

					<ul
						ref={menuRef}
						id={MENU_ID}
						data-site-menu
						className={cx(menuListBase, !isWide && menuPopover)}
						popover={isWide ? undefined : "auto"}
					>
						{NAV_LINKS.map((link) => (
							<li key={link.to}>
								<Link
									to={link.to}
									className={menuLink}
									aria-current={pathname === link.to ? "page" : undefined}
								>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
					<span data-header-cta>
						<Button as={Link} to="/download" uiSize="sm">
							Download
						</Button>
					</span>
				</nav>
			</div>
		</header>
	);
}
