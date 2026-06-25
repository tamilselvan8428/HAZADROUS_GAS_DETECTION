import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // Settings loaded from localStorage or initialized with defaults
  const [readApiKey, setReadApiKey] = useState(
    () => localStorage.getItem('ts_read_api_key') || 'NRG84QX4BM0WP86F'
  );
  const [channelId, setChannelId] = useState(
    () => localStorage.getItem('ts_channel_id') || ''
  );
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(!localStorage.getItem('ts_channel_id'));
  const [feeds, setFeeds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [muteSound, setMuteSound] = useState(false);

  // Form inputs inside Settings modal
  const [inputChannelId, setInputChannelId] = useState(channelId);
  const [inputReadApiKey, setInputReadApiKey] = useState(readApiKey);

  // Tooltip tracking for the SVG chart
  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const chartRef = useRef(null);

  // Latest values derived from feeds
  const latestFeed = feeds[feeds.length - 1];
  const methaneVal = latestFeed ? parseFloat(latestFeed.field1) || 0.0 : 0.0;
  const ammoniaVal = latestFeed ? parseFloat(latestFeed.field2) || 0.0 : 0.0;
  const isDangerous = latestFeed ? parseInt(latestFeed.field3) === 1 || methaneVal > 1000 || ammoniaVal > 300 : false;

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const clock = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clock);
  }, []);

  const getDeviceStatus = () => {
    if (!latestFeed) return { status: 'Offline', className: 'warn offline', details: 'No telemetry feeds' };
    const lastActiveTime = new Date(latestFeed.created_at);
    const diffMs = currentTime - lastActiveTime;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      return { status: 'Online', className: 'safe', details: 'Transmitting regularly' };
    } else {
      let timeString = '';
      if (diffSec < 120) {
        timeString = '1 minute ago';
      } else if (diffSec < 3600) {
        timeString = `${Math.floor(diffSec / 60)} minutes ago`;
      } else {
        timeString = `${Math.floor(diffSec / 3600)} hours ago`;
      }
      return { status: 'Offline', className: 'danger offline', details: `Inactivity: active ${timeString}` };
    }
  };

  const deviceStatus = getDeviceStatus();
  
  // Audio context for safety buzzer (synthesized via Web Audio API - no external assets needed!)
  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);

  useEffect(() => {
    // Save credentials to local storage when changed
    localStorage.setItem('ts_read_api_key', readApiKey);
    if (channelId) {
      localStorage.setItem('ts_channel_id', channelId);
    }
  }, [readApiKey, channelId]);

  // Handle synthesized alarm buzzer
  useEffect(() => {
    if (isDangerous && !muteSound) {
      // Start/resume buzzer
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }

        if (!oscillatorRef.current) {
          const osc = audioContextRef.current.createOscillator();
          const gain = audioContextRef.current.createGain();
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, audioContextRef.current.currentTime); // A5 note
          
          // Add frequency modulation for alarm "weewoo" effect
          let time = audioContextRef.current.currentTime;
          osc.frequency.linearRampToValueAtTime(880, time);
          
          gain.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
          
          // Modulate volume slightly for pulse effect
          const lfo = audioContextRef.current.createOscillator();
          const lfoGain = audioContextRef.current.createGain();
          lfo.frequency.value = 4; // 4Hz pulse
          lfoGain.gain.value = 0.05;
          lfo.connect(lfoGain);
          lfoGain.connect(gain.gain);
          lfo.start();

          osc.connect(gain);
          gain.connect(audioContextRef.current.destination);
          
          osc.start();
          oscillatorRef.current = { osc, lfo };
        }
      } catch (e) {
        console.error("Audio buzzer failed to initialize: ", e);
      }
    } else {
      // Stop buzzer
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.osc.stop();
          oscillatorRef.current.lfo.stop();
        } catch (e) {}
        oscillatorRef.current = null;
      }
    }

    return () => {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.osc.stop();
          oscillatorRef.current.lfo.stop();
        } catch (e) {}
        oscillatorRef.current = null;
      }
    };
  }, [isDangerous, muteSound]);

  // Data fetching logic
  const fetchData = async () => {
    if (!channelId) {
      setError("Please configure your Channel ID in settings.");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=30`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const data = await response.json();
      
      if (data && data.feeds) {
        setFeeds(data.feeds);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        throw new Error("Invalid response format from ThingSpeak.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to sync with ThingSpeak.");
    } finally {
      setIsLoading(false);
    }
  };

  // Poll setup
  useEffect(() => {
    if (channelId) {
      fetchData();
    }
    
    if (!autoRefresh || !channelId) return;

    const timer = setInterval(() => {
      fetchData();
    }, 15000); // 15s polling rate limit

    return () => clearInterval(timer);
  }, [channelId, readApiKey, autoRefresh]);

  // Handle settings submission
  const handleSaveSettings = (e) => {
    e.preventDefault();
    setChannelId(inputChannelId);
    setReadApiKey(inputReadApiKey);
    setIsSettingsOpen(false);
  };

  // SVG Chart Configuration
  const chartWidth = 700;
  const chartHeight = 300;
  const chartPadding = 40;

  // Max scale bounds (or auto-calculate)
  const maxMethaneVal = Math.max(...feeds.map(f => parseFloat(f.field1) || 0), 1200);
  const maxAmmoniaVal = Math.max(...feeds.map(f => parseFloat(f.field2) || 0), 400);

  // Coordinate scales
  const getX = (index) => {
    if (feeds.length <= 1) return chartPadding;
    return chartPadding + (index / (feeds.length - 1)) * (chartWidth - 2 * chartPadding);
  };

  const getY = (val, max) => {
    const scaleHeight = chartHeight - 2 * chartPadding;
    const ratio = Math.min(val / max, 1);
    return chartHeight - chartPadding - ratio * scaleHeight;
  };

  // Generate SVG path for a field
  const generatePath = (fieldName, max) => {
    if (feeds.length === 0) return '';
    return feeds.reduce((path, feed, index) => {
      const x = getX(index);
      const y = getY(parseFloat(feed[fieldName]) || 0, max);
      return path + `${index === 0 ? 'M' : 'L'} ${x} ${y} `;
    }, '');
  };

  // Generate SVG area (fill) path
  const generateAreaPath = (fieldName, max) => {
    if (feeds.length === 0) return '';
    const linePath = generatePath(fieldName, max);
    if (!linePath) return '';
    const startX = getX(0);
    const endX = getX(feeds.length - 1);
    const bottomY = chartHeight - chartPadding;
    return `${linePath} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
  };

  // Hover detection for chart tooltip
  const handleMouseMove = (e) => {
    if (!chartRef.current || feeds.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Scale X to map to feeds index
    const innerWidth = rect.width - (2 * chartPadding * (rect.width / chartWidth));
    const startX = chartPadding * (rect.width / chartWidth);
    const relativeX = mouseX - startX;
    
    let index = Math.round((relativeX / innerWidth) * (feeds.length - 1));
    index = Math.max(0, Math.min(index, feeds.length - 1));
    
    setHoverIndex(index);
    setTooltipPos({ x: mouseX + 15, y: mouseY - 25 });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Format date helper
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="dashboard-container">
      {/* HEADER SECTION */}
      <header className="dashboard-header glass-panel">
        <div className="header-title">
          <h1>Hazardous Gas Sentinel</h1>
          <p>{channelId ? `Syncing Channel #${channelId}` : 'Dashboard Unconfigured'}</p>
        </div>
        <div className="header-actions">
          {lastUpdated && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last Sync: {lastUpdated}
            </span>
          )}
          <button 
            onClick={() => setAutoRefresh(prev => !prev)} 
            className={autoRefresh ? 'active' : ''}
            title={autoRefresh ? "Auto-refreshing every 15s" : "Auto-refresh paused"}
          >
            <span className={`sync-dot ${autoRefresh && !isLoading ? 'pulse' : ''}`} style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: autoRefresh ? 'var(--green)' : 'var(--text-muted)',
              marginRight: '6px'
            }}></span>
            {autoRefresh ? 'Auto Sync' : 'Manual Mode'}
          </button>
          <button onClick={fetchData} disabled={isLoading || !channelId}>
            {isLoading ? 'Loading...' : 'Sync Now'}
          </button>
          <button onClick={() => setIsSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {/* ERROR DISPLAY */}
      {error && (
        <div className="glass-panel" style={{
          padding: '16px 24px',
          borderColor: 'rgba(244, 63, 94, 0.3)',
          background: 'rgba(244, 63, 94, 0.05)',
          color: 'var(--rose)',
          borderRadius: '16px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setIsSettingsOpen(true)}>Configure Channel</button>
        </div>
      )}

      {/* ALARM WARNING BANNER */}
      <div className={`alarm-banner glass-panel ${isDangerous ? 'danger' : ''}`}>
        <div className="alarm-info">
          <div className="alarm-icon">
            {isDangerous ? '⚠️' : '🛡️'}
          </div>
          <div className="alarm-details">
            <h3>{isDangerous ? 'DANGER ALERT ACTIVE' : 'System Guard Online'}</h3>
            <p>
              {isDangerous 
                ? 'High levels of toxic gas detected! Physical indicators are sounding.' 
                : 'All environmental sensors reading within safe operational parameters.'}
            </p>
          </div>
        </div>
        {isDangerous && (
          <button onClick={() => setMuteSound(m => !m)} className="primary" style={{
            background: muteSound ? 'rgba(255, 255, 255, 0.1)' : 'var(--rose)',
          }}>
            {muteSound ? '🔇 Unmute Browser Siren' : '🔊 Mute Siren'}
          </button>
        )}
      </div>

      {/* OVERVIEW METRICS */}
      <div className="stats-grid">
        {/* METHANE (MQ-6) CARD */}
        <div className="stat-card glass-panel methane">
          <div className="card-header">
            <span className="card-title">Methane (MQ-6)</span>
            <span className={`card-badge ${methaneVal > 1000 ? 'danger' : methaneVal > 600 ? 'warn' : 'safe'}`}>
              {methaneVal > 1000 ? 'Critical' : methaneVal > 600 ? 'Caution' : 'Safe'}
            </span>
          </div>
          <div className="card-content">
            <div className="value-display">
              <span className="value-number">{methaneVal.toFixed(1)}</span>
              <span className="value-unit">parts per million (ppm)</span>
            </div>
            
            {/* Visual Gauge */}
            <div className="mini-gauge">
              <svg>
                <circle className="bg-circle" cx="45" cy="45" r="40" />
                <circle 
                  className="value-circle" 
                  cx="45" 
                  cy="45" 
                  r="40"
                  strokeDashoffset={251.2 - (251.2 * Math.min(methaneVal, 1500)) / 1500}
                />
              </svg>
              <span className="mini-gauge-text">
                {Math.round((Math.min(methaneVal, 1500) / 1500) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* AMMONIA (MQ-135) CARD */}
        <div className="stat-card glass-panel ammonia">
          <div className="card-header">
            <span className="card-title">Ammonia (MQ-135)</span>
            <span className={`card-badge ${ammoniaVal > 300 ? 'danger' : ammoniaVal > 150 ? 'warn' : 'safe'}`}>
              {ammoniaVal > 300 ? 'Critical' : ammoniaVal > 150 ? 'Caution' : 'Safe'}
            </span>
          </div>
          <div className="card-content">
            <div className="value-display">
              <span className="value-number">{ammoniaVal.toFixed(2)}</span>
              <span className="value-unit">parts per million (ppm)</span>
            </div>

            {/* Visual Gauge */}
            <div className="mini-gauge">
              <svg>
                <circle className="bg-circle" cx="45" cy="45" r="40" />
                <circle 
                  className="value-circle" 
                  cx="45" 
                  cy="45" 
                  r="40"
                  strokeDashoffset={251.2 - (251.2 * Math.min(ammoniaVal, 500)) / 500}
                />
              </svg>
              <span className="mini-gauge-text">
                {Math.round((Math.min(ammoniaVal, 500) / 500) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* DEVICE LINK STATUS CARD */}
        <div className={`stat-card glass-panel device-link ${deviceStatus.status === 'Online' ? 'online' : 'offline'}`}>
          <div className="card-header">
            <span className="card-title">Hardware Link</span>
            <span className={`card-badge ${deviceStatus.className.includes('safe') ? 'safe' : 'danger'}`}>
              {deviceStatus.status}
            </span>
          </div>
          <div className="card-content">
            <div className="value-display">
              <span className="value-number" style={{ fontSize: '32px', margin: '4px 0' }}>
                {deviceStatus.status === 'Online' ? 'ACTIVE' : 'OFFLINE'}
              </span>
              <span className="value-unit">{deviceStatus.details}</span>
            </div>
            
            {/* Visual Connection Bar Signal */}
            <div className="signal-strength" style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              height: '50px',
              paddingBottom: '5px'
            }}>
              {[1, 2, 3, 4].map((bar) => {
                const isActive = deviceStatus.status === 'Online' && (bar <= 3 || (bar === 4 && feeds.length > 0));
                return (
                  <div key={bar} style={{
                    width: '6px',
                    height: `${bar * 10}px`,
                    backgroundColor: isActive 
                      ? (isDangerous ? 'var(--warning)' : 'var(--green)') 
                      : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '2px',
                    transition: 'all 0.3s ease'
                  }}></div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS & LOG TABLE SECTION */}
      <div className="main-grid">
        {/* SVG CHART PANEL */}
        <div className="glass-panel chart-panel">
          <div className="chart-header">
            <div className="chart-title">
              <h2>Historical Trends</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Showing last 30 readings</span>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-color methane"></span>
                <span>Methane (MQ-6)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color ammonia"></span>
                <span>Ammonia (MQ-135)</span>
              </div>
            </div>
          </div>
          
          <div className="chart-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            {feeds.length === 0 ? (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)'
              }}>
                No data available. Ensure your Channel ID is loaded.
              </div>
            ) : (
              <>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} ref={chartRef} style={{ width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id="methaneGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="ammoniaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = chartPadding + ratio * (chartHeight - 2 * chartPadding);
                    return (
                      <g key={i}>
                        <line 
                          x1={chartPadding} 
                          y1={y} 
                          x2={chartWidth - chartPadding} 
                          y2={y} 
                          stroke="rgba(255,255,255,0.04)" 
                          strokeWidth="1"
                        />
                        {/* Methane Axis label (Left) */}
                        <text 
                          x={chartPadding - 8} 
                          y={y + 4} 
                          fill="var(--cyan)" 
                          fontSize="9" 
                          textAnchor="end" 
                          opacity="0.6"
                        >
                          {Math.round(maxMethaneVal - ratio * maxMethaneVal)}
                        </text>
                        {/* Ammonia Axis label (Right) */}
                        <text 
                          x={chartWidth - chartPadding + 8} 
                          y={y + 4} 
                          fill="var(--primary)" 
                          fontSize="9" 
                          textAnchor="start" 
                          opacity="0.6"
                        >
                          {Math.round(maxAmmoniaVal - ratio * maxAmmoniaVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Shaded area fills under curves */}
                  <path d={generateAreaPath('field1', maxMethaneVal)} fill="url(#methaneGrad)" />
                  <path d={generateAreaPath('field2', maxAmmoniaVal)} fill="url(#ammoniaGrad)" />

                  {/* Lines */}
                  <path 
                    d={generatePath('field1', maxMethaneVal)} 
                    fill="none" 
                    stroke="var(--cyan)" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path 
                    d={generatePath('field2', maxAmmoniaVal)} 
                    fill="none" 
                    stroke="var(--primary)" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Vertical cursor guide on hover */}
                  {hoverIndex !== null && (
                    <line 
                      x1={getX(hoverIndex)} 
                      y1={chartPadding} 
                      x2={getX(hoverIndex)} 
                      y2={chartHeight - chartPadding} 
                      stroke="rgba(255,255,255,0.15)" 
                      strokeDasharray="4 4"
                    />
                  )}

                  {/* Highlight dots on hover */}
                  {hoverIndex !== null && (
                    <>
                      <circle 
                        cx={getX(hoverIndex)} 
                        cy={getY(parseFloat(feeds[hoverIndex].field1) || 0, maxMethaneVal)} 
                        r="5" 
                        fill="var(--cyan)" 
                        stroke="#030712" 
                        strokeWidth="2"
                      />
                      <circle 
                        cx={getX(hoverIndex)} 
                        cy={getY(parseFloat(feeds[hoverIndex].field2) || 0, maxAmmoniaVal)} 
                        r="5" 
                        fill="var(--primary)" 
                        stroke="#030712" 
                        strokeWidth="2"
                      />
                    </>
                  )}
                </svg>

                {/* Custom Chart Hover Tooltip */}
                {hoverIndex !== null && feeds[hoverIndex] && (
                  <div className="chart-tooltip" style={{
                    display: 'block',
                    left: `${tooltipPos.x}px`,
                    top: `${tooltipPos.y}px`
                  }}>
                    <div className="chart-tooltip-time">{formatTime(feeds[hoverIndex].created_at)}</div>
                    <div style={{ color: 'var(--cyan)' }}>
                      Methane: {(parseFloat(feeds[hoverIndex].field1) || 0).toFixed(1)} ppm
                    </div>
                    <div style={{ color: 'var(--primary)' }}>
                      Ammonia: {(parseFloat(feeds[hoverIndex].field2) || 0).toFixed(2)} ppm
                    </div>
                    <div style={{ 
                      marginTop: '4px', 
                      fontSize: '10px', 
                      color: parseInt(feeds[hoverIndex].field3) === 1 ? 'var(--rose)' : 'var(--green)' 
                    }}>
                      Status: {parseInt(feeds[hoverIndex].field3) === 1 ? '⚠️ Danger Alert' : '✔️ Safe'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* LOG HISTORY LIST */}
        <div className="glass-panel logs-panel">
          <h2>Sensor Feed Logs</h2>
          <div className="logs-list">
            {feeds.length === 0 ? (
              <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Waiting for readings...
              </div>
            ) : (
              [...feeds].reverse().slice(0, 15).map((feed, idx) => {
                const meth = parseFloat(feed.field1) || 0;
                const ammo = parseFloat(feed.field2) || 0;
                const danger = parseInt(feed.field3) === 1 || meth > 1000 || ammo > 300;
                
                return (
                  <div className={`log-item ${danger ? 'danger' : ''}`} key={feed.entry_id}>
                    <div className="log-time">{formatTime(feed.created_at)}</div>
                    <div className="log-values">
                      <span className="log-val methane">{meth.toFixed(1)} M</span>
                      <span className="log-val ammonia">{ammo.toFixed(2)} A</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SETTINGS DIALOG */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>ThingSpeak Credentials</h2>
              {channelId && (
                <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
              )}
            </div>
            
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label htmlFor="chId">ThingSpeak Channel ID</label>
                <input 
                  id="chId"
                  type="text" 
                  placeholder="e.g. 1952345" 
                  value={inputChannelId}
                  onChange={(e) => setInputChannelId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="rKey">Read API Key</label>
                <input 
                  id="rKey"
                  type="text" 
                  placeholder="NRG84QX4BM0WP86F" 
                  value={inputReadApiKey}
                  onChange={(e) => setInputReadApiKey(e.target.value)}
                  required
                />
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '20px' }}>
                Credentials are saved securely in your local browser storage.
              </p>

              <div className="modal-actions">
                {channelId && (
                  <button type="button" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                )}
                <button type="submit" className="primary">Save & Connect</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
