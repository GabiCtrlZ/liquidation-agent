const BNtoNum = (bn) => parseInt(bn.toString())
const toBN = (num) => ethers.BigNumber.from(num)

const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate))
  .then((results) => arr.filter((_v, index) => results[index]))

module.exports = {
  BNtoNum,
  toBN,
  asyncFilter,
}