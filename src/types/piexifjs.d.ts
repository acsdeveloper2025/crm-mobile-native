// Minimal ambient types for piexifjs — the package ships without
// @types/* so we declare the surface we use (remove) here. See the
// upstream README at https://github.com/hMatoba/piexifjs for the full
// API reference.

declare module 'piexifjs' {
  /**
   * Strip every Exif IFD from a JPEG supplied as a base64 string
   * (with or without the `data:image/jpeg;base64,` prefix). Returns
   * the cleaned JPEG in the same shape as the input.
   */
  export function remove(jpegBase64: string): string;

  /**
   * Parse the Exif of a JPEG (base64, with or without data-URI prefix)
   * into IFD dictionaries keyed by tag number. Throws when the input has
   * no Exif block. We only read `0th[ImageIFD.Orientation]`.
   */
  export function load(jpegBase64: string): {
    '0th'?: Record<number, unknown>;
    Exif?: Record<number, unknown>;
    GPS?: Record<number, unknown>;
    [key: string]: unknown;
  };

  /** Tag-number constants for the 0th IFD (we use `Orientation`). */
  export const ImageIFD: { Orientation: number; [key: string]: number };
}
