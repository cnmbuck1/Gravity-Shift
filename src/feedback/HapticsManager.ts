import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Taptic feedback through Capacitor Haptics (Core Haptics on iPhone). In a browser it falls
 * back to the Vibration API where one exists; iOS Safari has none, so it is silent there.
 * Calls are throttled so a ball grinding along a wall can't buzz continuously.
 */
export class HapticsManager {
  enabled = true;
  private lastImpact = 0;

  impact(strength: number): void {
    const now = performance.now();
    if (!this.enabled || now - this.lastImpact < 120) return;
    this.lastImpact = now;
    const style = strength > 6 ? ImpactStyle.Heavy : strength > 3 ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  }

  success(): void {
    if (this.enabled) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }

  warning(): void {
    if (this.enabled) Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  }

  shift(): void {
    if (this.enabled) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  }
}
