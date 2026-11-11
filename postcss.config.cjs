/**
 * PandaCSS PostCSS plugin — picked up automatically by Vite 8 / Storybook.
 * The plugin extracts Panda class usages from CSS files (including the
 * `@layer reset, base, tokens, recipes, utilities;` declaration in
 * `src/management/panel/styles/app.css`) and emits the generated
 * `styled-system/styles.css`.
 */
const pandacssPostcss = require("@pandacss/postcss");

module.exports = {
	plugins: [pandacssPostcss.default({})],
};