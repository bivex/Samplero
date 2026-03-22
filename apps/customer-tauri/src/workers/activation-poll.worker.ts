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