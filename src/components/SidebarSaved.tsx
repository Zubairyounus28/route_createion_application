import React from 'react';
import {
  Cloud,
  HardDrive,
  LogIn,
  Play,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {metersToMilesText, millisToDurationText} from '../lib/formatters';
import type {OfflineCachedTour, SyncedSchoolTour} from '../types/navigation';
import {PWAInstallButton} from './PWAInstallButton';

interface SidebarSavedProps {
  isSignedIn: boolean;
  userEmail: string | null;
  onSignIn: () => void;
  syncedTours: SyncedSchoolTour[];
  onLoadSyncedTour: (tour: SyncedSchoolTour) => void;
  onDeleteSyncedTour: (tourId: string) => void;
  offlineTours: OfflineCachedTour[];
  onLoadOfflineTour: (tour: OfflineCachedTour) => void;
  onRemoveOfflineTour: (tourId: string) => void;
  onClearOfflineCache: () => void;
  isOnline: boolean;
}

export const SidebarSaved: React.FC<SidebarSavedProps> = ({
  isSignedIn,
  userEmail,
  onSignIn,
  syncedTours,
  onLoadSyncedTour,
  onDeleteSyncedTour,
  offlineTours,
  onLoadOfflineTour,
  onRemoveOfflineTour,
  onClearOfflineCache,
  isOnline,
}) => {
  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
      {/* PWA Install + Account Sync Status */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Cross-Device Sync & Offline App
          </span>
          <PWAInstallButton />
        </div>

        {isSignedIn ? (
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
            <Cloud className="w-4 h-4 text-teal-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                Synced as {userEmail || 'Signed-in account'}
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Your school tours update automatically across all devices.
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2.5">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Sign in with Google to sync your saved multi-stop school tours across desktop, tablet, and mobile.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              disabled={!isOnline}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 px-4 md:px-3 py-2 md:py-1.5 rounded-lg bg-slate-900 dark:bg-teal-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in with Google
            </button>
          </div>
        )}
      </div>

      {/* Cloud Synced Tours */}
      {isSignedIn && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Synced School Tours ({syncedTours.length})
            </h3>
          </div>

          {syncedTours.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No synced tours yet. Save a multi-stop route from the Tour Stops tab.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {syncedTours.map(tour => (
                <li
                  key={tour.id}
                  className="p-3 bg-white dark:bg-slate-950 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {tour.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      From {tour.originName}
                    </div>
                    <div className="mt-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {tour.stops.length} stops · {tour.travelMode}
                      {typeof tour.totalDistanceMeters === 'number' &&
                        ` · ${metersToMilesText(tour.totalDistanceMeters)}`}
                      {typeof tour.totalDurationMillis === 'number' &&
                        ` · ${millisToDurationText(tour.totalDurationMillis)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLoadSyncedTour(tour)}
                      title="Load tour"
                      className="inline-flex items-center justify-center gap-1 min-h-[40px] md:min-h-0 px-3 md:px-2.5 py-2 md:py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSyncedTour(tour.id)}
                      aria-label={`Delete ${tour.title}`}
                      className="min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 p-2 md:p-1.5 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Offline Cached Routes */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Offline Cached Tours ({offlineTours.length})
            </h3>
          </div>
          {offlineTours.length > 0 && (
            <button
              type="button"
              onClick={onClearOfflineCache}
              className="text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              Clear cache
            </button>
          )}
        </div>

        {offlineTours.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Computed routes and school stops are cached locally on this device so you can navigate even without signal.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {offlineTours.map(item => (
              <li
                key={item.id}
                className="p-3 bg-white dark:bg-slate-950 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {!isOnline && (
                      <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.stops.length} stops · Cached{' '}
                    {new Date(item.cachedAt).toLocaleDateString()}
                  </div>
                  {item.route && (
                    <div className="mt-1 text-xs font-mono tabular-nums text-teal-700 dark:text-teal-400">
                      {millisToDurationText(item.route.totalDurationMillis)} ·{' '}
                      {metersToMilesText(item.route.totalDistanceMeters)} ·{' '}
                      {item.route.legs.reduce((acc, l) => acc + l.steps.length, 0)}{' '}
                      turn steps saved
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadOfflineTour(item)}
                    className="inline-flex items-center justify-center gap-1 min-h-[40px] md:min-h-0 px-3 md:px-2.5 py-2 md:py-1.5 rounded-md bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveOfflineTour(item.id)}
                    aria-label={`Remove cached ${item.title}`}
                    className="min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 p-2 md:p-1.5 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
