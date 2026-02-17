// ──────────────────────────────────────────
// GRABH Download Queue
// ──────────────────────────────────────────

interface QueueJob {
  id: string;
  url: string;
  resolve: (filePath: string) => void;
  reject: (error: Error) => void;
}

export class DownloadQueue {
  private queue: QueueJob[] = [];
  private active = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a download job to the queue. Returns a promise that resolves
   * when the job completes.
   */
  enqueue(
    url: string,
    downloadFn: (url: string) => Promise<string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.queue.push({ id, url, resolve, reject });
      console.log(`  📋 Queue: added job ${id} (${this.queue.length} waiting, ${this.active} active)`);
      this.processNext(downloadFn);
    });
  }

  private async processNext(downloadFn: (url: string) => Promise<string>) {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    this.active++;

    console.log(`  ⬇  Queue: processing ${job.id} (${this.active}/${this.maxConcurrent} slots)`);

    try {
      const filePath = await downloadFn(job.url);
      job.resolve(filePath);
    } catch (err: any) {
      job.reject(err);
    } finally {
      this.active--;
      console.log(`  ✓  Queue: finished ${job.id} (${this.active}/${this.maxConcurrent} slots, ${this.queue.length} waiting)`);
      this.processNext(downloadFn);
    }
  }

  /** Current queue status */
  get status() {
    return {
      waiting: this.queue.length,
      active: this.active,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
export const downloadQueue = new DownloadQueue(
  parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || "2", 10)
);
