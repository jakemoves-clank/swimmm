<script>
	// v3 under its own number, for linking to it while it is also the root.
	// One component with `/`, deliberately: an alias that could drift would
	// be a second product.
	import Dips from '$lib/v3/Dips.svelte';

	let { data } = $props();
</script>

<Dips {data} />
