import React from 'react';
import {Phone} from 'lucide-react';

interface AppFooterProps {
  variant?: 'bar' | 'compact';
}

export const AppFooter: React.FC<AppFooterProps> = ({variant = 'bar'}) => {
  if (variant === 'compact') {
    return (
      <footer className="px-4 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
        <div className="font-semibold text-slate-900 dark:text-slate-100">
          Route Creator
        </div>
        <p className="leading-relaxed">
          Multi-stop local discovery, live traffic routing, Car &amp; Bike voice navigation, and offline route caching.
        </p>
        <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700 dark:text-slate-300">
          <span>
            Idea by <strong className="font-semibold">Zubair Younus</strong>
          </span>
          <span aria-hidden="true">|</span>
          <a
            href="tel:+923212696712"
            className="inline-flex items-center gap-1 font-mono tabular-nums text-teal-700 dark:text-teal-400 hover:underline"
          >
            <Phone className="w-3 h-3" />
            +923212696712
          </a>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Generated from Google AI Studio
        </div>
      </footer>
    );
  }

  return (
    <footer className="hidden md:flex shrink-0 items-center justify-between gap-6 px-6 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400">
      <div className="flex items-center gap-2 min-w-0 truncate">
        <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          Route Creator
        </span>
        <span aria-hidden="true">·</span>
        <span className="truncate">
          Multi-stop discovery, real-time traffic routing &amp; Car/Bike voice navigation
        </span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
        <span>
          Idea by <strong className="font-semibold text-slate-800 dark:text-slate-200">Zubair Younus</strong>
        </span>
        <span aria-hidden="true">|</span>
        <a
          href="tel:+923212696712"
          className="inline-flex items-center gap-1 font-mono tabular-nums text-teal-700 dark:text-teal-400 hover:underline"
        >
          <Phone className="w-3 h-3" />
          +923212696712
        </a>
        <span aria-hidden="true">·</span>
        <span className="text-slate-500 dark:text-slate-400">
          Generated from Google AI Studio
        </span>
      </div>
    </footer>
  );
};
