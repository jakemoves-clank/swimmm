<script>
	// The one control every concept shares: lane or leisure. It takes no colours
	// of its own — it inherits --ink, --paper and --accent from whichever
	// concept is hosting it, so eleven palettes get eleven toggles for free.
	import { SWIM_KINDS, SWIM_KIND_LABELS } from '$lib/config.js';

	let { kind, setKind, label = 'Swim type' } = $props();
</script>

<div class="kinds" role="group" aria-label={label}>
	{#each SWIM_KINDS as k (k)}
		<button class:on={kind === k} aria-pressed={kind === k} onclick={() => setKind(k)}>
			{SWIM_KIND_LABELS[k]}
		</button>
	{/each}
</div>

<style>
	.kinds {
		display: inline-flex;
		gap: 1px;
		padding: 1px;
		border: 1px solid var(--rule, currentColor);
		border-radius: 999px;
		background: var(--rule, transparent);
	}
	button {
		border: 0;
		border-radius: 999px;
		background: var(--paper, transparent);
		color: var(--ink, currentColor);
		opacity: 0.62;
		padding: 0.3rem 0.85rem;
		font: 600 0.72rem/1.2 inherit;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	button:hover {
		opacity: 0.85;
	}
	button.on {
		background: var(--accent, currentColor);
		color: var(--paper, #fff);
		opacity: 1;
	}
</style>
