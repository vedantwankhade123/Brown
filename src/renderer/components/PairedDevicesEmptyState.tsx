import React from 'react';

export interface PairedDevicesEmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * PairedDevicesEmptyState
 * Premium, minimalist animated device-sync empty state illustration
 * communicating bidirectional Phone ↔ Desktop synchronization.
 */
export const PairedDevicesEmptyState: React.FC<PairedDevicesEmptyStateProps> = ({
  title = 'No mobile devices paired yet',
  description = 'Click “Generate Pair Code” and enter the code in your mobile app to connect your device.',
  className = '',
  style = {}
}) => {
  return (
    <div
      className={`sync-empty-state-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        background: 'rgba(255, 255, 255, 0.015)',
        border: '1px dashed rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        width: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style
      }}
    >
      <div
        className="sync-empty-svg-wrapper"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '320px',
          height: '120px',
          marginBottom: '12px'
        }}
      >
        <svg
          className="sync-empty-illustration"
          viewBox="0 0 320 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '120px',
            pointerEvents: 'none',
            overflow: 'visible'
          }}
        >
          <defs>
            {/* Subtle Glow Filter */}
            <filter id="sync-subtle-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Center Sync Ring Gradient / Faint Fill */}
            <linearGradient id="sync-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(96, 165, 250, 0.18)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.04)" />
            </linearGradient>
          </defs>

          {/* 1. Connection Lines */}
          {/* Background Guide Lines (faint solid) */}
          <line
            x1="88"
            y1="60"
            x2="138"
            y2="60"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="182"
            y1="60"
            x2="232"
            y2="60"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Left Flowing Dotted Path (Phone -> Sync) */}
          <line
            x1="88"
            y1="60"
            x2="138"
            y2="60"
            className="connection-left"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 4"
          />

          {/* Right Flowing Dotted Path (Sync -> Laptop) */}
          <line
            x1="182"
            y1="60"
            x2="232"
            y2="60"
            className="connection-right"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 4"
          />

          {/* 2. Traveling Data Pulses */}
          {/* Pulse 1: Phone -> Laptop */}
          <circle
            cx="0"
            cy="60"
            r="2.5"
            className="data-pulse pulse-phone-to-laptop"
            fill="#ffffff"
            filter="url(#sync-subtle-glow)"
          />
          {/* Pulse 2: Laptop -> Phone */}
          <circle
            cx="0"
            cy="60"
            r="2.5"
            className="data-pulse pulse-laptop-to-phone"
            fill="#ffffff"
            filter="url(#sync-subtle-glow)"
          />

          {/* 3. Smartphone (Left) */}
          <g className="phone" transform="translate(42, 22)">
            {/* Outer Body */}
            <rect
              x="0"
              y="0"
              width="46"
              height="76"
              rx="8"
              ry="8"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="1.5"
              fill="rgba(255, 255, 255, 0.02)"
            />
            {/* Screen Inner Outline */}
            <rect
              x="4"
              y="7"
              width="38"
              height="62"
              rx="4"
              ry="4"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
              fill="none"
            />
            {/* Dynamic Island / Notch */}
            <rect x="16" y="3" width="14" height="2.5" rx="1.2" fill="rgba(255, 255, 255, 0.6)" />
            {/* Screen Content Lines (Micro-UI) */}
            <line
              x1="9"
              y1="18"
              x2="25"
              y2="18"
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="24"
              x2="35"
              y2="24"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="30"
              x2="29"
              y2="30"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Screen Sync Indicator Dot */}
            <circle
              cx="23"
              cy="50"
              r="4"
              stroke="rgba(96, 165, 250, 0.7)"
              strokeWidth="1"
              fill="rgba(96, 165, 250, 0.15)"
            />
            <circle cx="23" cy="50" r="1.5" fill="#60a5fa" />
            {/* Bottom Home Bar */}
            <line
              x1="16"
              y1="72"
              x2="30"
              y2="72"
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>

          {/* 4. Sync Symbol (Center) */}
          <g className="sync-container" transform="translate(160, 60)">
            {/* Subtle Outer Ring */}
            <circle
              cx="0"
              cy="0"
              r="18"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
              fill="url(#sync-ring-grad)"
            />
            {/* Rotating Sync Arrows */}
            <g className="sync-icon">
              {/* Top Arc & Arrow */}
              <path
                d="M-8 -6 A 10 10 0 0 1 8 -3"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M5 -5 L8 -3 L6 0"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Bottom Arc & Arrow */}
              <path
                d="M8 6 A 10 10 0 0 1 -8 3"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M-5 5 L-8 3 L-6 0"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </g>
          </g>

          {/* 5. Laptop / Desktop Screen (Right) */}
          <g className="laptop" transform="translate(232, 26)">
            {/* Screen Outer Bezel */}
            <rect
              x="6"
              y="0"
              width="76"
              height="52"
              rx="4"
              ry="4"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="1.5"
              fill="rgba(255, 255, 255, 0.02)"
            />
            {/* Inner Screen */}
            <rect
              x="10"
              y="4"
              width="68"
              height="42"
              rx="2"
              ry="2"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
              fill="none"
            />
            {/* Camera Dot */}
            <circle cx="44" cy="2" r="0.8" fill="rgba(255, 255, 255, 0.5)" />
            {/* Screen Micro-UI Lines */}
            <line
              x1="16"
              y1="12"
              x2="36"
              y2="12"
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="16"
              y1="18"
              x2="54"
              y2="18"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="16"
              y1="24"
              x2="46"
              y2="24"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Laptop Base / Keyboard Deck */}
            <path
              d="M0 54 H88 L83 61 H5 Z"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="rgba(255, 255, 255, 0.04)"
            />
            {/* Trackpad / Notch */}
            <line
              x1="38"
              y1="55"
              x2="50"
              y2="55"
              stroke="rgba(255, 255, 255, 0.4)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <h6
        className="sync-empty-title"
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#ffffff',
          margin: '0 0 6px 0',
          letterSpacing: '-0.01em'
        }}
      >
        {title}
      </h6>
      <p
        className="sync-empty-desc"
        style={{
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.55)',
          margin: 0,
          lineHeight: 1.5,
          maxWidth: '440px'
        }}
      >
        {description}
      </p>
    </div>
  );
};

export default PairedDevicesEmptyState;
