import type { CSSProperties } from "react";

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  copy: "M9 9h11v11H9zM15 9V4H4v11h5",
  external: "M14 4h6v6m0-6L10 14m-2-9H4v15h15v-4",
  link: "m10 13 4-4m-6 6-1 1a4.24 4.24 0 0 1-6-6l4-4a4.24 4.24 0 0 1 6 0m2 2 1-1a4.24 4.24 0 0 1 6 6l-4 4a4.24 4.24 0 0 1-6 0",
  plus: "M12 5v14M5 12h14",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  eyeOff:
    "m3 3 18 18M10 5.2a11 11 0 0 1 2-.2c6 0 10 7 10 7a20 20 0 0 1-3 4M6 6C3.5 8.5 2 12 2 12s4 7 10 7a12 12 0 0 0 5-1",
} as const;

export function Icon({
  name,
  className,
  style,
}: {
  name: keyof typeof paths;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
