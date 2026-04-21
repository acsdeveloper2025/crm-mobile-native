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
}
