import type { JSX, ReactNode } from "react";

export type WorkspaceShellProps = {
	rootModifierClasses?: readonly string[];
	dialogColumnClass?: string;
	title: string;
	meta: string;
	children: ReactNode;
	afterBody?: ReactNode;
	footer?: ReactNode;
};

export function WorkspaceShell({
	rootModifierClasses = [],
	dialogColumnClass,
	title,
	meta,
	children,
	afterBody,
	footer,
}: WorkspaceShellProps): JSX.Element {
	const mods: string[] = [];
	for (const c of rootModifierClasses) {
		const trimmed = c.trim();
		if (trimmed) mods.push(trimmed);
	}
	const rootClass = ["wsd-root", "wsd-root--shell", ...mods].join(" ");
	const columnClass = dialogColumnClass?.trim() || "wsd-dialog-column";
	return (
		<div className={rootClass}>
			<div className={columnClass}>
				<header className="wsd-header">
					<h1 className="wsd-title">{title}</h1>
					<div className="wsd-header-end">
						<span className="wsd-meta">{meta}</span>
					</div>
				</header>
				<div className="wsd-main-scroll">
					<section className="wsd-body">{children}</section>
					{afterBody}
					{footer ? <footer className="wsd-footer">{footer}</footer> : null}
				</div>
			</div>
		</div>
	);
}
