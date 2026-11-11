// Debug console overlay panel  Eslides up from the bottom of the host element.
// Uses React for rendering via Panel.

import {
	type JSX,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	clearLogs,
	executeCommand,
	type LogMessage,
	subscribe,
} from "@/management/debug/console/interceptor";
import { type FilterLevel, Panel } from "@/management/debug/console/ui/Panel";

export type DebugConsoleOptions = {
	/** Host element to mount inside (defaults to document.body) */
	host?: Element;
};

export class DebugConsole {
	private _host: Element;
	private _container: Element & ElementCSSInlineStyle;
	private _root: Root;
	private _isOpen = false;
	private _resizeStartY = 0;
	private _resizeStartH = 0;

	constructor(opts: DebugConsoleOptions = {}) {
		this._host = opts.host ?? document.body;
		this._container = this._host.appendChild(document.createElement("div"));
		this._root = createRoot(this._container);
		this._render();
		this._bind();
	}

	toggle(): void {
		this._isOpen ? this.close() : this.open();
	}

	open(): void {
		this._isOpen = true;
		this._container.classList.add("open");
		const input = this._container.querySelector(".dbg-input") as
			| (Element & { focus?: () => void })
			| null;
		input?.focus?.();
	}

	close(): void {
		this._isOpen = false;
		this._container.classList.remove("open");
	}

	destroy(): void {
		this._root.unmount();
		this._container.remove();
	}

	private _render(): void {
		this._root.render(<DebugConsoleReact host={this._host} />);
	}

	private _bind(): void {
		// Resize handle needs native DOM access  Equery after mount
		setTimeout(() => {
			const resizeHandle = this._container.querySelector(".dbg-resize");
			if (!resizeHandle) return;

			resizeHandle.addEventListener("pointerdown", (ev) => {
				if (!(ev instanceof PointerEvent)) return;
				ev.preventDefault();
				this._resizeStartY = ev.clientY;
				this._resizeStartH = this._container.clientHeight;
				resizeHandle.setPointerCapture?.(ev.pointerId);

				const onMove = (moveEvent: Event) => {
					if (!(moveEvent instanceof PointerEvent)) return;
					const delta = this._resizeStartY - moveEvent.clientY;
					const newH = Math.max(
						100,
						Math.min(this._host.clientHeight * 0.9, this._resizeStartH + delta),
					);
					this._container.style.height = `${newH}px`;
				};
				const onUp = () => {
					resizeHandle.removeEventListener("pointermove", onMove);
					resizeHandle.removeEventListener("pointerup", onUp);
				};
				resizeHandle.addEventListener("pointermove", onMove);
				resizeHandle.addEventListener("pointerup", onUp);
			});
		}, 0);
	}
}

// ── React wrapper component ──────────────────────────────────────────────────

type MessagesRef = RefObject<Element | null>;

interface DebugConsoleReactProps {
	host?: Element;
}

function DebugConsoleReact({
	host = document.body,
}: DebugConsoleReactProps): JSX.Element {
	const messagesRef = useRef<Element>(null);
	const [messages, setMessages] = useState<readonly LogMessage[]>([]);
	const [filter, setFilter] = useState<FilterLevel>("all");
	const [autoScroll, setAutoScroll] = useState(true);
	const [_cmdHistory, setCmdHistory] = useState<string[]>([]);
	const [_cmdIdx, setCmdIdx] = useState(-1);

	const handleFilterChange = useCallback((f: FilterLevel) => {
		setFilter(f);
	}, []);

	const handleAutoScrollChange = useCallback((v: boolean) => {
		setAutoScroll(v);
	}, []);

	const handleClear = useCallback(() => {
		void clearLogs(window).then(() => setMessages([]));
	}, []);

	const handleCommandExecute = useCallback((code: string) => {
		setCmdHistory((prev) => {
			const next = [code, ...prev];
			if (next.length > 50) next.pop();
			return next;
		});
		setCmdIdx(-1);
		console.log(`> ${code}`);
		executeCommand(code);
	}, []);

	const _handleScroll = useCallback(() => {
		if (!messagesRef.current) return;
		const el = messagesRef.current;
		const { scrollTop, scrollHeight, clientHeight } = el;
		setAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
	}, []);

	// Subscribe on mount
	useEffect(() => {
		const unsub = subscribe((msgs) => {
			setMessages(msgs);
		});
		return unsub;
	}, []);

	// Auto-scroll on new messages
	useEffect(() => {
		if (autoScroll && messagesRef.current) {
			messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
		}
	}, [autoScroll]);

	return (
		<Panel
			messages={messages}
			filter={filter}
			autoScroll={autoScroll}
			onFilterChange={handleFilterChange}
			onAutoScrollChange={handleAutoScrollChange}
			onClear={handleClear}
			onCommandExecute={handleCommandExecute}
			messagesRef={messagesRef}
		/>
	);
}
