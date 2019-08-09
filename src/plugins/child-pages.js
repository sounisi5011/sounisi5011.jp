const path = require('path');

function arrayStartsWith(targetArray, searchArray) {
  if (searchArray.length <= targetArray.length) {
    return searchArray.every((value, index) => targetArray[index] === value);
  }
  return false;
}

function arrayEquals(array1, array2) {
  return array1.length === array2.length && arrayStartsWith(array1, array2);
}

function splitPath(pathstr) {
  return path.normalize(pathstr).split(path.sep);
}

function findFilename(files, filedata) {
  const entry = Object.entries(files).find(([, value]) => value === filedata);
  return entry ? entry[0] : undefined;
}

function getPathList(files, filedata) {
  const filename = findFilename(files, filedata);
  if (typeof filename !== 'string') {
    return [];
  }
  return splitPath(filename);
}

function toParentPathList(pathList) {
  const parentPathList = [...pathList];
  const filename = parentPathList.pop();
  if (filename !== 'index.html') {
    parentPathList.push(filename);
  }
  return parentPathList;
}

const defaultDesc = {
  configurable: true,
  enumerable: true,
};

module.exports = () => {
  return (files, metalsmith, done) => {
    Object.values(files).forEach(filedata => {
      Object.defineProperties(filedata, {
        childPages: {
          ...defaultDesc,
          get() {
            return ({ descendant = false } = {}) => {
              const parentPathList = toParentPathList(
                getPathList(files, filedata),
              );
              return Object.entries(files)
                .filter(([filename]) => {
                  const childPathList = toParentPathList(splitPath(filename));
                  return (
                    (descendant
                      ? parentPathList.length < childPathList.length
                      : parentPathList.length === childPathList.length - 1) &&
                    arrayStartsWith(childPathList, parentPathList)
                  );
                })
                .map(([, filedata]) => filedata);
            };
          },
          set() {},
        },
        parentPage: {
          ...defaultDesc,
          get() {
            return () => {
              const parentPathList = toParentPathList(
                getPathList(files, filedata),
              );
              parentPathList.pop();
              const parentEntry = Object.entries(files).find(([filename]) => {
                const pathList = toParentPathList(splitPath(filename));
                return arrayEquals(parentPathList, pathList);
              });

              return parentEntry ? parentEntry[1] : undefined;
            };
          },
          set() {},
        },
        pathList: {
          ...defaultDesc,
          get() {
            return getPathList(files, filedata);
          },
          set() {},
        },
      });
    });
    done();
  };
};
