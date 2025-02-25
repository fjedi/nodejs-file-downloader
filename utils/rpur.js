const { createDelay } = require("./delay");

/**
 *
 * @param {Function} promiseFactory
 * @param {Object} config
 * @param {Function} [config.onError]
 * @param {Function} [config.shouldStop]
 * @param {Function}  [config.onAttempt]
 * @param {number}  [config.delay]
 * @param {number}  [config.maxAttempts]
 * @param {number}  [config.timeout]
 * @returns {Promise}
 */
// async function repeatPromiseUntilResolved(...args) {//Destructuring arguments in order to avoid having the "attempts" counter as part of the API.
module.exports = async function rpur(promiseFactory, config = {}) {
  const attempts = arguments[2] || 0;
  const dummy = () => false;
  const shouldStop = config.shouldStop || dummy;
  const delay = config.delay || null;
  const maxAttempts = config.maxAttempts || 0;
  const timeout = config.timeout || 60000 * 10; // Default timeout after request will be canceled is 10 minutes
  try {
    var newAttempts = attempts + 1;

    if (config.onAttempt) {
      await config.onAttempt(attempts + 1);
    }
    const promise = promiseFactory();
    const result = await promiseWithTimeout(promise, timeout);
    return result;
  } catch (error) {
    if (config.onError) {
      await config.onError(error, newAttempts);
    }

    if ((await shouldStop(error)) || newAttempts == maxAttempts) throw error;

    if (delay) {
      await createDelay(delay);
    }

    return await rpur(promiseFactory, config, newAttempts); // Calls it self, as long as there are retries left.
  }
};

function promiseWithTimeout(promise, time) {
  // debugger;
  return new Promise(async (resolve, reject) => {
    if (time) {
      var timeout = setTimeout(() => {
        reject(new Error("Promise timed out as defined in the config"));
      }, time);
    }
    try {
      const result = await promise;
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      clearTimeout(timeout);
    }
  });
}
