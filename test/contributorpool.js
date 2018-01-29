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
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');
const BigNumber = require('bignumber.js');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const ContributorPool = artifacts.require('./ContributorPool.sol');

const { coinsToCoinUnits } = utils;

const lockTime = 2 * 86400 * 365; // 2 years

const contributorAmount = coinsToCoinUnits(200000000);
const testAmount = coinsToCoinUnits(10);

contract('ContributorPool:give', (accounts) => {
  const giveId1 = []; // acct 1
  const giveId2 = []; // acct 2
  let like;
  let cp;
  let airDropAmount = new BigNumber(0);

  before(async () => {
    like = await LikeCoin.new(contributorAmount);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    // TEST_CONT_0001
    // register by non-owner (acct 1)
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[1] });
    }, 'ContributorPool contract should be registered by owner only');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[1] });
    }, 'ContributorPool contract should not be registered by pending owner');

    await like.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    }, 'ContributorPool contract should not be registered by old owner');
    // change back
    await like.transferOwnership(accounts[0], { from: accounts[1] });
    await like.claimOwnership({ from: accounts[0] });

    // TEST_CONT_0002
    // register by owner (acct 0)
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    // TEST_CONT_0039
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('deploy contributor pool again', async () => {
    // TEST_CONT_0003
    // register by owner again
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    }, 'ContributorPool contract should be registered once only');
  });

  it('give LIKE (zero value)', async () => {
    // give 0 LIKE to acct 1
    const amount = 0;
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[1], amount);
    }, 'Should not propose to give 0 LIKE');
  });

  it('give LIKE by non-owner', async () => {
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[1], testAmount, { from: accounts[5] });
    }, 'Should not allow give LIKE by non-owner');
  });

  it('give LIKE (exceed value)', async () => {
    await utils.assertSolidityThrow(async () => {
      // give (max + 1) LIKE to acct 1
      await cp.give(accounts[1], contributorAmount.add(1));
    }, 'Should not give LIKE more than available number');
  });

  it('give LIKE (negative value/overflow)', async () => {
    await utils.assertSolidityThrow(async () => {
      // execute to give -1 LIKE to acct 1
      await cp.give(accounts[1], -1);
    }, 'Should not give negative amount');
  });

  it('give LIKE (general case)', async () => {
    // TEST_CONT_0013
    assert(contributorAmount.eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (i)');
    // give LIKE to acct 1
    const amount = testAmount;
    await cp.give(accounts[1], amount);
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    assert(contributorAmount.sub(testAmount).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (ii)');
    giveId1.push(id);
    // give LIKE to acct 1
    await cp.give(accounts[1], amount);
    const id2 = (await utils.solidityEventPromise(cp.Give())).args._id;
    assert(contributorAmount.sub(testAmount.mul(2)).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (iii)');
    const acctBalance = await like.balanceOf(accounts[1]);
    assert.equal(acctBalance, 0, '0 units of LIKE should be in account[1], because not yet claimed');
    giveId1.push(id2);

    // give LIKE to acct 2
    await cp.give(accounts[2], amount);
    const id3 = (await utils.solidityEventPromise(cp.Give())).args._id;
    const acctBalance2 = await like.balanceOf(accounts[2]);
    assert.equal(acctBalance2, 0, '0 units of LIKE should be in account[2], because not yet claimed');
    assert(contributorAmount.sub(testAmount.mul(3)).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (iv)');
    giveId2.push(id3);
  });

  it('give LIKE (exceed remaining value)', async () => {
    // TEST_CONT_0014
    // give (max - testAmount) LIKE to acct 1
    const remainAmount = await cp.getRemainingLikeCoins();
    const amount = contributorAmount.sub(testAmount.mul(3)).add(1);
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[5], amount);
    }, 'Should not allow give LIKE more than remaining available number');

    // add additional likecoin so that is enough for execution.
    await like.transfer(cp.address, 1, { from: accounts[0] });
    await cp.give(accounts[5], amount);
    // add back likecoin so that remaining likecoin is same as the state before this testcase
    await like.transfer(cp.address, remainAmount, { from: accounts[0] });
    airDropAmount = airDropAmount.add(remainAmount).add(1);
  });

  it('claim LIKE (invalid time)', async () => {
    // TEST_CONT_0015
    // acct 1 claims LIKE before unlock time
    await utils.assertSolidityThrow(async () => {
      await cp.claim(giveId1[0], { from: accounts[1] });
    }, 'Should not claim LIKE successfully before unlock time');
  });

  it('after two years', async () => {
    await utils.testrpcIncreaseTime(lockTime + 1);
  });

  it('claim LIKE (no LIKE given)', async () => {
    // TEST_CONT_0016
    // acct 3 claims LIKE
    await utils.assertSolidityThrow(async () => {
      await cp.claim(giveId1[0], { from: accounts[3] });
    }, 'Should not claim like any LIKE successfully');
    const acctBalance = await like.balanceOf(accounts[3]);
    assert.equal(acctBalance, 0, '0 units of LIKE should be in account[3], because no one give LIKE to this account');
  });

  it('claim LIKE (general case)', async () => {
    // TEST_CONT_0017
    // acct 1 claims after 2 years
    await cp.claim(giveId1[0], { from: accounts[1] });
    let acctBalance = await like.balanceOf(accounts[1]);
    assert(testAmount.eq(acctBalance), `${testAmount} units of LIKE should be in account[1]`);
    // acct 2 claims after 2 years
    await cp.claim(giveId2[0], { from: accounts[2] });
    acctBalance = await like.balanceOf(accounts[2]);
    assert(testAmount.eq(acctBalance), `${testAmount} units of LIKE should be in account[2]`);
    assert(contributorAmount.sub(testAmount.mul(3)).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (v)');
    // check balance of contributor pool (note: need to add airdrop amount)
    assert(contributorAmount.add(airDropAmount).sub(testAmount.mul(2)).eq(await like.balanceOf(cp.address)), 'Check contributor pool balance');
  });

  it('claim LIKE again', async () => {
    // TEST_CONT_0018
    // acct 1 claims same give id again
    await utils.assertSolidityThrow(async () => {
      await cp.claim(giveId1[0], { from: accounts[1] });
    }, 'Should not claim LIKE again successfully');
    const acctBalance = await like.balanceOf(accounts[1]);
    assert(testAmount.eq(acctBalance), `${testAmount} units of LIKE should be in account[1]`);
  });

  it('give more LIKE and claim', async () => {
    // TEST_CONT_0019
    // give LIKE to acct 1
    const amount = testAmount;
    await cp.give(accounts[1], amount);
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    assert(contributorAmount.sub(testAmount.mul(4)).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (vi)');
    giveId1.push(id);
    await utils.assertSolidityThrow(async () => {
      await cp.claim(giveId1[2], { from: accounts[1] });
    }, 'Should not claim LIKE before unlock time');
    // increase time
    await utils.testrpcIncreaseTime(lockTime + 1);
    // acct 1 claims after 2 years
    await cp.claim(giveId1[2], { from: accounts[1] });
    const acctBalance = await like.balanceOf(accounts[1]);
    assert(testAmount.mul(2).eq(acctBalance), `${testAmount} *2 units of LIKE should be in account[1]`);
    assert(contributorAmount.sub(testAmount.mul(4)).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (vii)');
  });
});

contract('ContributorPool:give2', (accounts) => {
  const giveId3 = []; // acct 3
  // testrpc seems to have some timing error, 10 seconds difference is acceptable in practice
  const testTime = lockTime - 10;
  let like;
  let cp;
  let unlockTimestamp;

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    // register by owner (acct 0)
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('give max LIKE', async () => {
    // TEST_CONT_0020
    // give max LIKE to acct 3
    const amount = contributorAmount;
    await cp.give(accounts[3], amount);
    unlockTimestamp = web3.eth.getBlock(web3.eth.blockNumber).timestamp + lockTime;
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    giveId3.push(id);
    const acctBalance = await like.balanceOf(accounts[3]);
    assert.equal(acctBalance, 0, '0 units of LIKE should be in account[3]');
    assert.equal((await cp.getRemainingLikeCoins()), 0, 'Check LIKE remains. (i)');
  });

  it('claim before unlock time', async () => {
    // TEST_CONT_0021
    // increase time
    await utils.testrpcIncreaseTime(testTime);
    await utils.assertSolidityThrow(async () => {
      await cp.claim(giveId3[0], { from: accounts[3] });
    }, 'Should not claim LIKE successfully before unlock time(after 1 year)');
    assert.isBelow(web3.eth.getBlock(web3.eth.blockNumber).timestamp, unlockTimestamp, 'Already on or after unlock time, please check test case');
    const acctBalance = await like.balanceOf(accounts[3]);
    assert.equal(acctBalance, 0, '0 units of LIKE should be in account[3]');
  });

  it('give after giving max LIKE already', async () => {
    // TEST_CONT_0022
    // give 1 LIKE to acct 1
    const amount = 1;
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[3], amount);
    }, 'Should not give LIKE because no more available');
  });

  it('claim after unlock time', async () => {
    // TEST_CONT_0023
    // increase time
    const gap = (unlockTimestamp - web3.eth.getBlock(web3.eth.blockNumber).timestamp) + 1;
    await utils.testrpcIncreaseTime(gap);
    await cp.claim(giveId3[0], { from: accounts[3] });
    const acctBalance = await like.balanceOf(accounts[3]);
    assert(contributorAmount.eq(acctBalance), `${contributorAmount} units of LIKE should be in account[3]`);
    assert.equal((await cp.getRemainingLikeCoins()), 0, 'Check LIKE remains. (ii)');
  });
});

contract('ContributorPool:give3', (accounts) => {
  const giveId3 = []; // acct 3
  let like;
  let cp;
  const notExistId = [20, 21, 22];

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    // register by owner (acct 0)
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('claim LIKE', async () => {
    // TEST_CONT_0024
    const amount = testAmount;
    await cp.give(accounts[3], amount);
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    giveId3.push(id);
    assert(contributorAmount.sub(testAmount).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (i)');
    // increase 2 year
    await utils.testrpcIncreaseTime(lockTime + 1);
    await cp.claim(giveId3[0], { from: accounts[3] });
    assert(contributorAmount.sub(testAmount).eq(await cp.getRemainingLikeCoins()), 'Check LIKE remains. (ii)');
  });

  it('claim a not existing id', async () => {
    // TEST_CONT_0058
    await utils.assertSolidityThrow(async () => {
      await cp.claim(notExistId[2], { from: accounts[5] });
    }, 'Should not claim not existing id');
  });
});

contract('ContributorPool:transferOwnership', (accounts) => {
  const oldOwner = accounts[0];
  const newOwner = accounts[1];
  let like;
  let cp;
  let giveId1;
  let giveId2;
  let giveId3;

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    // register by owner (acct 0)
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('transfer ownership', async () => {
    await cp.give(accounts[1], 1);
    giveId1 = (await utils.solidityEventPromise(cp.Give())).args._id;
    await cp.transferOwnership(newOwner);
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[2], 2, { from: newOwner });
    }, 'Should not give by pending owner');
    await cp.give(accounts[2], 2);
    giveId2 = (await utils.solidityEventPromise(cp.Give())).args._id;
  });

  it('claim ownership', async () => {
    await cp.transferOwnership(accounts[3]);
    await utils.assertSolidityThrow(async () => {
      await cp.claimOwnership({ from: newOwner });
    }, 'Should not claim ownership by deprecated pending owner');
    await cp.transferOwnership(newOwner);
    await utils.assertSolidityThrow(async () => {
      await cp.claimOwnership({ from: accounts[3] });
    }, 'Should not claim ownership by deprecated pending owner');
    const callResult = await cp.claimOwnership({ from: newOwner });
    const event = utils.solidityEvent(callResult, 'OwnershipTransferred');
    assert.equal(event.args.previousOwner, oldOwner, "OwnershipTransferred event has wrong 'previousOwner' field");
    assert.equal(event.args.newOwner, newOwner, "OwnershipTransferred event has wrong 'newOwner' field");
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[3], 3);
    }, 'Should not give by old owner');
    await cp.give(accounts[3], 3, { from: newOwner });
    giveId3 = (await utils.solidityEventPromise(cp.Give())).args._id;
    await utils.assertSolidityThrow(async () => {
      await cp.transferOwnership(oldOwner);
    }, 'Should not transfer ownership by old owner');
    await cp.transferOwnership(oldOwner, { from: newOwner });
  });

  it('check that all gives are valid', async () => {
    await utils.testrpcIncreaseTime(lockTime);
    await cp.claim(giveId1, { from: accounts[1] });
    assert((await like.balanceOf(accounts[1])).eq(1), '1 units of LIKE should be in account[1]');
    await cp.claim(giveId2, { from: accounts[2] });
    assert((await like.balanceOf(accounts[2])).eq(2), '2 units of LIKE should be in account[2]');
    await cp.claim(giveId3, { from: accounts[3] });
    assert((await like.balanceOf(accounts[3])).eq(3), '3 units of LIKE should be in account[3]');
  });
});

contract('ContributorPool:give4', (accounts) => {
  let like;
  let cp;

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('make 2 give that exceed amount in total', async () => {
    // amount + amount2 > total LIKE available
    const amount = testAmount;
    const amount2 = contributorAmount;
    await cp.give(accounts[1], amount);
    await utils.assertSolidityThrow(async () => {
      await cp.give(accounts[2], amount2);
    }, 'Should not allow to give as there is not enough LIKE.');
  });
});

contract('ContributorPool:give5', (accounts) => {
  const testTime = 86400 * 365;
  let like;
  let cp;
  let unlockTimestamp;

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('deploy contributor pool', async () => {
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const cpBalance = await like.balanceOf(cp.address);
    assert(contributorAmount.eq(cpBalance), `${contributorAmount} units of LIKE should be put in cp contract`);
  });

  it('mixed actions and execute after someone claimed', async () => {
    // TEST_CONT_0052
    const amount = testAmount;
    await cp.give(accounts[1], amount);
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    // increase time
    await utils.testrpcIncreaseTime(lockTime + 1);
    await cp.give(accounts[2], amount);
    const id2 = (await utils.solidityEventPromise(cp.Give())).args._id;
    // claim 1st give
    await cp.claim(id, { from: accounts[1] });
    const acctBalance = await like.balanceOf(accounts[1]);
    assert(testAmount.eq(acctBalance), `${testAmount} units of LIKE should be in account[1]`);
    // increase time
    await utils.testrpcIncreaseTime(lockTime + 1);
    // claim 2nd give
    await cp.claim(id2, { from: accounts[2] });
    const acctBalance2 = await like.balanceOf(accounts[1]);
    assert(testAmount.eq(acctBalance2), `${testAmount} units of LIKE should be in account[2]`);
  });

  it('mixed actions and execute at separate time but claim both, one is after unlock time one is not', async () => {
    // TEST_CONT_0053
    const amount = testAmount;
    await cp.give(accounts[3], amount);
    const id = (await utils.solidityEventPromise(cp.Give())).args._id;
    unlockTimestamp = web3.eth.getBlock(web3.eth.blockNumber).timestamp + lockTime;
    // increase 1 year time
    await utils.testrpcIncreaseTime(testTime + 1);
    await cp.give(accounts[4], amount);
    const id2 = (await utils.solidityEventPromise(cp.Give())).args._id;
    // increase 1 year time
    const gap = (unlockTimestamp - web3.eth.getBlock(web3.eth.blockNumber).timestamp) + 1;
    await utils.testrpcIncreaseTime(gap);
    // claim 1st give
    await cp.claim(id, { from: accounts[3] });
    const acctBalance = await like.balanceOf(accounts[3]);
    assert(testAmount.eq(acctBalance), `${testAmount} units of LIKE should be in account[1]`);
    await utils.assertSolidityThrow(async () => {
      // fail to claim 2nd give
      await cp.claim(id2, { from: accounts[4] });
    }, 'Should not give LIKE because not pass unlock time');
  });
});

contract('ContributorEvent', (accounts) => {
  const giveId1 = []; // acct 1
  let like;
  let cp;

  before(async () => {
    like = await LikeCoin.new(0);
    cp = await ContributorPool.new(like.address, lockTime);
  });

  it('should emit Transfer event, from like contract to contributorpool contract', async () => {
    // TEST_CONT_0035
    // register by owner (acct 0)
    await like.registerContributorPool(cp.address, contributorAmount, { from: accounts[0] });
    const event = await utils.solidityEventPromise(like.Transfer());
    assert.equal(event.args.from, 0x0, "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, cp.address, "Transfer event has wrong value on field 'to'");
    assert(contributorAmount.eq(event.args.value), "Transfer event has wrong value on field 'value'");
  });

  it('should emit Give event, from contributorpool contract to account', async () => {
    // TEST_CONT_0037
    // give LIKE to acct 1
    const amount = testAmount;
    await cp.give(accounts[1], amount);
    const event = await utils.solidityEventPromise(cp.Give());
    const id = event.args._id;
    assert.equal(event.args._to, accounts[1], "Give event has wrong value on field '_to'");
    assert(amount.eq(event.args._value), "Give event has wrong value on field '_value'");
    giveId1.push(id);
  });

  // event transfer likecoin from contributorpool contract to account
  it('should emit Transfer event, from contributorpool contract to account', async () => {
    // TEST_CONT_0038
    // increase time
    await utils.testrpcIncreaseTime(lockTime + 1);
    // acct 1 claims after 2 years
    await cp.claim(giveId1[0], { from: accounts[1] });
    let event = await utils.solidityEventPromise(like.Transfer());
    assert.equal(event.args.from, cp.address, "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, accounts[1], "Transfer event has wrong value on field 'to'");
    assert(testAmount.eq(event.args.value), "Transfer event has wrong value on field 'value'");

    event = await utils.solidityEventPromise(cp.Claimed());
    assert(event.args._id.eq(giveId1[0]), "Claimed event has wrong value on field '_id'");
  });
});

// vim: set ts=2 sw=2:
