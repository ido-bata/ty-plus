import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<main>
			<h1>ty-plus</h1>
			<p>Official website scaffold.</p>
		</main>
	);
}
