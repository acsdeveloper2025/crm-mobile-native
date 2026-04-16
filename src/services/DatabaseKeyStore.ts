import * as Keychain from 'react-native-keychain';

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
    await Keychain.setGenericPassword(DB_KEY_USERNAME, generatedKey, {
      service: DB_KEY_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return generatedKey;
  }
}

export const DatabaseKeyStore = new DatabaseKeyStoreClass();
export default DatabaseKeyStore;
