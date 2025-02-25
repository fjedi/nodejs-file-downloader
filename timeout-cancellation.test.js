const expect = require("expect");
const { app, server } = require("./testServer");

const fs = require("fs");
const Path = require("path");
const rimraf = require("rimraf");
const Downloader = require("./Downloader");
const { Readable } = require("stream");
describe("timeout and cancellation tests", () => {
  before((done) => {
    rimraf.sync("./downloads");
    done();
  });

  after((done) => {
    if (server) {
      server.close();
    }

    done();
  });

  it("Should get ERR_REQUEST_CANCELLED error after cancellation, while streaming", async function () {
    this.timeout(0);
    let errorCounter = 0;
    const downloader = new Downloader({
      fileName: "cancelled.jpg",
      maxAttempts: 4,
      timeout: 50000,
      url: `http://localhost:3002/cancelWhileStream`,
      directory: "./downloads",
      onResponse() {
        setTimeout(() => {
          downloader.cancel();
        }, 2000);
      },
      onError() {
        errorCounter++;
      },
    });
    let error;
    try {
      await downloader.download();
    } catch (e) {
      error = e;
    } finally {
      expect(errorCounter).toBe(1);
      if (!error || error.code !== "ERR_REQUEST_CANCELLED") {
        throw new Error("Cancellation did not work");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg.download was not deleted");
      }
    }
  });

  it("Should get ERR_REQUEST_CANCELLED error after cancellation, before stream", async function () {
    this.timeout(0);
    let errorCounter = 0;
    const downloader = new Downloader({
      fileName: "cancelled.jpg",
      maxAttempts: 4,
      timeout: 50000,
      url: `http://localhost:3002/cancelBeforeStream`,
      directory: "./downloads",
      onResponse(r) {
        // downloader.cancel()
      },
      onError() {
        errorCounter++;
      },
    });
    let error;
    try {
      setTimeout(() => {
        downloader.cancel();
      }, 2000);
      await downloader.download();
    } catch (e) {
      error = e;
    } finally {
      expect(errorCounter).toBe(1);
      if (!error || error.code !== "ERR_REQUEST_CANCELLED") {
        throw new Error("Cancellation did not work");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg.download was not deleted");
      }
    }
  });

  it("Should get ERR_REQUEST_CANCELLED error after cancellation, while streaming, with shouldBufferResponse", async function () {
    this.timeout(0);
    let errorCounter = 0;
    const downloader = new Downloader({
      fileName: "cancelled.jpg",
      maxAttempts: 4,
      shouldBufferResponse: true,
      url: `http://localhost:3002/cancelWhileStream`,
      directory: "./downloads",
      onResponse() {
        setTimeout(() => {
          downloader.cancel();
        }, 1000);
      },
      onError() {
        errorCounter++;
      },
    });
    let error;
    try {
      await downloader.download();
    } catch (e) {
      error = e;
    } finally {
      expect(errorCounter).toBe(1);
      if (!error || error.code !== "ERR_REQUEST_CANCELLED") {
        throw new Error("Cancellation did not work");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/cancelled.jpg")) {
        throw new Error("cancelled.jpg.download was not deleted");
      }
    }
  });

  it("Should timeout during stream, twice", async function () {
    let error;
    this.timeout(0);
    try {
      var onErrorCount = 0;

      const downloader = new Downloader({
        timeout: 1500,
        maxAttempts: 2,
        fileName: "timeout.jpg",

        url: `http://localhost:3002/timeoutDuringStream`,
        directory: "./downloads",
        onError: function (e) {
          onErrorCount++;
        },
      });

      await downloader.download();
      debugger;
    } catch (e) {
      error = e;
    } finally {
      expect(onErrorCount).toBe(2);
      if (await doesFileExist("./downloads/timeout.jpg")) {
        throw new Error("timeout.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/timeout.jpg")) {
        throw new Error("timeout.jpg.download was not deleted");
      }
    }
  });

  it("Should timeout during stream, twice, with shouldBufferResponse", async function () {
    let error;
    this.timeout(0);
    try {
      var onErrorCount = 0;

      const downloader = new Downloader({
        timeout: 1500,
        shouldBufferResponse: true,
        maxAttempts: 2,
        fileName: "timeout.jpg",

        url: `http://localhost:3002/timeoutDuringStream`,
        directory: "./downloads",
        onError: function (e) {
          onErrorCount++;
        },
      });

      await downloader.download();
      debugger;
    } catch (e) {
      error = e;
    } finally {
      expect(onErrorCount).toBe(2);
      if (await doesFileExist("./downloads/timeout.jpg")) {
        throw new Error("timeout.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/timeout.jpg")) {
        throw new Error("timeout.jpg.download was not deleted");
      }
    }
  });

  it("Should timeout before response", async function () {
    let error;
    this.timeout(0);
    try {
      var onErrorCount = 0;

      const downloader = new Downloader({
        timeout: 1500,
        fileName: "timeout2.jpg",

        url: `http://localhost:3002/timeoutBeforeResponse`,
        directory: "./downloads",
        onError: function (e) {
          onErrorCount++;
        },
      });

      await downloader.download();
      debugger;
    } catch (e) {
      error = e;
    } finally {
      expect(error.code).toBe("ERR_REQUEST_TIMEDOUT");
      expect(onErrorCount).toBe(1);
      // await verifyFile('./downloads/koala.jpg', 29051);
      if (await doesFileExist("./downloads/timeout2.jpg")) {
        throw new Error("timeout2.jpg was not deleted");
      }
      if (await doesFileExist("./downloads/timeout2.jpg")) {
        throw new Error("timeout2.jpg.download was not deleted");
      }
    }
  });
});

function doesFileExist(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) return resolve(false);

      resolve(true);
    });
  });
}
