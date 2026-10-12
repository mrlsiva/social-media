/**
 * BullMQ waits for Redis to become ready before running a command. When Redis is
 * down that wait never ends, so HTTP handlers bound every queue call with a timeout
 * and degrade gracefully (jobs are idempotent: a late enqueue after a timeout is
 * ignored by the processors because the DB row is already in a terminal state).
 */
export function withQueueTimeout<T>(operation: Promise<T>, ms = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Job queue (Redis) is not reachable')), ms);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
