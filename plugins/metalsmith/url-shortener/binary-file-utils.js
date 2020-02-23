class DataChunk {
  /**
   * @param {Object.<string, number>} chunkTypeRecord
   * @param {Buffer} data
   * @param {number} index
   */
  constructor(chunkTypeRecord, data = null, index = 0) {
    /** @private */
    this._chunkTypeMap = this._validateChunkTypeRecord(chunkTypeRecord);

    /**
     * @private
     * @type {Map.<number, Buffer>}
     */
    this._dataMap = new Map();

    if (data) {
      const startIndex = index;
      const { dataList, endIndex } = this._readDataChunks(data, startIndex);
      for (const { chunkType, data } of dataList) {
        this._appendBuffer(chunkType, data);
      }
      /** @private */
      this._data = data.subarray(startIndex, endIndex);
    }
  }

  /**
   * @param {string} chunkType
   * @returns {Buffer|undefined}
   */
  getBuffer(chunkType) {
    return this._getBuffer(this._getChunkTypeInt(chunkType));
  }

  /**
   * @param {string} chunkType
   * @param {Buffer} data
   */
  setBuffer(chunkType, data) {
    this._setBuffer(this._getChunkTypeInt(chunkType), data);
  }

  /**
   * @param {string} chunkType
   * @param {Buffer} data
   */
  appendBuffer(chunkType, data) {
    this._appendBuffer(this._getChunkTypeInt(chunkType), data);
  }

  /**
   * @param {string} chunkType
   * @returns {number|undefined}
   */
  getInt(chunkType) {
    const data = this.getBuffer(chunkType);
    if (!data) return undefined;
    return data.reduce((value, int, index) => value | (int << (8 * index)), 0);
  }

  /**
   * @param {string} chunkType
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
   * @param {number} chunkType
   * @returns {Buffer|undefined}
   */
  _getBuffer(chunkType) {
    return this._dataMap.get(chunkType);
  }

  /**
   * @private
   * @param {number} chunkType
   * @param {Buffer} data
   */
  _setBuffer(chunkType, data) {
    if (data.length < 1) {
      throw new TypeError(`空のBufferを設定することはできません`);
    }
    this._data = null;
    this._dataMap.set(chunkType, data);
  }

  /**
   * @requires
   * @param {number} chunkType
   * @param {Buffer} data
   */
  _appendBuffer(chunkType, data) {
    const prevData = this._getBuffer(chunkType);
    this._setBuffer(
      chunkType,
      prevData ? Buffer.concat([prevData, data]) : data,
    );
  }

  /**
   * @param {Object.<string, number>} chunkTypeRecord
   * @returns {Map.<string, number>}
   */
  _validateChunkTypeRecord(chunkTypeRecord) {
    /** @type {Map.<number, string>} */
    const duplicateMap = new Map();
    const chunkTypeEntries = Object.entries(chunkTypeRecord);
    for (const [typeName, typeInt] of chunkTypeEntries) {
      if (!(Number.isInteger(typeInt) && typeInt >= 0x00 && typeInt <= 0xff)) {
        throw new Error(
          `chunkType "${typeName}" の値が正しくありません。指定できる値は0以上${0xff}以下の整数です`,
        );
      }
      const existsTypeName = duplicateMap.get(typeInt);
      if (existsTypeName) {
        throw new Error(
          `chunkType "${typeName}" の値が "${existsTypeName}" と重複しています`,
        );
      }
      duplicateMap.set(typeInt, typeName);
    }
    return new Map(chunkTypeEntries);
  }

  /**
   * @param {string} chunkType
   * @returns {number}
   */
  _getChunkTypeInt(chunkType) {
    if (typeof chunkType !== 'string') {
      throw new TypeError(`chunkTypeに指定できる値は文字列のみです`);
    }
    const typeInt = this._chunkTypeMap.get(chunkType);
    if (typeof typeInt !== 'number') {
      throw new Error(`chunkType "${chunkType}" は定義されていません`);
    }
    return typeInt;
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
