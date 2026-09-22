import React from 'react';
import type { SVGProps } from 'react';

export function MaterialSymbolsMarkdownRounded(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.4em"
      height="1.4em"
      viewBox="0 0 8 8"
      {...props}
    >
      <path
        fill="#00be7f"
        d="M6 3V1h1v2h1L6.5 6L5 3M0 6V1h1l1.5 1L4 1h1v5H4V3L2.5 4L1 3v3"
      ></path>
    </svg>
  );
}
