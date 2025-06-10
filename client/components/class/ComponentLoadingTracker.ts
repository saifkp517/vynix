export class ComponentLoadingTracker {
  private static instance: ComponentLoadingTracker;
  private componentStates: Map<string, {
    status: 'loading' | 'loaded' | 'failed' | 'unloaded';
    timestamp: Date;
    loadTime?: number;
    error?: string;
  }> = new Map();
  private listeners: Map<string, (componentName: string, status: 'loading' | 'loaded' | 'failed' | 'unloaded', details: { loadTime?: number; error?: string }) => void> = new Map(); // Use Map for unique listener IDs

  static getInstance(): ComponentLoadingTracker {
    if (!ComponentLoadingTracker.instance) {
      ComponentLoadingTracker.instance = new ComponentLoadingTracker();
    }
    return ComponentLoadingTracker.instance;
  }

  // Add listener with a unique ID
  onStatusChange(id: string, callback: (componentName: string, status: 'loading' | 'loaded' | 'failed' | 'unloaded', details: { loadTime?: number; error?: string }) => void) {
    this.listeners.set(id, callback);
  }

  // Remove listener by ID
  offStatusChange(id: string) {
    this.listeners.delete(id);
  }

  // Notify all listeners
  private notifyListeners(componentName: string, status: 'loading' | 'loaded' | 'failed' | 'unloaded', details: { loadTime?: number; error?: string }) {
    this.listeners.forEach((callback) => callback(componentName, status, details));
  }

  logStatus(componentName: string, status: 'loading' | 'loaded' | 'failed' | 'unloaded', error?: Error) {
    const currentTime = new Date();
    const existingEntry = this.componentStates.get(componentName);
    
    // Avoid redundant status updates
    if (existingEntry?.status === status) return;

    let loadTime: number | undefined;
    if (status === 'loaded' && existingEntry?.status === 'loading') {
      loadTime = currentTime.getTime() - existingEntry.timestamp.getTime();
    }

    const details = {
      status,
      timestamp: currentTime,
      loadTime,
      error: error?.message
    };

    this.componentStates.set(componentName, details);
    this.notifyListeners(componentName, status, { loadTime, error: error?.message });

    const timeStr = currentTime.toISOString().split('T')[1].slice(0, 8);
    const loadTimeStr = loadTime ? ` (${loadTime}ms)` : '';
    const errorStr = error ? ` - ERROR: ${error.message}` : '';
    
    console.log(`🔄 [${timeStr}] ${componentName}: ${status.toUpperCase()}${loadTimeStr}${errorStr}`);
  }

  logSummary() {
    const stats = {
      loading: 0,
      loaded: 0,
      failed: 0,
      unloaded: 0
    };

    console.group('📊 Component Loading Summary');
    this.componentStates.forEach((state, name) => {
      stats[state.status]++;
      const statusIcon = {
        loading: '⏳',
        loaded: '✅',
        failed: '❌',
        unloaded: '📤'
      }[state.status];

      const timeInfo = state.loadTime ? ` (${state.loadTime}ms)` : '';
      const errorInfo = state.error ? ` - ${state.error}` : '';
      console.log(`${statusIcon} ${name}: ${state.status}${timeInfo}${errorInfo}`);
    });

    console.log(`\nTotals: ✅${stats.loaded} ⏳${stats.loading} ❌${stats.failed} 📤${stats.unloaded}`);
    console.groupEnd();
  }

  getComponentStatus(componentName: string) {
    return this.componentStates.get(componentName);
  }

  getAllStatuses() {
    return Array.from(this.componentStates.entries());
  }
}