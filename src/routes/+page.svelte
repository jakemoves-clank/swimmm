<script>
	// The live site. `/v1` and `/v2` are sealed snapshots of what stood here
	// before — see CLAUDE.md; this route is the one that moves.
	import Dips from '$lib/dips/Dips.svelte';

	let { data } = $props();
</script>

<Dips {data} />
