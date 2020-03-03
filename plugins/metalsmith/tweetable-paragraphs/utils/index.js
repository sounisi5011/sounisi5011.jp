function sortProps(value) {
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value)
      .sort()
      .reduce(
        (obj, prop) => Object.assign(obj, { [prop]: sortProps(value[prop]) }),
        {},
      );
  }
  return value;
}
exports.sortProps = sortProps;
