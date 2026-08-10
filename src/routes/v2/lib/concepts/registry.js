// The eleven concepts, in reading order.
//
// Each entry carries what the gallery needs to caption it: where the form
// comes from, what it asks the reader to do, and — the honest bit — what it
// is bad at. A gallery that only lists strengths isn't a comparison.

import TripLine from './C01TripLine.svelte';
import DayPlanner from './C02DayPlanner.svelte';
import PoolClock from './C03PoolClock.svelte';
import ParkingSign from './C04ParkingSign.svelte';
import MapOfMinutes from './C05MapOfMinutes.svelte';
import YourPool from './C06YourPool.svelte';
import TwelveMaps from './C07TwelveMaps.svelte';
import Almanac from './C08Almanac.svelte';
import SoonestSplash from './C09SoonestSplash.svelte';
import WorthTheTrip from './C10WorthTheTrip.svelte';
import Strings from './C11Strings.svelte';

export const CONCEPTS = [
	{
		slug: 'trip-line',
		title: 'The Trip Line',
		standfirst: 'Time across, travel down. Your trip is the diagonal.',
		lineage: 'É.-J. Marey’s train schedule graph (1885); Tufte, VDQI p. 31',
		reads:
			'Each pool sits at its own height — how many minutes away it is. Swims are bars. ' +
			'Because the vertical axis is measured in minutes of travel, a single departure ' +
			'becomes a single straight rake: drag it to change when you leave and it slides ' +
			'across, keeping its slope. Everything behind the rake has gone without you; the ' +
			'first bar it lands on is your swim.',
		weakness: 'Dense. Sixty pools is sixty lanes, and near neighbours crowd together.',
		touches: ['Drag the departure line', 'Lane / leisure'],
		component: TripLine
	},
	{
		slug: 'day-planner',
		title: 'The Day Planner',
		standfirst: 'The familiar one: a timetable, nearest pool first.',
		lineage: 'The school timetable and the wall calendar; Bertin’s reorderable matrix',
		reads:
			'Time runs down, pools run across, left to right in the order you can reach them. ' +
			'Everything above the red line has already happened. Tap the header to re-sort by ' +
			'what starts soonest instead.',
		weakness: 'Only fits a dozen pools on a phone, so it has to hide the rest.',
		touches: ['Re-sort the columns', 'Lane / leisure'],
		component: DayPlanner
	},
	{
		slug: 'pool-clock',
		title: 'The Pool Clock',
		standfirst: 'A day is a circle. Read it like a watch.',
		lineage: 'The 24-hour dial; Florence Nightingale’s coxcombs; Playfair in polar',
		reads:
			'Midnight at the top, noon at the bottom, and one ring per pool — the nearest pool ' +
			'is the innermost ring. The hand is now. The shaded wedge ahead of it is the time ' +
			'you would spend travelling, so any arc it has not yet swept is a swim you can still catch.',
		weakness: 'Angles are hard to compare precisely; you read order, not duration.',
		touches: ['Tap a ring', 'Lane / leisure'],
		component: PoolClock
	},
	{
		slug: 'parking-sign',
		title: 'Swim Permitted Between',
		standfirst: 'No chart at all. The municipal sign, applied to water.',
		lineage: 'Nikki Sylianteng’s parking-sign redesign; enamel street signage',
		reads:
			'One sign per pool, nearest first. Green is a swim you can still make; the arrow is ' +
			'how you would get there and how long it takes. Read the top sign and go.',
		weakness: 'Scales by scrolling, not by seeing. No overview of the day.',
		touches: ['Lane / leisure'],
		component: ParkingSign
	},
	{
		slug: 'map-of-minutes',
		title: 'A Map of Minutes',
		standfirst: 'Toronto redrawn so distance means time.',
		lineage: 'Time-space maps of the Japanese rail network; Bunge’s geography of effort',
		reads:
			'Every pool keeps its true compass direction from you, but its distance from the ' +
			'centre is how long it takes to get there. Switch from walking to cycling and watch ' +
			'the whole city pull inward.',
		weakness: 'The city stops looking like itself — you lose the streets you navigate by.',
		touches: ['Walk / bike', 'Tap a pool'],
		component: MapOfMinutes
	},
	{
		slug: 'your-pool',
		title: 'Your Pool',
		standfirst: 'The city divided into territories, shaded by when the water opens.',
		lineage: 'Dirichlet–Voronoi tessellation; John Snow’s cholera map; the choropleth',
		reads:
			'Every point in Toronto is coloured by its nearest pool with a swim today, and ' +
			'shaded by how soon that swim starts. Find yourself on the map: the cell you are ' +
			'standing in is your pool, and its shade is your wait.',
		weakness: 'Straight-line territories. Rivers, rail cuts and the Don Valley say otherwise.',
		touches: ['Tap a territory', 'Lane / leisure'],
		component: YourPool
	},
	{
		slug: 'twelve-maps',
		title: 'The Day in Twelve Maps',
		standfirst: 'The whole day at once, in twelve small maps. Nothing to press.',
		lineage: 'Tufte’s small multiples — “at the heart of visual reasoning”',
		reads:
			'One map per ninety minutes, from six in the morning to midnight. A dot is a pool ' +
			'with water in it during that slice. Read it the way you read a sentence: the ' +
			'morning is dense downtown, the evening spreads north and east.',
		weakness: 'Shows the shape of the day, not your day. There is no “you” in it — by design.',
		touches: [],
		component: TwelveMaps
	},
	{
		slug: 'almanac',
		title: 'The Almanac',
		standfirst: 'A table that happens to be a chart. Highest ink-per-square-inch here.',
		lineage: 'Tufte’s sparklines and table-graphics; the railway timetable; Playfair',
		reads:
			'One line per pool. The strip is its whole day, with a mark where you are now and ' +
			'a dot where you would enter the water. Numbers you would actually say out loud sit ' +
			'in the margin: minutes away, in the water by, minutes of swim.',
		weakness: 'Rewards study, not a glance. This is a reading, not a picture.',
		touches: ['Sort by soonest / nearest / longest swim', 'Lane / leisure'],
		component: Almanac
	},
	{
		slug: 'soonest-splash',
		title: 'Soonest Splash',
		standfirst: 'One axis. When could you be in the water?',
		lineage: 'The dot strip; Wilkinson’s dot plot; the beeswarm',
		reads:
			'Forget distance and start time as separate things — a pool ten minutes away whose ' +
			'swim begins in an hour is worse than one twenty minutes away that is already open. ' +
			'Each dot is placed at the minute you could be swimming there. Leftmost wins.',
		weakness: 'Collapses two facts into one. You cannot see whether it was far or late.',
		touches: ['Lane / leisure'],
		component: SoonestSplash
	},
	{
		slug: 'worth-the-trip',
		title: 'Worth the Trip',
		standfirst: 'Energy out against water in. The break-even line does the arguing.',
		lineage: 'The scatterplot with a reference line; Tukey; cost–benefit nomography',
		reads:
			'Across: the round trip, in minutes of your own effort. Up: the minutes you would ' +
			'actually spend swimming. On the diagonal you travel as long as you swim. Everything ' +
			'above it is worth the trip; the top-left corner is the best deal in the city.',
		weakness: 'Judges a swim by arithmetic. Sometimes the far pool is the nice one.',
		touches: ['Walk / bike', 'Lane / leisure'],
		component: WorthTheTrip
	},
	{
		slug: 'strings',
		title: 'Strings',
		standfirst: 'Three scales, one thread per pool. Follow a string with your finger.',
		lineage: 'The nomogram (d’Ocagne, 1884); Inselberg’s parallel coordinates',
		reads:
			'Left: how far away. Middle: the clock time you would be getting in. Right: how long ' +
			'you would get. All three scales are turned the same way up — best at the top — so ' +
			'the reading rule is one sentence: take the string that stays high all the way across. ' +
			'Where strings cross, you are looking at a trade-off.',
		weakness: 'Needs to be taught. Nobody has ever read one of these by accident.',
		touches: ['Tap a string', 'Lane / leisure'],
		component: Strings
	}
];

export const DEFAULT_CONCEPT = CONCEPTS[0].slug;

export function conceptBySlug(slug) {
	return CONCEPTS.find((c) => c.slug === slug) ?? CONCEPTS[0];
}
