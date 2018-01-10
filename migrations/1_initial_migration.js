/* global artifacts */

const Migrations = artifacts.require('./Migrations.sol');

module.exports = function migrate(deployer) {
  deployer.deploy(Migrations);
};
