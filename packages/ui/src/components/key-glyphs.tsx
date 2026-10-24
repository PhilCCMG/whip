import type { SVGProps } from 'react';

/**
 * Return/Enter key glyph (⏎): a hooked shaft down then left, with a solid arrowhead. Drawn on a
 * 16-unit grid so the orthogonal shaft lands on whole pixels at 1x and 2x; sized in em so it
 * follows the surrounding text. The shaft renders crisp; the head is anti-aliased so its
 * diagonals don't stair-step.
 */
export function ReturnKeyIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1.15em"
      height="1.15em"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        d="M12.5 3v6.5H6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        shapeRendering="crispEdges"
      />
      <path d="M2.5 9.5 7 5.5v8z" fill="currentColor" shapeRendering="geometricPrecision" />
    </svg>
  );
}
