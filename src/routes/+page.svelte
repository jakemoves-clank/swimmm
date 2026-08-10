<script>
	// The current version of Swimmm, served at the root. `/v3` renders the
	// same component, so the alias can never drift from what `/` shows;
	// `/v1` is the opposite arrangement, a frozen copy that must not move.
	import Dips from '$lib/v3/Dips.svelte';

	let { data } = $props();
</script>

<Dips {data} />
