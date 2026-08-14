import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-stone-50 p-6 text-stone-800">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 font-bold text-xl">
              !
            </div>
            <h2 className="text-xl font-bold text-stone-900">Something went wrong</h2>
            <p className="text-sm text-stone-600">
              An unexpected error occurred while loading the application interface.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs bg-stone-100 text-rose-700 p-3 rounded-lg overflow-x-auto text-left">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
