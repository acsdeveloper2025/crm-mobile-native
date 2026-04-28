// 2026-04-27 deep-audit fix (D12): hook surfaces the OS-level reduce-motion
// preference so animation-heavy components can skip / shorten transitions
// for users who have enabled "Reduce Motion" in Accessibility settings.
//
// Usage:
//   const reduceMotion = useReducedMotion();
//   if (reduceMotion) {
//     fadeAnim.setValue(1); // skip the timing
//   } else {
//     Animated.timing(fadeAnim, { ... }).start();
//   }
//
// Returns false until the initial AccessibilityInfo.isReduceMotionEnabled()
// resolves, then re-renders with the live value. Listens for runtime
// changes (user toggles the setting while the app is open).

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) {
          setReduceMotion(value);
        }
      })
      .catch(() => {
        // Some platforms / RN versions throw — default to false
        // (allow animations) rather than fail-open to a no-animation
        // state the user didn't ask for.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => {
        if (mounted) {
          setReduceMotion(value);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
