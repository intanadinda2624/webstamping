// ========================================
// FIREBASE CONFIGURATION
// ========================================
// Firebase project: monitoring-hasil-stamping
// Database URL from ESP32 code

const FIREBASE_CONFIG = {
  databaseURL: "https://monitoring-hasil-stamping-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Firebase Realtime Database REST API helper
const FirebaseDB = {
  baseURL: FIREBASE_CONFIG.databaseURL,

  // GET data from a path
  async get(path) {
    try {
      const response = await fetch(`${this.baseURL}/${path}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Firebase GET ${path}:`, error);
      throw error;
    }
  },

  // PUT (overwrite) data at a path
  async put(path, data) {
    try {
      const response = await fetch(`${this.baseURL}/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Firebase PUT ${path}:`, error);
      throw error;
    }
  },

  // POST (push) data to a path
  async post(path, data) {
    try {
      const response = await fetch(`${this.baseURL}/${path}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Firebase POST ${path}:`, error);
      throw error;
    }
  },

  // Listen to changes using Server-Sent Events (SSE)
  listen(path, callback) {
    const url = `${this.baseURL}/${path}.json`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data, null);
      } catch (e) {
        callback(null, e);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`Firebase SSE ${path}:`, error);
      callback(null, error);
    };

    return eventSource;
  }
};

// Machine name constant (matches ESP32)
const MACHINE_NAME = "Mesin Stamping Box";
