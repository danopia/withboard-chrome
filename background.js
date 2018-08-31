chrome.app.runtime.onLaunched.addListener(function (launchData) {
  chrome.system.display.getInfo(function (displays) {
    let displayNum = 0;

    for (const display of displays) {
      console.log('launching onto', display);

      const num = displayNum++;
      const suffix = num ? ''+num : '';

      chrome.app.window.create('index.html', {
        id: 'display'+suffix,
        bounds: display.bounds,
      });
    }
   });
});
