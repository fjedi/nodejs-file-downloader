import http from "http";
export default Downloader;

interface DownloaderConfig {
  url: string;
  directory?: string;
  fileName?: string;
  cloneFiles?: boolean;
  skipExistingFileName?: boolean;
  timeout?: number;
  maxAttempts?: number;
  delayBetweenAttempts?: number;
  headers?: object;
  httpsAgent?: any;
  proxy?: string;
  onAttempt?(attemptNumber: number): void | Promise<void>;
  onError?(e: Error): void | Promise<void>;
  onResponse?(r: http.IncomingMessage): boolean | void;
  onBeforeSave?(finalName: string): string | void;
  onProgress?(percentage: string, chunk: object, remaningSize: number): void;
  shouldStop?(e: Error): boolean | void | Promise<void>;
  shouldBufferResponse?: boolean;
  useSynchronousMode?: boolean;
}

interface DownloaderReport {
  downloadStatus: "COMPLETE" | "ABORTED";
  filePath: string | null;
}

declare class Downloader {
  constructor(config: DownloaderConfig);

  download(): Promise<DownloaderReport>;

  cancel(): void;
}
