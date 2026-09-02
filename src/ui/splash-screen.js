/**
 * Ultron Splash Screen
 * Forces display of Ultron logo and branding for minimum 10 seconds on startup
 */
(function () {
  'use strict';

  const SPLASH_CONFIG = {
    minDisplayTime: 10000,  // 10 seconds minimum
    fadeOutDuration: 1000,  // 1 second fade out
    logoAnimationDuration: 2000,  // 2 second logo animation
    enabled: true
  };

  let splashStartTime = Date.now();
  let isAppReady = false;
  let splashElement = null;

  /**
   * CREATE SPLASH SCREEN HTML
   */
  function createSplashScreen() {
    const splashHTML = `
      <div id="ultron-splash-screen" class="ultron-splash-overlay">
        <div class="ultron-splash-container">
          <!-- Brown Logo -->
          <div class="ultron-logo-container">
            <div class="ultron-logo-circle" style="background: transparent; border: none; box-shadow: none;">
              <img src="../../Assets/brown-white-logo.png" alt="Brown" class="ultron-logo-img" style="max-width: 180px; height: auto; object-fit: contain; filter: drop-shadow(0 0 18px rgba(99,102,241,0.6));" onerror="this.src='../../Assets/brown-white-logo.png'" />
            </div>
          </div>
          </div>
        </div>
      </div>
    `;

    return splashHTML;
  }

  /**
   * CREATE SPLASH SCREEN CSS
   */
  function createSplashStyles() {
    const styles = `
      <style id="ultron-splash-styles">
        .ultron-splash-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #312e81 60%, #1e40af 100%);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 1;
          transition: opacity 1s ease-out;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          overflow: hidden;
        }

        .ultron-splash-overlay.fade-out {
          opacity: 0;
          pointer-events: none;
        }

        .ultron-splash-container {
          text-align: center;
          color: white;
          position: relative;
          animation: splashFadeIn 1s ease-out;
        }

        @keyframes splashFadeIn {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Logo Container */
        .ultron-logo-container {
          position: relative;
          width: 120px;
          height: 120px;
          margin: 0 auto 10px;
        }

        .ultron-logo-circle {
          width: 120px;
          height: 120px;
          position: relative;
          z-index: 2;
        }

        .ultron-logo-svg {
          width: 100%;
          height: 100%;
          filter: url(#glow);
          animation: logoRotate 4s linear infinite;
        }

        @keyframes logoRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Logo animations */
        .logo-ring-outer {
          animation: ringPulse 2s ease-in-out infinite;
        }

        .logo-core {
          animation: corePulse 3s ease-in-out infinite;
        }

        .logo-brain-pattern {
          animation: brainFlicker 1.5s ease-in-out infinite alternate;
        }

        .brain-path-1 {
          animation: pathGlow 2s ease-in-out infinite;
          animation-delay: 0s;
        }

        .brain-path-2 {
          animation: pathGlow 2s ease-in-out infinite;
          animation-delay: 0.3s;
        }

        .brain-path-3 {
          animation: pathGlow 2s ease-in-out infinite;
          animation-delay: 0.6s;
        }

        .logo-center-dot {
          animation: dotPulse 1s ease-in-out infinite;
        }

        @keyframes ringPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @keyframes corePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }

        @keyframes brainFlicker {
          0% { opacity: 0.8; }
          100% { opacity: 1; }
        }

        @keyframes pathGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        @keyframes dotPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }

        /* Text Styling */
        .ultron-text-container {
          margin: 0;
        }

        .ultron-title {
          font-size: 4rem;
          font-weight: 900;
          margin: 0;
          background: linear-gradient(45deg, #60a5fa, #a78bfa, #34d399);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: titleGradient 3s ease-in-out infinite, titlePulse 2s ease-in-out infinite;
          letter-spacing: 0.1em;
          text-shadow: 0 0 30px rgba(96, 165, 250, 0.5);
        }

        @keyframes titleGradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes titlePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .ultron-logo-container {
            width: 100px;
            height: 100px;
          }

          .ultron-title {
            font-size: 2.5rem;
          }

          .ultron-loading-bar {
            width: 250px;
          }

          .ring-1, .ring-2, .ring-3 {
            width: 120px;
            height: 120px;
          }
        }

        /* Hide main app initially */
        body.splash-active {
          overflow: hidden;
        }

        body.splash-active > *:not(#ultron-splash-screen):not(script):not(style) {
          opacity: 0;
          pointer-events: none;
        }
      </style>
    `;

    return styles;
  }

  /**
   * UPDATE LOADING TEXT
   */
  function updateLoadingText(text) {
    const loadingText = document.querySelector('.ultron-loading-text');
    if (loadingText) {
      loadingText.textContent = text;
    }
  }

  /**
   * SHOW SPLASH SCREEN
   */
  function showSplash() {
    if (!SPLASH_CONFIG.enabled) return;

    console.log('[Splash] Showing Ultron splash screen...');
    splashStartTime = Date.now();

    // Add styles
    const stylesDiv = document.createElement('div');
    stylesDiv.innerHTML = createSplashStyles();
    document.head.appendChild(stylesDiv.firstElementChild);

    // Add splash screen
    const splashDiv = document.createElement('div');
    splashDiv.innerHTML = createSplashScreen();
    splashElement = splashDiv.firstElementChild;
    document.body.appendChild(splashElement);

    // Add class to body to hide main app
    document.body.classList.add('splash-active');

    // Animate loading text
    const loadingMessages = [
      'Initializing AI Systems...',
      'Loading Neural Networks...',
      'Configuring GPU Acceleration...',
      'Starting Memory Manager...',
      'Preparing User Interface...',
      'Connecting to AI Models...',
      'Optimizing Performance...',
      'Final Preparations...',
      'Ready!'
    ];

    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      if (messageIndex < loadingMessages.length) {
        updateLoadingText(loadingMessages[messageIndex]);
        messageIndex++;
      } else {
        clearInterval(messageInterval);
      }
    }, 1200);

    // Auto-hide after minimum time even if app isn't ready
    setTimeout(() => {
      if (!isAppReady) {
        console.log('[Splash] Minimum time reached, preparing to hide...');
        appReady();
      }
    }, SPLASH_CONFIG.minDisplayTime);
  }

  /**
   * HIDE SPLASH SCREEN
   */
  function hideSplash() {
    if (!splashElement) return;

    console.log('[Splash] Hiding splash screen...');

    // Fade out
    splashElement.classList.add('fade-out');

    setTimeout(() => {
      // Remove splash screen
      if (splashElement && splashElement.parentNode) {
        splashElement.parentNode.removeChild(splashElement);
      }

      // Remove styles
      const styles = document.getElementById('ultron-splash-styles');
      if (styles && styles.parentNode) {
        styles.parentNode.removeChild(styles);
      }

      // Remove body class
      document.body.classList.remove('splash-active');

      console.log('[Splash] ✓ Splash screen hidden');
    }, SPLASH_CONFIG.fadeOutDuration);
  }

  /**
   * APP READY - Called when app is loaded
   */
  function appReady() {
    if (isAppReady) return;

    isAppReady = true;
    const elapsedTime = Date.now() - splashStartTime;
    const remainingTime = Math.max(0, SPLASH_CONFIG.minDisplayTime - elapsedTime);

    console.log(`[Splash] App ready after ${elapsedTime}ms, ${remainingTime}ms remaining...`);

    if (remainingTime > 0) {
      // Wait for minimum display time
      updateLoadingText('Ready!');
      setTimeout(hideSplash, remainingTime);
    } else {
      // Hide immediately
      hideSplash();
    }
  }

  /**
   * FORCE SHOW SPLASH (for testing)
   */
  function forceShow() {
    isAppReady = false;
    splashStartTime = Date.now();
    showSplash();
  }

  /**
   * INITIALIZE SPLASH SYSTEM
   */
  function initialize() {
    // Show splash immediately on page load
    showSplash();

    // Listen for app ready events
    window.addEventListener('ultron-app-ready', appReady);
    window.addEventListener('DOMContentLoaded', () => {
      // Give a bit more time for app to initialize
      setTimeout(appReady, 2000);
    });

    // Fallback: hide after maximum time
    setTimeout(() => {
      if (splashElement && !splashElement.classList.contains('fade-out')) {
        console.warn('[Splash] Maximum display time reached, forcing hide');
        appReady();
      }
    }, 15000); // 15 seconds maximum

    console.log('[Splash] ✓ Splash system initialized');
  }

  // PUBLIC API
  window.UltronSplashScreen = {
    show: showSplash,
    hide: hideSplash,
    appReady: appReady,
    forceShow: forceShow,
    updateLoadingText: updateLoadingText,
    
    // Configuration
    setMinDisplayTime: (time) => { SPLASH_CONFIG.minDisplayTime = time; },
    setEnabled: (enabled) => { SPLASH_CONFIG.enabled = enabled; },
    getConfig: () => ({ ...SPLASH_CONFIG }),
    
    // Status
    isVisible: () => !!splashElement && !splashElement.classList.contains('fade-out'),
    getElapsedTime: () => Date.now() - splashStartTime
  };

  // Initialize immediately when script loads
  initialize();

})();