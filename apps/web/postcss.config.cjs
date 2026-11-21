/**
 * PandaCSS PostCSS plugin for the official web build. Points at the
 * web-specific Panda config so utilities are generated with the web
 * breakpoints and emitted into `apps/web/styled-system`.
 */
const pandacssPostcss = require("@pandacss/postcss");

module.exports = {
	plugins: [
		pandacssPostcss.default({
			configPath: require("node:path").join(__dirname, "panda.config.ts"),
		}),
	],
};
