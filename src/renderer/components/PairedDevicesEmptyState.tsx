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
          maxWidth: '360px',
          height: '140px',
          marginBottom: '14px'
        }}
      >
        <img
          className="sync-empty-illustration sync-animated-devices"
          src="../../Assets/computer-phone-connection.svg"
          alt="Device Connection"
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
