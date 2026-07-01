/** Reject if promise does not settle within ms. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise
      .then((v) => {
        window.clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(timer);
        reject(e);
      });
  });
}
