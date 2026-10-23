import type { HTMLAttributes } from "react";

type IconProps = HTMLAttributes<SVGElement>;

export const Logo = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    fill="none"
    height="1em"
    viewBox="0 0 882 553"
    {...props}
  >
    <defs>
      <clipPath id="_clipPath_6pfRW81LANZJpauFH7ZpnJxsgBuYJNcs">
        <rect width="882" height="553" />
      </clipPath>
    </defs>
    <g clipPath="url(#_clipPath_6pfRW81LANZJpauFH7ZpnJxsgBuYJNcs)">
      <path
        d=" M 388 553 L 438 553 L 526 553 L 576 553 L 577 553 L 798 332 L 798 194 L 798 193 L 748 193 L 387 553 L 388 553 Z  M 137 277 L 194 277 L 473 0 L 416 0 L 332 0 L 332 0 L 332 0 L 275 0 L 0 277 L 57 277 L 137 277 L 137 277 L 137 277 L 137 277 Z  M 741 0 L 681 0 L 489 193 L 392 193 L 332 193 L 59 466 L 59 553 L 119 553 L 120 553 L 180 553 L 410 323 L 498 323 L 558 323 L 882 0 L 822 0 L 741 0 L 741 0 L 741 0 L 741 0 L 741 0 L 741 0 Z "
        fillRule="evenodd"
        fill="currentColor"
        vectorEffect="non-scaling-stroke"
        strokeWidth="1"
        stroke="currentColor"
        strokeLinejoin="miter"
        strokeLinecap="square"
        strokeMiterlimit="3"
      />
    </g>
  </svg>
);

export const Github = (props: IconProps) => (
  <svg
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 96 98"
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="currentColor"
      d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
    />
  </svg>
);
