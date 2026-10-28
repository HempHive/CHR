import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ArchiveProvider } from '@/app/archive-context';
import type { ArchiveStore } from '@/persistence/store';
import { Shell } from '@/ui/shell';

export function App({ store }: { store: ArchiveStore }) {
  return (
    <AppErrorBoundary>
      <ArchiveProvider store={store}>
        <Shell />
      </ArchiveProvider>
    </AppErrorBoundary>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="boot">
          <h1>KINSHIP hit a problem</h1>
          <p>{this.state.message}</p>
          <p>The archive in this browser has not been deleted.</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
