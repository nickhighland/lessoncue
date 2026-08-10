/**
 * HLS is loaded dynamically in WebPlayer.tsx. The upstream declaration bundle
 * is intentionally very broad and can make TypeScript recurse indefinitely on
 * some Node/TypeScript combinations. Keep the compile-time surface narrow;
 * Vite still resolves the real hls.js package for the browser build.
 */
declare module "hls.js" {
  interface HlsErrorData {
    fatal?: boolean;
  }

  type HlsListener = (event?: unknown, data: HlsErrorData) => void;

  class Hls {
    static readonly Events: {
      readonly MANIFEST_PARSED: string;
      readonly ERROR: string;
    };

    static isSupported(): boolean;

    constructor(config?: Record<string, unknown>);
    loadSource(source: string): void;
    attachMedia(media: HTMLMediaElement): void;
    on(event: string, listener: HlsListener): void;
    destroy(): void;
  }

  export default Hls;
}
