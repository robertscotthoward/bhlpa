function log(s) {
    console.log(s)
    var l = $('#out').text()
    l += s + '\n'
    $('#out').text(l)
  }
  
  log('Script Init')
  
  window.BrowserInfo = function () {
    return {
      isHTTPS: false,
      hasWebCam: false,
      hasMicrophone: false,
      hasSpeakers: false,
      devices: [],
    }
  }
  
  /**
   * Methods that deal with client identification, geolocation and distances.
   * This class is an abstraction layer to the runtime environment, which are
   *   - Desktop Browser
   *   - Mobile Browser
   *   - Mobile WebView
   * where "Mobile" means iOS or Android.
   *
   * EXAMPLE:
   * var browser = new Browser()
   * log(`The coords are ${await browser.getPlaformObject().getGeoCoordinatesAsync()}`)
   */
  var Browser = function () {
    // Create the global callback function that iOS BMA needs.
    log('Browser.ctor()')
  
    window.DataFromBMA = function (type, info) {
      switch (type) {
        case 'deviceInfo':
        case 'geoCoordinates':
          // Interpret the 'info' as a JSON string.
          window.DataFromBMA_Value = JSON.parse(info)
          break
        default:
          log(`ERROR: DataFromBMA type '${type}' undefined.`)
          break
      }
    }
  }
  
  Browser.prototype.getPlatformObject = function () {
    // ===== IOS =====
    // Are we running in iOS WebView?
    if (window.webkit != undefined) {
      // Yes. iOS WebView!
      // The webkit object only exists in iOS WebView
  
      // TODO: Ensure that this works.
      window.webkit.messageHandlers.BMA.postMessage('getDeviceInfo')
      var deviceInfo = window.DataFromBMA_Value
  
      return {
        getDeviceInfoAsync: async () => {
          // Trigger the iOS BMA code to callback to our window.DataFromBMA() method,
          // which will set the window.window.DataFromBMA_Value global variable.
          return deviceInfo
        },
        getGeoCoordinatesAsync: () => {
          // Trigger the iOS BMA code to callback to our window.DataFromBMA() method,
          // which will set the window.window.DataFromBMA_Value global variable.
          window.webkit.messageHandlers.BMA.postMessage('getGeoCoordinates')
          return window.window.DataFromBMA_Value
        },
        isLocationServicesEnabled: () => {
          // Trigger the iOS BMA code to callback to our window.DataFromBMA() method,
          // which will set the window.window.DataFromBMA_Value global variable.
          window.webkit.messageHandlers.BMA.postMessage('getDeviceInfo')
          return window.window.DataFromBMA_Value.isLocationServicesEnabled
        },
        showSettings: () =>
          window.webkit.messageHandlers.BMA.postMessage('showSettings'),
      }
    }
  
    // ===== ANDROID =====
    // No. Are we running in Android WebView?
    if (window.BMA != undefined) {
      // Yes. Android WebView!
      // Android injects a BMA object.
  
      // TODO: Ensure that this works.
      var info = window.BMA.getDeviceInfo()
      return {
        getDeviceInfoAsync: async () => info,
        showSettings: () => window.BMA.showSettings(),
        isLocationServicesEnabled: info.isLocationServicesEnabled,
        getGeoCoordinatesAsync: async () => await window.BMA.getGeoCoordinates(),
      }
    }
  
    // ===== DEFAULT =====
    // We are running in a desktop browser or Safari on iOS or Chrome on Android, etc.
    // Definitely not in a WebView running inside the BMA.
    log(`getPlatformObject: DEFAULT`)
    return {
      getDeviceInfoAsync: async function () {
        console.log(window.Browser)
        return {
          type: window.Browser.getBrowserType(),
          isWebView: false,
          isLocationServicesEnabled: await window.Browser.isLocationServicesEnabledAsync(),
          getGeoCoordinatesAsync: await window.Browser.getGeoCoordinatesAsync(),
        }
      },
      showSettings: function () {
        log('showSettings() is undefined for desktop browsers.')
      },
      getGeoCoordinatesAsync: async function () {
        return await window.Browser.getGeoCoordinatesAsync()
      },
    }
  }
  
  Browser.prototype.getDevices = async function () {
    return await navigator.mediaDevices.enumerateDevices()
  }
  
  /**
   * See https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
   * @returns an object of type BrowserInfo
   */
  Browser.prototype.getBrowserInfoAsync = async function () {
    var info = new window.BrowserInfo()
    info.devices = await this.getDevices()
  
    info.isHTTPS = location.protocol === 'https:'
  
    info.devices.forEach((device) => {
      if (device.kind === 'audio') device.kind = 'audioinput'
      if (device.kind === 'video') device.kind = 'videoinput'
      // Chrome does not allow setting the deviceId:
      // if (!device.deviceId) device.deviceId = device.id
      // if (!device.id) device.id = device.deviceId
      if (device.kind === 'videoinput') info.hasWebCam = true
      if (device.kind === 'audioinput') info.hasMicrophone = true
      if (device.kind === 'audiooutput') info.hasSpeakers = true
    })
  
    return info
  }
  
  /**
   *
   * @returns "granted", "prompt", "denied"
   */
  Browser.prototype.getLocationServicesStateAsync = async function () {
    var result = await navigator.permissions.query({ name: 'geolocation' })
    return result.state
  }
  
  Browser.prototype.isLocationServicesEnabledAsync = async function () {
    var state = await this.getLocationServicesStateAsync()
    if (state === 'granted') {
      return true
    } else if (state === 'prompt') {
      return false
    }
    return false
  }
  
  /**
   * Return the geo coordinates of this device.
   * @returns an object with properties:
   *   latitude, longitude, and accuracy (in meters)
   */
  Browser.prototype.getGeoCoordinatesAsync = async function () {
    if (!navigator.geolocation) return null
  
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject)
    })
  
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy, // meters
    }
  }
  
  /**
   * Return the number of meters between two geo coordinates on the spherical Earth.
   * @param {float} lat1
   * @param {float} lon1
   * @param {float} lat2
   * @param {float} lon2
   * @returns
   */
  Browser.prototype.distanceBetweenInMeters = function (lat1, lon1, lat2, lon2) {
    const R = 6371e3 // meters
    const φ1 = (lat1 * Math.PI) / 180 // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180
  
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
    const d = R * c // meters
    return d
  }
  
  /**
   * Determine the mobile operating system.
   * @returns {String} - 'iOS', 'Android', 'Windows Phone', 'Windows 10', 'Macintosh', 'Linux', or 'unknown'.
   */
  Browser.prototype.getOperatingSystem = function () {
    var userAgent = navigator.userAgent || window.opera
  
    // Windows Phone must come first because its UA also contains "Android"
    if (/windows phone/i.test(userAgent)) return 'Windows Phone'
    if (/android/i.test(userAgent)) return 'Android'
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) return 'iOS'
    if (/Windows NT 10.0/.test(userAgent) && !window.MSStream)
      return 'Windows 10'
    if (/Macintosh/.test(userAgent) && !window.MSStream) return 'Macintosh'
    if (/Linux/.test(userAgent) && !window.MSStream) return 'Linux'
    return 'unknown'
  }
  
  Browser.prototype.getBrowserType = function () {
    var ua = navigator.userAgent
    var tem
    var M =
      ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) ||
      []
    if (/trident/i.test(M[1])) {
      tem = /\brv[ :]+(\d+)/g.exec(ua) || []
      return 'IE ' + (tem[1] || '')
    }
    if (M[1] === 'Chrome') {
      tem = ua.match(/\b(OPR|Edge)\/(\d+)/)
      if (tem != null) return tem.slice(1).join(' ').replace('OPR', 'Opera')
    }
    M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?']
    if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1])
    return M.join(' ')
  }
  
  window.Browser = new Browser()
  