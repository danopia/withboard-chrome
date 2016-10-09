chrome.app.runtime.onLaunched.addListener(function (launchData) {
  chrome.app.window.create(
    'index.html',
    {
      id: 'mainWindow',
      bounds: {width: 1280, height: 720},
      hidden: true,
    }
  );
});