// Icons copied from Lucide (https://lucide.dev, ISC license). 20px, stroke 2.
// They're decorative (aria-hidden); always put text next to them or give the
// button an aria-label.
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      // Dark Reader restyles stroked SVGs before hydration. Only this element's attributes are ignored.
      suppressHydrationWarning
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const CalendarIcon = (p: P) => (
  <Icon {...p}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></Icon>
);
export const CalendarCheckIcon = (p: P) => (
  <Icon {...p}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></Icon>
);
export const ClockIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>
);
export const MapPinIcon = (p: P) => (
  <Icon {...p}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const XIcon = (p: P) => (
  <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>
);
export const MenuIcon = (p: P) => (
  <Icon {...p}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Icon>
);
export const ChevronLeftIcon = (p: P) => (
  <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
);
export const ChevronRightIcon = (p: P) => (
  <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
);
export const ArrowLeftIcon = (p: P) => (
  <Icon {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Icon>
);
export const InfoIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Icon>
);
