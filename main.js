var domain = 'https://withboard.scopely.io';
//var domain = 'http://localhost:3000';

var config;
var manifest = chrome.runtime.getManifest();
var state = {
  app: {
    version: manifest.version,
  },
  displayOn: true,
  launchDate: new Date(),
  updateAvailable: false,
  restartRequired: false,
};

function setState(key, val) {
  console.log('Setting state', key);
  state[key] = val;
}

// Assume healthy at launch
var lastHeartbeat = new Date;

// Regularly transmit our state to the application
setInterval(async function() {

  // fetch select system statistics into state
  state.memory = await callAsPromise(chrome.system.memory.getInfo);
  const cpuInfo = await callAsPromise(chrome.system.cpu.getInfo);
  state.cpu = {
    modelName: cpuInfo.modelName,
    temperatures: cpuInfo.temperatures,
    usage: cpuInfo.processors.reduce((totals, p) => {
      for (key in p.usage) {
        totals[key] += p.usage[key];
      }
      return totals;
    }, {idle: 0, kernel: 0, total: 0, user: 0}),
  };

  // pass state if possible
  if (webview && webview.contentWindow) {
    webview.contentWindow.postMessage({
      command: 'state',
      fields: state
    }, '*');
  }
}, 30 * 1000);

window.addEventListener('message', function(event) {
  if (event.source === event.target) return;
  if (event.data.constructor !== Object) return;
  if (!event.data.command) return;
  console.log('Received message:', event.data.command);

  switch (event.data.command) {
    case 'config':
      config = event.data.config;
      console.log('Updated config:', config);

      updatePower();

      if (config.fourUp) {
        enable4up();
      } else {
        disable4up();
      }

      window.onresize();
      break;

    case 'getState':
      webview.contentWindow.postMessage({
        command: 'state',
        fields: state
      }, '*');
      break;

    case 'heartbeat':
      lastHeartbeat = new Date;
      break;

    case 'reboot':
      console.log('Resetting the device (kiosk only)');
      chrome.runtime.restart();
      break;
  }
});

// Monitor presence of 'online' heartbeats from the guest application
function checkHeartbeat() {
  const msSinceHealthy = new Date() - lastHeartbeat;

  // Some large amount of time without server comms
  if (msSinceHealthy > 6 * 60 * 60 * 1000) {
    // Looks like we haven't been online. Go postal
    console.log('Automatically resetting the device due to stalled heartbeat (kiosk only)');
    chrome.runtime.restart();
    // Consider us healthy again, so we can relax for a bit if restarts aren't working
    lastHeartbeat = new Date;
  }
}
// check every few minutes
setInterval(checkHeartbeat, 5 * 60 * 1000);

// Regular check on what power state should be
function updatePower() {
  var now = new Date();
  var on = true;

  if (config) {
    // array of hour, minute
    if (config.onAfter) {
      if (now.getHours() < config.onAfter[0]) {
        on = false;
      }
      if (now.getHours() === config.onAfter[0] && now.getMinutes() < config.onAfter[1]) {
        on = false;
      }
    }

    // array of hour, minute
    if (config.offAfter) {
      if (now.getHours() > config.offAfter[0]) {
        on = false;
      }
      if (now.getHours() === config.offAfter[0] && now.getMinutes() > config.offAfter[1]) {
        on = false;
      }
    }

    // array of day numbers to turn off for the entirety of
    if (config.daysOff) {
      if (config.daysOff.indexOf(now.getDay()) > -1) {
        on = false;
      }
    }
  }

  // Manage device power level
  if (state['displayOn'] !== on) {
    console.log('Display keepawake:', on);
    setState('displayOn', on);
  }
  chrome.power.requestKeepAwake(on ? 'display' : 'system');
}
updatePower();
setInterval(updatePower, 60 * 1000); // Every minute

window.onload = function() {
  var loading = document.querySelector('#loading');
  loading.remove();

  //chrome.system.display.getInfo(function (display) {
  setDomain();
  //setDomain('http://localhost:3000');
  //});

  chrome.power.requestKeepAwake('display');

  // Report some system states
  chrome.runtime.onUpdateAvailable.addListener(function (details) {
    setState('updateAvailable', details);
  });
  chrome.runtime.onRestartRequired.addListener(function (reason) {
    setState('restartRequired', reason);
  });
  chrome.runtime.getPlatformInfo(function (platform) {
    setState('platformInfo', platform);
  });

  webview.addEventListener("exit", function(event) {
    // FIXME: We could try reloading the guest, but we might have multiple panes
    setTimeout(function() {
      console.log('Automatically resetting the device due to exited page (kiosk only)');
      chrome.runtime.restart();
    }, 15000);
  });

  webview.addEventListener("contentload", function(event) {
    setTimeout(function() {
      webview.contentWindow.postMessage({
        command: 'startup'
      }, '*');
    }, 5000);
  });

  // Support video capture if desired
  webview.addEventListener('permissionrequest', function(e) {
    if (e.permission === 'media') {
      e.request.allow();
      setState('mediaRequested', new Date());
    }
  });

  /*
    chrome.storage.local.get('domain', function (settings) {
      if (settings.domain) {
        setDomain(settings.domain);
      } else {
        showSetup();
      }
    });
  */
};

// TODO: onunload not allowed
//window.onunload = function() {
//  chrome.power.releaseKeepAwake();
//};

const appWin = chrome.app.window.current();
const partition = 'persist:withboard' + appWin.id;

var webview;
function setDomain() {
  var setup = document.querySelector('#setup');
  setup.remove();

  if (!webview) {
    webview = document.createElement('webview');
    webview.addEventListener('loadstop', function () {
      chrome.app.window.current().show();
      webview.setZoomMode('per-view');
      window.onresize();
    });
  }
  webview.partition = partition;
  webview.src = domain + '/display';
  document.body.appendChild(webview);
  webview.focus();
}

function buildExtraView(pane) {
  var view = document.createElement('webview');
  view.addEventListener('loadstop', function () {
    webview.setZoomMode('per-view');
    window.onresize();
  });

  view.partition = partition;
  view.src = domain + '/display?pane=' + pane;
  return view;
}

var extraViews = [];
function enable4up() {
  if (extraViews.length) {
    return;
  }

  extraViews.push(buildExtraView('topRight'));
  extraViews.push(buildExtraView('bottomLeft'));
  extraViews.push(buildExtraView('bottomRight'));

  document.body.classList.add('fourup');
  extraViews.forEach(view => {
    document.body.appendChild(view);
  });
}

function disable4up() {
  extraViews.forEach(view => {
    view.remove();
  });
  document.body.classList.remove('fourup');
  extraViews = [];
}

function showSetup() {
  var setup = document.querySelector('#setup');
  var domainBox = document.querySelector('#domain');
  setup.style.display = 'block';

  setup.addEventListener('submit', function (event) {
    event.preventDefault();

    chrome.storage.local.set({domain: domainBox.value}, function () {
      setDomain(domainBox.value);
    });
  });

  domainBox.focus();
}

window.onresize = function() {
  var ratio;

  if (config && config.zoom) {
    ratio = config.zoom;
  } else {
    ratio = document.body.clientWidth / 1280;
  }
  if (extraViews.length) {
    ratio /= 2;
  }

  if (webview) {
    webview.setZoom(ratio);
  }
  extraViews.forEach(view => {
    view.setZoom(ratio);
  });

  setState('screenSize', {
    width: document.body.clientWidth,
    height: document.body.clientHeight,
  });
};

function callAsPromise(func, ...args) {
  return new Promise((resolve, reject) => {
    args.push(resolve);
    func.apply(null, args);
  })
}
