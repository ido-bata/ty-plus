() => ({
	url: location.href,
	text: document.body.innerText.slice(0, 200),
	canvas: !!document.querySelector("canvas"),
})
