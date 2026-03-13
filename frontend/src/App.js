import { useState, useRef, useCallback, useEffect } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  History, 
  Trash2, 
  Video,
  Repeat,
  Clock
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
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [startTimeInput, setStartTimeInput] = useState("0:00");
  const [endTimeInput, setEndTimeInput] = useState("0:00");
  const [playerReady, setPlayerReady] = useState(false);
  
  const [recentVideos, setRecentVideos] = useLocalStorage("loop-studio-history", []);
  
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const progressIntervalRef = useRef(null);

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
    
    // Clean up previous player
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
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
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
            // 1 = playing, 2 = paused
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

  // Progress tracking
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (playerReady && playing) {
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const time = playerRef.current.getCurrentTime();
          setCurrentTime(time);

          // Loop logic
          if (loopEnabled && loopEnd > loopStart) {
            if (time >= loopEnd) {
              playerRef.current.seekTo(loopStart, true);
            }
          }
        }
      }, 200);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [playerReady, playing, loopEnabled, loopStart, loopEnd]);

  // Handle URL submission
  const handleLoadVideo = useCallback(() => {
    const id = parseYouTubeUrl(url);
    if (id) {
      setVideoId(id);
      setLoopStart(0);
      setLoopEnd(0);
      setLoopEnabled(false);
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
      const newEntry = {
        id: videoId,
        url: `https://youtube.com/watch?v=${videoId}`,
        title: getVideoTitle(videoId),
        timestamp: Date.now(),
        loopStart,
        loopEnd,
        playbackRate
      };
      
      setRecentVideos(prev => {
        const filtered = prev.filter(v => v.id !== videoId);
        return [newEntry, ...filtered].slice(0, 5);
      });
    }
  }, [videoId, duration, loopStart, loopEnd, playbackRate, setRecentVideos]);

  // Toggle play/pause
  const handlePlayPause = useCallback(() => {
    if (!playerRef.current || !playerReady) return;
    
    if (playing) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }, [playing, playerReady]);

  // Toggle loop
  const handleToggleLoop = useCallback(() => {
    if (!loopEnabled) {
      const start = parseTime(startTimeInput);
      const end = parseTime(endTimeInput);
      
      if (end <= start) {
        toast.error("End time must be after start time");
        return;
      }
      
      setLoopStart(start);
      setLoopEnd(end);
      setLoopEnabled(true);
      
      if (playerRef.current && playerReady) {
        playerRef.current.seekTo(start, true);
      }
      toast.success(`Loop set: ${formatTime(start)} - ${formatTime(end)}`);
    } else {
      setLoopEnabled(false);
      toast.info("Loop disabled");
    }
  }, [loopEnabled, startTimeInput, endTimeInput, playerReady]);

  // Load from history
  const handleLoadFromHistory = useCallback((video) => {
    setUrl(video.url);
    setVideoId(video.id);
    if (video.loopStart !== undefined) {
      setLoopStart(video.loopStart);
      setStartTimeInput(formatTime(video.loopStart));
    }
    if (video.loopEnd !== undefined) {
      setLoopEnd(video.loopEnd);
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
    setLoopStart(currentTime);
    setStartTimeInput(formatTime(currentTime));
  }, [currentTime]);

  const setCurrentAsEnd = useCallback(() => {
    setLoopEnd(currentTime);
    setEndTimeInput(formatTime(currentTime));
  }, [currentTime]);

  // Handle slider change for seeking
  const handleSeek = useCallback((value) => {
    const time = value[0];
    if (playerRef.current && playerReady) {
      playerRef.current.seekTo(time, true);
    }
    setCurrentTime(time);
  }, [playerReady]);

  // Handle speed change
  const handleSpeedChange = useCallback((speed) => {
    setPlaybackRate(speed);
    if (playerRef.current && playerReady) {
      playerRef.current.setPlaybackRate(speed);
    }
  }, [playerReady]);

  // Reset to loop start
  const handleReset = useCallback(() => {
    if (playerRef.current && playerReady) {
      playerRef.current.seekTo(loopStart, true);
    }
  }, [loopStart, playerReady]);

  // Speed options
  const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="app-container">
      <div className="noise-overlay" />
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: '#18181b',
            border: '1px solid #27272a',
            color: '#fafafa'
          }
        }}
      />
      
      <div className="max-w-4xl mx-auto px-6 py-12 min-h-screen flex flex-col gap-10">
        {/* Header */}
        <header className="text-center fade-in">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-white uppercase mb-2">
            Loop Studio
          </h1>
          <p className="text-zinc-500 text-sm tracking-wide">
            Practice. Learn. Repeat.
          </p>
        </header>

        {/* URL Input */}
        <div className="relative w-full fade-in" style={{ animationDelay: '0.1s' }}>
          <input
            data-testid="youtube-url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
            placeholder="Paste YouTube URL here..."
            className="w-full bg-[#121214] border border-[#27272a] text-lg p-5 pr-28 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner placeholder:text-zinc-600 text-white"
          />
          <Button
            data-testid="load-video-btn"
            onClick={handleLoadVideo}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl px-6 font-heading uppercase tracking-wide shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] transition-all active:scale-95"
          >
            Load
          </Button>
        </div>

        {/* Video Player */}
        <div className="video-container fade-in" style={{ animationDelay: '0.2s' }} ref={containerRef}>
          {videoId ? (
            <div id="youtube-player" className="w-full h-full" />
          ) : (
            <div className="empty-state">
              <Video className="w-16 h-16 mb-4 text-zinc-700" />
              <span className="text-lg">Paste a YouTube link to begin</span>
            </div>
          )}
        </div>

        {/* Control Deck */}
        {videoId && (
          <div className="control-deck fade-in" style={{ animationDelay: '0.3s' }}>
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs font-mono text-zinc-500 mb-2">
                <span data-testid="current-time">{formatTime(currentTime)}</span>
                <span data-testid="duration">{formatTime(duration)}</span>
              </div>
              <Slider
                data-testid="progress-slider"
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="loop-slider"
              />
            </div>

            {/* Playback Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              {/* Play/Pause */}
              <div className="flex items-center gap-2">
                <Button
                  data-testid="play-pause-btn"
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                  className="w-12 h-12 rounded-full hover:bg-white/10 text-white"
                >
                  {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </Button>
                <Button
                  data-testid="reset-btn"
                  variant="ghost"
                  size="icon"
                  onClick={handleReset}
                  className="w-10 h-10 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <RotateCcw className="w-5 h-5" />
                </Button>
              </div>

              {/* Speed Control */}
              <div className="flex items-center gap-3 bg-zinc-900/50 px-4 py-2 rounded-xl border border-white/5">
                <Clock className="w-4 h-4 text-zinc-500" />
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-heading">Speed</span>
                <select
                  data-testid="speed-select"
                  value={playbackRate}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  className="bg-transparent text-white font-mono text-sm focus:outline-none cursor-pointer"
                >
                  {speedOptions.map(speed => (
                    <option key={speed} value={speed} className="bg-zinc-900">
                      {speed}x
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Loop Controls */}
            <div className="border-t border-zinc-800 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Repeat className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-400 uppercase tracking-wide font-heading">Loop Section</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                {/* Start Time */}
                <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-xs text-zinc-500 uppercase">Start</span>
                  <input
                    data-testid="loop-start-input"
                    type="text"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    placeholder="0:00"
                    className="time-input w-16"
                  />
                  <Button
                    data-testid="set-start-btn"
                    variant="ghost"
                    size="sm"
                    onClick={setCurrentAsStart}
                    className="text-xs text-blue-400 hover:text-blue-300 px-2"
                  >
                    Set
                  </Button>
                </div>

                {/* End Time */}
                <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-xs text-zinc-500 uppercase">End</span>
                  <input
                    data-testid="loop-end-input"
                    type="text"
                    value={endTimeInput}
                    onChange={(e) => setEndTimeInput(e.target.value)}
                    placeholder="0:00"
                    className="time-input w-16"
                  />
                  <Button
                    data-testid="set-end-btn"
                    variant="ghost"
                    size="sm"
                    onClick={setCurrentAsEnd}
                    className="text-xs text-blue-400 hover:text-blue-300 px-2"
                  >
                    Set
                  </Button>
                </div>

                {/* Loop Toggle */}
                <Button
                  data-testid="loop-toggle-btn"
                  onClick={handleToggleLoop}
                  className={`font-heading uppercase tracking-wide px-6 py-2 rounded-full text-sm transition-all active:scale-95 ${
                    loopEnabled 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                      : 'bg-blue-500 text-white hover:bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                  }`}
                >
                  {loopEnabled ? 'Stop Loop' : 'Start Loop'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Videos */}
        {recentVideos.length > 0 && (
          <div className="fade-in" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-zinc-500" />
                <h2 className="font-heading text-xl text-zinc-400 uppercase tracking-widest">Recent</h2>
              </div>
              <Button
                data-testid="clear-history-btn"
                variant="ghost"
                size="sm"
                onClick={handleClearHistory}
                className="text-zinc-600 hover:text-zinc-400"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentVideos.map((video) => (
                <div
                  key={video.id}
                  data-testid={`history-item-${video.id}`}
                  onClick={() => handleLoadFromHistory(video)}
                  className="history-card group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-12 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                      <img 
                        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 group-hover:text-white text-sm font-medium truncate">
                        {video.title}
                      </p>
                      <p className="text-xs font-mono text-zinc-600 group-hover:text-blue-400 mt-1">
                        {video.loopStart !== undefined && video.loopEnd !== undefined 
                          ? `${formatTime(video.loopStart)} - ${formatTime(video.loopEnd)}`
                          : 'Full video'
                        }
                        {video.playbackRate && video.playbackRate !== 1 && ` @ ${video.playbackRate}x`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-zinc-600 text-xs mt-auto pt-8">
          <p>Press Enter to load video after pasting URL</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
