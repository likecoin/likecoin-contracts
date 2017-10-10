/* global artifacts */

const LikeCoin = artifacts.require("./LikeCoin.sol");
const BigNumber = require("bignumber.js");

module.exports = (deployer) => {
    deployer.deploy(LikeCoin, new BigNumber(10000).times(new BigNumber(10).pow(10)));
};
