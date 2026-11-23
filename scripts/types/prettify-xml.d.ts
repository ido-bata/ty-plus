declare module "prettify-xml" {
	interface PrettifyXmlOptions {
		indent?: number;
		newline?: string;
		spaceBeforeSlash?: boolean;
		tagNameCase?: string;
	}

	function prettifyXml(xml: string, options?: PrettifyXmlOptions): string;
	export default prettifyXml;
}
