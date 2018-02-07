//    Copyright (C) 2017 LikeCoin Foundation Limited
//
//    This file is part of LikeCoin Smart Contract.
//
//    LikeCoin Smart Contract is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    LikeCoin Smart Contract is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with LikeCoin Smart Contract.  If not, see <http://www.gnu.org/licenses/>.

/* eslint-env mocha, node */
/* eslint no-underscore-dangle: off */
/* eslint no-await-in-loop: off */
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const ContributorPool = artifacts.require('./ContributorPool.sol');

const { coinsToCoinUnits } = utils;

const mintCoolDown = 60 * 60 * 24 * 365; // 1 year
const mintValue = coinsToCoinUnits(50000000);
const totalMintValue = mintValue.times(4);

contract('ContributorPool', (accounts) => {
  let like;
  let cp;

  before(async () => {
    like = await LikeCoin.new(0, 0x0, 0x0);
    cp = await ContributorPool.new(like.address, mintCoolDown, mintValue);
  });

  it('should register contributor pool', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, totalMintValue, { from: accounts[1] });
    }, 'ContributorPool contract should be registered by owner only');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, totalMintValue, { from: accounts[1] });
    }, 'ContributorPool contract should not be registered by pending owner');

    await like.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, totalMintValue, { from: accounts[0] });
    }, 'ContributorPool contract should not be registered by old owner');
    // change back
    await like.transferOwnership(accounts[0], { from: accounts[1] });
    await like.claimOwnership({ from: accounts[0] });

    await like.registerContributorPool(cp.address, totalMintValue, { from: accounts[0] });
    assert((await like.balanceOf(cp.address)).eq(0), 'Should not have LIKE before calling mint');
    assert((await like.totalSupply()).eq(0), 'Should not increase LIKE supply before calling mint');
  });

  it('should mint for contributor pool', async () => {
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[1] });
    }, 'Should not allow non-owner to mint');

    await cp.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[1] });
    }, 'Should not allow pending owner to mint');

    await cp.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[0] });
    }, 'Should not allow old owner to mint');

    // change back
    await cp.transferOwnership(accounts[0], { from: accounts[1] });
    await cp.claimOwnership({ from: accounts[0] });

    await cp.mint({ from: accounts[0] });
    assert((await like.balanceOf(cp.address)).eq(mintValue), 'Wrong number of LIKE being mint');
    assert((await like.totalSupply()).eq(mintValue), 'Total supply increased wrongly');

    let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const expectedNextMintTime = now + mintCoolDown;
    const nextMintTime = (await cp.nextMintTime()).toNumber();
    assert.isBelow(Math.abs(expectedNextMintTime - nextMintTime), 10, 'Wrong nextMintTime after mint');

    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[0] });
    }, 'Should not be able to mint again immediately');

    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((nextMintTime - now) - 5);
    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, nextMintTime, 'Already nextMintTime, please check test case');
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[0] });
    }, 'Should not be able to mint before nextMintTime');

    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((nextMintTime - now) + 1);
    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isAbove(now, nextMintTime, 'Still before nextMintTime, please check test case');
    await cp.mint({ from: accounts[0] });
    assert((await like.balanceOf(cp.address)).eq(mintValue.times(2)), 'Wrong number of LIKE being mint');
    assert((await like.totalSupply()).eq(mintValue.times(2)), 'Total supply increased wrongly');
  });

  it('should transfer LIKE to others', async () => {
    await utils.assertSolidityThrow(async () => {
      await cp.transfer(accounts[1], 1, { from: accounts[1] });
    }, 'Should not allow non-owner to transfer');

    await cp.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await cp.transfer(accounts[1], 1, { from: accounts[1] });
    }, 'Should not allow pending owner to transfer');

    await cp.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await cp.transfer(accounts[1], 1, { from: accounts[0] });
    }, 'Should not allow old owner to transfer');

    // change back
    await cp.transferOwnership(accounts[0], { from: accounts[1] });
    await cp.claimOwnership({ from: accounts[0] });

    const poolBalanceBefore = await like.balanceOf(cp.address);
    const receiverBalanceBefore = await like.balanceOf(accounts[1]);
    await cp.transfer(accounts[1], 1, { from: accounts[0] });
    assert((await like.balanceOf(cp.address)).eq(poolBalanceBefore.sub(1)), 'Wrong number of LIKE decreased on pool');
    assert((await like.balanceOf(accounts[1])).eq(receiverBalanceBefore.add(1)), 'Wrong number of LIKE increased on receiver');
  });

  it('should restrict transfer', async () => {
    const poolBalanceBefore = await like.balanceOf(cp.address);
    const receiverBalanceBefore = await like.balanceOf(accounts[1]);

    await utils.assertSolidityThrow(async () => {
      await cp.transfer(accounts[1], poolBalanceBefore.add(1), { from: accounts[0] });
    }, 'should not be able to transfer more LIKE than owned');

    await cp.transfer(accounts[1], poolBalanceBefore, { from: accounts[0] });
    assert((await like.balanceOf(cp.address)).eq(0), 'Wrong number of LIKE decreased on pool');
    assert((await like.balanceOf(accounts[1])).eq(receiverBalanceBefore.add(poolBalanceBefore)), 'Wrong number of LIKE increased on receiver');
  });

  it('should restrict mint', async () => {
    let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    let nextMintTime = (await cp.nextMintTime()).toNumber();

    assert.isBelow(now, nextMintTime, 'Already nextMintTime, please check test case');
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[0] });
    }, 'Should not be able to mint before nextMintTime');

    while ((await like.totalSupply()).lt(totalMintValue)) {
      now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
      await utils.testrpcIncreaseTime((nextMintTime - now) + 1);
      now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
      assert.isAbove(now, nextMintTime, 'Still before nextMintTime, please check test case');
      await cp.mint({ from: accounts[0] });
      nextMintTime = (await cp.nextMintTime()).toNumber();
    }

    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((nextMintTime - now) + 1);
    now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isAbove(now, nextMintTime, 'Still before nextMintTime, please check test case');
    await utils.assertSolidityThrow(async () => {
      await cp.mint({ from: accounts[0] });
    }, 'Should not be able to mint more than registered quota');
  });
});

// vim: set ts=2 sw=2:
