class DataChunk {
  /**
   * @param {Buffer} data
   * @param {number} index
   */
  constructor(data = null, index = 0) {
    /**
     * @private
     * @type {Map.<number, Buffer>}
     */
    this._dataMap = new Map();

    if (data) {
      const startIndex = index;
      const { dataList, endIndex } = this._readDataChunks(data, startIndex);
      for (const { chunkType, data } of dataList) {
        this.appendBuffer(chunkType, data);
      }
      /** @private */
      this._data = data.subarray(startIndex, endIndex);
    }
  }

  /**
   * @param {number} chunkType
   * @returns {Buffer|undefined}
   */
  getBuffer(chunkType) {
    return this._dataMap.get(chunkType);
  }

  /**
   * @param {number} chunkType
   * @param {Buffer} data
   */
  setBuffer(chunkType, data) {
    if (
      !(chunkType >= 0x00 && chunkType <= 0xff && Number.isInteger(chunkType))
    ) {
      throw new RangeError(
        `chunkType引数は${0x00}以上${0xff}以下の整数である必要があります`,
      );
    }
    if (data.length < 1) {
      throw new TypeError(`空のBufferを設定することはできません`);
    }
    this._data = null;
    this._dataMap.set(chunkType, data);
  }

  /**
   * @param {number} chunkType
   * @param {Buffer} data
   */
  appendBuffer(chunkType, data) {
    const prevData = this.getBuffer(chunkType);
    this.setBuffer(
      chunkType,
      prevData ? Buffer.concat([prevData, data]) : data,
    );
  }

  /**
   * @param {number} chunkType
   * @returns {number|undefined}
   */
  getInt(chunkType) {
    const data = this.getBuffer(chunkType);
    if (!data) return undefined;
    return data.reduce((value, int, index) => value | (int << (8 * index)), 0);
  }

  /**
   * @param {number} chunkType
   * @param {number} value
   */
  setInt(chunkType, value) {
    if (!(Number.isInteger(value) && value <= 0xffffffff)) {
      throw new TypeError(
        `value引数は${0xffffffff}以下の整数である必要があります`,
      );
    }
    const intList = [];
    let int = value;
    while (int) {
      intList.push(int & 0xff);
      int = int >>> 8;
    }
    this.setBuffer(chunkType, Buffer.from(intList));
  }

  toBuffer() {
    if (!this._data) {
      this._data = Buffer.concat(
        [...this._dataMap]
          .map(([chunkType, data]) => this._createDataChunk(chunkType, data))
          .reduce((bufList, list) => [...bufList, ...list], [])
          .concat(Buffer.from([0x00])),
      );
    }
    return this._data;
  }

  /**
   * @private
   * @param {Buffer} data
   * @param {number} startIndex
   * @returns {{dataList: {chunkType: number, data: Buffer}[], endIndex: number}}
   */
  _readDataChunks(data, startIndex) {
    const dataList = [];
    let currentIndex = startIndex;
    while (true) {
      const chunkLength = data[currentIndex++];
      if (chunkLength === 0x00) break;
      const chunkType = data[currentIndex++];
      dataList.push({
        chunkType,
        data: data.subarray(currentIndex, (currentIndex += chunkLength)),
      });
    }
    return { dataList, endIndex: currentIndex };
  }

  /**
   * @private
   * @param {number} chunkType
   * @param {Buffer} data
   * @returns {Buffer[]}
   */
  _createDataChunk(chunkType, data) {
    let index = 0;
    const list = [];
    while (index < data.length) {
      const chunkData = data.subarray(index, (index += 0xff));
      const chunkLength = chunkData.length;
      list.push(Buffer.from([chunkLength, chunkType]), chunkData);
    }
    return list;
  }
}

exports.DataChunk = DataChunk;
