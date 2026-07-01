"use client";

import { useEffect, useState } from "react";
import type { EducationVideoLink } from "@/lib/education-links";
import {
  getDiagnosticsFormUrl,
  getEducationVideos,
} from "@/lib/education-links";

type EducationConfigState = {
  videos: EducationVideoLink[];
  diagnosticsFormUrl: string | null;
  loading: boolean;
};

export function useEducationConfig(): EducationConfigState {
  const [state, setState] = useState<EducationConfigState>(() => ({
    videos: getEducationVideos(),
    diagnosticsFormUrl: getDiagnosticsFormUrl(),
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/education/config", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          videos?: EducationVideoLink[];
          diagnosticsFormUrl?: string | null;
        };
        if (cancelled) return;
        const videos =
          data.videos && data.videos.length > 0 ? data.videos : getEducationVideos();
        setState({
          videos,
          diagnosticsFormUrl:
            data.diagnosticsFormUrl ?? getDiagnosticsFormUrl(),
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setState({
            videos: getEducationVideos(),
            diagnosticsFormUrl: getDiagnosticsFormUrl(),
            loading: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
