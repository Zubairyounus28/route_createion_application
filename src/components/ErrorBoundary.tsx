import React, {Component, type ErrorInfo, type ReactNode} from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({hasError: false, errorMessage: ''});
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              CampusRoute encountered an unexpected issue while syncing or rendering navigation data.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 break-words max-h-36 overflow-auto">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-5 w-full px-4 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              Reload CampusRoute
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
