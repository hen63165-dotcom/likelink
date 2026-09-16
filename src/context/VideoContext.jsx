import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { storage } from "../lib/storage.js";
import { publicVideos, writePublicVideos } from "../lib/videoSync.js";

const VideoContext = createContext(null);

/** מפתח אחסון מקומי — הרילס שורדים רענון ונראים בפיד */
const STORE_KEY = "likelink_videos_v1";
/** המפתח המשותף בענן — כל מבקר רואה את הרילס של כולם */
const CLOUD_KEY = "marketplace:videos";

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    // blob: URLs מתים אחרי רענון הדף — מסננים אותם כדי שהפיד לא יציג ריל שבור.
    // רילים שהועלו ל-Supabase (http/s) שורדים ונשארים.
    return Array.isArray(raw)
      ? raw.filter((v) => v && typeof v.videoUrl === "string" && !v.videoUrl.startsWith("blob:"))
      : [];
  } catch {
    return [];
  }
}

/** מיזוג לפי id: העדכונים הגלובליים מהענן מתווספים בלי לדרוך על סרטונים מקומיים */
function deletedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem("likelink_videos_deleted") || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function mergeVideos(localList, cloudList) {
  const gone = deletedIds();
  const byId = new Map();
  for (const v of [...(cloudList || []), ...(localList || [])]) {
    if (v && v.id && !gone.has(v.id)) byId.set(v.id, v);
  }
  return [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * Video/Reels Context
 * Allows creators to upload videos and tag products for shoppable content.
 * Videos are persisted locally + pushed to public reels rail in the feed.
 */
export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(() => loadStore());

  // לשמור על סנכרון בין לשוניות
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORE_KEY) setVideos(loadStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ☁️ Cloud sync — הרילס שייכים לכולם: מבקר חדש רואה כל ריל שאי פעם הועלה
  // (מפתח הענן `marketplace:videos`), הסרטונים המקומיים ממוזגים פנימה,
  // וכל כתיבה משתקפת לענן. Best-effort בלבד — בלי רשת האתר ממשיך לעבוד.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cloud = await storage.get(CLOUD_KEY, true);
        let list = cloud?.value;
        if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = null; } }
        const safeList = publicVideos(list);
        if (alive && safeList.length) {
          setVideos((prev) => mergeVideos(prev, safeList));
        }
      } catch { /* offline-safe: הרילס המקומיים ממשיכים לעבוד */ }
    })();
    return () => { alive = false; };
  }, []);

  // שיקוף כל שינוי מקומי לענן (ממתין רגע כדי לא להציף, ומדלג על כתיבה מיותרת)
  // נכתבות לענן רק רשומות ציבוריות עם כתובת http(s) — טיוטות blob: מקומיות
  // לעולם לא מתפרסמות, ותמונת מצב פרטית-בלבד לא מוחקת את הפיד המשותף.
  useEffect(() => {
    if (!videos.length) return;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const cloud = await storage.get(CLOUD_KEY, true);
          let prev = cloud?.value;
          if (typeof prev === "string") { try { prev = JSON.parse(prev); } catch { prev = null; } }
          const prevList = Array.isArray(prev) ? prev : [];
          const merged = mergeVideos(publicVideos(prevList), publicVideos(videos)).slice(0, 60);
          if (JSON.stringify(merged) !== JSON.stringify(publicVideos(prevList))) {
            await writePublicVideos(storage, CLOUD_KEY, merged);
          }
        } catch { /* best-effort — ננסה שוב בשינוי הבא */ }
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [videos]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(videos.slice(0, 60)));
    } catch { /* full / private mode */ }
  }, [videos]);

  const addVideo = useCallback((videoData) => {
    const newVideo = {
      id: Date.now().toString(),
      ...videoData,
      createdAt: Date.now(),
      views: 0,
      clicks: 0,
    };
    setVideos((prev) => [newVideo, ...prev]);
    return newVideo;
  }, []);

  const updateVideo = useCallback((videoId, updates) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, ...updates } : v))
    );
  }, []);

  const deleteVideo = useCallback((videoId) => {
    // Tombstone: מחיקה מקומית חייבת לשרוד מיזוג ענן — אחרת הסרטון "קם לתחייה".
    try {
      const raw = JSON.parse(localStorage.getItem("likelink_videos_deleted") || "[]");
      const next = [...new Set([...raw, videoId])].slice(-200);
      localStorage.setItem("likelink_videos_deleted", JSON.stringify(next));
    } catch { /* private mode */ }
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  }, []);

  const trackVideoView = useCallback((videoId) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, views: (v.views || 0) + 1 } : v))
    );
  }, []);

  const trackProductClick = useCallback((videoId, productId) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              clicks: (v.clicks || 0) + 1,
              productClicks: {
                ...v.productClicks,
                [productId]: (v.productClicks?.[productId] || 0) + 1,
              },
            }
          : v
      )
    );
  }, []);

  const getVideosByMarketer = useCallback(
    (marketerId) => {
      return videos.filter((v) => v.marketerId === marketerId);
    },
    [videos]
  );

  return (
    <VideoContext.Provider
      value={{
        videos,
        addVideo,
        updateVideo,
        deleteVideo,
        trackVideoView,
        trackProductClick,
        getVideosByMarketer,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
}

export function useVideos() {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error("useVideos must be used within VideoProvider");
  }
  return context;
}
