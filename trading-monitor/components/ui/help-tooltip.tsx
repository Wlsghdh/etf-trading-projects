'use client';

import { useState } from 'react';

interface HelpItem {
  color?: string;
  label: string;
  description: string;
}

interface HelpTooltipProps {
  title: string;
  items: HelpItem[];
}

export function HelpTooltip({ title, items }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-5 w-5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-[10px] font-bold transition-colors"
        title="도움말"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 w-72 rounded-lg border border-border bg-popover p-4 shadow-lg">
            <h4 className="text-sm font-semibold mb-3">{title}</h4>
            <div className="space-y-2.5">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  {item.color && (
                    <div className={`h-3 w-3 rounded-sm shrink-0 mt-0.5 ${item.color}`} />
                  )}
                  <div>
                    <span className="text-xs font-medium">{item.label}</span>
                    <p className="text-[11px] text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
