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
        className="sync-empty-svg-wrapper sync-connect-images"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '480px',
          height: '150px',
          marginBottom: '16px',
          gap: '20px'
        }}
      >
        <img
          className="sync-connect-img"
          src="../../Assets/computer-connect.png"
          alt="Brown on desktop"
        />
        <div className="sync-connection-bridge">
          <div className="sync-bridge-track">
            <div className="sync-pulse-particle sync-particle-left"></div>
            <div className="sync-pulse-particle sync-particle-right-rev"></div>
          </div>
          <div className="sync-bridge-node" title="Local Connection Bridge">
            <svg className="sync-node-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </div>
          <div className="sync-bridge-track">
            <div className="sync-pulse-particle sync-particle-left"></div>
            <div className="sync-pulse-particle sync-particle-right-rev"></div>
          </div>
        </div>
        <img
          className="sync-connect-img sync-connect-mobile"
          src="../../Assets/connect-mobile.png"
          alt="Brown on mobile"
        />
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
