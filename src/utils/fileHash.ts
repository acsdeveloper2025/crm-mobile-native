// SHA-256 hash of a file's bytes for evidence-grade tamper detection on
// captured verification photos (deep-audit D6/D17).
//
// 2026-05-31 (Phase 1, capture-perf): switched from crypto-js over a
// base64 read to react-native-fs's NATIVE hash. The old path did
// `RNFS.readFile(path,'base64')` (a ~1.33× heap string) then hashed in
// pure JS on the bridge thread (~300ms + a multi-MB JS-heap spike per
// 5MB photo). RNFS.hash computes the digest natively from the file
// stream — no base64 string, no JS-thread compute, a fraction of the
// time and memory. Same SHA-256, identical 64-char lowercase-hex output,
// so the backend integrity check and any duplicate detection are
// unaffected. RNFS.hash supports 'sha256' on both platforms
// (RNFSManager: algorithms.put("sha256","SHA-256")).
//
// Failure mode unchanged: if the hash throws, we return null. Caller
// persists null on the row. Backend treats NULL as "client could not
// hash" — not a tamper signal, just an unverifiable photo. Better to
// keep the photo than to fail the entire capture over a hash compute.

import RNFS from 'react-native-fs';
import { Logger } from './logger';

const TAG = 'fileHash';

/**
 * Compute SHA-256 hex digest of a file's bytes (native).
 *
 * @param path absolute file path (no `file://` prefix)
 * @returns 64-char lowercase hex digest, or null if hashing failed.
 */
export async function sha256OfFile(path: string): Promise<string | null> {
  try {
    const digest = (await RNFS.hash(path, 'sha256')).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      Logger.warn(TAG, `Unexpected SHA-256 shape for ${path}`);
      return null;
    }
    return digest;
  } catch (err) {
    Logger.warn(TAG, `SHA-256 of file failed: ${path}`, err);
    return null;
  }
}
