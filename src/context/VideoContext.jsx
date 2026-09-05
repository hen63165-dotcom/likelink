import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const VideoContext = createContext(null);

/** מפתח אחסון מקומי — הרילס שורדים רענון ונראים בפיד */
const STORE_KEY = "likelink_videos_v1";

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
