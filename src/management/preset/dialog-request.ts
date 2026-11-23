export type PresetDialogRequest =
	| {
			action: "open-create";
			surfaceId: string;
			params?: Record<string, unknown>;
	  }
	| {
			action: "open-edit";
			presetId: string;
	  };
