var domain = 'https://withboard.scopely.io';
//var domain = 'http://localhost:3000';

var config;
var manifest = chrome.runtime.getManifest();
var state = {
  app: {
    version: manifest.version,
    permissions: manifest.permissions,
  },
  displayOn: true,
  launchDate: new Date(),
};

function setState(key, val) {
  console.log('Setting state', key);
  state[key] = val;
  
  if (webview && webview.contentWindow) {
  	webview.contentWindow.postMessage({
  		command: 'state',
  		fields: state
  	}, '*');
  }
}

window.addEventListener('message', function(event) {
	if (event.source === event.target) return;
	if (event.data.constructor !== Object) return;
	if (!event.data.command) return;
	console.log('Received message:', event.data);
	
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
	 
	  case 'reboot':
	    console.log('Resetting the device (kiosk only)');
	    chrome.runtime.restart();
	    break;
	}
});

// Regular check on what power state should be
function updatePower() {
  var now = new Date();
  var on = true;
  
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

  // Manage device power level
  console.log('Display keepawake:', on);
  setState('displayOn', on);
  chrome.power.requestKeepAwake(on ? 'display' : 'system');
}
setInterval(updatePower, 30 * 1000); // Every minute

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

  webview.addEventListener("loadstop", function(event) {
		webview.contentWindow.postMessage({
			command: 'startup'
		}, '*');
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

window.onunload = function() {
  chrome.power.releaseKeepAwake();
};

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
  webview.partition = 'persist:withboarddisplay';
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
  
  view.partition = 'persist:withboarddisplay';
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
