import { useEffect, useRef } from "react";

const CHECK_INTERVAL_MS = 30_000;
const ENTRY_PATTERN = /\/assets\/index-[^"'`]+\.js/;

function getCurrentEntryPath() {
  if (typeof document === "undefined") {
    return null;
  }

  const entryScript = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')
  ).find((script) => ENTRY_PATTERN.test(script.src));

  if (!entryScript) {
    return null;
  }

  return new URL(entryScript.src, window.location.origin).pathname;
}

async function getLatestEntryPath(baseUrl: string) {
  const entryUrl = new URL(baseUrl, window.location.origin);
  const response = await fetch(entryUrl, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const match = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/i);
  if (!match) {
    return null;
  }

  return new URL(match[1], window.location.origin).pathname;
}

export function useAppVersionSync(baseUrl: string) {
  const lastCheckRef = useRef(0);
  const reloadTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const runCheck = async () => {
      if (reloadTriggeredRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) {
        return;
      }
      lastCheckRef.current = now;

      const currentEntryPath = getCurrentEntryPath();
      if (!currentEntryPath) {
        return;
      }

      try {
        const latestEntryPath = await getLatestEntryPath(baseUrl);
        if (!latestEntryPath || latestEntryPath === currentEntryPath) {
          return;
        }

        reloadTriggeredRef.current = true;
        window.location.reload();
      } catch {
        // Ignore transient failures.
      }
    };

    const handleFocus = () => {
      void runCheck();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runCheck();
      }
    };

    void runCheck();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [baseUrl]);
}
