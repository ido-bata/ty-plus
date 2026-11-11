import type { JSX } from "react";
import { Button } from "@/shared/component/controls/Button";
import type { DirectoryBrowserEntry } from "./DirectoryBrowser";
import type { DirectoryBrowserSummary } from "./DirectoryBrowserSelectedSummary";

export type DirectoryBrowserOnboardingViewProps = {
	entries: readonly DirectoryBrowserEntry[];
	loading: boolean;
	goUpAvailable: boolean;
	onGoUp: () => void;
	onEntryClick: (entry: DirectoryBrowserEntry) => void;
	isFileSelected: (entryPath: string) => boolean;
	onToggleFileSelected: (entryPath: string) => void;
	isFolderSelected?: (entryPath: string) => boolean;
	onToggleFolderSelected?: (entryPath: string) => void;
	selectedSummary: DirectoryBrowserSummary;
	emptyLabel: string;
	loadingLabel: string;
	upLabel: string;
};

export function DirectoryBrowserOnboardingView({
	entries,
	loading,
	goUpAvailable,
	onGoUp,
	onEntryClick,
	isFileSelected,
	onToggleFileSelected,
	isFolderSelected,
	onToggleFolderSelected,
	selectedSummary,
	emptyLabel,
	loadingLabel,
	upLabel,
}: DirectoryBrowserOnboardingViewProps): JSX.Element {
	return (
		<div className="onboarding-file-selection">
			{loading ? (
				<div className="onboarding-loading-container">
					<span className="onboarding-text onboarding-text--caption">
						{loadingLabel}
					</span>
				</div>
			) : (
				<>
					<div className="onboarding-file-list">
						{goUpAvailable ? (
							<div className="onboarding-file-item onboarding-file-item--folder">
								<Button
									type="button"
									variant="ghost"
									uiSize="sm"
									className="onboarding-file-item__content"
									onClick={onGoUp}
								>
									<span className="onboarding-file-item__name">{upLabel}</span>
								</Button>
							</div>
						) : null}
						{entries.length === 0 ? (
							<div className="onboarding-file-item">
								<span className="onboarding-text onboarding-text--caption onboarding-text--muted">
									{emptyLabel}
								</span>
							</div>
						) : (
							entries.map((entry) => (
								<div
									key={entry.path}
									className={`onboarding-file-item ${entry.isDirectory ? "onboarding-file-item--folder" : ""}`}
								>
									<Button
										type="button"
										variant="ghost"
										uiSize="sm"
										className="onboarding-file-item__content"
										onClick={() => onEntryClick(entry)}
									>
										<span className="onboarding-file-item__name">
											{entry.name}
										</span>
										{!entry.isDirectory && !onToggleFolderSelected ? (
											<input
												type="checkbox"
												checked={isFileSelected(entry.path)}
												onChange={() => onToggleFileSelected(entry.path)}
												aria-label={`select ${entry.name}`}
											/>
										) : null}
									</Button>
									{entry.isDirectory && onToggleFolderSelected ? (
										<Button
											type="button"
											variant="ghost"
											uiSize="sm"
											className="onboarding-file-item__toggle"
											onClick={(event: React.MouseEvent) => {
												event.stopPropagation();
											}}
										>
											<input
												type="checkbox"
												checked={isFolderSelected?.(entry.path) ?? false}
												onChange={() => onToggleFolderSelected(entry.path)}
												aria-label={`select ${entry.name}`}
											/>
										</Button>
									) : null}
									{!entry.isDirectory && onToggleFolderSelected ? (
										<Button
											type="button"
											variant="ghost"
											uiSize="sm"
											className="onboarding-file-item__toggle"
											onClick={(event: React.MouseEvent) => {
												event.stopPropagation();
											}}
										>
											<input
												type="checkbox"
												checked={isFileSelected(entry.path)}
												onChange={() => onToggleFileSelected(entry.path)}
												aria-label={`select ${entry.name}`}
											/>
										</Button>
									) : null}
								</div>
							))
						)}
					</div>
					<p className="onboarding-text onboarding-text--caption onboarding-text--muted">
						{typeof selectedSummary === "string"
							? selectedSummary
							: `${selectedSummary.files} file${selectedSummary.files !== 1 ? "s" : ""}${selectedSummary.files > 0 && selectedSummary.folders > 0 ? ", " : ""}${selectedSummary.folders} folder${selectedSummary.folders !== 1 ? "s" : ""}`}
					</p>
				</>
			)}
		</div>
	);
}
