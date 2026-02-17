import React from 'react';
import { createRoot } from 'react-dom/client';
import { GeotabAuthProvider } from './hooks/useGeotabAuth.jsx';
import DashboardHome from './components/dashboard/DashboardHome.jsx';
import './index.css';

var root = null;

console.log('[Geoff] Add-in script loaded');

if (!window.geotab) window.geotab = {};
if (!window.geotab.addin) window.geotab.addin = {};

function geoffInitialize(api, state, callback) {
  console.log('[Geoff] initialize called');
  window._geotabApi = api;
  callback();
}

function geoffFocus(api, _state) {
  console.log('[Geoff] focus called');
  window._geotabApi = api;

  var container = document.getElementById('geoff-addin-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'geoff-addin-root';
    container.style.width = '100%';
    container.style.height = '100%';
    document.body.appendChild(container);
  }

  root = createRoot(container);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        GeotabAuthProvider,
        null,
        React.createElement(DashboardHome, { addinMode: true })
      )
    )
  );
}

function geoffBlur() {
  console.log('[Geoff] blur called');
  if (root) {
    root.unmount();
    root = null;
  }
}

// Register as both object and function patterns
var lifecycleObj = {
  initialize: geoffInitialize,
  focus: geoffFocus,
  blur: geoffBlur
};

// Function factory pattern (some MyGeotab versions require this)
var lifecycleFn = function() {
  return lifecycleObj;
};
lifecycleFn.initialize = geoffInitialize;
lifecycleFn.focus = geoffFocus;
lifecycleFn.blur = geoffBlur;

window.geotab.addin.geoff = lifecycleFn;

console.log('[Geoff] Registered, typeof:', typeof window.geotab.addin.geoff);
