import { useState, useRef, useCallback, useEffect } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { 
  History, 
  Trash2, 
  Video,
  Sun,
  Moon
} from "lucide-react";

// Parse YouTube URL to extract video ID
function parseYouTubeUrl(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Format seconds to MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Parse MM:SS to seconds
function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

// Get video title from URL (simplified)
function getVideoTitle(videoId) {
  return `Video ${videoId?.slice(0, 6) || 'Unknown'}`;
}

function App() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [startTimeInput, setStartTimeInput] = useState("0:00");
  const [endTimeInput, setEndTimeInput] = useState("0:00");
  const [playerReady, setPlayerReady] = useState(false);
  const [theme, setTheme] = useLocalStorage("loop-studio-theme", "dark");
  
  const [recentVideos, setRecentVideos] = useLocalStorage("loop-studio-history", []);
  
  const playerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) return;
    
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }, []);

  // Initialize player when videoId changes
  useEffect(() => {
    if (!videoId) return;
    
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    setPlayerReady(false);

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          controls: 1, // Show YouTube controls
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            setPlayerReady(true);
            const dur = event.target.getDuration();
            setDuration(dur);
            setLoopEnd(dur);
            setEndTimeInput(formatTime(dur));
            event.target.setPlaybackRate(playbackRate);
            event.target.playVideo();
            setPlaying(true);
          },
          onStateChange: (event) => {
            if (event.data === 1) {
              setPlaying(true);
            } else if (event.data === 2 || event.data === 0) {
              setPlaying(false);
            }
          }
        }
      });
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, playbackRate]);

  // Auto-loop logic - always active when loopEnd > loopStart
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (playerReady && playing) {
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const time = playerRef.current.getCurrentTime();
          setCurrentTime(time);

          // Auto-loop when we have valid start/end times
          const start = parseTime(startTimeInput);
          const end = parseTime(endTimeInput);
          if (end > start && time >= end) {
            playerRef.current.seekTo(start, true);
          }
        }
      }, 200);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [playerReady, playing, startTimeInput, endTimeInput]);

  // Handle URL submission
  const handleLoadVideo = useCallback(() => {
    const id = parseYouTubeUrl(url);
    if (id) {
      setVideoId(id);
      setLoopStart(0);
      setLoopEnd(0);
      setStartTimeInput("0:00");
      setEndTimeInput("0:00");
      toast.success("Video loaded!");
    } else {
      toast.error("Invalid YouTube URL");
    }
  }, [url]);

  // Save to history when video plays
  useEffect(() => {
    if (videoId && duration > 0) {
      const start = parseTime(startTimeInput);
      const end = parseTime(endTimeInput);
      const newEntry = {
        id: videoId,
        url: `https://youtube.com/watch?v=${videoId}`,
        title: getVideoTitle(videoId),
        timestamp: Date.now(),
        loopStart: start,
        loopEnd: end,
        playbackRate
      };
      
      setRecentVideos(prev => {
        const filtered = prev.filter(v => v.id !== videoId);
        return [newEntry, ...filtered].slice(0, 5);
      });
    }
  }, [videoId, duration, startTimeInput, endTimeInput, playbackRate, setRecentVideos]);

  // Load from history
  const handleLoadFromHistory = useCallback((video) => {
    setUrl(video.url);
    setVideoId(video.id);
    if (video.loopStart !== undefined) {
      setStartTimeInput(formatTime(video.loopStart));
    }
    if (video.loopEnd !== undefined) {
      setEndTimeInput(formatTime(video.loopEnd));
    }
    if (video.playbackRate) {
      setPlaybackRate(video.playbackRate);
    }
    toast.success("Video loaded from history");
  }, []);

  // Clear history
  const handleClearHistory = useCallback(() => {
    setRecentVideos([]);
    toast.info("History cleared");
  }, [setRecentVideos]);

  // Set current time as start/end
  const setCurrentAsStart = useCallback(() => {
    setStartTimeInput(formatTime(currentTime));
    toast.success(`Start: ${formatTime(currentTime)}`);
  }, [currentTime]);

  const setCurrentAsEnd = useCallback(() => {
    setEndTimeInput(formatTime(currentTime));
    toast.success(`End: ${formatTime(currentTime)}`);
  }, [currentTime]);

  // Handle speed change
  const handleSpeedChange = useCallback((speed) => {
    const clampedSpeed = Math.max(0.25, Math.min(2, speed));
    const roundedSpeed = Math.round(clampedSpeed * 100) / 100;
    setPlaybackRate(roundedSpeed);
    if (playerRef.current && playerReady) {
      playerRef.current.setPlaybackRate(roundedSpeed);
    }
  }, [playerReady]);

  const handleSpeedSlider = useCallback((value) => {
    handleSpeedChange(value[0]);
  }, [handleSpeedChange]);

  // Speed presets
  const speedPresets = [0.5, 0.75, 1, 1.5, 2];

  return (
    <div className={`app-container ${theme}`}>
      <div className="noise-overlay" />
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: theme === 'dark' ? '#18181b' : '#ffffff',
            border: theme === 'dark' ? '1px solid #27272a' : '1px solid #e4e4e7',
            color: theme === 'dark' ? '#fafafa' : '#18181b'
          }
        }}
      />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 min-h-screen flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between fade-in">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight heading-text uppercase">
              Loop Studio
            </h1>
            <p className="muted-text text-xs tracking-wide">
              Practice. Learn. Repeat.
            </p>
          </div>
          <Button
            data-testid="theme-toggle-btn"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full theme-toggle-btn"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </header>

        {/* URL Input */}
        <div className="relative w-full fade-in">
          <input
            data-testid="youtube-url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
            placeholder="Paste YouTube URL..."
            className="url-input"
          />
          <Button
            data-testid="load-video-btn"
            onClick={handleLoadVideo}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-all active:scale-95"
          >
            Load
          </Button>
        </div>

        {/* Video Player */}
        <div className="video-container fade-in">
          {videoId ? (
            <div id="youtube-player" className="w-full h-full" />
          ) : (
            <div className="empty-state">
              <Video className="w-12 h-12 mb-3" />
              <span className="text-sm">Paste a YouTube link to begin</span>
            </div>
          )}
        </div>

        {/* Compact Control Bar */}
        {videoId && (
          <div className="control-bar fade-in">
            {/* Loop Times */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="loop-input-group">
                <span className="text-xs muted-text">FROM</span>
                <input
                  data-testid="loop-start-input"
                  type="text"
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  placeholder="0:00"
                  className="time-input-compact"
                />
                <button
                  data-testid="set-start-btn"
                  onClick={setCurrentAsStart}
                  className="set-btn"
                >
                  Set
                </button>
              </div>
              
              <span className="muted-text text-sm">→</span>
              
              <div className="loop-input-group">
                <span className="text-xs muted-text">TO</span>
                <input
                  data-testid="loop-end-input"
                  type="text"
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                  placeholder="0:00"
                  className="time-input-compact"
                />
                <button
                  data-testid="set-end-btn"
                  onClick={setCurrentAsEnd}
                  className="set-btn"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Speed Control */}
            <div className="speed-control">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs muted-text">SPEED</span>
                <span data-testid="speed-display" className="font-mono text-sm speed-value">{playbackRate}x</span>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  data-testid="speed-slider"
                  value={[playbackRate]}
                  min={0.25}
                  max={2}
                  step={0.05}
                  onValueChange={handleSpeedSlider}
                  className="speed-slider flex-1"
                />
                <div className="flex gap-1">
                  {speedPresets.map(speed => (
                    <button
                      key={speed}
                      data-testid={`speed-preset-${speed}`}
                      onClick={() => handleSpeedChange(speed)}
                      className={`speed-chip ${playbackRate === speed ? 'active' : ''}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Videos */}
        {recentVideos.length > 0 && (
          <div className="fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 muted-text" />
                <span className="text-xs muted-text uppercase tracking-wider">Recent</span>
              </div>
              <button
                data-testid="clear-history-btn"
                onClick={handleClearHistory}
                className="text-xs muted-text hover:opacity-70 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentVideos.map((video) => (
                <div
                  key={video.id}
                  data-testid={`history-item-${video.id}`}
                  onClick={() => handleLoadFromHistory(video)}
                  className="history-card-compact"
                >
                  <img 
                    src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="history-card-overlay">
                    <span className="text-xs font-mono">
                      {formatTime(video.loopStart)} - {formatTime(video.loopEnd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
