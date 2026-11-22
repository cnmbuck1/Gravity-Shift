import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Taptic feedback through Capacitor Haptics (Core Haptics on iPhone). In a browser it falls
 * back to the Vibration API where one exists; iOS Safari has none, so it is silent there.
 * Calls are throttled so a ball grinding along a wall can't buzz continuously.
 */
export class HapticsManager {
  enabled = true;
  private lastImpact = 0;
  private lastFail = -Infinity;

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

  /**
   * A mistake (void, hazard, laser, pulse...): one firm buzz, clearly different from the light
   * wall taps, so a miss is felt before the respawn. Wall taps are held off while it plays.
   */
  fail(): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastFail < 600) return;
    this.lastFail = now;
    this.lastImpact = now + 250;
    Haptics.vibrate({ duration: 280 }).catch(() => {
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    });
  }

  shift(): void {
    if (this.enabled) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  }
}
