import React, { createContext, useContext, useState, useCallback } from "react";

const VideoContext = createContext(null);

/**
 * Video/Reels Context
 * Allows creators to upload videos and tag products for shoppable content
 */
export function VideoProvider({ children }) {
  const [videos, setVideos] = useState([]);

  const addVideo = useCallback((videoData) => {
    const newVideo = {
      id: Date.now().toString(),
      ...videoData,
      createdAt: Date.now(),
      views: 0,
      clicks: 0,
    };
    setVideos((prev) => [...prev, newVideo]);
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
