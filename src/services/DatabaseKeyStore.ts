import * as Keychain from 'react-native-keychain';
import { Logger } from '../utils/logger';

const TAG = 'DatabaseKeyStore';
const DB_KEY_SERVICE = 'crm-mobile-native.database-encryption-key';
const DB_KEY_USERNAME = 'database';

const isValidEncryptionKey = (key: string): boolean =>
  /^[A-Fa-f0-9]{64}$/.test(key);

const generateEncryptionKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

class DatabaseKeyStoreClass {
  async getOrCreateKey(): Promise<string> {
    const existing = await Keychain.getGenericPassword({
      service: DB_KEY_SERVICE,
    });

    if (existing) {
      const key = existing.password.trim();
      if (!isValidEncryptionKey(key)) {
        throw new Error(
          'Stored database encryption key is invalid. Clear the app data and sign in again.',
        );
      }
      return key;
    }

    const generatedKey = generateEncryptionKey();
    // 2026-04-21 v1.0.3 fix: do NOT request `SECURITY_LEVEL.SECURE_HARDWARE`.
    // On some Samsung devices the Knox / StrongBox policy causes
    // `setGenericPassword({ securityLevel: SECURE_HARDWARE })` to
    // silently resolve to `false` (no-op) without throwing. The round-2
    // S8 fix didn't check that return value, so the app happily ran
    // with an un-stored key on first launch and then generated a
    // DIFFERENT key on second launch → the existing DB file couldn't
    // decrypt → SQLITE_CORRUPT[11] ("database disk image is
    // malformed"). Samsung-only regression.
    //
    // The DB master key is already protected by:
    //   - ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY — key cannot leave
    //     this device and is inaccessible while the screen is locked.
    //   - The OS keystore default (hardware-backed when available,
    //     software fallback silently when not).
    // The incremental security value of explicit SECURE_HARDWARE was
    // marginal on a DB-encryption key (wraps offline cache, not user
    // credentials). Trading it for cross-OEM reliability is the right
    // call.
    const result = await Keychain.setGenericPassword(
      DB_KEY_USERNAME,
      generatedKey,
      {
        service: DB_KEY_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );

    // Defensive: if the library ever returns `false` (store failed
    // silently under some future OEM policy), throw so the caller sees
    // the failure NOW, not on next launch with a wrong-key DB.
    if (result === false) {
      throw new Error(
        'Failed to store database encryption key in the system keychain',
      );
    }
    Logger.info(TAG, 'Database encryption key generated and stored');
    return generatedKey;
  }

  /**
   * Remove the stored key. Called from the SQLITE_CORRUPT recovery path
   * in DatabaseService so that a restored-but-unreadable DB file can be
   * paired with a freshly minted key on the next getOrCreateKey() call.
   * Silently swallows errors — if the keychain is unreachable, the
   * retry will still succeed because SQLCipher generates a fresh file.
   */
  async reset(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: DB_KEY_SERVICE });
    } catch {
      // Non-fatal: recovery continues with the existing (or regenerated) key.
    }
  }
}

export const DatabaseKeyStore = new DatabaseKeyStoreClass();
export default DatabaseKeyStore;
