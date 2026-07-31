// Five of the concepts hang their tap targets off SVG shapes — a ring on a
// dial, a Voronoi cell, a thread in a nomogram — because that is the shape the
// reader is actually aiming at. An SVG shape with `role="button"` gets none of
// a real <button>'s behaviour for free, so each has to be given it back:
//
//   - Space activates as well as Enter. A native button does; a div or a
//     <circle> pretending to be one does not, and a keyboard user who presses
//     Space on a focused control expects it to fire.
//   - Space is swallowed, or the page scrolls out from under the press.
//
// One helper rather than five inline handlers, because five copies of this is
// exactly the kind of thing that drifts — and did: one file was fixed and the
// other four were left behind.
export function onActivate(run) {
	return (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		run();
	};
}
