// Current date and minutes-since-midnight in Toronto, wherever the code runs.
export function torontoNow(date = new Date()) {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Toronto',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		// h23 guarantees 00–23 output; hour12:false can yield "24:xx" in some
		// hour cycles, which would mis-place midnight.
		hourCycle: 'h23'
	});
	const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}
