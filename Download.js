const fs = require('fs');
const http = require('http') // For jsdoc
const IncomingMessage = http.IncomingMessage
const makeRequest = require('./makeRequest');
const stream = require('stream');
var HttpsProxyAgent = require('https-proxy-agent');
const { Transform } = require('stream')
const util = require('util');
const FileProcessor = require('./utils/FileProcessor');
const pipelinePromisified = util.promisify(stream.pipeline);
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);
const { deduceFileName, exists } = require('./utils/fileName');
const { isJson } = require('./utils/string');
const unlink = util.promisify(fs.unlink)
const rename = util.promisify(fs.rename)

const downloadStatusEnum = {
    COMPLETE:'COMPLETE',
    ABORTED:"ABORTED"
}

module.exports = class Download {

    /**
   * 
   * @param {object} config 
   * @param {string} config.url 
   * @param {string} [config.directory]    
   * @param {string} [config.fileName = undefined] 
   * @param {boolean } [config.cloneFiles=true] 
   * @param {boolean} [config.skipExistingFileName = false]
   * @param {number} [config.timeout=6000]   
   * @param {object} [config.headers = undefined] 
   * @param {object} [config.httpsAgent = undefined] 
   * @param {string} [config.proxy = undefined]   
   * @param {function} [config.onResponse = undefined] 
   * @param {function} [config.onBeforeSave = undefined] 
   * @param {function} [config.onProgress = undefined]   
   * @param {boolean} [config.shouldBufferResponse = false] 
   * @param {boolean} [config.useSynchronousMode = false] 
   */
    constructor(config) {

        const defaultConfig = {
            directory: './',
            fileName: undefined,
            timeout: 6000,
            useSynchronousMode: false,
            httpsAgent: undefined,
            proxy: undefined,
            headers: undefined,
            cloneFiles: true,
            skipExistingFileName: false,
            shouldBufferResponse: false,
            onResponse: undefined,
            onBeforeSave: undefined,
            onProgress: undefined
        }

        this.config = {
            ...defaultConfig,
            ...config
        }


        this.isCancelled = false;
        this.cancelCb = null;//Function from makeRequest, to cancel the download.
        this.percentage = 0;
        this.fileSize = null;
        this.currentDataSize = 0;
        this.originalResponse = null;//The IncomingMessage read stream.


    }



    /**
    * The entire download process.
    * @return {Promise<{filePath:string | null,downloadStatus:(keyof downloadStatusEnum)} | void>}
    */
    async start() {

        await this._verifyDirectoryExists(this.config.directory)


        if (this.config.fileName && this.config.skipExistingFileName) {
            if (await exists(this.config.directory + '/' + this.config.fileName)) {
                return { downloadStatus: downloadStatusEnum.ABORTED, filePath: null }
            }
        }

        try {
            const { dataStream, originalResponse } = await this._request();

            this.originalResponse = originalResponse;

            if (originalResponse.statusCode > 226) {

                const error = await this._createErrorObject(dataStream, originalResponse)

                throw error;
            }

            if (this.config.onResponse) {

                const shouldContinue = await this.config.onResponse(originalResponse);
                if (shouldContinue === false) {
                    return { downloadStatus: downloadStatusEnum.ABORTED, filePath: null }
                }
            }


            const finalPath = await this._save({ dataStream, originalResponse })
            return { filePath:finalPath, downloadStatus: finalPath ? downloadStatusEnum.COMPLETE : downloadStatusEnum.ABORTED}
        } catch (error) {

            if (this.isCancelled) {
                const customError = new Error('Request cancelled')
                customError.code = 'ERR_REQUEST_CANCELLED'
                throw customError
            }
            throw error;
        }

    }

    async _createErrorObject(dataStream, originalResponse) {
        const responseString = await this._getStringFromStream(dataStream);

        const error = new Error(`Request failed with status code ${originalResponse.statusCode}`)

        error.statusCode = originalResponse.statusCode

        error.response = originalResponse

        error.responseBody = isJson(responseString) ? JSON.parse(responseString) : responseString

        return error;
    }




    async _getStringFromStream(stream) {
        const buffer = await this._createBufferFromResponseStream(stream);
        return buffer.toString();
    }


    /**
     * 
     * @param {string} directory 
     */
    async _verifyDirectoryExists(directory) {
        await mkdir(directory, { recursive: true });
    }



    /**
     * @return {Promise<{dataStream:stream.Readable,originalResponse:IncomingMessage}}  
     */
    async _request() {
        const { dataStream, originalResponse } = await this._makeRequest();
        const headers = originalResponse.headers;
        const contentLength = headers['content-length'] || headers['Content-Length'];
        this.fileSize = parseInt(contentLength);
        return { dataStream, originalResponse }

    }

    /**
     * @param {Promise<{dataStream:stream.Readable,originalResponse:IncomingMessage}}  
     * @return {Promise<string | null>} finalPath
     */
    async _save({ dataStream, originalResponse }) {

        try {
            let { finalFileName, originalFileName } = await this._getFileName(originalResponse.headers);

            if (this.config.skipExistingFileName && await exists(this.config.directory + '/' + originalFileName)) {
                // will skip this request
                return null;
            }

            if (this.config.onBeforeSave) {
                const clientOverideName = await this.config.onBeforeSave(finalFileName)
                if (clientOverideName && typeof clientOverideName === 'string') {
                    finalFileName = clientOverideName;
                }
            }

            const finalPath = `${this.config.directory}/${finalFileName}`;

            var tempPath = this._getTempFilePath(finalPath);

            if (this.config.shouldBufferResponse) {
                const buffer = await this._createBufferFromResponseStream(dataStream);
                await this._saveFromBuffer(buffer, tempPath);
            } else {
                await this._saveFromReadableStream(dataStream, tempPath);
            }
            await this._renameTempFileToFinalName(tempPath, finalPath)

            return finalPath;

        } catch (error) {
            if (!this.config.shouldBufferResponse)
                await this._removeFailedFile(tempPath)

            throw error;
        }


    }





    /**
     * 
     * @return {Promise<{dataStream:stream.Readable,originalResponse:IncomingMessage}}  
     */
    async _makeRequest() {
        const { timeout, headers, proxy, url, httpsAgent } = this.config;
        const options = {
            timeout,
            headers
        }
        if (httpsAgent) {
            options.agent = httpsAgent;
        }
        else if (proxy) {
            options.agent = new HttpsProxyAgent(proxy)
        }

        const { makeRequestIter, cancel, } = makeRequest(url, options)
        this.cancelCb = cancel
        const { dataStream, originalResponse, } = await makeRequestIter()

        return { dataStream, originalResponse }
    }



    /**
     * 
     * @param {string} fullPath 
     * @return {Promie<WritableStream>}
     */
    _createWriteStream(fullPath) {
        return fs.createWriteStream(fullPath)
    }

    /**
     * 
     * @param {stream.Readable} stream 
     * @returns 
     */
    async _createBufferFromResponseStream(stream) {
        const chunks = []
        for await (let chunk of stream) {
            chunks.push(chunk)
        }

        const buffer = Buffer.concat(chunks)
        return buffer;
    }


    _getProgressStream() {
        const that = this;
        const progress = new Transform({

            transform(chunk, encoding, callback) {

                that.currentDataSize += chunk.byteLength;
                if (that.fileSize) {
                    that.percentage = ((that.currentDataSize / that.fileSize) * 100).toFixed(2)
                } else {
                    that.percentage = NaN
                }

                const remainingFracture = (100 - that.percentage) / 100;
                const remainingSize = Math.round(remainingFracture * that.fileSize);


                if (that.config.onProgress) {
                    that.config.onProgress(that.percentage, chunk, remainingSize);
                }

                // Push the data onto the readable queue.
                callback(null, chunk);
            }
        });

        return progress;

    }







    async _pipeStreams(arrayOfStreams) {
        await pipelinePromisified(...arrayOfStreams);
    }



    async _saveFromReadableStream(read, path) {
        const streams = [read];
        const write = this._createWriteStream(path)
        if (this.config.onProgress) {
            const progressStream = this._getProgressStream()
            streams.push(progressStream);

        }
        streams.push(write)
        await this._pipeStreams(streams)


    }



    async _saveFromBuffer(buffer, path) {
        await writeFile(path, buffer)

    }

    async _removeFailedFile(path) {
        await unlink(path);
    }

    async _renameTempFileToFinalName(temp, final) {
        await rename(temp, final)
    }

    /**
     * 
     * @param {string} finalpath 
     */
    _getTempFilePath(finalpath) {
        return `${finalpath}.download`;
    }



    /**
     * @param {object} responseHeaders 
     */
    async _getFileName(responseHeaders) {
        let originalFileName;
        let finalFileName;
        if (this.config.fileName) {
            originalFileName = this.config.fileName
        } else {
            originalFileName = deduceFileName(this.config.url, responseHeaders)
        }

        if (this.config.cloneFiles === true) {
            var fileProcessor = new FileProcessor({ useSynchronousMode: this.config.useSynchronousMode, fileName: originalFileName, path: this.config.directory })

            finalFileName = await fileProcessor.getAvailableFileName()
        } else {
            finalFileName = originalFileName
        }

        return { finalFileName, originalFileName };
    }


    cancel() {
        if (this.cancelCb) {
            this.isCancelled = true;

            this.cancelCb()
        }


    }
}


