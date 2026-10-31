import type { SVGProps } from 'react';
import drawings from './icon-artwork.json';

/** Original project artwork. No external icon package or network assets. */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
type Drawing = { paths?: string[]; circles?: number[][]; rects?: number[][] };
function makeIcon(name: keyof typeof drawings) {
  const drawing: Drawing = drawings[name];
  function Icon({ size = 20, strokeWidth = 1.7, ...props }: IconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-todo-icon={name} {...props}>
      {drawing.paths?.map((d, i) => <path key={`p${i}`} d={d} />)}
      {drawing.circles?.map(([cx, cy, r], i) => <circle key={`c${i}`} cx={cx} cy={cy} r={r} />)}
      {drawing.rects?.map(([x, y, width, height, rx], i) => <rect key={`r${i}`} x={x} y={y} width={width} height={height} rx={rx} />)}
    </svg>;
  }
  Icon.displayName = name;
  return Icon;
}
export const TodoMark = makeIcon('TodoMark');
export const Check = makeIcon('Check');
export const CheckCheck = makeIcon('CheckCheck');
export const Plus = makeIcon('Plus');
export const X = makeIcon('X');
export const ChevronDown = makeIcon('ChevronDown');
export const ChevronLeft = makeIcon('ChevronLeft');
export const ChevronRight = makeIcon('ChevronRight');
export const ArrowRight = makeIcon('ArrowRight');
export const ArrowUpRight = makeIcon('ArrowUpRight');
export const ArrowDownWideNarrow = makeIcon('ArrowDownWideNarrow');
export const ArrowDownToLine = makeIcon('ArrowDownToLine');
export const ArrowUpFromLine = makeIcon('ArrowUpFromLine');
export const Download = makeIcon('Download');
export const Upload = makeIcon('Upload');
export const ImportFile = makeIcon('ImportFile');
export const ExportFile = makeIcon('ExportFile');
export const DayPlan = makeIcon('DayPlan');
export const EmptyTodo = makeIcon('EmptyTodo');
export const Circle = makeIcon('Circle');
export const CircleCheck = makeIcon('CircleCheck');
export const CheckCircle2 = makeIcon('CheckCircle2');
export const CircleHelp = makeIcon('CircleHelp');
export const Clock3 = makeIcon('Clock3');
export const History = makeIcon('History');
export const Bell = makeIcon('Bell');
export const CalendarDays = makeIcon('CalendarDays');
export const CalendarClock = makeIcon('CalendarClock');
export const Search = makeIcon('Search');
export const ListTodo = makeIcon('ListTodo');
export const LayoutGrid = makeIcon('LayoutGrid');
export const Settings2 = makeIcon('Settings2');
export const PanelLeftClose = makeIcon('PanelLeftClose');
export const PanelLeftOpen = makeIcon('PanelLeftOpen');
export const Ellipsis = makeIcon('Ellipsis');
export const Eye = makeIcon('Eye');
export const EyeOff = makeIcon('EyeOff');
export const FileText = makeIcon('FileText');
export const FileJson = makeIcon('FileJson');
export const AlignLeft = makeIcon('AlignLeft');
export const FolderOpen = makeIcon('FolderOpen');
export const HardDrive = makeIcon('HardDrive');
export const Save = makeIcon('Save');
export const Tag = makeIcon('Tag');
export const Trash2 = makeIcon('Trash2');
export const ShieldCheck = makeIcon('ShieldCheck');
export const Sprout = makeIcon('Sprout');
export const Flower2 = makeIcon('Flower2');
export const LoaderCircle = makeIcon('LoaderCircle');
