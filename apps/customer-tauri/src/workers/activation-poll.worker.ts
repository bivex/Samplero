/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:33
 * Last Updated: 2026-03-22 02:33
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

let pollTimer: number | null = null;

type StartMessage = {
  type: "start";
  intervalMs?: number;
  immediate?: boolean;
};

type StopMessage = {
  type: "stop";
};

type WorkerMessage = StartMessage | StopMessage;

const stopPolling = () => {
  if (pollTimer !== null) {
    self.clearInterval(pollTimer);
    pollTimer = null;
  }
};

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === "stop") {
    stopPolling();
    return;
  }

  stopPolling();
  if (event.data.immediate !== false) {
    self.postMessage({ type: "poll" });
  }
  pollTimer = self.setInterval(() => {
    self.postMessage({ type: "poll" });
  }, event.data.intervalMs ?? 4000);
};