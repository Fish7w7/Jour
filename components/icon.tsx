import type { ReactNode } from "react";

const paths = {
  today: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-12 5h2m3 0h2"/></>,
  dates: <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9Z"/>,
  settings: <><path d="m10 3-.7 2.1-2 .9-2.1-.7-2 3.4 1.5 1.7v2.3l-1.5 1.7 2 3.4 2.1-.7 2 .9.7 2.1h4l.7-2.1 2-.9 2.1.7 2-3.4-1.5-1.7v-2.3l1.5-1.7-2-3.4-2.1.7-2-.9L14 3z"/><circle cx="12" cy="11.6" r="3"/></>,
  hospital: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 9h6m-3-3v6m-4 9v-5h8v5"/></>,
  book: <><path d="M12 6a6 6 0 0 0-4-2H3v15h5c1.5 0 3 .7 4 2 1-1.3 2.5-2 4-2h5V4h-5a6 6 0 0 0-4 2zm0 0v15"/></>,
  sparkles: <><path d="M10 3l2.3 6.7L19 12l-6.7 2.3L10 21l-2.3-6.7L1 12l6.7-2.3L10 3zm9-1v6m-3-3h6m-2 12v4m-2-2h4"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/></>,
  moon: <path d="M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z"/>,
  appearance: <><circle cx="12" cy="12" r="8.5"/><path fill="currentColor" stroke="none" d="M12 3.5a8.5 8.5 0 0 0 0 17Z"/></>,
  bell: <path d="M9.5 19a2.5 2.5 0 0 0 5 0M12 3a5.5 5.5 0 0 0-5.5 5.5v3L4 15v1h16v-1l-2.5-3.5v-3A5.5 5.5 0 0 0 12 3Z"/>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9m-9 4h4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>,
  upload: <path d="M12 15V3M8 7l4-4 4 4M4 16v4h16v-4"/>,
  share: <path d="M12 15V3m-4 4 4-4 4 4M7 10H5v11h14V10h-2"/>,
  home: <path d="m3 10 9-7 9 7m-2-1v11H5V9m5 11v-6h4v6"/>,
  more: <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="3"/>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  right: <path d="m9 5 7 7-7 7"/>,
  left: <path d="m15 5-7 7 7 7"/>,
  flag: <><path d="M5 21V4m0 1c5-5 9 4 15 0v11c-6 4-10-5-15 0"/></>,
  gift: <><path d="M3 9h18v4H3zm2 4v8h14v-8M12 9v12m0-12H8a3 3 0 1 1 3-3l1 3zm0 0h4a3 3 0 1 0-3-3l-1 3z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></>,
  edit: <path d="m13 6 5 5M4 20l4.7-1 11-11a2 2 0 0 0 0-2.8l-.9-.9a2 2 0 0 0-2.8 0l-11 11L4 20z"/>,
  offline: <path d="M3 3l18 18M3 10a15 15 0 0 1 3-2m4-1a15 15 0 0 1 11 3M6 14a10 10 0 0 1 5-2m-2 5a5 5 0 0 1 6 0m-3 4h.01"/>,
  check: <path d="m5 12 4 4L19 6"/>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, size = 22, className }: { name: keyof typeof paths; size?: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
