const express = require("express");
const fs = require("fs");
const { Readable } = require("stream");

const port = "3002";
const app = express();
app.get("/cancelWhileStream", (req, res) => {
  const read = fs.createReadStream("./fixtures/Desert.jpg", {
    highWaterMark: 2000,
  });

  const modifiedStream = Readable.from(
    (async function* () {
      for await (const chunk of read) {
        await timeout(1000);
        yield chunk;
      }
    })()
  );
  modifiedStream.pipe(res);
});

app.get("/cancelBeforeStream", async (req, res) => {
  await timeout(3000);
  const read = fs.createReadStream("./fixtures/Desert.jpg");

  const modifiedStream = Readable.from(
    (async function* () {
      for await (const chunk of read) {
        yield chunk;
      }
    })()
  );
  modifiedStream.pipe(res);
});

app.get("/timeoutDuringStream", (req, res) => {
  const read = fs.createReadStream("./fixtures/Koala.jpg", {
    highWaterMark: 2000,
  });

  const modifiedStream = Readable.from(
    (async function* () {
      let counter = 0;
      for await (const chunk of read) {
        if (counter === 0) {
          counter++;
          yield chunk;
        } else {
          await timeout(2000);
          yield chunk;
        }
      }
    })()
  );
  modifiedStream.pipe(res);
});

app.get("/timeoutBeforeResponse", async (req, res) => {
  const read = fs.createReadStream("./fixtures/Koala.jpg", {
    highWaterMark: 2000,
  });
  await timeout(5000);
  const modifiedStream = Readable.from(
    (async function* () {
      for await (const chunk of read) {
        yield chunk;
      }
    })()
  );
  modifiedStream.pipe(res);
});

app.get("/koala", async (req, res) => {
  const read = fs.createReadStream("./fixtures/Koala.jpg", {
    highWaterMark: 2000,
  });

  const modifiedStream = Readable.from(
    (async function* () {
      for await (const chunk of read) {
        yield chunk;
      }
    })()
  );
  modifiedStream.pipe(res);
});

const server = app.listen(port, () => {
  console.log(port);
});

function timeout(mil) {
  return new Promise((res) => {
    setTimeout(() => {
      res();
    }, mil);
  });
}

module.exports = {
  app,
  server,
};
