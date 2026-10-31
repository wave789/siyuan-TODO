import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3 } from './icons';
import { dateKey, formatDateTime, pad } from './model';

export function DateTimePicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const d = new Date(value);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  function setPart(part: 'date' | 'hour' | 'minute', next: string | number) {
    const updated = new Date(value);
    if (part === 'date') {
      const parts = String(next).split('-').map(Number);
      if (parts.length !== 3 || parts.some(v => !Number.isFinite(v))) return;
      updated.setFullYear(parts[0], parts[1] - 1, parts[2]);
    } else if (part === 'hour') updated.setHours(Number(next));
    else updated.setMinutes(Number(next));
    updated.setSeconds(0, 0);
    if (!Number.isNaN(updated.getTime())) onChange(updated.toISOString());
  }
  return <div className="sx-date-picker" ref={root}>
    <button type="button" className={`date-trigger ${open ? 'is-open' : ''}`} onClick={() => setOpen(!open)} aria-label={`选择${label}`} aria-expanded={open}>
      <CalendarDays size={16} /><span>{formatDateTime(value)}</span><ChevronDown size={14} />
    </button>
    {open && <div className="date-popover" role="group" aria-label={`${label}选择器`}>
      <label className="picker-date-label">日期<input aria-label={`${label}日期`} type="date" value={dateKey(d)} onChange={e => setPart('date', e.target.value)} min="1900-01-01" max="2100-12-31" /></label>
      <div className="wheel-heading"><Clock3 size={14} /><span>滚动选择时间</span><small>时 / 分</small></div>
      <div className="time-wheels">
        <TimeWheel count={24} value={d.getHours()} label={`${label}小时`} onChange={hour => setPart('hour', hour)} />
        <span className="wheel-colon">:</span>
        <TimeWheel count={60} value={d.getMinutes()} label={`${label}分钟`} onChange={minute => setPart('minute', minute)} />
      </div>
      <button type="button" className="picker-done" onClick={() => setOpen(false)}><Check size={14} /> 确定时间</button>
    </div>}
  </div>;
}

function TimeWheel({ count, value, label, onChange }: { count: number; value: number; label: string; onChange: (value: number) => void }) {
  const wheel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, onChange }); latest.current = { value, onChange };
  useEffect(() => { if (wheel.current) wheel.current.scrollTop = value * 32; }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="time-wheel" ref={wheel} role="listbox" aria-label={label} onScroll={() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = Math.max(0, Math.min(count - 1, Math.round((wheel.current?.scrollTop || 0) / 32)));
      if (next !== latest.current.value) latest.current.onChange(next);
    }, 120);
  }} onKeyDown={event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); onChange(Math.max(0, Math.min(count - 1, value + (event.key === 'ArrowUp' ? -1 : 1))));
    }
  }}>
    {Array.from({ length: count }, (_, index) => <button type="button" role="option" aria-selected={value === index} tabIndex={value === index ? 0 : -1} className={value === index ? 'wheel-selected' : ''} key={index} onClick={() => onChange(index)}>{pad(index)}</button>)}
  </div>;
}
