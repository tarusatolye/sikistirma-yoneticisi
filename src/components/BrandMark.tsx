import React, { useId } from "react";

// Same drawing as docs/icon.svg.
export const BrandMark: React.FC<{ className?: string }> = ({ className = "w-6 h-6 rounded-[5px]" }) => {
  const gradient = useId();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className={`${className} shrink-0 shadow`}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b21b6" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill={`url(#${gradient})`} />
      <g transform="translate(64 64) scale(16)" color="#ffffff">
        <path
          fill="currentColor"
          d="M4.528 5.118a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 12 10.535V21a1 1 0 0 1-1.555.832l-5.554-3.703A2 2 0 0 1 4 16.465V6a1 1 0 0 1 .528-.882m4-2a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 16 8.535V19a1 1 0 0 1-1.555.832l-.945-.63v-8.667a3.5 3.5 0 0 0-1.559-2.912L8 4.995V4a1 1 0 0 1 .528-.882m4-2a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 20 6.535V17a1 1 0 0 1-1.555.832l-.945-.63V8.534a3.5 3.5 0 0 0-1.559-2.912L12 2.995V2a1 1 0 0 1 .528-.882"
        />
      </g>
    </svg>
  );
};
