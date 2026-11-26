import { describe, expect, it } from "vitest";
import { scanSectionSource } from "./check-settings-ui-primitives";

describe("scanSectionSource", () => {
	it("accepts shared Button and css() usage", () => {
		const src = `
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";
const row = css({ display: "flex" });
export const C = () => (
	<div className={row}>
		<Button variant="ghost" uiSize="sm" onClick={() => {}}>Check now</Button>
	</div>
);
`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("rejects raw <button> JSX", () => {
		const src = `export const C = () => <button type="button" onClick={() => {}}>x</button>;`;
		const violations = scanSectionSource(src);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe("raw-button");
		expect(violations[0]?.line).toBe(1);
	});

	it("rejects multi-line raw <button>", () => {
		const src = `export const C = () => (
	<button
		type="button"
	>
		x
	</button>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["raw-button"]);
		expect(violations[0]?.line).toBe(2);
	});

	it("rejects raw <a> JSX", () => {
		const src = `export const C = () => <a href="https://example.com">link</a>;`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["raw-anchor"]);
	});

	it("does not flag <abbr> or similar tags", () => {
		const src = `export const C = () => <abbr title="HyperText">HTML</abbr>;`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("rejects inline style={{ }}", () => {
		const src = `export const C = () => <div style={{ color: "red" }}>x</div>;`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["inline-style"]);
	});

	it("ignores mentions inside comments", () => {
		const src = `// do not use <button> here
/* or <a href="#"> anchors */
export const C = () => <div>ok</div>;`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("rejects unpinned <ListSelect>", () => {
		const src = `export const C = () => (
	<ListSelect
		options={opts}
		value={v}
		onChange={onChange}
	/>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["listselect-height"]);
	});

	it("accepts <ListSelect> pinned via triggerClassName or uiSize=sm", () => {
		const pinned = `export const C = () => (
	<>
		<ListSelect options={o} value={v} onChange={c} triggerClassName={H} />
		<ListSelect options={o} value={v} onChange={c} uiSize="sm" />
	</>
);`;
		expect(scanSectionSource(pinned)).toEqual([]);
	});

	it("rejects inline element as direct SettingsField child", () => {
		const src = `export const C = () => (
	<SettingsGrid>
		<SettingsField span={3}>
			<SettingsFieldLabel>status</SettingsFieldLabel>
			<span className={tone}>{label}</span>
		</SettingsField>
	</SettingsGrid>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["inline-leaf"]);
		expect(violations[0]?.line).toBe(5);
	});

	it("rejects inline element inside expression child of SettingsField", () => {
		const src = `export const C = () => (
	<SettingsField span={6}>
		{cond ? <span>on</span> : <SettingsFieldValue><span>off</span></SettingsFieldValue>}
	</SettingsField>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["inline-leaf"]);
	});

	it("accepts SettingsFieldValue, block elements, and nested inline usage", () => {
		const src = `export const C = () => (
	<SettingsGrid>
		<SettingsField span={6}>
			<p className={note}>description</p>
		</SettingsField>
		<SettingsField span={3}>
			<SettingsFieldLabel>installed</SettingsFieldLabel>
			<SettingsFieldValue>
				<span className={muted}>{version}</span>
			</SettingsFieldValue>
		</SettingsField>
		<SettingsField span={3}>
			<label className={row}>
				<input type="checkbox" />
				<span>gesture label</span>
			</label>
		</SettingsField>
	</SettingsGrid>
);`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("does not flag spans inside props or outside SettingsField", () => {
		const src = `export const C = () => (
	<>
		<Preview icon={<span>i</span>}>
			<span>free text outside a field</span>
		</Preview>
		<SettingsField span={6}>
			<SettingsFieldLabel>ok</SettingsFieldLabel>
			<div className={row}><span>wrapped</span></div>
		</SettingsField>
	</>
);`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("rejects content-width Button inside SettingsField", () => {
		const src = `export const C = () => (
	<SettingsField span={6}>
		<Button variant="primary" uiSize="sm" onClick={go}>Go</Button>
	</SettingsField>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["action-width"]);
	});

	it("rejects content-width Button even inside SettingsFieldValue", () => {
		const src = `export const C = () => (
	<SettingsField span={3}>
		<SettingsFieldValue>
			<span>0.11.0</span>
			<Button variant="ghost" uiSize="md" onClick={check}>check</Button>
		</SettingsFieldValue>
	</SettingsField>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["action-width"]);
	});

	it("accepts fullWidth Button inside SettingsField", () => {
		const src = `export const C = () => (
	<>
		<SettingsField span={2}>
			<Button variant="primary" uiSize="md" fullWidth onClick={go}>Go</Button>
		</SettingsField>
		<SettingsField span={3}>
			<SettingsFieldValue>
				<span>0.11.0</span>
			</SettingsFieldValue>
		</SettingsField>
	</>
);`;
		expect(scanSectionSource(src)).toEqual([]);
	});

	it("rejects raw element as direct SettingsGrid child", () => {
		const src = `export const C = () => (
	<SettingsGrid>
		<p className={note}>note</p>
		<div className={row}>
			<Button variant="default" uiSize="sm" fullWidth>ok</Button>
		</div>
		<SettingsField span={6}><SettingsFieldLabel>f</SettingsFieldLabel></SettingsField>
	</SettingsGrid>
);`;
		const violations = scanSectionSource(src);
		expect(violations.map((v) => v.rule)).toEqual(["grid-child", "grid-child"]);
	});

	it("accepts SettingsField/SettingsSectionHeading and Fragment-wrapped fields", () => {
		const src = `export const C = () => (
	<SettingsGrid>
		<SettingsSectionHeading>Group</SettingsSectionHeading>
		<Fragment>
			<SettingsField span={3}><SettingsFieldLabel>a</SettingsFieldLabel></SettingsField>
			<SettingsField span={3}><SettingsFieldLabel>b</SettingsFieldLabel></SettingsField>
		</Fragment>
	</SettingsGrid>
);`;
		expect(scanSectionSource(src)).toEqual([]);
	});
});
