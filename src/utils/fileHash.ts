// 2026-04-28 deep-audit fix (D6/D17): SHA-256 hash of a file's bytes for
// evidence-grade tamper detection on captured verification photos.
//
// Implementation choice: crypto-js (already pulled transitively by
// react-native-pdf, now declared as direct dep). Pure-JS, no native
// install — zero risk of breaking the existing op-sqlite/SQLCipher
// NDK build chain.
//
// Performance note: 5MB photo → ~300ms on mid-tier Android (Galaxy A17
// class). Called AFTER GPS resolves on the capture path, BEFORE DB
// insert. The user has already seen the watermark preview at that
// point so this latency is invisible inside the existing capture wait.
//
// Heap note: RNFS.readFile(path, 'base64') produces a string ~1.33×
// the file size (5MB photo → ~7MB base64 string). Same heap footprint
// as the existing EXIF strip path in `AttachmentService.stripExifMetadata`
// — no new memory pressure beyond what the app already tolerates.
//
// Failure mode: if read or hash throws, we return null. Caller persists
// null on the row. Backend treats NULL as "client could not hash" —
// not a tamper signal, just an unverifiable photo. Better to keep the
// photo than to fail the entire capture over a hash compute.

import RNFS from 'react-native-fs';
import CryptoJS from 'crypto-js';
import { Logger } from './logger';

const TAG = 'fileHash';

/**
 * Compute SHA-256 hex digest of a file's bytes.
 *
 * @param path absolute file path (no `file://` prefix)
 * @returns 64-char lowercase hex digest, or null if read/hash failed.
 */
export async function sha256OfFile(path: string): Promise<string | null> {
  try {
    const base64 = await RNFS.readFile(path, 'base64');
    // CryptoJS treats input as a UTF-8 string by default. We need the raw
    // bytes — parse the base64 back into a WordArray and hash that.
    const wordArray = CryptoJS.enc.Base64.parse(base64);
    const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      Logger.warn(TAG, `Unexpected SHA-256 shape for ${path}`);
      return null;
    }
    return hash;
  } catch (err) {
    Logger.warn(TAG, `SHA-256 of file failed: ${path}`, err);
    return null;
  }
}
