import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS, SITE } from "../lib/site";
import { SiteMark } from "./SiteMark";

const MENU_ID = "site-menu";

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
			className={`site-header${isWide ? " is-wide" : ""}`}
		>
			<div ref={innerRef} className="site-header-inner">
				<Link to="/" className="site-logo">
					<SiteMark />
					<span>{SITE.name}</span>
				</Link>

				<nav className="site-nav" aria-label="Primary">
					<button
						type="button"
						className="site-menu-button"
						popoverTarget={MENU_ID}
						popoverTargetAction="toggle"
						aria-controls={MENU_ID}
					>
						<svg
							viewBox="0 0 16 16"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						>
							<path d="M2 4.5h12M2 8h12M2 11.5h12" />
						</svg>
						<span>Menu</span>
					</button>

					<ul
						ref={menuRef}
						id={MENU_ID}
						className="site-menu"
						popover={isWide ? undefined : "auto"}
					>
						{NAV_LINKS.map((link) => (
							<li key={link.to}>
								<Link
									to={link.to}
									aria-current={pathname === link.to ? "page" : undefined}
								>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
					<Link to="/download" className="btn btn-primary site-header-cta">
						Download
					</Link>
				</nav>
			</div>
		</header>
	);
}
